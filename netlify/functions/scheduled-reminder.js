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
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Skipped - reminders paused' })
            };
        }

        // Check if today is a weekend (0 = Sunday, 6 = Saturday)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // If it's a weekend and weekend sending is disabled, skip
        if (isWeekend && !settings?.sendOnWeekends) {
            console.log('Weekend sending is disabled, skipping scheduled send');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Skipped - weekend sending disabled' })
            };
        }

        // Call the send-reminder function
        const reminderUrl = process.env.URL || 'http://localhost:8888';
        const response = await fetch(`${reminderUrl}/.netlify/functions/send-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual: false })
        });

        const result = await response.json();

        console.log('Scheduled send result:', result);

        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Scheduled reminder error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// Export as scheduled function - runs daily at 10am CST (4pm UTC)
export default schedule('0 16 * * *', handler);
