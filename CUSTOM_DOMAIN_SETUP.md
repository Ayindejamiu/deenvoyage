# Connect deenvoyage.com Domain to Firebase Hosting

## Step 1: Add Custom Domain (Do This in Firebase Console)

1. Go to: https://console.firebase.google.com/project/deenvoyage-f065a/hosting
2. Click **"Add custom domain"** button
3. Enter: **deenvoyage.com**
4. Click "Continue"
5. Firebase will give you DNS records to add

## Step 2: Update DNS Records

Firebase will show you DNS records like:
- **Type A**: `deenvoyage.com` → `199.36.158.100` (or similar)
- **Type AAAA**: `deenvoyage.com` → IPv6 address

**Where to add these:**
- Go to your domain registrar (GoDaddy, Namecheap, etc.)
- Find DNS settings/zone file for `deenvoyage.com`
- Add the A and AAAA records Firebase shows you
- **Remove any old DNS records** pointing elsewhere

## Step 3: Wait for Verification

- Firebase will verify the DNS records (can take 30 min - 24 hours)
- Once verified, deenvoyage.com will show "✓ Connected"

## Step 4: Test

Once verified:
- Visit https://deenvoyage.com/lecture
- Submit a test registration
- Emails should work!

## Current Status

✅ Firebase Hosting sites created:
- `deenvoyage-f065a.web.app` (working)
- `deenvoyage-com.web.app` (waiting for custom domain)

✅ Both deployed with same code
✅ Render email endpoint configured

⏳ **Waiting for you to:**
1. Add custom domain in Firebase Console
2. Add DNS records to your domain registrar
3. Wait for verification

## Important Notes

- Do NOT change or delete DNS records while verification is pending
- Keep the DNS records active even after verification
- Email sending will work once domain is verified
- CORS allows: `https://deenvoyage.com`

Once domain is verified, all functionality will work at deenvoyage.com!
