/**
 * Backup Script - Phase 0
 *
 * Dumps all data from yom-data blob store to a local JSON file.
 * Run with: npx netlify dev:exec node scripts/backup-data.js
 */

import { getStore } from '@netlify/blobs';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function backup() {
    console.log('Starting backup of yom-data store...\n');

    const store = getStore('yom-data');

    // Fetch all data
    const settings = await store.get('settings', { type: 'json' });
    const members = await store.get('members', { type: 'json' });
    const currentIndex = await store.get('currentIndex', { type: 'json' });
    const history = await store.get('history', { type: 'json' });
    const lastScheduledSendDate = await store.get('lastScheduledSendDate', { type: 'json' });

    const backup = {
        exportedAt: new Date().toISOString(),
        store: 'yom-data',
        data: {
            settings,
            members,
            currentIndex,
            history,
            lastScheduledSendDate
        }
    };

    // Summary
    console.log('=== Backup Summary ===');
    console.log(`Members: ${members?.length || 0}`);
    console.log(`Current Index: ${currentIndex}`);
    console.log(`History entries: ${history?.length || 0}`);
    console.log(`Last scheduled send: ${lastScheduledSendDate || 'not set'}`);
    console.log(`Paused: ${settings?.paused || false}`);
    console.log(`Send time: ${settings?.sendTime || 'not set'}`);
    console.log(`Timezone: ${settings?.timezone || 'not set'}`);
    console.log('');

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-yom-data-${timestamp}.json`;
    const filepath = join(__dirname, '..', filename);

    writeFileSync(filepath, JSON.stringify(backup, null, 2));
    console.log(`Backup saved to: ${filename}`);

    // Also save a "latest" copy for easy reference
    const latestPath = join(__dirname, '..', 'backup-latest.json');
    writeFileSync(latestPath, JSON.stringify(backup, null, 2));
    console.log('Also saved to: backup-latest.json');

    return backup;
}

backup().catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
});
