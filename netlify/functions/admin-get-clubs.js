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
        const { phone, password } = await req.json();

        // Check admin credentials
        const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
        if (cleanPhone !== ADMIN_PHONE || password !== ADMIN_PASSWORD) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Get all clubs
        const clubs = await store.get('clubs', { type: 'json' }) || [];

        // Get details for each club
        const clubsWithDetails = await Promise.all(clubs.map(async (club) => {
            const members = await store.get(`club:${club.slug}:members`, { type: 'json' }) || [];
            const history = await store.get(`club:${club.slug}:history`, { type: 'json' }) || [];
            const settings = await store.get(`club:${club.slug}:settings`, { type: 'json' }) || {};

            const lastSend = history.length > 0 ? history[0] : null;

            return {
                slug: club.slug,
                name: club.name,
                createdAt: club.createdAt,
                memberCount: members.length,
                lastSend: lastSend ? {
                    date: lastSend.date,
                    to: lastSend.to,
                    success: lastSend.success
                } : null,
                paused: settings.paused || false
            };
        }));

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
