import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';

// Helper to get current time in a specific timezone
function getTimeInTimezone(timezone) {
    const now = new Date();
    const tzString = now.toLocaleString('en-US', { timeZone: timezone });
    const tzDate = new Date(tzString);
    return {
        hours: tzDate.getHours(),
        minutes: tzDate.getMinutes(),
        dayOfWeek: tzDate.getDay(), // 0 = Sunday, 6 = Saturday
        dateString: tzDate.toDateString() // e.g., "Mon Jan 06 2025"
    };
}

// Parse time string like "13:30" into hours and minutes
function parseTimeString(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

// Check if current time is within the 15-minute window starting at targetTime
function isTimeToSend(currentHours, currentMinutes, targetHours, targetMinutes) {
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const targetTotalMinutes = targetHours * 60 + targetMinutes;
    const diff = currentTotalMinutes - targetTotalMinutes;
    return diff >= 0 && diff < 15;
}

// Process a single club's reminder
async function processClub(clubSlug, store) {
    try {
        const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });

        if (!settings) {
            console.log(`[${clubSlug}] No settings found, skipping`);
            return;
        }

        // Check if paused
        if (settings.paused) {
            console.log(`[${clubSlug}] Reminders are paused, skipping`);
            return;
        }

        // Get timezone-aware current time for this club
        const timezone = settings.timezone || 'America/Chicago';
        const localTime = getTimeInTimezone(timezone);

        console.log(`[${clubSlug}] Local time: ${localTime.hours}:${String(localTime.minutes).padStart(2, '0')} (${timezone})`);

        // Check if we already sent today for this club
        const lastSendDate = await store.get(`club:${clubSlug}:lastScheduledSendDate`, { type: 'text' });
        if (lastSendDate === localTime.dateString) {
            console.log(`[${clubSlug}] Already sent today, skipping`);
            return;
        }

        // Determine if it's a weekend
        const isWeekend = localTime.dayOfWeek === 0 || localTime.dayOfWeek === 6;

        // If it's a weekend and weekend sending is disabled, skip
        if (isWeekend && !settings.sendOnWeekends) {
            console.log(`[${clubSlug}] Weekend sending is disabled, skipping`);
            return;
        }

        // Get the appropriate send time based on day type
        const defaultSendTime = '10:00';
        let targetTimeStr;
        if (isWeekend && settings.weekendSendTime) {
            targetTimeStr = settings.weekendSendTime;
        } else {
            targetTimeStr = settings.sendTime || defaultSendTime;
        }

        const targetTime = parseTimeString(targetTimeStr);
        console.log(`[${clubSlug}] Target send time: ${targetTimeStr} (${isWeekend ? 'weekend' : 'weekday'})`);

        // Check if current time matches the target send time (within 15-min window)
        if (!isTimeToSend(localTime.hours, localTime.minutes, targetTime.hours, targetTime.minutes)) {
            console.log(`[${clubSlug}] Not time yet`);
            return;
        }

        console.log(`[${clubSlug}] Time matches! Sending reminder...`);

        // Mark that we're sending today (do this before sending to prevent duplicates)
        await store.set(`club:${clubSlug}:lastScheduledSendDate`, localTime.dateString);

        // Call the send-reminder function
        const reminderUrl = process.env.URL || 'http://localhost:8888';
        const response = await fetch(`${reminderUrl}/.netlify/functions/send-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual: false, clubSlug })
        });

        // Check if the response is ok before parsing JSON
        if (!response.ok) {
            const text = await response.text();
            console.error(`[${clubSlug}] Send-reminder returned error:`, response.status, text.substring(0, 200));
            // Clear the send date so we can retry
            await store.set(`club:${clubSlug}:lastScheduledSendDate`, '');
            return;
        }

        // Check content-type before parsing as JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error(`[${clubSlug}] Send-reminder returned non-JSON response:`, contentType, text.substring(0, 200));
            return;
        }

        const result = await response.json();
        console.log(`[${clubSlug}] Scheduled send result:`, result);

    } catch (error) {
        console.error(`[${clubSlug}] Error processing club:`, error);
    }
}

// This function runs every 15 minutes and processes all clubs
const handler = async (event, context) => {
    console.log('='.repeat(50));
    console.log('Scheduled reminder check starting...');
    console.log('='.repeat(50));

    try {
        const store = getStore('textclub-data');

        // Get all clubs
        const clubs = await store.get('clubs', { type: 'json' }) || [];

        if (clubs.length === 0) {
            console.log('No clubs found');
            return;
        }

        console.log(`Processing ${clubs.length} club(s)...`);

        // Process each club sequentially to avoid rate limits
        // (Could be parallelized with Promise.all if needed)
        for (const club of clubs) {
            await processClub(club.slug, store);
        }

        console.log('='.repeat(50));
        console.log('Scheduled reminder check complete');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('Scheduled reminder error:', error);
    }
};

// Export as scheduled function - runs every 15 minutes
export default schedule('*/15 * * * *', handler);
