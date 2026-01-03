# Year of Music - Daily Song Reminder App

A simple web app that sends daily SMS reminders to your group members to share their song of the day!

## Features

- **Mobile-first admin dashboard** - Manage your group on the go
- **Automated daily reminders** - Sends SMS at 10am CST on weekdays (skips weekends)
- **Simple rotation system** - Automatically cycles through group members alphabetically
- **Manual controls** - Skip turns or send manual reminders
- **Customizable settings** - Edit message template, send time, and timezone
- **Pause/unpause** - Pause reminders for holidays or breaks
- **Send history** - Track all sent reminders
- **SMS via Textbelt API** - Reliable SMS delivery

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (mobile-first)
- **Backend**: Netlify Functions (serverless)
- **Database**: Netlify Blobs (key-value storage)
- **SMS**: Textbelt API
- **Hosting**: Netlify

## Getting Started

### Prerequisites

- Netlify account
- Textbelt API key

### Deployment

1. **Deploy to Netlify**
   - Connect your GitHub repo to Netlify
   - Build settings:
     - Build command: (leave empty)
     - Publish directory: `public`
   - Deploy!

2. **Environment Variables** (Optional)
   - The Textbelt API key is stored in Netlify Blobs
   - You can update it through the settings in the dashboard

3. **Access the Dashboard**
   - Navigate to your Netlify URL
   - Login with password: `yom`
   - Start adding members!

## Usage

### Admin Dashboard

1. **Login** - Use password `yom` (can be changed later if needed)
2. **Add Members** - Click "Add Member" and enter name and phone number (10 digits, no country code)
3. **Manage Rotation** - Members are automatically sorted alphabetically
4. **Send Reminders** - Use "Send Reminder Now" to manually trigger
5. **Skip Turns** - Use "Skip Next Person" to advance rotation
6. **Configure Settings**:
   - Send time (default 10:00am)
   - Timezone (default CST)
   - Message template (use `{name}` for personalization)
   - Pause/unpause daily reminders

### Automatic Reminders

The app automatically sends reminders:
- **When**: Every weekday at 10am CST (configurable)
- **Who**: The next person in the alphabetical rotation
- **What**: Your customized message template
- **Skips**: Weekends (Saturday & Sunday)

## Local Development

```bash
# Install dependencies
npm install

# Run locally with Netlify Dev
npm run dev

# Access at http://localhost:8888
```

## Data Structure

All data is stored in Netlify Blobs:

- **settings**: App configuration, password, API key, message template
- **members**: Array of group members (name, phone, id)
- **currentIndex**: Current position in rotation
- **history**: Send history (last 100 sends)

## Textbelt API

This app uses Textbelt for SMS sending. Check your quota at any time in the dashboard after sending a message.

- Free tier: 1 text per day
- Paid: $1.95 per 100 texts (or use your own Textbelt key)

## Customization

### Change Send Schedule

Edit `netlify.toml` to change the cron schedule:

```toml
[[functions]]
  path = "/.netlify/functions/scheduled-reminder"
  schedule = "0 16 * * 1-5"  # 10am CST (4pm UTC) on weekdays
```

### Change Password

The password is stored in Netlify Blobs. You can manually update it or add a password change feature in the dashboard.

## Support

For issues or questions, check the Textbelt documentation or Netlify documentation.

Happy Year of Music! 🎵
