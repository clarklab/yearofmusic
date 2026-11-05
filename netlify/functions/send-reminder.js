import { getStore } from '@netlify/blobs';
import { getRandomContent } from './fun-content.js';
import { requireClubAuth, redactSecrets } from '../lib/club-auth.js';

// RETRY STRATEGY (two tiers):
// 1. IMMEDIATE (network errors only): If request doesn't reach Textbelt
//    (timeout, connection refused), retry up to 2 times with exponential backoff.
// 2. DEFERRED (content/API errors): If Textbelt rejects the message (e.g.,
//    "URL detected"), schedule retry in 15 min with fresh content. Max 3 attempts,
//    then notify admin.

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_MANUAL_SENDS_PER_DAY = 10; // Caps "Send now" so a club can't be used to spam
const LOW_QUOTA_THRESHOLD = 15; // Text the admin when Textbelt quota drops below this
const LOW_QUOTA_ALERT_KEY = 'lowQuotaAlertSent';

// Send SMS with immediate retry ONLY for network errors.
// API rejections (success: false) return immediately - deferred retry handles those.
async function sendSmsWithNetworkRetry(phone, message, apiKey, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://textbelt.com/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message, key: apiKey })
            });

            const result = await response.json();

            // API responded - return immediately (success or failure).
            // If failure, deferred retry will handle it with fresh content.
            return { ...result, error: redactSecrets(result.error), attempts: attempt + 1 };
        } catch (error) {
            // Network error (timeout, connection refused, etc.) - retry immediately
            lastError = error.message;

            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s exponential backoff
                console.log(`SMS attempt ${attempt + 1} network error (${error.message}), retrying in ${waitTime}ms...`);
                await delay(waitTime);
            }
        }
    }

    // All network retries exhausted
    return {
        success: false,
        error: lastError || 'Network error after multiple attempts',
        attempts: maxRetries + 1
    };
}

// Text the admin. The number comes from the ADMIN_NUMBER env var, never from a request.
async function notifyAdmin(clubSlug, message) {
    const adminPhone = process.env.ADMIN_NUMBER;
    if (!adminPhone) {
        console.error(`[${clubSlug}] ADMIN_NUMBER not set, skipping admin notification`);
        return { success: false, error: 'ADMIN_NUMBER not set' };
    }

    console.log(`[${clubSlug}] Notifying admin: ${message}`);

    try {
        const response = await fetch('https://textbelt.com/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: adminPhone,
                message: message,
                key: process.env.TEXTBELT_API_KEY
            })
        });
        const result = await response.json();
        console.log(`[${clubSlug}] Admin notification result:`, { ...result, error: redactSecrets(result.error) });
        return result;
    } catch (error) {
        console.error(`[${clubSlug}] Failed to notify admin:`, error);
        return { success: false, error: error.message };
    }
}

// Text the admin once when quota drops below the threshold. The flag is global
// because every club shares one Textbelt key, and it re-arms after a refill.
// Only marked sent on success, so an out-of-quota alert retries on the next send.
async function checkLowQuota(store, clubSlug, quotaRemaining) {
    if (typeof quotaRemaining !== 'number') return;

    const alertSent = await store.get(LOW_QUOTA_ALERT_KEY, { type: 'json' });

    if (quotaRemaining >= LOW_QUOTA_THRESHOLD) {
        if (alertSent) await store.delete(LOW_QUOTA_ALERT_KEY);
        return;
    }
    if (alertSent) return;

    const result = await notifyAdmin(clubSlug, `Rotato: Textbelt quota is low (${quotaRemaining} texts left). Refill soon.`);
    if (result.success) {
        await store.setJSON(LOW_QUOTA_ALERT_KEY, { sentAt: new Date().toISOString(), quotaRemaining });
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
        const { manual = false, clubSlug, isRetry = false } = await req.json();

        const store = getStore('textclub-data');

        // Require a valid session (scheduled-reminder mints its own token)
        const auth = await requireClubAuth(req, store, clubSlug);
        if (auth.response) return auth.response;
        const { settings } = auth;

        // Get data for this club
        const members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];
        let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' }) || 0;
        let history = await store.get(`club:${clubSlug}:history`, { type: 'json' }) || [];

        // Rate-limit manual sends
        if (manual) {
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recentManualSends = history.filter(e => e.manual && new Date(e.date).getTime() > dayAgo).length;
            if (recentManualSends >= MAX_MANUAL_SENDS_PER_DAY) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Limit of ${MAX_MANUAL_SENDS_PER_DAY} manual sends per day reached`
                }), {
                    status: 429,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
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

        // Retry state is read from the store, never from the request body,
        // so a caller can't choose who gets texted
        const retryState = isRetry ? await store.get(`club:${clubSlug}:retryState`, { type: 'json' }) : null;

        if (retryState) {
            // Retry: re-send to the stored member, using their current details
            attemptNumber = retryState.attemptNumber;
            targetMember = members.find(m => m.id === retryState.originalMember?.id);

            // Verify member still exists (they might have been removed)
            if (!targetMember) {
                console.log(`[${clubSlug}] Member ${retryState.originalMember?.name} no longer exists, clearing retry state`);
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
            console.log(`[${clubSlug}] Retry attempt ${attemptNumber} for ${targetMember.name}`);
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

        // Send SMS via Textbelt with immediate retry for network errors only
        const textbeltResult = await sendSmsWithNetworkRetry(
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
            quotaRemaining: textbeltResult.quotaRemaining ?? null, // ?? keeps 0 (out of quota)
            attempts: textbeltResult.attempts || 1,
            attemptNumber: attemptNumber,
            manual: manual,
            message: message
        };

        history.unshift(historyEntry); // Add to beginning
        history = history.slice(0, 100); // Keep last 100
        await store.setJSON(`club:${clubSlug}:history`, history);

        // Low-quota alert must never break the send itself
        try {
            await checkLowQuota(store, clubSlug, textbeltResult.quotaRemaining);
        } catch (error) {
            console.error(`[${clubSlug}] Low quota check failed:`, error);
        }

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
                    await notifyAdmin(clubSlug, `Message fail in group:${settings.name || clubSlug}`);
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
