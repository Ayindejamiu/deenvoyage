// Lecture Registration Form Handler
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, push, set, get, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDK3r2QlBbErNqs0L4DIuzrJi_ue-4z0MA",
  authDomain: "deenvoyage-f065a.firebaseapp.com",
  databaseURL: "https://deenvoyage-f065a-default-rtdb.firebaseio.com",
  projectId: "deenvoyage-f065a",
  storageBucket: "deenvoyage-f065a.appspot.com",
  messagingSenderId: "76816405729",
  appId: "1:76816405729:web:d1db037c0a7c27c6f613a0",
  measurementId: "G-QY6WP2QBQY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Page load timestamp for bot detection
const _pageLoadedAt = Date.now();

// Generate unique incremental registration number
async function generateRegistrationNumber() {
  try {
    const counterRef = ref(database, 'lecture_registrations_counter');
    
    // Get current counter value
    const snapshot = await get(counterRef);
    let currentNumber = snapshot.exists() ? snapshot.val() : 0;
    
    // Increment the counter
    currentNumber += 1;
    
    // Update the counter in Firebase
    await set(counterRef, currentNumber);
    
    // Format as DVN 000001
    const registrationNumber = `DVN ${String(currentNumber).padStart(6, '0')}`;
    return registrationNumber;
  } catch (error) {
    console.error('Error generating registration number:', error);
    throw error;
  }
}

// Copy to clipboard function
window.copyToClipboard = function() {
  const codeElement = document.getElementById('display-code');
  const code = codeElement.textContent;
  
  navigator.clipboard.writeText(code).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Failed to copy code. Please try again.');
  });
};

// Form submission handler
document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('lecture-registration-form');
  const successMessage = document.getElementById('success-message');
  const errorAlert = document.getElementById('error-alert');
  const loadingSpinner = document.getElementById('loading-spinner');

  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      // Get form data
      const fname = document.getElementById('fname').value.trim();
      const lname = document.getElementById('lname').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const attendance = document.getElementById('attendance').value;
      const newsletter = document.getElementById('newsletter').checked;

      // Validation
      if (!fname || !lname || !email || !phone || !attendance) {
        showError('Please fill out all required fields.');
        return;
      }

      // Email validation
      if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return;
      }

      // Phone validation (basic)
      if (!isValidPhone(phone)) {
        showError('Please enter a valid phone number.');
        return;
      }

      // Bot detection - check if form was filled too quickly
      const timeSincePageLoad = Date.now() - _pageLoadedAt;
      if (timeSincePageLoad < 2000) {
        showError('Please take a moment before submitting. Thank you!');
        return;
      }

      // Show loading state
      form.style.display = 'none';
      loadingSpinner.style.display = 'block';
      errorAlert.classList.remove('show');

      try {
        // Generate unique registration number
        const registrationNumber = await generateRegistrationNumber();
        const registrationData = {
          firstName: fname,
          lastName: lname,
          email: email,
          phone: phone,
          attendees: attendance,
          newsletter: newsletter,
          registrationNumber: registrationNumber,
          registeredAt: new Date().toISOString(),
          eventType: 'Ramadan Lecture'
        };

        // Save to Firebase
        const dbRef = ref(database, 'lecture_registrations');
        const newRegistration = push(dbRef);
        await set(newRegistration, registrationData);

        // Send emails via Resend API
        await sendEmails(fname, lname, email, phone, attendance, registrationNumber);

        // Show success message
        loadingSpinner.style.display = 'none';
        successMessage.classList.add('show');
        document.getElementById('display-code').textContent = registrationNumber;

        // Reset form
        form.reset();

        // Scroll to success message
        setTimeout(() => {
          successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

      } catch (error) {
        console.error('Error processing registration:', error);
        loadingSpinner.style.display = 'none';
        form.style.display = 'block';
        showError('An error occurred while processing your registration. Please try again or contact support.');
      }
    });
  }

  function showError(message) {
    errorAlert.textContent = message;
    errorAlert.classList.add('show');
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function isValidPhone(phone) {
    // Basic phone validation - at least 10 digits
    const phoneRegex = /[\d\s\-\+\(\)]{10,}/;
    return phoneRegex.test(phone);
  }

  // Configurable email endpoint: set window.DEENVOYAGE_EMAIL_ENDPOINT in HTML to override
  const EMAIL_ENDPOINT = window.DEENVOYAGE_EMAIL_ENDPOINT || 'http://localhost:3001/send-lecture-emails';

  async function sendEmails(firstName, lastName, email, phone, attendees, registrationNumber) {
    try {
      const response = await fetch(EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName,
          lastName: lastName,
          email: email,
          phone: phone,
          attendees: attendees,
          registrationNumber: registrationNumber
        })
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        console.error('Email sending failed:', result.error);
        // Don't throw - registration is still successful
      } else {
        console.log('Emails sent successfully', result);
      }
    } catch (error) {
      console.error('Error sending emails:', error);
      // Don't throw - registration is still successful even if emails fail
    }
  }
});
