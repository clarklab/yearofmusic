import { getStore } from '@netlify/blobs';

const ADMIN_PHONE = '5125524631';
const ADMIN_PASSWORD = 'cool85';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { phone, password } = body;

        // Check admin credentials
        const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
        console.log('Admin login attempt:', cleanPhone, 'Expected:', ADMIN_PHONE);

        if (cleanPhone !== ADMIN_PHONE || password !== ADMIN_PASSWORD) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get all clubs
        const clubs = await store.get('clubs', { type: 'json' }) || [];
        console.log('Found clubs:', clubs.length);

        // Get details for each club
        const clubsWithDetails = [];
        for (const club of clubs) {
            try {
                if (!club || !club.slug) {
                    console.log('Skipping invalid club entry:', club);
                    continue;
                }

                const members = await store.get(`club:${club.slug}:members`, { type: 'json' }) || [];
                const history = await store.get(`club:${club.slug}:history`, { type: 'json' }) || [];
                const settings = await store.get(`club:${club.slug}:settings`, { type: 'json' }) || {};

                const lastSend = Array.isArray(history) && history.length > 0 ? history[0] : null;

                clubsWithDetails.push({
                    slug: club.slug,
                    name: club.name || club.slug,
                    createdAt: club.createdAt,
                    memberCount: Array.isArray(members) ? members.length : 0,
                    lastSend: lastSend ? {
                        date: lastSend.date,
                        to: lastSend.to,
                        success: lastSend.success
                    } : null,
                    paused: settings.paused || false
                });
            } catch (clubError) {
                console.error(`Error processing club ${club?.slug}:`, clubError);
            }
        }

        return new Response(JSON.stringify({ clubs: clubsWithDetails }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Admin get clubs error:', error);
        return new Response(JSON.stringify({ error: 'Failed to get clubs' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
