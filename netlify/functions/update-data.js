import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';
import { requireClubAuth } from '../lib/club-auth.js';

const MAX_MEMBERS = 25;
const MAX_NAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 500;

// Returns an error string, or null when the member fields are valid
function validateMember(name, phone) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
        return `Name must be 1-${MAX_NAME_LENGTH} characters`;
    }
    if (typeof phone !== 'string' || !/^\d{10}$/.test(phone)) {
        return 'Phone number must be 10 digits';
    }
    return null;
}

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

        const store = getStore('textclub-data');

        // Require a valid session for this club
        const auth = await requireClubAuth(req, store, clubSlug);
        if (auth.response) return auth.response;

        if (action === 'addMember') {
            const { name, phone } = body;
            const invalid = validateMember(name, phone);
            if (invalid) {
                return new Response(JSON.stringify({ error: invalid }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

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
                name: name.trim(),
                phone
            };
            members.push(newMember);

            // Sort alphabetically by name
            members.sort((a, b) => a.name.localeCompare(b.name));

            await store.setJSON(`club:${clubSlug}:members`, members);

            return new Response(JSON.stringify({ success: true, memberId: newMember.id }), {
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
            const invalid = validateMember(name, phone);
            if (invalid) {
                return new Response(JSON.stringify({ error: invalid }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            let members = await store.get(`club:${clubSlug}:members`, { type: 'json' }) || [];

            const memberIndex = members.findIndex(m => m.id === id);
            if (memberIndex === -1) {
                return new Response(JSON.stringify({ error: 'Member not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Update member
            members[memberIndex] = { ...members[memberIndex], name: name.trim(), phone };

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

            if (!newSettings || typeof newSettings.message !== 'string' || newSettings.message.length > MAX_MESSAGE_LENGTH) {
                return new Response(JSON.stringify({ error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
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
