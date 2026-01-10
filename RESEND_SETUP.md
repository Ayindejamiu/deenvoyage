# Resend Email Integration Setup

## What's Been Done

I've successfully integrated Resend for sending emails from your Deen Voyage website. Here's what was implemented:

### 1. **Updated Firebase Cloud Functions** (`functions/index.js`)
   - Replaced SendGrid with Resend
   - Added your Resend API key: `re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf`
   - Created two email handlers:
     - `notifyNewRegistration` - For regular registrations
     - `notifyLectureRegistration` - For lecture registrations

### 2. **Updated Package Dependencies** (`functions/package.json`)
   - Removed `@sendgrid/mail`
   - Added `resend` package

### 3. **Updated Frontend** (`js/lecture-registration.js`)
   - Removed EmailJS dependency
   - Emails are now automatically sent via Cloud Functions when a registration is saved to Firebase

### 4. **Cleaned Up HTML** (`lecture.html`)
   - Removed EmailJS script tag

## Email Features

### For Lecture Registrations:
1. **Confirmation Email to Registrant**
   - Beautiful HTML email with registration number
   - Event details and instructions
   - Personalized greeting

2. **Notification Email to Admin**
   - Sent to `hello@deenvoyage.com`
   - Contains all registration details
   - Registration number for easy reference

## Important: Update Your Email Domain

⚠️ **Action Required**: Currently, emails are being sent from `onboarding@resend.dev` (Resend's test domain). For production use, you should:

1. **Verify Your Domain in Resend**
   - Go to https://resend.com/domains
   - Add your domain (e.g., `deenvoyage.com`)
   - Follow the DNS setup instructions

2. **Update the "from" Email Address**
   - Edit `functions/index.js`
   - Replace `from: 'Deen Voyage <onboarding@resend.dev>'` with your verified email
   - Example: `from: 'Deen Voyage <noreply@deenvoyage.com>'`

## Deploying the Functions

To deploy your updated Cloud Functions to Firebase:

```bash
cd functions
firebase deploy --only functions
```

## Testing

1. **Test Registration**:
   - Open `lecture.html` in your browser
   - Fill out and submit the registration form
   - Check that:
     - Registration is saved in Firebase Database
     - Confirmation email is sent to the registrant
     - Notification email is sent to admin

2. **Check Email Logs**:
   - Monitor Firebase Functions logs: `firebase functions:log`
   - Check Resend dashboard: https://resend.com/emails

## Email Templates

The emails include:
- Responsive HTML design
- Your brand colors (purple gradient)
- Clear registration numbers
- Professional formatting
- Mobile-friendly layout

## API Key Security

⚠️ **Security Note**: The API key is currently hardcoded in `functions/index.js`. For better security, consider:

1. **Using Firebase Environment Config**:
   ```bash
   firebase functions:config:set resend.key="re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf"
   ```
   
   Then update the code:
   ```javascript
   const RESEND_KEY = functions.config().resend && functions.config().resend.key;
   const resend = new Resend(RESEND_KEY);
   ```

2. **Using Firebase Secret Manager** (recommended for production):
   ```bash
   firebase functions:secrets:set RESEND_API_KEY
   ```

## Troubleshooting

- **Emails not sending**: Check Firebase Functions logs
- **Authentication errors**: Verify your Resend API key is correct
- **Domain issues**: Make sure you've verified your domain in Resend
- **Billing**: Ensure Firebase Blaze plan is active for outbound network requests

## Support

- Resend Documentation: https://resend.com/docs
- Firebase Functions: https://firebase.google.com/docs/functions
- Contact: hello@deenvoyage.com
