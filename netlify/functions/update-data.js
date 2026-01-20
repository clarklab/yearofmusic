import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';

const MAX_MEMBERS = 25;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 50; // milliseconds

// Helper function to retry operations with exponential backoff
async function retryOperation(operationFn, maxRetries = MAX_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await operationFn(attempt);
            return result;
        } catch (error) {
            lastError = error;
            // Don't retry permanent errors (like validation failures)
            if (error.permanent) {
                throw error;
            }
            if (attempt < maxRetries - 1) {
                // Exponential backoff with jitter
                const delay = BASE_RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 10;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
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

            try {
                // Use retry logic to handle concurrent modifications
                const result = await retryOperation(async (attempt) => {
                    // Read current state with version metadata
                    const membersKey = `club:${clubSlug}:members`;
                    const versionKey = `club:${clubSlug}:members:version`;

                    let members = await store.get(membersKey, { type: 'json' }) || [];
                    let currentVersion = await store.get(versionKey, { type: 'json' }) || 0;

                    // Check member limit (non-retryable error)
                    if (members.length >= MAX_MEMBERS) {
                        const error = new Error(`Maximum ${MAX_MEMBERS} members allowed per club`);
                        error.permanent = true;
                        error.statusCode = 400;
                        throw error;
                    }

                    // Check for duplicate phone number (non-retryable error)
                    const normalizedPhone = phone.replace(/\D/g, ''); // Remove non-digits for comparison
                    const duplicateMember = members.find(m => {
                        const memberPhone = m.phone.replace(/\D/g, '');
                        return memberPhone === normalizedPhone;
                    });

                    if (duplicateMember) {
                        const error = new Error(`Phone number already exists for ${duplicateMember.name}`);
                        error.permanent = true;
                        error.statusCode = 400;
                        throw error;
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

                    // Increment version for optimistic concurrency control
                    const newVersion = currentVersion + 1;

                    // Write both members and version atomically (as much as possible)
                    await store.setJSON(versionKey, newVersion);
                    await store.setJSON(membersKey, members);

                    // Verify write succeeded by checking version
                    const verifyVersion = await store.get(versionKey, { type: 'json' });
                    if (verifyVersion !== newVersion && attempt < MAX_RETRIES - 1) {
                        // Version mismatch detected - another write happened concurrently
                        console.log(`Concurrent modification detected on attempt ${attempt + 1}, retrying...`);
                        throw new Error('Concurrent modification detected');
                    }

                    return { success: true, memberId: newMember.id };
                });

                return new Response(JSON.stringify(result), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                // Handle permanent errors (like member limit) differently
                if (error.permanent) {
                    return new Response(JSON.stringify({ error: error.message }), {
                        status: error.statusCode || 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                throw error; // Let outer catch handle retryable errors
            }
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
