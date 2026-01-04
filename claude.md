# Year of Music - Architecture Guide

## Overview

Year of Music is a web-based admin dashboard for managing group SMS reminders. It sends daily text messages to group members in alphabetical rotation, reminding them it's their turn to share a song.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (no frameworks)
- **Backend**: Netlify Functions (serverless Node.js)
- **Storage**: Netlify Blobs (key-value store)
- **SMS**: Textbelt API
- **Hosting**: Netlify

## Directory Structure

```
yearofmusic/
├── netlify/
│   └── functions/           # Serverless functions
│       ├── login.js         # Password verification
│       ├── get-data.js      # Fetch app data
│       ├── update-data.js   # Modify members, settings
│       ├── send-reminder.js # Core SMS sending
│       ├── scheduled-reminder.js         # Weekday cron (Mon-Fri)
│       └── scheduled-reminder-weekend.js # Weekend cron (Sat-Sun)
├── public/                  # Static frontend files
│   ├── index.html          # Login page
│   ├── dashboard.html      # Admin dashboard
│   ├── app.js              # Frontend logic
│   └── styles.css          # Styling
├── scripts/
│   └── generate-images.js  # Build script for favicons/OG images
├── netlify.toml            # Netlify config & cron schedules
└── package.json
```

## Data Model (Netlify Blobs)

All data stored in `yom-data` store:

| Key | Type | Description |
|-----|------|-------------|
| `settings` | object | Password, send time, timezone, message template, pause flag, weekend toggle |
| `members` | array | Group members: `{ id, name, phone }` |
| `currentIndex` | number | Current position in rotation |
| `history` | array | Last 100 SMS sends with status |

## Netlify Functions

| Function | Type | Purpose |
|----------|------|---------|
| `login.js` | HTTP POST | Verify admin password |
| `get-data.js` | HTTP GET | Fetch all app data (filters sensitive fields) |
| `update-data.js` | HTTP POST | CRUD for members, settings, skip rotation |
| `send-reminder.js` | HTTP POST | Send SMS to current member, advance rotation |
| `scheduled-reminder.js` | Scheduled | Weekday trigger (10am CST / 4pm UTC) |
| `scheduled-reminder-weekend.js` | Scheduled | Weekend trigger (10am CST / 4pm UTC) |

## SMS Flow

1. Cron triggers `scheduled-reminder.js` or `scheduled-reminder-weekend.js`
2. Checks if paused or (for weekend) if weekend sending enabled
3. Calls `send-reminder.js` via HTTP POST
4. `send-reminder.js` fetches current member from rotation
5. Formats message with `{name}` placeholder
6. POSTs to Textbelt API: `https://textbelt.com/text`
7. Logs result to history
8. Advances `currentIndex` on success

## Key Configuration

**netlify.toml** defines:
- Cron schedules: `0 16 * * 1-5` (weekdays), `0 16 * * 0,6` (weekends)
- esbuild bundler for functions
- Redirect rule for SPA routing

## Dependencies

- `@netlify/blobs` - Data storage
- `@netlify/functions` - Scheduled function support (required for `schedule()` wrapper)
- `netlify-cli` (dev) - Local development
- `sharp` (dev) - Image generation

## Development

```bash
npm install
npm run dev    # Starts Netlify dev server on localhost:8888
```

## Common Issues

**Scheduled functions failing with "Cannot find module '@netlify/functions'"**
- Ensure `@netlify/functions` is in package.json dependencies
- Run `npm install` and redeploy

**SMS not sending**
- Check if reminders are paused in settings
- Check Textbelt quota remaining in history
- For weekends, verify "Send on Weekends" is enabled
