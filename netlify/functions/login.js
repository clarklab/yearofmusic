import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { password } = await req.json();
        const store = getStore('yom-data');

        // Get settings from blob storage
        let settings = await store.get('settings', { type: 'json' });

        // Initialize with default password if not set
        if (!settings) {
            settings = { password: 'yom' };
            await store.setJSON('settings', settings);
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
