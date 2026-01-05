import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';

// This function runs daily at 10am CST (4pm UTC)
// It checks settings to determine if it should send on weekends
const handler = async (event, context) => {
    console.log('Scheduled reminder triggered at:', new Date().toISOString());

    try {
        const store = getStore('yom-data');

        // Get settings to check if paused
        const settings = await store.get('settings', { type: 'json' });

        if (settings?.paused) {
            console.log('Reminders are paused, skipping scheduled send');
            return;
        }

        // Check if today is a weekend (0 = Sunday, 6 = Saturday)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // If it's a weekend and weekend sending is disabled, skip
        if (isWeekend && !settings?.sendOnWeekends) {
            console.log('Weekend sending is disabled, skipping scheduled send');
            return;
        }

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

// Export as scheduled function - runs daily at 10am CST (4pm UTC)
export default schedule('0 16 * * *', handler);
