import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';

// Helper to get current time in CST
function getCSTTime() {
    const now = new Date();
    // Convert to CST (America/Chicago)
    const cstString = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const cstDate = new Date(cstString);
    return {
        hours: cstDate.getHours(),
        minutes: cstDate.getMinutes(),
        dayOfWeek: cstDate.getDay(), // 0 = Sunday, 6 = Saturday
        dateString: cstDate.toDateString() // e.g., "Mon Jan 06 2025"
    };
}

// Parse time string like "13:30" into hours and minutes
function parseTimeString(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

// Check if current time is within the 15-minute window starting at targetTime
function isTimeToSend(currentHours, currentMinutes, targetHours, targetMinutes) {
    // Convert both to minutes since midnight for easier comparison
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const targetTotalMinutes = targetHours * 60 + targetMinutes;

    // Check if current time is within 0-14 minutes after the target time
    // This means if sendTime is 13:30, we'll trigger at the 13:30 run (not 13:45)
    const diff = currentTotalMinutes - targetTotalMinutes;
    return diff >= 0 && diff < 15;
}

// This function runs every 15 minutes and checks if it's time to send based on settings
const handler = async (event, context) => {
    const cst = getCSTTime();
    console.log(`Scheduled check at CST: ${cst.hours}:${String(cst.minutes).padStart(2, '0')} on ${cst.dateString}`);

    try {
        const store = getStore('yom-data');

        // Get settings
        const settings = await store.get('settings', { type: 'json' });

        // Check if paused
        if (settings?.paused) {
            console.log('Reminders are paused, skipping');
            return;
        }

        // Check if we already sent today
        const lastSendDate = await store.get('lastScheduledSendDate', { type: 'text' });
        if (lastSendDate === cst.dateString) {
            console.log('Already sent today, skipping');
            return;
        }

        // Determine if it's a weekend
        const isWeekend = cst.dayOfWeek === 0 || cst.dayOfWeek === 6;

        // If it's a weekend and weekend sending is disabled, skip
        if (isWeekend && !settings?.sendOnWeekends) {
            console.log('Weekend sending is disabled, skipping');
            return;
        }

        // Get the appropriate send time based on day type
        const defaultSendTime = '10:00';
        let targetTimeStr;
        if (isWeekend && settings?.weekendSendTime) {
            targetTimeStr = settings.weekendSendTime;
        } else {
            targetTimeStr = settings?.sendTime || defaultSendTime;
        }

        const targetTime = parseTimeString(targetTimeStr);
        console.log(`Target send time: ${targetTimeStr} (${isWeekend ? 'weekend' : 'weekday'})`);

        // Check if current time matches the target send time (within 15-min window)
        if (!isTimeToSend(cst.hours, cst.minutes, targetTime.hours, targetTime.minutes)) {
            console.log(`Not time yet. Current: ${cst.hours}:${String(cst.minutes).padStart(2, '0')}, Target: ${targetTimeStr}`);
            return;
        }

        console.log('Time matches! Sending reminder...');

        // Mark that we're sending today (do this before sending to prevent duplicates)
        await store.set('lastScheduledSendDate', cst.dateString);

        // Call the send-reminder function
        const reminderUrl = process.env.URL || 'http://localhost:8888';
        const response = await fetch(`${reminderUrl}/.netlify/functions/send-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual: false })
        });

        // Check if the response is ok before parsing JSON
        if (!response.ok) {
            const text = await response.text();
            console.error('Send-reminder returned error:', response.status, text.substring(0, 200));
            // Clear the send date so we can retry
            await store.set('lastScheduledSendDate', '');
            return;
        }

        // Check content-type before parsing as JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Send-reminder returned non-JSON response:', contentType, text.substring(0, 200));
            return;
        }

        const result = await response.json();
        console.log('Scheduled send result:', result);
        return;
    } catch (error) {
        console.error('Scheduled reminder error:', error);
        return;
    }
};

// Export as scheduled function - runs every 15 minutes
export default schedule('*/15 * * * *', handler);
