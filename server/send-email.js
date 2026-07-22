require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || 'your-api-key-here');

// Enable CORS
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'https://deenvoyage.com',
      'https://www.deenvoyage.com',
      'https://deenvoyage-f065a.web.app',
      'https://deenvoyage-f065a.firebaseapp.com',
      'https://deenvoyage-com.web.app',
      'https://deenvoyage-com.firebaseapp.com'
    ];
    // Allow: no origin (curl/Postman), file:// pages, any localhost port
    if (
      !origin ||
      origin === 'null' ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      allowed.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed — ' + origin));
    }
  }
}));

// Health check — used by the client to wake up the server before sending
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use(express.json());

app.post('/send-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, error: 'Missing email or otp' });
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 24px; color: #333; }
    .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
    .header { background: #0a3d62; padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 1.3rem; letter-spacing: .04em; }
    .header p  { margin: 6px 0 0; color: rgba(255,255,255,.7); font-size: .85rem; }
    .body { padding: 32px; text-align: center; }
    .body p { color: #555; font-size: .92rem; line-height: 1.7; margin-bottom: 24px; }
    .otp-box { display: inline-block; background: #f0f6ff; border: 2px dashed #0a3d62; border-radius: 12px; padding: 18px 36px; font-size: 2.4rem; font-weight: 800; color: #0a3d62; letter-spacing: .18em; font-family: monospace; margin-bottom: 24px; }
    .note { font-size: .78rem; color: #999; line-height: 1.6; }
    .footer { border-top: 1px solid #eef0f3; padding: 18px 32px; font-size: .78rem; color: #aaa; text-align: center; }
    .brand { color: #0a3d62; font-weight: 700; }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>🕋 Deen Voyage</h1>
    <p>Umrah Visa Application — Email Verification</p>
  </div>
  <div class="body">
    <p>Please use the code below to verify your email address and begin your Umrah Visa application.</p>
    <div class="otp-box">${otp}</div>
    <p class="note">This code expires in <strong>10 minutes</strong>.<br>Do not share this code with anyone.</p>
  </div>
  <div class="footer">
    <p>If you did not request this, please ignore this email.</p>
    <p><span class="brand">Deen Voyage</span> &nbsp;·&nbsp; Travel with Value</p>
  </div>
</div>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: [email],
      subject: `${otp} — Your Deen Voyage verification code`,
      html
    });
    if (error) {
      console.error('OTP Resend error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/send-visa-notification', async (req, res) => {
  const { referenceNumber, firstName, lastName, email, phone, passportCountry, validVisaType, submittedAt } = req.body;
  if (!referenceNumber || !email) return res.status(400).json({ success: false, error: 'Missing fields' });

  const date = new Date(submittedAt || Date.now()).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;margin:0;padding:24px;color:#333}
  .card{max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  .header{background:#0a3d62;padding:24px 32px;color:#fff}
  .header h1{margin:0;font-size:1.2rem} .header p{margin:4px 0 0;opacity:.7;font-size:.85rem}
  .body{padding:28px 32px}
  .row{display:flex;border-bottom:1px solid #f0f0f0;padding:10px 0;font-size:.9rem}
  .row:last-child{border:none}
  .label{color:#888;width:160px;flex-shrink:0;font-weight:600}
  .val{color:#222}
  .ref{font-family:monospace;background:#f0f6ff;border:1px solid #cce0ff;padding:3px 10px;border-radius:4px;font-weight:700;color:#0a3d62;font-size:1rem}
  .footer{border-top:1px solid #eef0f3;padding:16px 32px;font-size:.78rem;color:#aaa;text-align:center}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>🕋 New Umrah Visa Application</h1>
    <p>Submitted via deenvoyage.com</p>
  </div>
  <div class="body">
    <div class="row"><span class="label">Reference</span><span class="val"><span class="ref">${referenceNumber}</span></span></div>
    <div class="row"><span class="label">Applicant</span><span class="val">${firstName} ${lastName}</span></div>
    <div class="row"><span class="label">Email</span><span class="val">${email}</span></div>
    <div class="row"><span class="label">Phone</span><span class="val">${phone || '—'}</span></div>
    <div class="row"><span class="label">Passport Country</span><span class="val">${passportCountry || '—'}</span></div>
    <div class="row"><span class="label">Valid Visa Type</span><span class="val">${validVisaType || 'N/A'}</span></div>
    <div class="row"><span class="label">Submitted</span><span class="val">${date}</span></div>
  </div>
  <div class="footer">Log in to the admin dashboard to view uploaded documents.</div>
</div>
</body></html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: ['jamiu@deenvoyage.com'],
      subject: `New Visa Application — ${referenceNumber} (${firstName} ${lastName})`,
      html
    });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Visa notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/send-lecture-emails', async (req, res) => {
  const { firstName, lastName, email, phone, attendees, registrationNumber } = req.body;

  try {
    // Send confirmation email to registrant
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .registration-number { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .reg-num { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
          .details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Registration Confirmed! 🎉</h1>
          </div>
          <div class="content">
            <h2>Assalamu Alaikum ${firstName}!</h2>
            <p>Thank you for registering for the <strong>Ramadan Lecture</strong>. We're excited to have you join us!</p>
            
            <div class="registration-number">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your Registration Number</p>
              <div class="reg-num">${registrationNumber}</div>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">Please bring this number to the event</p>
            </div>
            
            <div class="details">
              <h3>Registration Details:</h3>
              <ul>
                <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Phone:</strong> ${phone}</li>
                <li><strong>Number of Attendees:</strong> ${attendees}</li>
                <li><strong>Event:</strong> Ramadan Lecture</li>
              </ul>
            </div>
            
            <p><strong>What's Next?</strong></p>
            <ul>
              <li>Save your registration number: <strong>${registrationNumber}</strong></li>
              <li>Arrive at the venue 15 minutes early for check-in</li>
              <li>Present your registration number at the entrance</li>
            </ul>
            
            <p>If you have any questions, please don't hesitate to contact us at hello@deenvoyage.com</p>
            
            <div class="footer">
              <p>JazakAllah Khair,<br><strong>Deen Voyage Team</strong></p>
              <p style="font-size: 12px;">This is an automated confirmation email. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send confirmation to registrant
    const confirmationResult = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: [email],
      subject: `Registration Confirmed - Ramadan Lecture | ${registrationNumber}`,
      html: confirmationHtml
    });

    // Send notification to admin
    const adminHtml = `
      <h2>New Lecture Registration</h2>
      <ul>
        <li><strong>Registration Number:</strong> ${registrationNumber}</li>
        <li><strong>Name:</strong> ${firstName} ${lastName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Number of Attendees:</strong> ${attendees}</li>
        <li><strong>Event:</strong> Ramadan Lecture</li>
      </ul>
    `;

    const adminResult = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: ['hello@deenvoyage.com'],
      subject: `New Lecture Registration: ${firstName} ${lastName} - ${registrationNumber}`,
      html: adminHtml
    });

    res.json({
      success: true,
      confirmationEmailId: confirmationResult.data.id,
      adminEmailId: adminResult.data.id
    });

  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/send-receipt', async (req, res) => {
  const {
    receiptNumber,
    date,
    clientName,
    clientEmail,
    purpose,
    currency,
    amount,
    amountPaid,
    balance,
    payments   // array of { receiptNumber, date, amount, note }
  } = req.body;

  const CURRENCY_SYMBOLS = { CAD: 'CA$', USD: '$', NGN: '₦', GBP: '£' };
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';

  function fmt(val) {
    return sym + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const dateLabel   = fmtDate(date);
  const isPaid      = balance <= 0;
  const statusLabel = isPaid ? 'Paid in Full' : 'Balance Owing';
  const statusColor = isPaid ? '#1e8449' : '#b8960c';
  const balanceColor = isPaid ? '#1e8449' : '#c0392b';

  // Build payment rows for the table
  const paymentRows = (Array.isArray(payments) && payments.length > 0)
    ? payments.map((p, i) => `
        <tr style="background:${i % 2 === 0 ? '#fafbfc' : '#fff'};">
          <td style="padding-left:20px;font-size:.86rem;color:#555;">${p.note || 'Payment'}</td>
          <td style="font-size:.86rem;color:#555;">${fmtDate(p.date)}</td>
          <td style="text-align:right;font-weight:700;">${fmt(p.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3">${purpose || '—'}</td></tr>`;

  const receiptHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 24px; color: #333; }
    .card { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
    .card-header { background: #0a3d62; color: #fff; padding: 28px 36px; }
    .card-header h1 { margin: 0 0 4px; font-size: 1.5rem; letter-spacing: .04em; }
    .card-header p { margin: 0; opacity: .75; font-size: .88rem; }
    .card-body { padding: 32px 36px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .meta-item .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: #999; font-weight: 700; }
    .meta-item .value { font-size: .95rem; font-weight: 700; color: #1a1a2e; margin-top: 2px; }
    .issued-to { background: #f6f8fa; border-left: 4px solid #d4af37; border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 24px; }
    .issued-to .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: #999; font-weight: 700; }
    .issued-to .name { font-size: 1.1rem; font-weight: 700; color: #1a1a2e; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #0a3d62; color: #fff; padding: 10px 14px; font-size: .76rem; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
    thead th:last-child { text-align: right; }
    .pkg-row td { background: #f6f8fa; font-size: .78rem; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .05em; padding: 8px 14px; }
    tbody td { padding: 10px 14px; font-size: .9rem; border-bottom: 1px solid #eef0f3; }
    tbody td:last-child { text-align: right; }
    .totals { margin-left: auto; width: 270px; }
    .totals table { width: 100%; margin-bottom: 0; }
    .totals td { padding: 6px 8px; font-size: .88rem; border-bottom: none; }
    .totals td:last-child { text-align: right; font-weight: 600; }
    .totals .sep td { border-top: 1px solid #e1e8ed; padding-top: 10px; }
    .totals .total-row td { font-size: 1.05rem; font-weight: 800; color: ${balanceColor}; padding-top: 8px; }
    .badge { display: inline-block; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; padding: 3px 10px; border-radius: 999px; background: ${isPaid ? '#eafaf1' : '#fff3cd'}; color: ${statusColor}; border: 1px solid ${isPaid ? '#a9dfbf' : '#ffc107'}; }
    .footer { border-top: 1px solid #eef0f3; margin-top: 28px; padding-top: 18px; font-size: .78rem; color: #aaa; line-height: 1.6; }
    .brand { color: #0a3d62; font-weight: 700; font-size: .88rem; }
  </style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <h1>RECEIPT</h1>
    <p>Deen Voyage &nbsp;·&nbsp; Calgary, Alberta, Canada</p>
  </div>
  <div class="card-body">
    <div class="meta">
      <div class="meta-item">
        <div class="label">Receipt Number</div>
        <div class="value" style="font-family:monospace;">${receiptNumber}</div>
      </div>
      <div class="meta-item" style="text-align:right;">
        <div class="label">Date</div>
        <div class="value">${dateLabel}</div>
      </div>
    </div>

    <div class="issued-to">
      <div class="label">Issued To</div>
      <div class="name">${clientName}</div>
    </div>

    <table>
      <thead>
        <tr><th style="width:50%;">Description</th><th>Date</th><th>Amount</th></tr>
      </thead>
      <tbody>
        <tr class="pkg-row"><td colspan="3">${purpose || '—'}</td></tr>
        ${paymentRows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Total Package</td><td>${fmt(amount)}</td></tr>
        <tr><td style="color:#1e8449;">Total Paid</td><td style="color:#1e8449;">${fmt(amountPaid)}</td></tr>
        <tr class="sep"><td></td><td></td></tr>
        <tr class="total-row">
          <td>Balance Due &nbsp;<span class="badge">${statusLabel}</span></td>
          <td>${fmt(balance)}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <p>This receipt is issued by <span class="brand">Deen Voyage</span> as confirmation of payment received.<br>
      For queries, contact <a href="mailto:hello@deenvoyage.com" style="color:#0a3d62;">hello@deenvoyage.com</a></p>
      <p style="margin-top:16px;"><strong class="brand">Deen Voyage</strong> &nbsp;·&nbsp; Travel with Value</p>
    </div>
  </div>
</div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: [clientEmail],
      subject: `Your Receipt ${receiptNumber} — Deen Voyage`,
      html: receiptHtml
    });

    res.json({ success: true, emailId: result.data.id });
  } catch (error) {
    console.error('Error sending receipt email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Email server running on port ${PORT}`);
});
