import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    try {
        // Get clubSlug from query params
        const url = new URL(req.url);
        const clubSlug = url.searchParams.get('clubSlug');

        // Validate clubSlug
        if (!clubSlug) {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get all data for this club
        let settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
        let members = await store.get(`club:${clubSlug}:members`, { type: 'json' });
        let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' });
        let history = await store.get(`club:${clubSlug}:history`, { type: 'json' });

        // If no settings exist, club doesn't exist
        if (!settings) {
            return new Response(JSON.stringify({ error: 'Club not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Initialize defaults if not set
        if (!members) {
            members = [];
        }

        if (currentIndex === null || currentIndex === undefined) {
            currentIndex = 0;
        }

        if (!history) {
            history = [];
        }

        // Don't send password to frontend
        const { password, ...publicSettings } = settings;

        return new Response(JSON.stringify({
            settings: publicSettings,
            members,
            currentIndex,
            history
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Get data error:', error);
        return new Response(JSON.stringify({ error: 'Failed to get data' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
