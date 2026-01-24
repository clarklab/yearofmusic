import { getStore } from '@netlify/blobs';
import { getRandomContent } from './fun-content.js';

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// Send SMS with retry logic for transient failures
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

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { manual = false, clubSlug } = await req.json();

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

        // Get current member
        currentIndex = currentIndex % members.length;
        const currentMember = members[currentIndex];

        // Format message
        let message = settings.message.replace('{name}', currentMember.name);

        // Append fun content if enabled
        const funContent = getRandomContent(
            settings.includeJoke || false,
            settings.includeHoroscope || false
        );
        if (funContent) {
            message = message + '\n\n' + funContent;
        }

        // Log outgoing message for debugging
        console.log(`[${clubSlug}] === OUTGOING SMS ===`);
        console.log(`[${clubSlug}] To: ${currentMember.name} (${currentMember.phone})`);
        console.log(`[${clubSlug}] Message: ${message}`);
        console.log(`[${clubSlug}] === END MESSAGE ===`);

        // Send SMS via Textbelt with automatic retry for transient failures
        const textbeltResult = await sendSmsWithRetry(
            currentMember.phone,
            message,
            process.env.TEXTBELT_API_KEY,
            2 // Max 2 retries (3 total attempts)
        );

        // Log to history (including full message for debugging)
        const historyEntry = {
            date: new Date().toISOString(),
            name: currentMember.name,
            phone: currentMember.phone,
            status: textbeltResult.success ? 'success' : 'failed',
            error: textbeltResult.error || null,
            quotaRemaining: textbeltResult.quotaRemaining || null,
            attempts: textbeltResult.attempts || 1,
            message: message
        };

        history.unshift(historyEntry); // Add to beginning
        history = history.slice(0, 100); // Keep last 100
        await store.setJSON(`club:${clubSlug}:history`, history);

        // Advance to next person if successful
        if (textbeltResult.success) {
            currentIndex = (currentIndex + 1) % members.length;
            await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
        }

        // Log result
        console.log(`[${clubSlug}] === SMS RESULT ===`);
        if (textbeltResult.success) {
            const retryInfo = textbeltResult.attempts > 1 ? ` (after ${textbeltResult.attempts} attempts)` : '';
            console.log(`[${clubSlug}] Status: SUCCESS${retryInfo}`);
        } else {
            console.error(`[${clubSlug}] Status: FAILED after ${textbeltResult.attempts || 1} attempt(s)`);
            console.error(`[${clubSlug}] Error: ${textbeltResult.error || 'Unknown error'}`);
        }
        console.log(`[${clubSlug}] Quota remaining: ${textbeltResult.quotaRemaining}`);
        console.log(`[${clubSlug}] === END RESULT ===`);

        return new Response(JSON.stringify({
            success: textbeltResult.success,
            sentTo: currentMember.name,
            quotaRemaining: textbeltResult.quotaRemaining,
            error: textbeltResult.error
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
