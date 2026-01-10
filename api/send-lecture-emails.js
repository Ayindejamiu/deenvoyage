import { Resend } from 'resend';

// Vercel serverless function to send lecture emails via Resend.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    res.status(500).json({ success: false, error: 'Missing RESEND_API_KEY' });
    return;
  }

  const resend = new Resend(resendApiKey);
  const { firstName = '', lastName = '', email = '', phone = '', attendees = '', registrationNumber = '' } = req.body || {};

  if (!email || !registrationNumber) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }

  try {
    const confirmationHtml = `<!DOCTYPE html>
<html><head><style>
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
.content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
.registration-number { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
.reg-num { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
.details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
.footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
</style></head><body>
<div class="container"><div class="header"><h1>Registration Confirmed! 🎉</h1></div><div class="content">
<h2>Assalamu Alaikum ${firstName}!</h2>
<p>Thank you for registering for the <strong>Ramadan Lecture</strong>. We're excited to have you join us!</p>
<div class="registration-number"><p style="margin:0 0 10px 0;font-size:14px;color:#666;">Your Registration Number</p><div class="reg-num">${registrationNumber}</div><p style="margin:10px 0 0 0;font-size:12px;color:#666;">Please bring this number to the event</p></div>
<div class="details"><h3>Registration Details:</h3><ul>
<li><strong>Name:</strong> ${firstName} ${lastName}</li>
<li><strong>Email:</strong> ${email}</li>
<li><strong>Phone:</strong> ${phone}</li>
<li><strong>Number of Attendees:</strong> ${attendees}</li>
<li><strong>Event:</strong> Ramadan Lecture</li>
</ul></div>
<p><strong>What's Next?</strong></p><ul>
<li>Save your registration number: <strong>${registrationNumber}</strong></li>
<li>Arrive at the venue 15 minutes early for check-in</li>
<li>Present your registration number at the entrance</li>
</ul>
<p>If you have any questions, please contact hello@deenvoyage.com</p>
<div class="footer"><p>JazakAllah Khair,<br><strong>Deen Voyage Team</strong></p><p style="font-size:12px;">This is an automated confirmation email. Please do not reply.</p></div>
</div></div></body></html>`;

    const adminHtml = `
      <h2>New Lecture Registration</h2>
      <ul>
        <li><strong>Registration Number:</strong> ${registrationNumber}</li>
        <li><strong>Name:</strong> ${firstName} ${lastName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Number of Attendees:</strong> ${attendees}</li>
      </ul>
    `;

    const [confirmation, admin] = await Promise.all([
      resend.emails.send({
        from: 'Deen Voyage <hello@deenvoyage.com>',
        to: [email],
        subject: `Registration Confirmed | ${registrationNumber}`,
        html: confirmationHtml
      }),
      resend.emails.send({
        from: 'Deen Voyage <hello@deenvoyage.com>',
        to: ['hello@deenvoyage.com'],
        subject: `New Lecture Registration: ${firstName} ${lastName} - ${registrationNumber}`,
        html: adminHtml
      })
    ]);

    res.status(200).json({
      success: true,
      confirmationEmailId: confirmation?.data?.id || null,
      adminEmailId: admin?.data?.id || null
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
}
