# Email Endpoint Setup for deenvoyage.com/lecture.html

## Current Status
✅ Email server running locally on port 3001  
✅ Verified sender: hello@deenvoyage.com  
✅ Resend API key configured  

## For Production (deenvoyage.com)

Since your live site at **deenvoyage.com/lecture.html** can't reach localhost, deploy the email endpoint to a free platform:

### Recommended: Deploy to Render (Free, Simple)

1. **Create account** at https://render.com

2. **Create New Web Service**
   - Connect your GitHub repo (or upload the `/server` folder)
   - Settings:
     - **Name**: deenvoyage-emails
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `node send-email.js`
     - **Instance Type**: Free

3. **Add Environment Variable**
   - Key: `RESEND_API_KEY`
   - Value: `re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf`

4. **Deploy** - Render gives you a URL like:
   `https://deenvoyage-emails.onrender.com`

5. **Update lecture.html** - Add before the script tag:
   ```html
   <script>
     window.DEENVOYAGE_EMAIL_ENDPOINT = 'https://deenvoyage-emails.onrender.com/send-lecture-emails';
   </script>
   <script type="module" src="js/lecture-registration.js"></script>
   ```

### Alternative: Vercel Serverless (Also Free)

The file `api/send-lecture-emails.js` is already ready for Vercel:

1. Push repo to GitHub
2. Import to Vercel: https://vercel.com/new
3. Add env var: `RESEND_API_KEY = re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf`
4. Deploy - get URL like `https://your-app.vercel.app/api/send-lecture-emails`
5. Update lecture.html with that URL

## Local Testing (Works Now)

The server is running on port 3001. To test locally:

```bash
# Serve your site locally (pick one):
firebase serve
# or
python3 -m http.server 5000
```

Then open http://localhost:5000/lecture.html and submit a registration.

## What Happens After Deploy

1. User visits **deenvoyage.com/lecture.html**
2. Submits registration form
3. Registration saved to Firebase ✅
4. Frontend calls your deployed email endpoint
5. Email server sends:
   - ✉️ Confirmation to registrant (from hello@deenvoyage.com)
   - ✉️ Notification to hello@deenvoyage.com
6. User sees success with registration number

## Next Step

Deploy to Render or Vercel (takes ~5 minutes), then I'll update lecture.html with the endpoint URL.
