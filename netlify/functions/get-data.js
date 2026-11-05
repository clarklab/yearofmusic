import { getStore } from '@netlify/blobs';
import { requireClubAuth, redactSecrets } from '../lib/club-auth.js';

export default async (req, context) => {
    try {
        // Get clubSlug from query params
        const url = new URL(req.url);
        const clubSlug = url.searchParams.get('clubSlug');

        const store = getStore('textclub-data');

        // Require a valid session for this club
        const auth = await requireClubAuth(req, store, clubSlug);
        if (auth.response) return auth.response;
        const { settings } = auth;

        // Get all data for this club
        let members = await store.get(`club:${clubSlug}:members`, { type: 'json' });
        let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' });
        let history = await store.get(`club:${clubSlug}:history`, { type: 'json' });

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

        // Older entries may contain the Textbelt key inside error messages
        history = history.map(entry => ({ ...entry, error: redactSecrets(entry.error) }));

        // Don't send password or any API key to frontend
        const { password, textbeltKey, ...publicSettings } = settings;

        return new Response(JSON.stringify({
            settings: publicSettings,
            members,
            currentIndex,
            history
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
    } catch (error) {
        console.error('Get data error:', error);
        return new Response(JSON.stringify({ error: 'Failed to get data' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
