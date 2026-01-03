import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';

// This function runs on weekends at the configured time
// Note: The actual schedule is set in netlify.toml
const handler = async (event, context) => {
    console.log('Weekend scheduled reminder triggered at:', new Date().toISOString());

    try {
        const store = getStore('yom-data');

        // Get settings to check if paused and weekend sending enabled
        const settings = await store.get('settings', { type: 'json' });

        if (settings?.paused) {
            console.log('Reminders are paused, skipping scheduled send');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Skipped - reminders paused' })
            };
        }

        // Check if weekend sending is enabled
        if (!settings?.sendOnWeekends) {
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

        console.log('Weekend scheduled send result:', result);

        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Weekend scheduled reminder error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// Export as scheduled function - runs on weekends
// Default: Saturday and Sunday at 10am CST (4pm UTC)
export default schedule('0 16 * * 0,6', handler);
