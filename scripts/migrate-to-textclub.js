/**
 * Migration Script - Phase 1
 *
 * Migrates data from single-tenant yom-data store to multi-tenant textclub-data store.
 * Creates yearofmusic as the first club.
 *
 * Run with: npx netlify dev:exec node scripts/migrate-to-textclub.js
 *
 * Options:
 *   --dry-run    Preview migration without writing (default)
 *   --execute    Actually perform the migration
 */

import { getStore } from '@netlify/blobs';

const CLUB_SLUG = 'yearofmusic';
const CLUB_NAME = 'Year of Music';

async function migrate() {
    const isDryRun = !process.argv.includes('--execute');

    console.log('='.repeat(50));
    console.log(isDryRun ? 'DRY RUN - No data will be written' : 'EXECUTING MIGRATION');
    console.log('='.repeat(50));
    console.log('');

    // Source store (old single-tenant)
    const sourceStore = getStore('yom-data');

    // Target store (new multi-tenant)
    const targetStore = getStore('textclub-data');

    // Read all data from source
    console.log('Reading from yom-data store...');
    const settings = await sourceStore.get('settings', { type: 'json' });
    const members = await sourceStore.get('members', { type: 'json' });
    const currentIndex = await sourceStore.get('currentIndex', { type: 'json' });
    const history = await sourceStore.get('history', { type: 'json' });
    const lastScheduledSendDate = await sourceStore.get('lastScheduledSendDate', { type: 'json' });

    // Validate source data
    if (!settings) {
        console.error('ERROR: No settings found in yom-data. Is the store empty?');
        process.exit(1);
    }

    console.log('');
    console.log('=== Source Data Summary ===');
    console.log(`Members: ${members?.length || 0}`);
    console.log(`Current Index: ${currentIndex ?? 'not set'}`);
    console.log(`History entries: ${history?.length || 0}`);
    console.log(`Last scheduled send: ${lastScheduledSendDate || 'not set'}`);
    console.log(`Send time: ${settings?.sendTime || 'not set'}`);
    console.log(`Timezone: ${settings?.timezone || 'not set'}`);
    console.log(`Paused: ${settings?.paused || false}`);
    console.log('');

    // Prepare target data
    const clubs = [{
        slug: CLUB_SLUG,
        name: CLUB_NAME,
        createdAt: new Date().toISOString()
    }];

    // Keys to write
    const migrations = [
        { key: 'clubs', value: clubs },
        { key: `club:${CLUB_SLUG}:settings`, value: settings },
        { key: `club:${CLUB_SLUG}:members`, value: members || [] },
        { key: `club:${CLUB_SLUG}:currentIndex`, value: currentIndex ?? 0 },
        { key: `club:${CLUB_SLUG}:history`, value: history || [] },
        { key: `club:${CLUB_SLUG}:lastScheduledSendDate`, value: lastScheduledSendDate || null }
    ];

    console.log('=== Migration Plan ===');
    for (const { key, value } of migrations) {
        const preview = JSON.stringify(value).slice(0, 80);
        console.log(`  ${key}: ${preview}${preview.length >= 80 ? '...' : ''}`);
    }
    console.log('');

    if (isDryRun) {
        console.log('DRY RUN COMPLETE - No data written');
        console.log('');
        console.log('To execute migration, run:');
        console.log('  npx netlify dev:exec node scripts/migrate-to-textclub.js --execute');
        return;
    }

    // Execute migration
    console.log('Writing to textclub-data store...');
    for (const { key, value } of migrations) {
        await targetStore.setJSON(key, value);
        console.log(`  ✓ ${key}`);
    }

    console.log('');
    console.log('=== Migration Complete ===');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify data: npx netlify dev:exec node scripts/verify-migration.js');
    console.log('2. Wait for tomorrow\'s scheduled text to succeed');
    console.log('3. Deploy updated functions');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
