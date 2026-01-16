/**
 * Verification Script
 *
 * Compares data in yom-data (source) with textclub-data (target) to verify migration.
 *
 * Run with: npx netlify dev:exec node scripts/verify-migration.js
 */

import { getStore } from '@netlify/blobs';

const CLUB_SLUG = 'yearofmusic';

async function verify() {
    console.log('=== Migration Verification ===');
    console.log('');

    const sourceStore = getStore('yom-data');
    const targetStore = getStore('textclub-data');

    // Check clubs array exists
    const clubs = await targetStore.get('clubs', { type: 'json' });
    if (!clubs || clubs.length === 0) {
        console.error('FAIL: No clubs found in textclub-data');
        process.exit(1);
    }
    console.log(`✓ Clubs array exists with ${clubs.length} club(s)`);

    const yomClub = clubs.find(c => c.slug === CLUB_SLUG);
    if (!yomClub) {
        console.error(`FAIL: Club '${CLUB_SLUG}' not found in clubs array`);
        process.exit(1);
    }
    console.log(`✓ Club '${CLUB_SLUG}' found: "${yomClub.name}"`);
    console.log('');

    // Compare each data type
    const checks = [
        { name: 'settings', sourceKey: 'settings', targetKey: `club:${CLUB_SLUG}:settings` },
        { name: 'members', sourceKey: 'members', targetKey: `club:${CLUB_SLUG}:members` },
        { name: 'currentIndex', sourceKey: 'currentIndex', targetKey: `club:${CLUB_SLUG}:currentIndex` },
        { name: 'history', sourceKey: 'history', targetKey: `club:${CLUB_SLUG}:history` },
        { name: 'lastScheduledSendDate', sourceKey: 'lastScheduledSendDate', targetKey: `club:${CLUB_SLUG}:lastScheduledSendDate` }
    ];

    let allPassed = true;

    for (const { name, sourceKey, targetKey } of checks) {
        const sourceValue = await sourceStore.get(sourceKey, { type: 'json' });
        const targetValue = await targetStore.get(targetKey, { type: 'json' });

        const sourceJson = JSON.stringify(sourceValue);
        const targetJson = JSON.stringify(targetValue);

        if (sourceJson === targetJson) {
            console.log(`✓ ${name}: Match`);
        } else {
            console.log(`✗ ${name}: MISMATCH`);
            console.log(`  Source: ${sourceJson?.slice(0, 100)}...`);
            console.log(`  Target: ${targetJson?.slice(0, 100)}...`);
            allPassed = false;
        }
    }

    console.log('');
    if (allPassed) {
        console.log('=== ALL CHECKS PASSED ===');
        console.log('Migration verified successfully!');
    } else {
        console.log('=== VERIFICATION FAILED ===');
        console.log('Some data did not match. Review the mismatches above.');
        process.exit(1);
    }
}

verify().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
