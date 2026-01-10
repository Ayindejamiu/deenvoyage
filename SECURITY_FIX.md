# SECURITY FIX - API Key Exposure

## What Happened
Your Resend API key was exposed in the GitHub repository.

## What I Did
1. ✅ Removed hardcoded API key from all files
2. ✅ Updated code to use environment variables
3. ✅ Created `.env.example` templates
4. ✅ `.env` already in `.gitignore`

## What YOU Need to Do URGENTLY

### 1. Revoke the Exposed API Key
- Go to https://resend.com/api-keys
- Find the key: `re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf`
- Click "Delete" or "Revoke"

### 2. Generate a New API Key
- In Resend dashboard, create a new API key
- Copy the new key (starts with `re_...`)

### 3. Update Render Environment Variable
- Go to Render dashboard: https://dashboard.render.com
- Find your `deenvoyage` service
- Go to Environment → Edit
- Update `RESEND_API_KEY` with the NEW key
- Save and redeploy

### 4. Set Local Environment Variable (for testing)
```bash
cd /home/jamiu/Documents/deenvoyage/server
echo "RESEND_API_KEY=your-new-key-here" > .env
echo "PORT=3001" >> .env
```

Replace `your-new-key-here` with your actual new API key.

## For Future Reference

**NEVER hardcode API keys in code!** Always use:
- Environment variables (`.env` files locally)
- Secrets management (Render, Vercel, Firebase env config)
- `.env` files are in `.gitignore` - they won't be committed

## Testing After Fix

Once you update Render with the new key:
1. Visit https://deenvoyage-f065a.web.app/lecture.html
2. Submit a test registration
3. Verify emails are sent

## Files Updated
- `functions/index.js` - Now uses `process.env.RESEND_API_KEY`
- `server/send-email.js` - Now uses `process.env.RESEND_API_KEY`
- `api/send-lecture-emails.js` - Already uses env var
- Created `.env.example` templates

The exposed key is no longer in the code. Revoke it immediately!
