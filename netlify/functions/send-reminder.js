import { getStore } from '@netlify/blobs';
import { getRandomContent } from './fun-content.js';

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

        // Send SMS via Textbelt
        const textbeltResponse = await fetch('https://textbelt.com/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentMember.phone,
                message: message,
                key: process.env.TEXTBELT_API_KEY
            })
        });

        const textbeltResult = await textbeltResponse.json();

        // Log to history
        const historyEntry = {
            date: new Date().toISOString(),
            name: currentMember.name,
            phone: currentMember.phone,
            status: textbeltResult.success ? 'success' : 'failed',
            error: textbeltResult.error || null,
            quotaRemaining: textbeltResult.quotaRemaining || null
        };

        history.unshift(historyEntry); // Add to beginning
        history = history.slice(0, 100); // Keep last 100
        await store.setJSON(`club:${clubSlug}:history`, history);

        // Advance to next person if successful
        if (textbeltResult.success) {
            currentIndex = (currentIndex + 1) % members.length;
            await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
        }

        console.log(`[${clubSlug}] Send result: ${textbeltResult.success ? 'success' : 'failed'} to ${currentMember.name}`);

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
