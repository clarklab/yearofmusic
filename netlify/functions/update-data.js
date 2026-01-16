import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';

const MAX_MEMBERS = 25;

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await req.json();
        const { action, clubSlug } = body;

        // Validate clubSlug
        if (!clubSlug || typeof clubSlug !== 'string') {
            return new Response(JSON.stringify({ error: 'Club slug is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const store = getStore('textclub-data');

        // Verify club exists
        const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
        if (!settings) {
            return new Response(JSON.stringify({ error: 'Club not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'addMember') {
            const { name, phone } = body;
            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];

            // Check member limit
            if (members.length >= MAX_MEMBERS) {
                return new Response(JSON.stringify({ error: `Maximum ${MAX_MEMBERS} members allowed per club` }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Add new member
            const newMember = {
                id: randomUUID(),
                name,
                phone
            };
            members.push(newMember);

            // Sort alphabetically by name
            members.sort((a, b) => a.name.localeCompare(b.name));

            await store.setJSON(`club:${clubSlug}:members`, members);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'removeMember') {
            const { id } = body;
            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];
            let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' }) || 0;

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

            await store.setJSON(`club:${clubSlug}:members`, members);
            await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'skipTurn') {
            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];
            let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' }) || 0;

            if (members.length > 0) {
                currentIndex = (currentIndex + 1) % members.length;
                await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'editMember') {
            const { id, name, phone } = body;
            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];

            const memberIndex = members.findIndex(m => m.id === id);
            if (memberIndex === -1) {
                return new Response(JSON.stringify({ error: 'Member not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Update member
            members[memberIndex] = { ...members[memberIndex], name, phone };

            // Re-sort alphabetically by name
            members.sort((a, b) => a.name.localeCompare(b.name));

            await store.setJSON(`club:${clubSlug}:members`, members);

            // Find new index of edited member and adjust currentIndex if needed
            let currentIndex = await store.get(`club:${clubSlug}:currentIndex`, { type: 'json' }) || 0;
            if (currentIndex >= members.length) {
                currentIndex = currentIndex % members.length;
                await store.setJSON(`club:${clubSlug}:currentIndex`, currentIndex);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'setNextMember') {
            const { id } = body;
            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];

            const memberIndex = members.findIndex(m => m.id === id);
            if (memberIndex === -1) {
                return new Response(JSON.stringify({ error: 'Member not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            await store.setJSON(`club:${clubSlug}:currentIndex`, memberIndex);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'updateSettings') {
            const { settings: newSettings } = body;
            let currentSettings = await store.get(`club:${clubSlug}:settings`, { type: 'json' }) || {};

            // Merge settings, keeping password
            currentSettings = {
                ...currentSettings,
                sendTime: newSettings.sendTime,
                timezone: newSettings.timezone,
                message: newSettings.message,
                paused: newSettings.paused,
                sendOnWeekends: newSettings.sendOnWeekends,
                weekendSendTime: newSettings.weekendSendTime,
                includeJoke: newSettings.includeJoke,
                includeHoroscope: newSettings.includeHoroscope
            };

            await store.setJSON(`club:${clubSlug}:settings`, currentSettings);

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
