import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { name, slug, password, adminName, adminPhone } = await req.json();

        // Validate inputs
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return new Response(JSON.stringify({ error: 'Club name is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!slug || typeof slug !== 'string') {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!password || typeof password !== 'string' || password.length < 4) {
            return new Response(JSON.stringify({ error: 'Password must be at least 4 characters' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!adminName || typeof adminName !== 'string' || adminName.trim().length === 0) {
            return new Response(JSON.stringify({ error: 'Your name is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!adminPhone || typeof adminPhone !== 'string') {
            return new Response(JSON.stringify({ error: 'Your phone number is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Clean phone number (digits only)
        const cleanPhone = adminPhone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            return new Response(JSON.stringify({ error: 'Phone number must be 10 digits' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate slug format (lowercase, alphanumeric, hyphens only)
        const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
        if (!slugRegex.test(slug) || slug.length < 2 || slug.length > 30) {
            return new Response(JSON.stringify({
                error: 'Slug must be 2-30 characters, lowercase letters, numbers, and hyphens only'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Reserved slugs
        const reservedSlugs = ['a', 'create', 'admin', 'api', 'login', 'dashboard', 'settings', 'about', 'help'];
        if (reservedSlugs.includes(slug)) {
            return new Response(JSON.stringify({ error: 'This slug is reserved' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Check if slug already exists
        const existingSettings = await store.get(`club:${slug}:settings`, { type: 'json' });
        if (existingSettings) {
            return new Response(JSON.stringify({ error: 'A club with this slug already exists' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create club settings
        const settings = {
            password,
            adminPhone: cleanPhone,
            sendTime: '10:00',
            timezone: 'America/Chicago',
            message: `Hey {name}! It's your turn to share today for ${name.trim()}! Post your pick to the group.`,
            paused: false,
            sendOnWeekends: false,
            weekendSendTime: '10:00',
            includeJoke: false,
            includeHoroscope: false
        };

        // Create admin as first member
        const adminMember = {
            id: randomUUID(),
            name: adminName.trim(),
            phone: cleanPhone
        };

        // Add to clubs list
        let clubs = await store.get('clubs', { type: 'json' }) || [];
        clubs.push({
            slug,
            name: name.trim(),
            createdAt: new Date().toISOString()
        });
        await store.setJSON('clubs', clubs);

        // Create club data
        await store.setJSON(`club:${slug}:settings`, settings);
        await store.setJSON(`club:${slug}:members`, [adminMember]);
        await store.setJSON(`club:${slug}:currentIndex`, 0);
        await store.setJSON(`club:${slug}:history`, []);

        console.log(`Club created: ${slug} (${name.trim()})`);

        return new Response(JSON.stringify({
            success: true,
            slug,
            name: name.trim()
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Create club error:', error);
        return new Response(JSON.stringify({ error: 'Failed to create club' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
