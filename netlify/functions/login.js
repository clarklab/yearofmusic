import { getStore } from '@netlify/blobs';
import { isValidSlug, checkClubCredentials, createToken } from '../lib/club-auth.js';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { password, phone, clubSlug } = await req.json();

        // Validate clubSlug
        if (!isValidSlug(clubSlug)) {
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

        // Check password and phone (locks out after repeated failures)
        const { ok, locked } = await checkClubCredentials(store, clubSlug, settings, {
            password,
            phone: phone || ''
        });

        if (locked) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Too many failed attempts. Try again in 15 minutes.'
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: ok,
            token: ok ? createToken(clubSlug, settings) : null,
            error: ok ? null : 'Invalid phone or password'
        }), {
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
