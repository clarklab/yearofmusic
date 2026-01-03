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
        const body = await req.json();
        const { action } = body;
        const store = getStore('yom-data');

        if (action === 'addMember') {
            const { name, phone } = body;
            let members = await store.get('members', { type: 'json' }) || [];

            // Add new member
            const newMember = {
                id: randomUUID(),
                name,
                phone
            };
            members.push(newMember);

            // Sort alphabetically by name
            members.sort((a, b) => a.name.localeCompare(b.name));

            await store.setJSON('members', members);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'removeMember') {
            const { id } = body;
            let members = await store.get('members', { type: 'json' }) || [];
            let currentIndex = await store.get('currentIndex', { type: 'json' }) || 0;

            // Find index of member to remove
            const removeIndex = members.findIndex(m => m.id === id);
            if (removeIndex === -1) {
                return new Response(JSON.stringify({ error: 'Member not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Remove member
            members.splice(removeIndex, 1);

            // Adjust currentIndex if needed
            if (removeIndex < currentIndex) {
                currentIndex = Math.max(0, currentIndex - 1);
            } else if (removeIndex === currentIndex && members.length > 0) {
                currentIndex = currentIndex % members.length;
            }

            await store.setJSON('members', members);
            await store.setJSON('currentIndex', currentIndex);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'skipTurn') {
            let members = await store.get('members', { type: 'json' }) || [];
            let currentIndex = await store.get('currentIndex', { type: 'json' }) || 0;

            if (members.length > 0) {
                currentIndex = (currentIndex + 1) % members.length;
                await store.setJSON('currentIndex', currentIndex);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'updateSettings') {
            const { settings: newSettings } = body;
            let settings = await store.get('settings', { type: 'json' }) || {};

            // Merge settings, keeping password and API key
            settings = {
                ...settings,
                sendTime: newSettings.sendTime,
                timezone: newSettings.timezone,
                message: newSettings.message,
                paused: newSettings.paused,
                sendOnWeekends: newSettings.sendOnWeekends,
                weekendSendTime: newSettings.weekendSendTime
            };

            await store.setJSON('settings', settings);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Update data error:', error);
        return new Response(JSON.stringify({ error: 'Failed to update data' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
