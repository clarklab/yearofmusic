import { getStore } from '@netlify/blobs';
import { requireClubAuth, checkClubCredentials } from '../lib/club-auth.js';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { clubSlug, password } = await req.json();

        if (!password || typeof password !== 'string') {
            return new Response(JSON.stringify({ error: 'Password is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Require a valid session, then re-confirm the password (with lockout)
        const auth = await requireClubAuth(req, store, clubSlug);
        if (auth.response) return auth.response;

        const { ok, locked } = await checkClubCredentials(store, clubSlug, auth.settings, { password });
        if (!ok) {
            return new Response(JSON.stringify({ error: locked ? 'Too many failed attempts. Try again in 15 minutes.' : 'Invalid password' }), {
                status: locked ? 429 : 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Delete all club data
        await store.delete(`club:${clubSlug}:settings`);
        await store.delete(`club:${clubSlug}:members`);
        await store.delete(`club:${clubSlug}:currentIndex`);
        await store.delete(`club:${clubSlug}:history`);
        await store.delete(`club:${clubSlug}:lastScheduledSendDate`);
        await store.delete(`club:${clubSlug}:retryState`);
        await store.delete(`club:${clubSlug}:loginFailures`);

        // Remove from clubs list
        let clubs = await store.get('clubs', { type: 'json' }) || [];
        clubs = clubs.filter(c => c.slug !== clubSlug);
        await store.setJSON('clubs', clubs);

        console.log(`Club deleted: ${clubSlug}`);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Delete club error:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete club' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
