import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { manual = false } = await req.json();
        const store = getStore('yom-data');

        // Get data
        const settings = await store.get('settings', { type: 'json' });
        const members = await store.get('members', { type: 'json' }) || [];
        let currentIndex = await store.get('currentIndex', { type: 'json' }) || 0;
        let history = await store.get('history', { type: 'json' }) || [];

        // Check if paused (only for scheduled sends)
        if (!manual && settings?.paused) {
            console.log('Reminders are paused, skipping send');
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
            console.log('No members to send to');
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
        const message = settings.message.replace('{name}', currentMember.name);

        // Send SMS via Textbelt
        const textbeltResponse = await fetch('https://textbelt.com/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentMember.phone,
                message: message,
                key: settings.textbeltKey
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
        await store.setJSON('history', history);

        // Advance to next person if successful
        if (textbeltResult.success) {
            currentIndex = (currentIndex + 1) % members.length;
            await store.setJSON('currentIndex', currentIndex);
        }

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
