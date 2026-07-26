// Combined app.js for contact and registration forms
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {  getDatabase, ref, onValue, push, set, get } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
const auth = getAuth(app);



// CONTACT FORM HANDLER
// Record page load time to help detect very fast (bot) submissions
const _pageLoadedAt = Date.now();

const contactForm = document.getElementById('contact-form');
// Fill hidden timestamp in forms if present (helps measure time-on-page)
document.addEventListener('DOMContentLoaded', () => {
  const cfTs = document.getElementById('cf_page_ts');
  if (cfTs) cfTs.value = String(_pageLoadedAt);
});
if (contactForm) {
  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const fname = document.getElementById('fname').value.trim();
    const lname = document.getElementById('lname').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();
    const honeypot = document.getElementById('hp_field') ? document.getElementById('hp_field').value.trim() : '';
    const pageTsInput = document.getElementById('cf_page_ts');
    const pageTs = pageTsInput && pageTsInput.value ? Number(pageTsInput.value) : _pageLoadedAt;
    const now = Date.now();
    const fullName = `${fname} ${lname}`;

    // Basic client-side anti-spam checks
    // 1) Required fields
    if (!fname || !lname || !email || !message) {
      showMessage("Please fill out all fields.", true, contactForm);
      return;
    }

    // 2) Honeypot must be empty
    if (honeypot) {
      // silently ignore or show a generic success so bots don't try again
      console.warn('Contact form honeypot filled; likely spam. Field value:', honeypot);
      showMessage("Your message has been sent. We will get back to you shortly!", false, contactForm);
      contactForm.reset();
      return;
    }

    // 3) Minimal message length
    if (message.length < 10) {
      showMessage('Please provide a longer message (at least 10 characters).', true, contactForm);
      return;
    }

    // 4) Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showMessage('Please provide a valid email address.', true, contactForm);
      return;
    }

    // 5) Time-on-page check: if the form is submitted too quickly after load, treat as bot
    if (now - pageTs < 3000) { // less than 3 seconds
      console.warn('Contact form submitted too quickly; likely spam.');
      showMessage("Your message has been sent. We will get back to you shortly!", false, contactForm);
      contactForm.reset();
      return;
    }

    // 6) Simple per-client rate limit using localStorage (30s)
    try {
      const last = Number(localStorage.getItem('lastContactSubmit') || '0');
      if (now - last < 30 * 1000) {
        showMessage('Please wait a moment before sending another message.', true, contactForm);
        return;
      }
      localStorage.setItem('lastContactSubmit', String(now));
    } catch (err) {
      // localStorage might be disabled; ignore
    }

    // Passed checks: proceed to write and send
    const messagesRef = ref(database, 'contactMessages');
    const newMessageRef = push(messagesRef);

    set(newMessageRef, {
      name: fullName,
      email: email,
      message: message,
      _meta: {
        ts: now,
        userAgent: (navigator && navigator.userAgent) ? navigator.userAgent : null
      }
    }).then(() => {
      // send notification via EmailJS (same template as before)
      emailjs.send("service_rmrqml1", "template_02eb23k", {
        from_name: fullName,
        from_email: email,
        message: message
      }).then(() => {
        showMessage("Your message has been sent. We will get back to you shortly!", false, contactForm);
        contactForm.reset();
      }).catch((emailErr) => {
        console.error('EmailJS send error:', emailErr);
        showMessage("Your message was saved but we couldn't send the notification email right now.", false, contactForm);
        contactForm.reset();
      });
    }).catch((error) => {
      showMessage("Failed to send message. Try again.", true, contactForm);
      console.error(error);
    });
  });
}

// REGISTRATION FORM HANDLER
const registrationForm = document.getElementById('registration-form');
if (registrationForm) {
  registrationForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const fname = document.getElementById('fname').value.trim();
    const lname = document.getElementById('lname').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const travelType = document.getElementById('travelType').value;
  const startDate = document.getElementById('startDate') ? document.getElementById('startDate').value : '';
  const endDate = document.getElementById('endDate') ? document.getElementById('endDate').value : '';
    let passport = document.getElementById('passportType').value;
    const otherPassport = document.getElementById('otherPassport').value.trim();
    const requirements = document.getElementById('requirements').value.trim();
    const roomType = document.getElementById('roomType').value;

    if (passport === 'Other') passport = `Other - ${otherPassport}`;

    // If travel type is Other, require start and end dates
    if (travelType === 'Other') {
      if (!startDate || !endDate) {
        showMessage('Please choose a start and end date for your travel.', true, registrationForm);
        return;
      }
      // Normalize travelType to include dates for storage/display
      // e.g. "Other (2025-12-01 → 2025-12-10)"
      const formattedRange = `${startDate} → ${endDate}`;
      // we keep travelType value but also store start/end separately below
    }

    const registrationRef = ref(database, 'registrations');
    const newRegRef = push(registrationRef);

    set(newRegRef, {
      firstName: fname,
      lastName: lname,
      email: email,
      phone: phone,
      travelType: travelType,
      travelStartDate: startDate || null,
      travelEndDate: endDate || null,
      passportType: passport,
      otherRequirements: requirements,
      roomType: roomType
    }).then(() => {
      // Send a notification email using EmailJS (same service used by contact form).
      // Include a `to_email` field so your EmailJS template can route to hello@deenvoyage.com.
      return emailjs.send("service_rmrqml1", "template_psg9tfp", {
        to_email: 'hello@deenvoyage.com',
        first_name: fname,
        last_name: lname,
        email: email,
        phone: phone,
        travel_type: travelType,
        travel_start_date: startDate || '',
        travel_end_date: endDate || '',
        passport_type: passport,
        requirements: requirements,
        room_type: roomType
      }).then(() => {
        showMessage("Registration successful. We will contact you shortly.", false, registrationForm);
        registrationForm.reset();
        document.getElementById('otherPassport').classList.add("d-none");
      }).catch((emailErr) => {
        // DB write succeeded but email failed. Log and notify user accordingly.
        console.error('EmailJS send error:', emailErr);
        showMessage("Registration saved, but notification email failed to send. We'll follow up.", true, registrationForm);
        registrationForm.reset();
        document.getElementById('otherPassport').classList.add("d-none");
      });
    }).catch((error) => {
      showMessage("Failed to submit registration. Please try again.", true, registrationForm);
      console.error(error);
    });
  });
}


//Admin dashboard 

// ✅ Hardcoded credentials
const ADMIN_EMAIL = "ayindejamiu90@gmail.com";
const ADMIN_PASSWORD = "Kunle4islam";

// ✅ Expose login and logout to global window (for inline HTML usage)
window.manualLogin = function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    document.getElementById("login-section").classList.add("d-none");
    document.getElementById("dashboard-section").classList.remove("d-none");
    loadRegistrations();
    loadVisaApplications();
  } else {
    document.getElementById("login-error").innerText = "Invalid email or password.";
  }
};

window.manualLogout = function () {
  location.reload();
};

function loadRegistrations() {
  const tbody = document.getElementById("registrations-table-body");
  tbody.innerHTML = "";

  get(ref(database, "registrations"))
    .then(snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.values(data).forEach(reg => {
          tbody.innerHTML += `<tr>
            <td>${reg.firstName} ${reg.lastName}</td>
            <td>${reg.email}</td>
            <td>${reg.phone}</td>
            <td>${reg.travelType}</td>
            <td>${reg.passportType}</td>
            <td>${reg.roomType}</td>
            <td>${reg.otherRequirements}</td>
          </tr>`;
        });
      }
    })
    .catch(console.error);
}


function loadVisaApplications() {
  const tbody = document.getElementById("visa-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  get(ref(database, "visa_applications"))
    .then(snapshot => {
      if (!snapshot.exists()) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No visa applications yet.</td></tr>';
        return;
      }
      const entries = Object.values(snapshot.val()).reverse();
      entries.forEach(v => {
        const date = v.submittedAt ? new Date(v.submittedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        const docLinks = [
          v.passportURL              ? `<a href="${v.passportURL}" target="_blank">📄 Passport</a>` : '',
          v.flightTicketURL          ? `<a href="${v.flightTicketURL}" target="_blank">✈️ Flight</a>` : '',
          v.meccaHotelReservationURL  ? `<a href="${v.meccaHotelReservationURL}" target="_blank">🕋 Mecca Hotel</a>` : '',
          v.medinaHotelReservationURL ? `<a href="${v.medinaHotelReservationURL}" target="_blank">🕌 Medina Hotel</a>` : '',
          v.hotelReservationURL      ? `<a href="${v.hotelReservationURL}" target="_blank">🏨 Hotel</a>` : '',
        ].filter(Boolean).join('');
        const flightInfo = v.flightOption === 'book_dv' ? 'Booking via DV' : (v.flightTicketURL ? 'Has ticket' : (v.flightOption || '—'));
        const hotelInfo  = v.meccaHotel ? `🕋 ${v.meccaHotel} / 🕌 ${v.medinaHotel || '—'}` : (v.hotel || '—');
        const dates      = v.travelFrom ? `${v.travelFrom} → ${v.travelTo}` : '—';

        tbody.innerHTML += `<tr>
          <td><span class="ref-badge">${v.referenceNumber || '—'}</span></td>
          <td>${v.firstName || ''} ${v.lastName || ''}</td>
          <td>${v.email || '—'}</td>
          <td>${v.phone || '—'}</td>
          <td>${v.passportCountry || '—'}</td>
          <td>${v.validVisaType || '—'}</td>
          <td>${flightInfo}</td>
          <td>${hotelInfo}</td>
          <td>${dates}</td>
          <td>${date}</td>
          <td class="doc-links">${docLinks || '—'}</td>
        </tr>`;
      });
    })
    .catch(console.error);
}

// QATAR VACATION REGISTRATION HANDLER
window.submitQatarRegistration = async function(data) {
  const registrationRef = ref(database, 'registrations');
  const newRegRef = push(registrationRef);

  await set(newRegRef, {
    firstName:      data.firstName,
    lastName:       data.lastName,
    email:          data.email,
    phone:          data.phone,
    travelType:     'Qatar Vacation',
    travelStartDate: data.arrivalDate || null,
    travelEndDate:   data.departureDate || null,
    passportType:   data.passport === 'Others' ? `Others - ${data.passportOther}` : data.passport,
    passportExpiry:  data.passportExpiry || null,
    travellers:      data.travellers,
    purpose:         data.purpose,
    hotelPref:       data.hotelPref,
    roomType:        data.roomType,
    otherRequirements: data.requirements,
    notes:           data.notes || '',
    submittedAt:     data.submittedAt
  });

  try {
    await emailjs.send("service_rmrqml1", "template_psg9tfp", {
      to_email:         'hello@deenvoyage.com',
      first_name:       data.firstName,
      last_name:        data.lastName,
      email:            data.email,
      phone:            data.phone,
      travel_type:      'Qatar Vacation',
      travel_start_date: data.arrivalDate || '',
      travel_end_date:   data.departureDate || '',
      passport_type:    data.passport === 'Others' ? `Others - ${data.passportOther}` : data.passport,
      requirements:     data.requirements,
      room_type:        data.roomType
    });
  } catch (emailErr) {
    console.error('EmailJS Qatar notification error:', emailErr);
  }
};

// SHARED MESSAGE DISPLAY FUNCTION
function showMessage(text, isError = false, form) {
  let msgEl = form.querySelector("#form-status");
  if (!msgEl) {
    msgEl = document.createElement("div");
    msgEl.id = "form-status";
    msgEl.style.marginTop = "10px";
    form.appendChild(msgEl);
  }
  msgEl.style.color = isError ? "red" : "green";
  msgEl.textContent = text;
}


// saving Auth Form Handler
if (document.getElementById("loginForm")) {
  const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', e => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        location.href = "dashboard.html";
      })
      .catch(error => {
        alert("Login failed: " + error.message);
        console.error(error);
      });
  });
}

// 📝 REGISTER FORM
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', e => {
    e.preventDefault();

    const firstName = document.getElementById("firstName").value.trim();
    const surname = document.getElementById("surname").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();

    if (!firstName || !surname || !email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    createUserWithEmailAndPassword(auth, email, password)
      .then(userCredential => {
        const uid = userCredential.user.uid;
        const userRef = ref(database, `clients/${uid}`);
        return set(userRef, {
          firstName,
          surname,
          email
        });
      })
      .then(() => {
        location.href = "dashboard.html";
      })
      .catch(error => {
        alert("Registration failed: " + error.message);
        console.error(error);
      });
  });
}
}

//savings admin login 
if (document.getElementById("adminLoginForm")) {
  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminEmail = "ayindejamiu90@gmail.com";
  const adminPassword = "Kunle4islam";

  adminLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value.trim();
    const errorMsg = document.getElementById("errorMsg");

    if (!email || !password) {
      errorMsg.textContent = "Please fill in all fields.";
      return;
    }

    if (email !== adminEmail || password !== adminPassword) {
      errorMsg.textContent = "Unauthorized credentials.";
      return;
    }

    signInWithEmailAndPassword(auth, email, password)  // <- fixed here
      .then(() => location.href = "admin.html")
      .catch(error => {
        errorMsg.textContent = "Login failed: " + error.message;
      });
  });
}


//Savings admin
if (document.getElementById("clientsTableBody")) {
onAuthStateChanged(auth, user => {
  if (!user) {
    // If not logged in, redirect to login
    location.href = "admin-login.html";
  } else {
    // Fetch and display client data
    const clientsRef = ref(database, "clients");
    onValue(clientsRef, snapshot => {
      const tableBody = document.getElementById("clientsTableBody");
      tableBody.innerHTML = ""; // Clear table

      snapshot.forEach(child => {
        const data = child.val();
        const row = `
          <tr>
            <td>${data.firstName} ${data.surname}</td>
            <td>${data.email}</td>
            <td>${data.targetAmount || 0}</td>
            <td>${data.totalSaved || 0}</td>
          </tr>
        `;
        tableBody.insertAdjacentHTML("beforeend", row);
      });
    });
  }
});

// 🚪 Sign out handler
document.getElementById("signOutBtn").addEventListener("click", () => {
  signOut(auth)
    .then(() => location.href = "admin-login.html")
    .catch(err => alert("Error signing out: " + err.message));
});
}



// saving Dashboard Logic
auth.onAuthStateChanged(user => {
  if (user && document.getElementById("userEmail")) {
    const uid = user.uid;
    document.getElementById("userEmail").textContent = user.email;

    const userRef = ref(database, `clients/${uid}`);
    const goalRef = ref(database, `clients/${uid}/goal`);
    const savingsRef = ref(database, `clients/${uid}/savings`);

    // Fetch and display user's full name
    onValue(userRef, snapshot => {
      const data = snapshot.val();
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = (data && data.firstName && data.surname) ? `${data.firstName} ${data.surname}` : "User";
    });

    // Goal
    onValue(goalRef, (snapshot) => {
      const goal = snapshot.val() || 0;
      const goalEl = document.getElementById("goalDisplay");
      if (goalEl) goalEl.textContent = goal;
    });

    // Savings
    onValue(savingsRef, (snap) => {
      let total = 0;
      snap.forEach(entry => {
        const val = entry.val();
        if (val && val.amount) {
          total += Number(val.amount);
        }
      });

      const totalEl   = document.getElementById("totalSaved");
      const goalEl    = document.getElementById("goalDisplay");
      const barEl     = document.getElementById("progressBar");
      if (!totalEl || !goalEl || !barEl) return;
      totalEl.textContent = total;
      const goal = parseFloat(goalEl.textContent);
      const percent = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;
      barEl.style.width = percent + "%";
      barEl.textContent = Math.round(percent) + "%";
    });

    // Set Goal
    window.setGoal = () => {
      const goalAmount = parseFloat(document.getElementById("goalAmount").value);
      if (goalAmount > 0) {
        set(goalRef, goalAmount);
        document.getElementById("goalAmount").value = "";
      }
    };

    //signout
    const signOutBtn = document.getElementById("signOutBtn");
if (signOutBtn) {
  signOutBtn.addEventListener("click", () => {
    signOut(auth)
      .then(() => {
        location.href = "index.html";
      })
      .catch(error => {
        alert("Sign out failed: " + error.message);
        console.error(error);
      });
  });
}

    // Add Savings
    window.addSavings = () => {
      const amountInput = document.getElementById("savingsAmount");
      const amount = parseFloat(amountInput.value);

      if (amount > 0 && !isNaN(amount)) {
        push(savingsRef, {
          amount,
          date: new Date().toISOString()
        }).then(() => {
          amountInput.value = "";
        }).catch(error => {
          console.error("Error adding savings:", error);
          alert("Error adding savings.");
        });
      } else {
        alert("Enter a valid amount.");
      }
    };
  }
});

