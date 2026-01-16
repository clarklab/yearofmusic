# Rotato - Architecture Guide

## Overview

Rotato is a multi-tenant web platform for managing group SMS reminders. Each "Club" is an independent group where members take turns on a rotating schedule, getting text reminders when it's their turn. Perfect for book clubs, song sharing, recipe exchanges, or any group activity.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (no frameworks)
- **Backend**: Netlify Functions (serverless Node.js)
- **Storage**: Netlify Blobs (key-value store, multi-tenant)
- **SMS**: Textbelt API (shared key)
- **Hosting**: Netlify

## Directory Structure

```
rotato/
├── netlify/
│   └── functions/           # Serverless functions
│       ├── login.js         # Club password verification
│       ├── get-data.js      # Fetch club data
│       ├── update-data.js   # Modify members, settings
│       ├── send-reminder.js # Core SMS sending
│       ├── scheduled-reminder.js # Multi-tenant cron (every 15 min)
│       ├── create-club.js   # Create new club
│       ├── delete-club.js   # Delete a club
│       ├── check-slug.js    # Validate slug availability
│       ├── get-club-info.js # Get club name for login page
│       └── fun-content.js   # Jokes and horoscopes helper
├── public/                  # Static frontend files
│   ├── index.html          # Landing page
│   ├── create.html         # Create club page
│   ├── club-login.html     # Club login page (served at /:slug)
│   ├── dashboard.html      # Admin dashboard (served at /:slug/dashboard)
│   ├── app.js              # Dashboard logic
│   └── styles.css          # Styling
├── scripts/
│   ├── backup-data.js      # Backup current data
│   ├── migrate-to-textclub.js # Migration script
│   ├── verify-migration.js # Verify migration
│   └── generate-images.js  # Build script for favicons/OG images
├── netlify.toml            # Netlify config & routing
└── package.json
```

## Data Model (Netlify Blobs)

All data stored in `textclub-data` store with prefixed keys:

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `clubs` | array | List of all clubs: `{ slug, name, createdAt }` |
| `club:{slug}:settings` | object | Password, send time, timezone, message template, etc. |
| `club:{slug}:members` | array | Club members: `{ id, name, phone }` |
| `club:{slug}:currentIndex` | number | Current position in rotation |
| `club:{slug}:history` | array | Last 100 SMS sends with status |
| `club:{slug}:lastScheduledSendDate` | string | Duplicate prevention per club |

## URL Structure

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/create` | Create new club |
| `/:slug` | Club login page |
| `/:slug/dashboard` | Club admin dashboard |

## Netlify Functions

| Function | Type | Purpose |
|----------|------|---------|
| `login.js` | HTTP POST | Verify club password |
| `get-data.js` | HTTP GET | Fetch club data (requires `clubSlug` query param) |
| `update-data.js` | HTTP POST | CRUD for members, settings (requires `clubSlug` in body) |
| `send-reminder.js` | HTTP POST | Send SMS to current member (requires `clubSlug` in body) |
| `scheduled-reminder.js` | Scheduled | Multi-tenant cron - processes all clubs every 15 min |
| `create-club.js` | HTTP POST | Create new club |
| `delete-club.js` | HTTP POST | Delete club (requires password confirmation) |
| `check-slug.js` | HTTP GET | Check if slug is available |
| `get-club-info.js` | HTTP GET | Get club name for display |

## SMS Flow

1. Cron triggers `scheduled-reminder.js` every 15 minutes
2. Fetches all clubs from `clubs` array
3. For each club:
   - Check if paused
   - Check if already sent today (per-club tracking)
   - Check timezone and send time
   - If time matches, call `send-reminder.js` with `clubSlug`
4. `send-reminder.js` formats message and sends via Textbelt
5. Logs result to club's history
6. Advances `currentIndex` on success

## Limits

- **Members per club**: 25 max
- **History entries**: 100 per club
- **Slug length**: 2-30 characters, lowercase alphanumeric with hyphens

## Authentication

- Each club has its own password (stored in settings)
- Session stored in `sessionStorage` with key `textclub-auth-{clubSlug}`
- No cross-club authentication - each club is completely isolated

## Environment Variables

- `TEXTBELT_API_KEY` - Textbelt SMS API key (shared across all clubs)
- `URL` - Netlify site URL (auto-set by Netlify)

## Development

```bash
npm install
npm run dev    # Starts Netlify dev server on localhost:8888
```

## Migration from Year of Music (v1)

The original "Year of Music" single-tenant app was migrated to multi-tenant:
- Data moved from `yom-data` store to `textclub-data` store
- Keys prefixed with `club:yearofmusic:`
- Year of Music is now just another club in the platform

Migration scripts in `scripts/`:
```bash
# Backup first
npx netlify dev:exec node scripts/backup-data.js

# Dry run migration
npx netlify dev:exec node scripts/migrate-to-textclub.js

# Execute migration
npx netlify dev:exec node scripts/migrate-to-textclub.js --execute

# Verify migration
npx netlify dev:exec node scripts/verify-migration.js
```
