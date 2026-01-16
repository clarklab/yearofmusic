import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { clubSlug, password } = await req.json();

        // Validate inputs
        if (!clubSlug || typeof clubSlug !== 'string') {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!password || typeof password !== 'string') {
            return new Response(JSON.stringify({ error: 'Password is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Verify club exists and password is correct
        const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
        if (!settings) {
            return new Response(JSON.stringify({ error: 'Club not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (settings.password !== password) {
            return new Response(JSON.stringify({ error: 'Invalid password' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Delete all club data
        await store.delete(`club:${clubSlug}:settings`);
        await store.delete(`club:${clubSlug}:members`);
        await store.delete(`club:${clubSlug}:currentIndex`);
        await store.delete(`club:${clubSlug}:history`);
        await store.delete(`club:${clubSlug}:lastScheduledSendDate`);

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
