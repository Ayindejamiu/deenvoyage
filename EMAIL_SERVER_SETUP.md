# Email Server Setup - WORKING SOLUTION ✅

## The Problem
Firebase requires a **Blaze (pay-as-you-go) plan** to use Cloud Functions with outbound network requests.

## The Solution
I've created a standalone Express server that handles email sending using Resend API.

## How It Works

1. **User submits registration** on lecture.html
2. **Registration saved** to Firebase Database
3. **Frontend calls** the Express server at `http://localhost:3001/send-lecture-emails`
4. **Server sends two emails** via Resend:
   - ✉️ Confirmation to registrant
   - ✉️ Notification to admin (hello@deenvoyage.com)

## Setup Instructions

### 1. Start the Email Server

```bash
cd /home/jamiu/Documents/deenvoyage/server
node send-email.js
```

The server will run on **port 3001** and handle email sending.

### 2. Open Your Website

Open `lecture.html` in your browser (make sure you're serving it via a local server or Firebase hosting).

### 3. Test Registration

1. Fill out the registration form
2. Submit
3. Check:
   - ✅ Registration saved to Firebase
   - ✅ Registrant receives confirmation email
   - ✅ Admin receives notification at hello@deenvoyage.com

## Email Server Details

- **File**: `server/send-email.js`
- **Port**: 3001
- **Endpoint**: `POST /send-lecture-emails`
- **CORS**: Enabled for localhost and deenvoyage.com

## Production Deployment

For production, you have several options:

### Option 1: Upgrade Firebase to Blaze Plan (Recommended)
- Visit: https://console.firebase.google.com/project/deenvoyage-f065a/usage/details
- Upgrade to Blaze plan (pay-as-you-go)
- Redeploy Cloud Functions: `firebase deploy --only functions`
- Use the Cloud Functions version (already coded in `functions/index.js`)

### Option 2: Deploy Express Server
Deploy the server folder to:
- **Heroku**: Free tier available
- **Railway**: Easy deployment
- **Render**: Free tier available
- **DigitalOcean**: $5/month
- **AWS EC2**: Various pricing

Then update the fetch URL in `js/lecture-registration.js`:
```javascript
const response = await fetch('https://your-server-domain.com/send-lecture-emails', {
```

### Option 3: Use Serverless Functions
Deploy as serverless function to:
- **Vercel Functions**
- **Netlify Functions**
- **AWS Lambda**

## Current Status

✅ Email server running on port 3001  
✅ Resend API integrated with your key  
✅ Both confirmation and admin emails configured  
✅ Professional HTML email templates  
✅ Frontend connected to email server  

## Testing the Server

You can test the email endpoint directly:

```bash
curl -X POST http://localhost:3001/send-lecture-emails \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "your-email@example.com",
    "phone": "+1234567890",
    "attendees": "2",
    "registrationNumber": "DVN 000001"
  }'
```

## Troubleshooting

**Server not starting?**
- Check if port 3001 is already in use: `lsof -i :3001`
- Kill the process: `kill -9 <PID>`
- Restart: `node send-email.js`

**Emails not sending?**
- Check server logs in terminal
- Verify Resend API key is correct
- Check Resend dashboard: https://resend.com/emails

**CORS errors?**
- Make sure your website URL is added to CORS origins in `server/send-email.js`

## Keep Server Running

To keep the server running even after closing terminal:

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
cd /home/jamiu/Documents/deenvoyage/server
pm2 start send-email.js --name deenvoyage-emails

# View logs
pm2 logs deenvoyage-emails

# Stop
pm2 stop deenvoyage-emails
```

## Support

For issues:
1. Check server terminal for errors
2. Check browser console for errors
3. Check Resend dashboard for email status
4. Contact: hello@deenvoyage.com
