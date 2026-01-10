const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');

// Initialize the Admin SDK
admin.initializeApp();

// Initialize Resend with your API key
const resend = new Resend('re_Jg47oJUA_KMbDpEpHiaQ7U3EAKuB525Lf');

/**
 * Trigger: Realtime Database onCreate for /registrations/{id}
 * Action: Send a summary email to hello@deenvoyage.com with registration details using Resend.
 * Notes:
 * - Requires a Resend API key configured in the code
 * - You should enable billing (Blaze) to allow outbound network requests from Functions.
 */
exports.notifyNewRegistration = functions.database.ref('/registrations/{regId}').onCreate(async (snapshot, context) => {
  const data = snapshot.val() || {};
  const regId = context.params.regId;

  const firstName = data.firstName || data.fname || '';
  const lastName = data.lastName || data.lname || '';
  const email = data.email || '';
  const phone = data.phone || '';
  const travelType = data.travelType || data.travel_type || '';
  const passportType = data.passportType || data.passport_type || data.passport || '';
  const requirements = data.otherRequirements || data.requirements || '';
  const roomType = data.roomType || '';

  const subject = `New registration: ${firstName} ${lastName}`.trim();

  const html = `
    <h2>New Registration (ID: ${regId})</h2>
    <ul>
      <li><strong>First name:</strong> ${firstName}</li>
      <li><strong>Last name:</strong> ${lastName}</li>
      <li><strong>Email:</strong> ${email}</li>
      <li><strong>Phone:</strong> ${phone}</li>
      <li><strong>Travel Type:</strong> ${travelType}</li>
      <li><strong>Passport Type:</strong> ${passportType}</li>
      <li><strong>Room Type:</strong> ${roomType}</li>
      <li><strong>Other Requirements:</strong> ${requirements}</li>
      <li><strong>Raw Data:</strong> <pre>${JSON.stringify(data, null, 2)}</pre></li>
    </ul>
  `;

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>',
      to: ['hello@deenvoyage.com'],
      subject: subject || 'New registration',
      html: html
    });

    if (error) {
      console.error('Error sending notification email:', error);
      await snapshot.ref.child('_notification').set({ 
        sent: false, 
        error: String(error), 
        timestamp: Date.now() 
      });
      throw error;
    }

    await snapshot.ref.child('_notification').set({ 
      sent: true, 
      emailId: emailData.id,
      timestamp: Date.now() 
    });
    console.log(`Notification email sent for registration ${regId}. Email ID: ${emailData.id}`);
    return null;
  } catch (err) {
    console.error('Error sending notification email:', err);
    await snapshot.ref.child('_notification').set({ 
      sent: false, 
      error: String(err), 
      timestamp: Date.now() 
    });
    throw err;
  }
});

/**
 * Trigger: Realtime Database onCreate for /lecture_registrations/{id}
 * Action: Send confirmation email to the registrant and notification to admin
 */
exports.notifyLectureRegistration = functions.database.ref('/lecture_registrations/{regId}').onCreate(async (snapshot, context) => {
  const data = snapshot.val() || {};
  const regId = context.params.regId;

  const firstName = data.firstName || '';
  const lastName = data.lastName || '';
  const email = data.email || '';
  const phone = data.phone || '';
  const attendees = data.attendees || '';
  const newsletter = data.newsletter || false;
  const registrationNumber = data.registrationNumber || '';
  const eventType = data.eventType || 'Lecture';

  try {
    // Send confirmation email to the registrant
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
            <p>Thank you for registering for the <strong>${eventType}</strong>. We're excited to have you join us!</p>
            
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
                <li><strong>Event:</strong> ${eventType}</li>
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

    const { data: confirmationData, error: confirmationError } = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>', // Replace with your verified domain
      to: [email],
      subject: `Registration Confirmed - ${eventType} | ${registrationNumber}`,
      html: confirmationHtml
    });

    if (confirmationError) {
      console.error('Error sending confirmation email:', confirmationError);
    } else {
      console.log(`Confirmation email sent to ${email}. Email ID: ${confirmationData.id}`);
    }

    // Send notification to admin
    const adminHtml = `
      <h2>New Lecture Registration (ID: ${regId})</h2>
      <ul>
        <li><strong>Registration Number:</strong> ${registrationNumber}</li>
        <li><strong>Name:</strong> ${firstName} ${lastName}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Number of Attendees:</strong> ${attendees}</li>
        <li><strong>Newsletter:</strong> ${newsletter ? 'Yes' : 'No'}</li>
        <li><strong>Event Type:</strong> ${eventType}</li>
        <li><strong>Registered At:</strong> ${data.registeredAt || ''}</li>
      </ul>
      <h3>Raw Data:</h3>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `;

    const { data: adminData, error: adminError } = await resend.emails.send({
      from: 'Deen Voyage <hello@deenvoyage.com>', // Replace with your verified domain
      to: ['hello@deenvoyage.com'],
      subject: `New Lecture Registration: ${firstName} ${lastName} - ${registrationNumber}`,
      html: adminHtml
    });

    if (adminError) {
      console.error('Error sending admin notification:', adminError);
    } else {
      console.log(`Admin notification sent. Email ID: ${adminData.id}`);
    }

    // Update the registration record with email status
    await snapshot.ref.child('_emailStatus').set({
      confirmationSent: !confirmationError,
      confirmationEmailId: confirmationData?.id || null,
      adminNotificationSent: !adminError,
      adminEmailId: adminData?.id || null,
      timestamp: Date.now()
    });

    return null;
  } catch (err) {
    console.error('Error in lecture registration handler:', err);
    await snapshot.ref.child('_emailStatus').set({
      error: String(err),
      timestamp: Date.now()
    });
    throw err;
  }
});
