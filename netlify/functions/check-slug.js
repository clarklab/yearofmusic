import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    try {
        const url = new URL(req.url);
        const slug = url.searchParams.get('slug');

        if (!slug) {
            return new Response(JSON.stringify({ error: 'Slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate slug format
        const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
        if (!slugRegex.test(slug) || slug.length < 2 || slug.length > 30) {
            return new Response(JSON.stringify({
                available: false,
                reason: 'invalid_format',
                message: 'Slug must be 2-30 characters, lowercase letters, numbers, and hyphens only'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Reserved slugs
        const reservedSlugs = ['create', 'admin', 'api', 'login', 'dashboard', 'settings', 'about', 'help'];
        if (reservedSlugs.includes(slug)) {
            return new Response(JSON.stringify({
                available: false,
                reason: 'reserved',
                message: 'This slug is reserved'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Check if slug already exists
        const existingSettings = await store.get(`club:${slug}:settings`, { type: 'json' });

        return new Response(JSON.stringify({
            available: !existingSettings,
            reason: existingSettings ? 'taken' : null,
            message: existingSettings ? 'This slug is already taken' : null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Check slug error:', error);
        return new Response(JSON.stringify({ error: 'Failed to check slug' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
