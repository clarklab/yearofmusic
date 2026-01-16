import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    try {
        const url = new URL(req.url);
        const clubSlug = url.searchParams.get('clubSlug');

        if (!clubSlug) {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get clubs list to find name
        const clubs = await store.get('clubs', { type: 'json' }) || [];
        const club = clubs.find(c => c.slug === clubSlug);

        if (!club) {
            // Also check if settings exist (in case clubs list is out of sync)
            const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
            if (!settings) {
                return new Response(JSON.stringify({ error: 'Club not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // Club exists but not in list - return basic info
            return new Response(JSON.stringify({
                slug: clubSlug,
                name: clubSlug,
                exists: true
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            slug: club.slug,
            name: club.name,
            exists: true
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Get club info error:', error);
        return new Response(JSON.stringify({ error: 'Failed to get club info' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
