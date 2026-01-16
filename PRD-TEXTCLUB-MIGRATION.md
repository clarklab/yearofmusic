# Text Club Migration PRD

## Overview

Transform "Year of Music" from a single-tenant SMS reminder app into "Text Club" - a multi-tenant platform where anyone can create and manage their own group SMS reminder club.

**Primary Constraint**: The existing "yearofmusic" club has ~14 active members with a scheduled text going out tomorrow morning. **Zero downtime and zero data loss are mandatory.**

---

## Goals

1. **Don't break anything** - Current yearofmusic functionality must work throughout migration
2. **Generalize to "Text Club"** - Rebrand and make the app support multiple independent clubs
3. **Migrate existing data** - yearofmusic becomes the first Club with all data preserved
4. **Complete tenant isolation** - Each Club is private, admins only see their own data

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | Netlify Blobs (keep) | Already works, no new dependencies |
| Data structure | Prefixed keys | `club:{slug}:settings`, simpler than multiple stores |
| Routing | URL slug paths | `/yearofmusic`, `/book-club`, etc. |
| Auth | Per-Club password | Same simple model as today, just scoped to Club |
| SMS billing | Shared Textbelt key | Platform pays, simplifies onboarding |

---

## Data Model Changes

### Current (Single-Tenant)
```
Store: yom-data
├── settings        → Club settings object
├── members         → Array of members
├── currentIndex    → Rotation position
├── history         → Send history
└── lastScheduledSendDate → Duplicate prevention
```

### New (Multi-Tenant)
```
Store: textclub-data
├── clubs                           → Array of {slug, name, createdAt}
├── club:{slug}:settings            → Per-club settings (includes password)
├── club:{slug}:members             → Per-club members array
├── club:{slug}:currentIndex        → Per-club rotation position
├── club:{slug}:history             → Per-club send history
└── club:{slug}:lastScheduledSendDate → Per-club duplicate prevention
```

### Migration Mapping
| Old Key (yom-data) | New Key (textclub-data) |
|--------------------|-------------------------|
| `settings` | `club:yearofmusic:settings` |
| `members` | `club:yearofmusic:members` |
| `currentIndex` | `club:yearofmusic:currentIndex` |
| `history` | `club:yearofmusic:history` |
| `lastScheduledSendDate` | `club:yearofmusic:lastScheduledSendDate` |

**Plus**: Add `yearofmusic` to the `clubs` array.

---

## URL Structure

| Route | Purpose |
|-------|---------|
| `/` | Landing page (new) - explains Text Club, link to create |
| `/create` | Create new Club form |
| `/:slug` | Club login page |
| `/:slug/dashboard` | Club admin dashboard |

**Example URLs**:
- `textclub.app/yearofmusic` → Year of Music login
- `textclub.app/yearofmusic/dashboard` → Year of Music dashboard
- `textclub.app/book-buddies` → Book Buddies login
- `textclub.app/create` → Create new club

---

## API Changes

All existing endpoints get a `clubSlug` parameter:

| Endpoint | Change |
|----------|--------|
| `POST /login` | Add `clubSlug` to request body |
| `GET /get-data` | Add `clubSlug` query param |
| `POST /update-data` | Add `clubSlug` to request body |
| `POST /send-reminder` | Add `clubSlug` to request body |

**New Endpoints**:
| Endpoint | Purpose |
|----------|---------|
| `GET /get-clubs` | List all club slugs (for scheduler) |
| `POST /create-club` | Create new club with name, slug, password |
| `GET /check-slug` | Check if slug is available |

---

## Scheduled Reminder Changes

### Current Behavior
- Runs every 15 minutes
- Checks single club's settings
- Sends if time matches

### New Behavior
- Runs every 15 minutes (unchanged)
- Fetches list of all clubs
- For each club:
  - Check if paused
  - Check if already sent today (per-club tracking)
  - Check timezone and send time
  - Send if conditions met
- Process clubs in parallel for efficiency

```javascript
// Pseudocode
const clubs = await store.get('clubs');
await Promise.all(clubs.map(club => processClubReminder(club.slug)));
```

---

## Implementation Phases

### Phase 0: Pre-Migration Safety (Do First)
**Goal**: Ensure we can rollback if anything goes wrong

- [ ] Create backup of current `yom-data` blob store
- [ ] Document current state (member count, currentIndex, last send date)
- [ ] Test that current system works (manual send test if safe)

### Phase 1: Data Migration Script
**Goal**: Copy existing data to new structure without disrupting old system

- [ ] Create migration script in `scripts/migrate-to-textclub.js`
- [ ] Script reads from `yom-data`, writes to `textclub-data`
- [ ] Creates `clubs` array with yearofmusic as first entry
- [ ] Copies all data with `club:yearofmusic:` prefix
- [ ] **Run migration but DON'T deploy new functions yet**
- [ ] Verify migrated data is correct

### Phase 2: Update Functions (Backward Compatible)
**Goal**: Functions work with both old and new data structure

- [ ] Update `get-data.js` to accept optional `clubSlug`, default to reading from new structure
- [ ] Update `login.js` to accept `clubSlug`
- [ ] Update `update-data.js` to accept `clubSlug`
- [ ] Update `send-reminder.js` to accept `clubSlug`
- [ ] **All functions fall back to yearofmusic if no slug provided**
- [ ] Add `get-clubs.js` endpoint
- [ ] Add `create-club.js` endpoint
- [ ] Add `check-slug.js` endpoint

### Phase 3: Update Scheduler
**Goal**: Scheduler processes all clubs

- [ ] Update `scheduled-reminder.js` to:
  1. Fetch all clubs
  2. Process each club independently
  3. Respect per-club timezone/time settings
  4. Track `lastScheduledSendDate` per club
- [ ] Test with only yearofmusic in clubs list

### Phase 4: Update Frontend
**Goal**: Dashboard works with club context

- [ ] Create new landing page at `/index.html`
- [ ] Create club creation page at `/create.html`
- [ ] Rename current login to work at `/:slug/index.html` pattern
- [ ] Update `app.js` to:
  - Extract club slug from URL
  - Include slug in all API calls
  - Show club name in header
- [ ] Update `styles.css` with Text Club branding

### Phase 5: Routing Setup
**Goal**: URL structure works correctly

- [ ] Update `netlify.toml` redirects for new routing
- [ ] Handle `/:slug` → club login
- [ ] Handle `/:slug/dashboard` → club dashboard
- [ ] Handle `/create` → creation page
- [ ] Handle `/` → landing page

### Phase 6: Cleanup (After Verification)
**Goal**: Remove old single-tenant code

- [ ] Remove fallback to `yom-data` store
- [ ] Archive old store (don't delete)
- [ ] Update CLAUDE.md with new architecture

---

## Detailed Function Changes

### login.js
```javascript
// Before
const { password } = JSON.parse(event.body);
const settings = await store.get('settings', { type: 'json' });

// After
const { password, clubSlug } = JSON.parse(event.body);
const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
```

### get-data.js
```javascript
// Before
const settings = await store.get('settings', { type: 'json' });

// After
const clubSlug = event.queryStringParameters?.clubSlug || 'yearofmusic';
const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
```

### scheduled-reminder.js
```javascript
// Before
// Process single hardcoded club

// After
const clubs = await store.get('clubs', { type: 'json' }) || [];
for (const club of clubs) {
  await processClubReminder(club.slug, store);
}
```

---

## New Files

| File | Purpose |
|------|---------|
| `scripts/migrate-to-textclub.js` | One-time migration script |
| `public/landing.html` | New landing page explaining Text Club |
| `public/create.html` | Club creation form |
| `netlify/functions/get-clubs.js` | List clubs (for scheduler) |
| `netlify/functions/create-club.js` | Create new club |
| `netlify/functions/check-slug.js` | Validate slug availability |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Migration corrupts data | Run migration to NEW store, old store untouched |
| New scheduler fails | Keep old scheduler code, feature flag to switch |
| API breaks during deploy | Backward compatible - no clubSlug = yearofmusic default |
| Tomorrow's text fails | Phase 1-2 can be deployed today, scheduler changes later |

### Rollback Plan
1. If scheduler fails: Revert to old `scheduled-reminder.js`
2. If API fails: Functions have fallback to `yearofmusic`
3. If everything fails: Old `yom-data` store is untouched, can revert entirely

---

## Success Criteria

### Phase 1-2 Complete (Safe to do today)
- [ ] Migrated data exists in `textclub-data` store
- [ ] yearofmusic dashboard still works
- [ ] Can manually send reminder successfully

### Phase 3 Complete (Tomorrow's text works)
- [ ] Scheduled reminder fires for yearofmusic
- [ ] Text arrives at correct time

### Phase 4-5 Complete (Multi-tenant ready)
- [ ] Can create new club via `/create`
- [ ] New club gets own login, dashboard, rotation
- [ ] yearofmusic fully isolated from new clubs

### Full Migration Complete
- [ ] Landing page live
- [ ] Multiple clubs operating independently
- [ ] Old `yom-data` store archived

---

## Timeline Recommendation

**Today (Before Tomorrow's Text)**:
1. Run Phase 0 (backup, verify current state)
2. Run Phase 1 (migration script)
3. Deploy Phase 2 (backward-compatible functions)
4. Verify yearofmusic still works

**After Tomorrow's Text Succeeds**:
5. Deploy Phase 3 (multi-tenant scheduler)
6. Verify scheduled send works

**Following Days**:
7. Phase 4-5 (frontend, routing)
8. Phase 6 (cleanup)

---

## Decisions (Resolved)

1. **Domain**: New domain TBD (likely textclub.fun)
2. **Club limits**: 25 members per club max
3. **Club deletion**: Yes, admins can delete their club (data deleted)
4. **Branding**: Rename to Text Club, keep existing UI
