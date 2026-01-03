import { getStore } from '@netlify/blobs';

export default async (req, context) => {
    try {
        const store = getStore('yom-data');

        // Get all data
        let settings = await store.get('settings', { type: 'json' });
        let members = await store.get('members', { type: 'json' });
        let currentIndex = await store.get('currentIndex', { type: 'json' });
        let history = await store.get('history', { type: 'json' });

        // Initialize defaults if not set
        if (!settings) {
            settings = {
                password: 'yom',
                sendTime: '10:00',
                timezone: 'America/Chicago',
                message: "Hey {name}! It's your turn to share a song today for Year of Music! Post your Spotify link to the group 🎵",
                paused: false,
                textbeltKey: 'f9ef39e5aae048a0d8337fad7dc9eff7e0b4b6ecucS9btY9IyZqdxFOqrx52fYnJ'
            };
            await store.setJSON('settings', settings);
        }

        if (!members) {
            members = [];
            await store.setJSON('members', members);
        }

        if (currentIndex === null || currentIndex === undefined) {
            currentIndex = 0;
            await store.setJSON('currentIndex', currentIndex);
        }

        if (!history) {
            history = [];
            await store.setJSON('history', history);
        }

        // Don't send password to frontend
        const { password, textbeltKey, ...publicSettings } = settings;

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
