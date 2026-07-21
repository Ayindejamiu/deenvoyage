import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const form      = document.getElementById("book-form");
const pkgCards  = Array.from(document.querySelectorAll(".pkg-card"));
const occButtons = Array.from(document.querySelectorAll(".occ-btn"));
const statusBox = document.getElementById("book-status");
const submitBtn = document.getElementById("book-submit");

const summary = {
  pkg:      document.getElementById("sum-pkg"),
  occ:      document.getElementById("sum-occ"),
  name:     document.getElementById("sum-name"),
  passport: document.getElementById("sum-passport"),
  price:    document.getElementById("sum-price")
};

const fields = {
  firstName:    document.getElementById("firstName"),
  lastName:     document.getElementById("lastName"),
  email:        document.getElementById("email"),
  phone:        document.getElementById("phone"),
  passportType: document.getElementById("passportType"),
  travelDate:   document.getElementById("travelDate"),
  requirements: document.getElementById("requirements")
};

let selectedCard      = pkgCards[0];
let selectedOccupancy = "Quad (4 persons)";

function priceForOccupancy(card, occ) {
  if (occ === "Triple (3 persons)") return Number(card.dataset.priceTriple || card.dataset.price || 0);
  if (occ === "Double (2 persons)") return Number(card.dataset.priceDouble || card.dataset.price || 0);
  return Number(card.dataset.price || 0);
}

function formatNaira(amount) {
  return "₦" + Number(amount).toLocaleString("en-NG");
}

let selectedPackage = {
  name:  selectedCard ? selectedCard.dataset.pkg : "August Umrah 2026",
  price: selectedCard ? priceForOccupancy(selectedCard, selectedOccupancy) : 4200000
};

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.add("show");
  statusBox.classList.remove("success", "error");
  statusBox.classList.add(isError ? "error" : "success");
}

function clearStatus() {
  statusBox.textContent = "";
  statusBox.classList.remove("show", "success", "error");
}

function updateSummary() {
  const fullName = `${fields.firstName.value.trim()} ${fields.lastName.value.trim()}`.trim();
  summary.pkg.textContent      = selectedPackage.name;
  summary.occ.textContent      = selectedOccupancy;
  summary.name.textContent     = fullName || "—";
  summary.passport.textContent = fields.passportType.value || "—";
  summary.price.textContent    = `${formatNaira(selectedPackage.price)} / person`;
}

function setupPackageSelection() {
  pkgCards.forEach(card => {
    card.addEventListener("click", () => {
      pkgCards.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedCard = card;
      selectedPackage = {
        name:  card.dataset.pkg,
        price: priceForOccupancy(card, selectedOccupancy)
      };
      updateSummary();
    });
  });
}

function setupOccupancySelection() {
  occButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      occButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedOccupancy = btn.dataset.occ || "";
      selectedPackage.price = priceForOccupancy(selectedCard, selectedOccupancy);
      updateSummary();
    });
  });
}

function validateForm() {
  if (!fields.firstName.value.trim())    return "First name is required.";
  if (!fields.lastName.value.trim())     return "Surname is required.";
  if (!fields.email.value.trim())        return "Email address is required.";
  if (!fields.phone.value.trim())        return "Phone number is required.";
  if (!fields.passportType.value.trim()) return "Passport country is required.";
  return "";
}

function openWhatsAppChat(payload) {
  const fullName = `${payload.firstName} ${payload.lastName}`.trim();
  const message = [
    "*New Booking Request — Deen Voyage 🇳🇬*",
    "",
    `*Name:* ${fullName}`,
    `*Email:* ${payload.email}`,
    `*Phone:* ${payload.phone}`,
    `*Package:* ${payload.packageName}`,
    `*Occupancy:* ${payload.occupancy}`,
    `*Passport:* ${payload.passportType}`,
    `*Travel Month:* ${payload.travelMonth || "Not provided"}`,
    `*Starting Price:* ${formatNaira(payload.packageStartPrice)} / person`,
    `*Requirements:* ${payload.requirements || "None"}`,
    `*Source:* Nigeria booking page`,
    "",
    "Please confirm availability and next steps."
  ].join("\n");

  const waUrl = `https://wa.me/14036831777?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank", "noopener");
}

async function saveBooking(payload) {
  const bookingRef       = push(ref(db, "bookings"));
  const registrationRef  = push(ref(db, "registrations"));

  const registrationPayload = {
    firstName:        payload.firstName,
    lastName:         payload.lastName,
    email:            payload.email,
    phone:            payload.phone,
    travelType:       payload.packageName,
    passportType:     payload.passportType,
    otherRequirements: payload.requirements,
    roomType:         payload.occupancy,
    travelStartDate:  payload.travelMonth || null,
    travelEndDate:    null,
    source:           "book-ng.html",
    currency:         "NGN"
  };

  await Promise.all([
    set(bookingRef, payload),
    set(registrationRef, registrationPayload)
  ]);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearStatus();

  const validationError = validateForm();
  if (validationError) {
    showStatus(validationError, true);
    return;
  }

  const bookingPayload = {
    firstName:         fields.firstName.value.trim(),
    lastName:          fields.lastName.value.trim(),
    email:             fields.email.value.trim(),
    phone:             fields.phone.value.trim(),
    passportType:      fields.passportType.value,
    travelMonth:       fields.travelDate.value || null,
    requirements:      fields.requirements.value.trim() || "",
    packageName:       selectedPackage.name,
    packageStartPrice: selectedPackage.price,
    currency:          "NGN",
    occupancy:         selectedOccupancy,
    source:            "book-ng.html",
    createdAt:         new Date().toISOString(),
    createdAtMs:       Date.now()
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = "Saving...";

  try {
    await saveBooking(bookingPayload);
    showStatus("Booking request saved! Our team will contact you shortly.");
    openWhatsAppChat(bookingPayload);
    form.reset();
    selectedCard      = pkgCards[0];
    selectedOccupancy = "Quad (4 persons)";
    selectedPackage   = { name: selectedCard.dataset.pkg, price: priceForOccupancy(selectedCard, selectedOccupancy) };
    pkgCards.forEach((c, i)  => c.classList.toggle("selected", i === 0));
    occButtons.forEach((b, i) => b.classList.toggle("selected", i === 0));
    updateSummary();
  } catch (error) {
    console.error("Failed to save booking", error);
    showStatus("Unable to save booking right now. Please try again.", true);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "Book Now";
  }
});

[fields.firstName, fields.lastName, fields.passportType].forEach(field => {
  field.addEventListener("input",  updateSummary);
  field.addEventListener("change", updateSummary);
});

setupPackageSelection();
setupOccupancySelection();
updateSummary();
