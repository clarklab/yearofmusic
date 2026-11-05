# Text Club Migration Notes

## Status: CODE COMPLETE - Ready for Deploy

All code has been written. Migration steps below should be followed AFTER tomorrow's scheduled text succeeds.

---

## Phase 0: Backup & Documentation [COMPLETE]

### Files Created
- `scripts/backup-data.js` - Dumps yom-data to JSON file
- Added `backup-*.json` to `.gitignore`

### Before Deploy Checklist
- [ ] Run backup: `npm run backup`
- [ ] Document current member count, currentIndex, last send date
- [ ] Verify current system works (check recent history)

---

## Phase 1: Migration Script [COMPLETE]

### Target Structure
```
Store: textclub-data
├── clubs                              → [{slug: 'yearofmusic', name: 'Year of Music', createdAt: '...'}]
├── club:yearofmusic:settings          → settings object
├── club:yearofmusic:members           → members array
├── club:yearofmusic:currentIndex      → number
├── club:yearofmusic:history           → history array
└── club:yearofmusic:lastScheduledSendDate → date string
```

### Files Created
- `scripts/migrate-to-textclub.js` - Migration script (dry-run by default)
- `scripts/verify-migration.js` - Verification script

### How to Run
```bash
# Dry run (preview only)
npm run migrate

# Execute migration
npm run migrate:execute

# Verify migration
npm run migrate:verify
```

---

## Phase 2: Updated Functions [COMPLETE]

All functions updated to use `textclub-data` store with `club:{slug}:` prefix:
- `login.js` - Requires `clubSlug` in body
- `get-data.js` - Requires `clubSlug` query param
- `update-data.js` - Requires `clubSlug` in body
- `send-reminder.js` - Requires `clubSlug` in body

### New Functions Created
- `create-club.js` - Create new club
- `delete-club.js` - Delete club with password confirmation
- `check-slug.js` - Check slug availability
- `get-club-info.js` - Get club name for display

---

## Phase 3: Multi-Tenant Scheduler [COMPLETE]

Updated `scheduled-reminder.js` to:
- Fetch all clubs from `clubs` array
- Process each club independently
- Respect per-club timezone and send time
- Track `lastScheduledSendDate` per club

---

## Phase 4: Frontend [COMPLETE]

### New Files
- `public/index.html` - Landing page (Text Club branding)
- `public/create.html` - Club creation page
- `public/club-login.html` - Club login page

### Updated Files
- `public/dashboard.html` - Text Club branding, club name display, delete club option
- `public/app.js` - Extract clubSlug from URL, include in all API calls

---

## Phase 5: Routing [COMPLETE]

Updated `netlify.toml` with routes:
- `/` → Landing page
- `/create` → Create club page
- `/:slug` → Club login
- `/:slug/dashboard` → Club dashboard

---

## Phase 6: Documentation [COMPLETE]

- Updated `CLAUDE.md` with new multi-tenant architecture
- Updated `package.json` with new name and npm scripts

---

## Deployment Checklist

### Before Tomorrow's Text (DO NOTHING - just verify it works)
1. [ ] Verify current yearofmusic dashboard works
2. [ ] Wait for tomorrow's scheduled text to send
3. [ ] Confirm text was received successfully

### After Tomorrow's Text Succeeds
1. [ ] Run backup: `npm run backup`
2. [ ] Run migration dry run: `npm run migrate`
3. [ ] Review migration output - verify all data looks correct
4. [ ] Run migration: `npm run migrate:execute`
5. [ ] Verify migration: `npm run migrate:verify`
6. [ ] Deploy to Netlify (git push)
7. [ ] Test yearofmusic login at `/yearofmusic`
8. [ ] Test yearofmusic dashboard at `/yearofmusic/dashboard`
9. [ ] Verify all members and settings are intact
10. [ ] Test creating a new club at `/create`
11. [ ] Wait for next scheduled reminder to verify multi-tenant scheduler works

### Rollback Plan
If anything fails:
1. Old `yom-data` store is completely untouched
2. Can revert git to previous commit
3. Redeploy old code
4. Everything returns to exactly how it was

---

## Files Changed Summary

### New Files
- `scripts/backup-data.js`
- `scripts/migrate-to-textclub.js`
- `scripts/verify-migration.js`
- `netlify/functions/create-club.js`
- `netlify/functions/delete-club.js`
- `netlify/functions/check-slug.js`
- `netlify/functions/get-club-info.js`
- `public/create.html`
- `public/club-login.html`

### Modified Files
- `netlify/functions/login.js` - Added clubSlug
- `netlify/functions/get-data.js` - Added clubSlug
- `netlify/functions/update-data.js` - Added clubSlug, member limit
- `netlify/functions/send-reminder.js` - Added clubSlug
- `netlify/functions/scheduled-reminder.js` - Multi-tenant loop
- `public/index.html` - New landing page
- `public/dashboard.html` - Text Club branding, delete club
- `public/app.js` - clubSlug extraction, all API calls
- `netlify.toml` - New routing rules
- `package.json` - New name, version, scripts
- `CLAUDE.md` - New architecture docs
- `.gitignore` - Added backup files
