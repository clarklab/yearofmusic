import { getStore } from '@netlify/blobs';
import { getRandomContent } from './fun-content.js';

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry configuration
const ADMIN_PHONE = '5125524631';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

// Errors that should NOT be retried (permanent failures)
const PERMANENT_ERRORS = [
    'invalid phone number',
    'invalid number',
    'quota exceeded',
    'out of quota',
    'not enough credits',
    'invalid api key',
    'blocked number'
];

// Check if an error is permanent (shouldn't be retried)
function isPermanentError(errorMessage) {
    if (!errorMessage) return false;
    const lowerError = errorMessage.toLowerCase();
    return PERMANENT_ERRORS.some(pe => lowerError.includes(pe));
}

// Send SMS with immediate retry logic for transient failures
async function sendSmsWithRetry(phone, message, apiKey, maxRetries = 2) {
    let lastError = null;
    let lastResult = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://textbelt.com/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message, key: apiKey })
            });

            const result = await response.json();
            lastResult = result;

            // If successful, return immediately
            if (result.success) {
                return { ...result, attempts: attempt + 1 };
            }

            // If permanent error, don't retry
            if (isPermanentError(result.error)) {
                console.log(`Permanent error detected, not retrying: ${result.error}`);
                return { ...result, attempts: attempt + 1 };
            }

            // For transient errors, retry after delay
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s exponential backoff
                console.log(`SMS attempt ${attempt + 1} failed (${result.error}), retrying in ${waitTime}ms...`);
                await delay(waitTime);
            }

            lastError = result.error;
        } catch (error) {
            lastError = error.message;

            // Network errors are transient, retry
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`SMS attempt ${attempt + 1} network error (${error.message}), retrying in ${waitTime}ms...`);
                await delay(waitTime);
            }
        }
    }

    // All retries exhausted
    return {
        success: false,
        error: lastError || 'Failed after multiple attempts',
        quotaRemaining: lastResult?.quotaRemaining,
        attempts: maxRetries + 1
    };
}

// Send admin notification about failed messages
async function notifyAdmin(clubSlug, clubName) {
    const message = `Message fail in group:${clubName}`;
    console.log(`[${clubSlug}] Notifying admin: ${message}`);

    try {
        const response = await fetch('https://textbelt.com/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: ADMIN_PHONE,
                message: message,
                key: process.env.TEXTBELT_API_KEY
            })
        });
        const result = await response.json();
        console.log(`[${clubSlug}] Admin notification result:`, result);
        return result;
    } catch (error) {
        console.error(`[${clubSlug}] Failed to notify admin:`, error);
        return { success: false, error: error.message };
    }
}

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { manual = false, clubSlug, isRetry = false, retryContext = null } = await req.json();

        // Validate clubSlug
        if (!clubSlug || typeof clubSlug !== 'string') {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get data for this club
        const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
        const members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];
        let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' }) || 0;
        let history = await store.get(`club:${clubSlug}:history`, { type: 'json' }) || [];

        // If no settings exist, club doesn't exist
        if (!settings) {
            return new Response(JSON.stringify({ error: 'Club not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if paused (only for scheduled sends)
        if (!manual && settings?.paused) {
            console.log(`[${clubSlug}] Reminders are paused, skipping send`);
            return new Response(JSON.stringify({
                success: true,
                skipped: true,
                reason: 'paused'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if we have members
        if (members.length === 0) {
            console.log(`[${clubSlug}] No members to send to`);
            return new Response(JSON.stringify({
                success: false,
                error: 'No members'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Determine which member to send to
        let targetMember;
        let attemptNumber = 1;

        if (isRetry && retryContext) {
            // Retry: use the member from retry context
            attemptNumber = retryContext.attemptNumber;
            targetMember = retryContext.originalMember;
            console.log(`[${clubSlug}] Retry attempt ${attemptNumber} for ${targetMember.name}`);

            // Verify member still exists (they might have been removed)
            const memberExists = members.some(m => m.id === targetMember.id);
            if (!memberExists) {
                console.log(`[${clubSlug}] Member ${targetMember.name} no longer exists, clearing retry state`);
                await store.delete(`club:${clubSlug}:retryState`);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Member no longer exists',
                    retryCleared: true
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } else {
            // Normal send: use current index
            currentIndex = currentIndex % members.length;
            targetMember = members[currentIndex];
        }

        // Format message
        let message = settings.message.replace('{name}', targetMember.name);

        // Append fun content if enabled (regenerated fresh for each attempt)
        const funContent = getRandomContent(
            settings.includeJoke || false,
            settings.includeHoroscope || false
        );
        if (funContent) {
            message = message + '\n\n' + funContent;
        }

        // Send SMS via Textbelt with immediate retry for transient failures
        const textbeltResult = await sendSmsWithRetry(
            targetMember.phone,
            message,
            process.env.TEXTBELT_API_KEY,
            2 // Max 2 immediate retries (3 total attempts within this request)
        );

        // Log to history (including full message for debugging)
        const historyEntry = {
            date: new Date().toISOString(),
            name: targetMember.name,
            phone: targetMember.phone,
            status: textbeltResult.success ? 'success' : 'failed',
            error: textbeltResult.error || null,
            quotaRemaining: textbeltResult.quotaRemaining || null,
            attempts: textbeltResult.attempts || 1,
            attemptNumber: isRetry ? attemptNumber : 1,
            message: message
        };

        history.unshift(historyEntry); // Add to beginning
        history = history.slice(0, 100); // Keep last 100
        await store.setJSON(`club:${clubSlug}:history`, history);

        // Handle success or failure
        if (textbeltResult.success) {
            // Success: clear retry state and advance index
            await store.delete(`club:${clubSlug}:retryState`);
            currentIndex = (currentIndex + 1) % members.length;
            await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
            const retryInfo = textbeltResult.attempts > 1 ? ` (after ${textbeltResult.attempts} immediate attempts)` : '';
            console.log(`[${clubSlug}] Send successful to ${targetMember.name}${retryInfo}, advanced to index ${currentIndex}`);
        } else {
            // Failure: handle deferred retry logic (only for non-manual sends)
            if (!manual) {
                if (attemptNumber < MAX_RETRY_ATTEMPTS) {
                    // Schedule deferred retry with fresh content
                    const nextRetryTime = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
                    const timezone = settings.timezone || 'America/Chicago';
                    const localDate = new Date().toLocaleString('en-US', { timeZone: timezone });
                    const dateString = new Date(localDate).toDateString();

                    const retryState = {
                        attemptNumber: attemptNumber + 1,
                        nextRetryTime: nextRetryTime,
                        originalMember: { id: targetMember.id, name: targetMember.name, phone: targetMember.phone },
                        dateString: dateString,
                        lastError: textbeltResult.error || 'Unknown error'
                    };
                    await store.setJSON(`club:${clubSlug}:retryState`, retryState);
                    console.log(`[${clubSlug}] Scheduled deferred retry ${attemptNumber + 1} for ${nextRetryTime}`);
                } else {
                    // Max attempts reached: notify admin, clear state, advance index
                    console.log(`[${clubSlug}] Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached, notifying admin`);
                    await notifyAdmin(clubSlug, settings.name || clubSlug);
                    await store.delete(`club:${clubSlug}:retryState`);
                    currentIndex = (currentIndex + 1) % members.length;
                    await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
                    console.log(`[${clubSlug}] Advanced to index ${currentIndex} after max failures`);
                }
            }
            console.log(`[${clubSlug}] Send failed to ${targetMember.name} after ${textbeltResult.attempts || 1} immediate attempt(s): ${textbeltResult.error}`);
        }

        return new Response(JSON.stringify({
            success: textbeltResult.success,
            sentTo: targetMember.name,
            quotaRemaining: textbeltResult.quotaRemaining,
            error: textbeltResult.error,
            attempts: textbeltResult.attempts || 1,
            attemptNumber: attemptNumber,
            willRetry: !textbeltResult.success && !manual && attemptNumber < MAX_RETRY_ATTEMPTS
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Send reminder error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
