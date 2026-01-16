import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { password, clubSlug } = await req.json();

        // Validate clubSlug
        if (!clubSlug || typeof clubSlug !== 'string') {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get settings for this club
        const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });

        // If no settings exist, club doesn't exist
        if (!settings) {
            return new Response(JSON.stringify({ success: false, error: 'Club not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const isValid = password === settings.password;

        return new Response(JSON.stringify({ success: isValid }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Login error:', error);
        return new Response(JSON.stringify({ success: false, error: 'Login failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
