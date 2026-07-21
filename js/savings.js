import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getDatabase, ref, push, get, onValue, update, remove
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDK3r2QlBbErNqs0L4DIuzrJi_ue-4z0MA",
  authDomain: "deenvoyage-f065a.firebaseapp.com",
  databaseURL: "https://deenvoyage-f065a-default-rtdb.firebaseio.com",
  projectId: "deenvoyage-f065a",
  storageBucket: "deenvoyage-f065a.appspot.com",
  messagingSenderId: "76816405729",
  appId: "1:76816405729:web:d1db037c0a7c27c6f613a0"
};

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getDatabase(app);

const SYM = { CAD: 'CA$', NGN: '₦', GBP: '£', USD: '$' };

const planId = new URLSearchParams(location.search).get('id');

// ── Route ─────────────────────────────────────────────────────
if (planId) {
  document.getElementById('client-portal').style.display = '';
  document.title = 'My Savings — Deen Voyage';
  initClientPortal();
} else {
  document.getElementById('staff-app').style.display = '';
  initStaffDashboard();
}

// ════════════════════════════════════════════════════════════
//  CLIENT PORTAL
// ════════════════════════════════════════════════════════════
let verifiedPlan = null; // plan data after PIN verified

function showPortalScreen(id) {
  ['pin-screen', 'savings-screen', 'notfound-screen'].forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none';
  });
}

function initClientPortal() {
  const digits = document.querySelectorAll('.pin-digit');

  digits.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.slice(-1).replace(/\D/, '');
      if (input.value && i < digits.length - 1) digits[i + 1].focus();
      if (i === digits.length - 1 && input.value) attemptUnlock();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        digits[i - 1].focus();
        digits[i - 1].value = '';
      }
    });
    input.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
      if (text.length === 4) {
        digits.forEach((d, j) => { d.value = text[j] || ''; });
        digits[3].focus();
        attemptUnlock();
      }
    });
  });

  document.getElementById('pin-submit-btn').addEventListener('click', attemptUnlock);
  setTimeout(() => digits[0]?.focus(), 150);

  // Toggle payment form
  document.getElementById('client-pay-toggle').addEventListener('click', () => {
    const form = document.getElementById('client-pay-form');
    const btn  = document.getElementById('client-pay-toggle');
    const open = form.style.display === 'none' || !form.style.display;
    form.style.display = open ? '' : 'none';
    btn.textContent    = open ? '✕ Cancel' : '＋ Submit a Payment';
    if (open) {
      document.getElementById('cp-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('cp-amount').value = '';
      document.getElementById('cp-note').value = '';
      document.getElementById('cp-status').textContent = '';
      document.getElementById('cp-status').className = 'sv-client-status';
    }
  });

  // Submit client payment
  document.getElementById('cp-submit-btn').addEventListener('click', submitClientPayment);
}

async function attemptUnlock() {
  const digits     = document.querySelectorAll('.pin-digit');
  const enteredPin = Array.from(digits).map(d => d.value).join('');
  if (enteredPin.length < 4) return;

  const btn    = document.getElementById('pin-submit-btn');
  const errEl  = document.getElementById('pin-error');
  btn.textContent = 'Checking…'; btn.disabled = true;
  errEl.style.display = 'none';

  try {
    const snap = await get(ref(db, `savings_portal/${planId}`));
    if (!snap.exists()) { showPortalScreen('notfound-screen'); return; }

    const plan = snap.val();
    if (String(plan.accessPin) !== String(enteredPin)) {
      errEl.textContent = 'Incorrect PIN. Please try again.';
      errEl.style.display = '';
      digits.forEach(d => { d.value = ''; });
      digits[0].focus();
      btn.textContent = 'View My Savings'; btn.disabled = false;
      return;
    }

    verifiedPlan = plan;
    renderClientPlan(plan);
    showPortalScreen('savings-screen');

    // Hide submit payment if plan is not active
    if (plan.status !== 'active') {
      document.getElementById('client-pay-section').style.display = 'none';
    }
  } catch {
    errEl.textContent = 'Error loading plan. Please try again.';
    errEl.style.display = '';
    btn.textContent = 'View My Savings'; btn.disabled = false;
  }
}

async function submitClientPayment() {
  const amount = parseFloat(document.getElementById('cp-amount').value) || 0;
  const date   = document.getElementById('cp-date').value;
  const method = document.getElementById('cp-method').value;
  const note   = document.getElementById('cp-note').value.trim();
  const st     = document.getElementById('cp-status');
  const btn    = document.getElementById('cp-submit-btn');

  if (!amount || amount <= 0) {
    st.textContent = 'Please enter a valid amount.'; st.className = 'sv-client-status error'; return;
  }

  btn.disabled = true; btn.textContent = 'Submitting…';
  st.textContent = 'Sending…'; st.className = 'sv-client-status info';

  try {
    const depositId = push(ref(db, `savings_portal/${planId}/pending_deposits`)).key;
    await update(ref(db), {
      [`savings_portal/${planId}/pending_deposits/${depositId}`]: {
        amount,
        date: date || new Date().toISOString().split('T')[0],
        method,
        note: note || method,
        clientName: verifiedPlan?.clientName || '',
        submittedAt: Date.now(),
        status: 'pending'
      }
    });
    st.textContent = '✓ Payment submitted! Your consultant will verify and confirm it.';
    st.className = 'sv-client-status success';
    document.getElementById('cp-amount').value = '';
    document.getElementById('cp-note').value   = '';
    btn.textContent = 'Submit Payment'; btn.disabled = false;
    // Close form after 3s
    setTimeout(() => {
      document.getElementById('client-pay-form').style.display = 'none';
      document.getElementById('client-pay-toggle').textContent = '＋ Submit a Payment';
    }, 3000);
  } catch (err) {
    st.textContent = 'Error: ' + err.message; st.className = 'sv-client-status error';
    btn.textContent = 'Submit Payment'; btn.disabled = false;
  }
}

function renderClientPlan(plan) {
  const sym    = SYM[plan.currency] || plan.currency;
  const target = parseFloat(plan.targetAmount) || 0;
  const saved  = parseFloat(plan.totalSaved)  || 0;
  const pct    = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
  const balance = Math.max(target - saved, 0);

  document.getElementById('portal-greeting').textContent = `Hello, ${plan.clientName || 'there'}! 👋`;
  document.getElementById('portal-package').textContent  = plan.package || '';

  const statusMap = {
    active:    ['Active',      'sv-s-active'],
    paused:    ['Paused',      'sv-s-paused'],
    completed: ['Completed ✓', 'sv-s-completed'],
    cancelled: ['Cancelled',   'sv-s-cancelled']
  };
  const [label, cls] = statusMap[plan.status] || ['Active', 'sv-s-active'];
  document.getElementById('portal-status-badge').innerHTML =
    `<span class="sv-badge ${cls}">${label}</span>`;

  const circumference = 2 * Math.PI * 52;
  const ring = document.getElementById('ring-progress');
  ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;
  ring.style.stroke = pct >= 100 ? '#c8a84b' : '#059669';
  document.getElementById('ring-pct').textContent = Math.round(pct) + '%';

  document.getElementById('portal-saved').textContent     = sym + saved.toLocaleString();
  document.getElementById('portal-target').textContent    = sym + target.toLocaleString();
  document.getElementById('portal-remaining').textContent = sym + balance.toLocaleString();

  const metaParts = [];
  if (plan.planType === 'fixed' && plan.installmentAmount) {
    metaParts.push(`${sym}${parseFloat(plan.installmentAmount).toLocaleString()} / ${plan.installmentFrequency || 'month'}`);
  }
  if (plan.targetDate) metaParts.push(`Target date: ${fmtDate(plan.targetDate)}`);
  document.getElementById('portal-meta').textContent = metaParts.join('  ·  ');

  // Confirmed payments
  const histEl   = document.getElementById('portal-history-list');
  const payments = plan.payments ? Object.entries(plan.payments) : [];
  if (!payments.length) {
    histEl.innerHTML = '<p class="sv-muted">No confirmed payments yet.</p>';
  } else {
    payments.sort((a, b) => (a[1].date || '') < (b[1].date || '') ? 1 : -1);
    histEl.innerHTML = payments.map(([, d]) => `
      <div class="sv-payment-row">
        <div>
          <div class="sv-pay-note">${esc(d.note || d.method || 'Payment')}</div>
          <div class="sv-pay-date">${fmtDate(d.date)}${d.method ? ' · ' + esc(d.method) : ''}</div>
        </div>
        <div class="sv-pay-amount">${sym}${parseFloat(d.amount).toLocaleString()}</div>
      </div>`).join('');
  }

  // Pending payments
  const pending = plan.pending_deposits ? Object.entries(plan.pending_deposits) : [];
  const activePending = pending.filter(([, d]) => d.status === 'pending');
  if (activePending.length) {
    histEl.innerHTML += `
      <div style="margin-top:16px;padding-top:12px;border-top:1px dashed #e2e8f0;">
        <p style="font-size:.75rem;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px;">⏳ Pending Verification (${activePending.length})</p>
        ${activePending.sort((a,b) => (b[1].submittedAt||0)-(a[1].submittedAt||0)).map(([, d]) => `
          <div class="sv-payment-row" style="opacity:.7;">
            <div>
              <div class="sv-pay-note">${esc(d.note || d.method || 'Payment')}</div>
              <div class="sv-pay-date">${fmtDate(d.date)} · Awaiting confirmation</div>
            </div>
            <div class="sv-pay-amount" style="color:#f59e0b;">${sym}${parseFloat(d.amount).toLocaleString()}</div>
          </div>`).join('')}
      </div>`;
  }
}

// ════════════════════════════════════════════════════════════
//  STAFF DASHBOARD
// ════════════════════════════════════════════════════════════
const STATUS_LABELS = { active: 'Active', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled' };

let allPlans     = {};
let currentUser  = null;
let activePlanId = null;

function initStaffDashboard() {
  onAuthStateChanged(auth, async user => {
    if (!user) { location.href = 'crm-login.html?returnTo=savings.html'; return; }
    currentUser = user;

    const snap = await get(ref(db, `crm_staff/${user.uid}`));
    const profile = snap.exists() ? snap.val() : { name: user.email };
    document.getElementById('user-initials').textContent =
      (profile.name || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('user-name').textContent = profile.name;

    subscribePlans();
    setupStaffUI();
  });
}

function subscribePlans() {
  onValue(ref(db, 'savings_plans'), snap => {
    allPlans = {};
    if (snap.exists()) snap.forEach(c => { allPlans[c.key] = { id: c.key, ...c.val() }; });
    renderStats();
    applyFilters();
  });
}

function renderStats() {
  const plans = Object.values(allPlans);
  document.getElementById('stat-total').textContent     = plans.length;
  document.getElementById('stat-active').textContent    = plans.filter(p => p.status === 'active').length;
  document.getElementById('stat-completed').textContent = plans.filter(p => p.status === 'completed').length;
  const saved = plans.filter(p => p.currency === 'CAD')
    .reduce((s, p) => s + (parseFloat(p.totalSaved) || 0), 0);
  document.getElementById('stat-saved').textContent =
    'CA$' + saved.toLocaleString('en-CA', { maximumFractionDigits: 0 });
}

function applyFilters() {
  const q      = (document.getElementById('sv-search').value || '').toLowerCase();
  const status = document.getElementById('sv-status').value;
  const travel = document.getElementById('sv-travel').value;
  const plans  = Object.values(allPlans).filter(p => {
    if (status && p.status !== status) return false;
    if (travel && p.travelType !== travel) return false;
    if (q && !(p.clientName || '').toLowerCase().includes(q)) return false;
    return true;
  });
  plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  renderTable(plans);
}

function renderTable(plans) {
  const tbody = document.getElementById('plans-body');
  if (!plans.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><p>No savings plans yet.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = plans.map(p => {
    const sym    = SYM[p.currency] || p.currency;
    const target = parseFloat(p.targetAmount) || 0;
    const saved  = parseFloat(p.totalSaved) || 0;
    const pct    = target > 0 ? Math.min((saved / target) * 100, 100).toFixed(0) : 0;
    // Count pending client deposits
    const pendingCount = p.pendingCount || 0;
    return `<tr>
      <td>
        <div style="font-weight:600;color:#1e293b;">${esc(p.clientName)}${pendingCount ? ` <span style="background:#fef3c7;color:#92400e;font-size:.68rem;padding:1px 6px;border-radius:99px;font-weight:700;">⏳${pendingCount}</span>` : ''}</div>
        <div style="font-size:.76rem;color:#94a3b8;">${esc(p.clientEmail || p.clientPhone || '')}</div>
      </td>
      <td>${esc(p.package)}</td>
      <td>${sym}${target.toLocaleString()}</td>
      <td style="font-weight:600;color:#059669;">${sym}${saved.toLocaleString()}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="sv-prog-bar"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
          <span style="font-size:.78rem;font-weight:700;color:#475569;min-width:30px;">${pct}%</span>
        </div>
      </td>
      <td><span class="sv-badge sv-s-${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn-secondary-crm btn-sm" onclick="openDeposit('${p.id}')">+ Pay</button>
        <button class="btn-secondary-crm btn-sm" onclick="openDetail('${p.id}')">View</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Record payment (staff direct) ──────────────────────────────
window.openDeposit = function(id) {
  activePlanId = id;
  const p   = allPlans[id];
  const sym = SYM[p.currency] || p.currency;
  const target = parseFloat(p.targetAmount) || 0;
  const saved  = parseFloat(p.totalSaved) || 0;
  document.getElementById('dep-plan-info').innerHTML =
    `<strong>${esc(p.clientName)}</strong> · ${esc(p.package)}<br>
     Target: ${sym}${target.toLocaleString()} &nbsp;·&nbsp;
     Saved: ${sym}${saved.toLocaleString()} &nbsp;·&nbsp;
     Remaining: <strong>${sym}${(target - saved).toLocaleString()}</strong>`;
  document.getElementById('dep-amount').value =
    p.planType === 'fixed' ? (p.installmentAmount || '') : '';
  document.getElementById('dep-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('dep-note').value =
    p.planType === 'fixed'
      ? (p.installmentFrequency === 'weekly'   ? 'Weekly installment'
       : p.installmentFrequency === 'biweekly' ? 'Bi-weekly installment'
       :                                         'Monthly installment')
      : '';
  document.getElementById('dep-status').className = 'rcp-status';
  openModal('modal-deposit');
};

// Record deposit + create accounts_income entry (receipt log)
async function recordDeposit(id, amount, date, note, method, fromPending) {
  const plan      = allPlans[id];
  const newTotal  = (parseFloat(plan.totalSaved) || 0) + amount;
  const depositId = push(ref(db, `savings_deposits/${id}`)).key;
  const incomeId  = push(ref(db, 'accounts_income')).key;
  const rec       = {
    amount, date: date || new Date().toISOString().split('T')[0],
    method: method || 'Other',
    note: note || 'Savings deposit', recordedBy: currentUser.uid, timestamp: Date.now()
  };

  const updates = {};
  updates[`savings_deposits/${id}/${depositId}`]           = rec;
  updates[`savings_plans/${id}/totalSaved`]                = newTotal;
  updates[`savings_plans/${id}/updatedAt`]                 = Date.now();
  updates[`savings_portal/${id}/totalSaved`]               = newTotal;
  updates[`savings_portal/${id}/lastUpdated`]              = Date.now();
  updates[`savings_portal/${id}/payments/${depositId}`]    = { amount, date: rec.date, method: rec.method, note: rec.note };

  // Log to accounts_income (receipt system)
  updates[`accounts_income/${incomeId}`] = {
    description: `${plan.clientName || 'Client'} — ${plan.package || 'Savings'}`,
    clientName:  plan.clientName || '',
    amount,
    currency:    plan.currency || 'CAD',
    category:    plan.travelType === 'hajj' ? 'hajj' : 'umrah',
    date:        rec.date,
    source:      'savings',
    notes:       `Savings deposit · ${plan.package} · ${method || ''}`.trim(),
    savingsPlanId: id,
    createdAt:   Date.now(),
    createdBy:   currentUser.uid
  };

  if (fromPending) {
    updates[`savings_portal/${id}/pending_deposits/${fromPending}/status`] = 'accepted';
  }

  await update(ref(db), updates);
}

// ── Plan detail (with pending deposits) ───────────────────────
window.openDetail = function(id) {
  activePlanId = id;
  const p = allPlans[id];
  document.getElementById('detail-title').textContent = `${p.clientName} — ${p.package}`;
  document.getElementById('detail-complete-btn').style.display =
    ['completed', 'cancelled'].includes(p.status) ? 'none' : '';
  document.getElementById('detail-cancel-btn').style.display =
    p.status === 'cancelled' ? 'none' : '';
  renderPlanDetail(p);
  openModal('modal-plan-detail');
};

function renderPlanDetail(p) {
  const sym    = SYM[p.currency] || p.currency;
  const target = parseFloat(p.targetAmount) || 0;
  const saved  = parseFloat(p.totalSaved) || 0;
  const pct    = target > 0 ? Math.min((saved / target) * 100, 100).toFixed(0) : 0;
  const balance = target - saved;

  document.getElementById('plan-detail-body').innerHTML = `
    <div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:.85rem;font-weight:600;color:#475569;">Progress</span>
        <span style="font-size:.85rem;font-weight:700;color:#059669;">${pct}%</span>
      </div>
      <div class="sv-prog-bar sv-prog-lg"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:.8rem;color:#64748b;">
        <span>Saved: <strong style="color:#059669;">${sym}${saved.toLocaleString()}</strong></span>
        <span>Remaining: <strong style="color:${balance > 0 ? '#ef4444' : '#059669'}">${sym}${balance.toLocaleString()}</strong></span>
        <span>Target: <strong>${sym}${target.toLocaleString()}</strong></span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
      <div style="background:#f8fafc;border-radius:8px;padding:12px;">
        <div style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Plan Type</div>
        <div style="font-weight:600;font-size:.875rem;">${p.planType === 'fixed'
          ? `Fixed · ${sym}${parseFloat(p.installmentAmount || 0).toLocaleString()} / ${p.installmentFrequency || 'month'}`
          : 'Flexible'}</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;">
        <div style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Start</div>
        <div style="font-weight:600;font-size:.875rem;">${p.startDate ? fmtDate(p.startDate) : '—'}</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;">
        <div style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Target Date</div>
        <div style="font-weight:600;font-size:.875rem;">${p.targetDate ? fmtDate(p.targetDate) : '—'}</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;">
        <div style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Client PIN</div>
        <div style="font-weight:700;font-size:1.1rem;font-family:monospace;letter-spacing:.2em;">${p.accessPin || '—'}</div>
      </div>
    </div>
    ${p.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:16px;font-size:.875rem;color:#78350f;">📝 ${esc(p.notes)}</div>` : ''}

    <!-- Pending client deposits -->
    <div id="pending-deposits-section" style="margin-bottom:20px;"></div>

    <!-- Payment history -->
    <div>
      <div style="font-size:.875rem;font-weight:600;color:#475569;margin-bottom:10px;">Payment History</div>
      <div id="detail-history"><div style="text-align:center;padding:20px;color:#9ca3af;font-size:.875rem;">Loading…</div></div>
    </div>`;

  // Load pending deposits from portal
  get(ref(db, `savings_portal/${p.id}/pending_deposits`)).then(pendSnap => {
    const pendEl = document.getElementById('pending-deposits-section');
    if (!pendEl) return;
    if (!pendSnap.exists()) { pendEl.innerHTML = ''; return; }

    const pending = [];
    pendSnap.forEach(c => { pending.push({ id: c.key, ...c.val() }); });
    const active = pending.filter(d => d.status === 'pending');
    if (!active.length) { pendEl.innerHTML = ''; return; }

    active.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    const sym2 = SYM[p.currency] || p.currency;
    pendEl.innerHTML = `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;">
        <div style="font-size:.85rem;font-weight:700;color:#92400e;margin-bottom:10px;">⏳ Client-Submitted Payments (${active.length})</div>
        ${active.map(d => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #fde68a;gap:8px;">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:.875rem;">${sym2}${parseFloat(d.amount).toLocaleString()}</div>
              <div style="font-size:.75rem;color:#78350f;">${fmtDate(d.date)} · ${esc(d.method || '')} · ${esc(d.note || '')}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-primary-crm btn-sm" style="background:#059669;"
                onclick="acceptPendingDeposit('${p.id}','${d.id}',${d.amount},'${d.date}','${esc(d.note||d.method||'Payment')}','${d.method||'Other'}')">
                ✓ Accept
              </button>
              <button class="btn-secondary-crm btn-sm"
                onclick="rejectPendingDeposit('${p.id}','${d.id}')">
                ✕
              </button>
            </div>
          </div>`).join('')}
      </div>`;
  });

  // Load confirmed deposits
  get(ref(db, `savings_deposits/${p.id}`)).then(snap => {
    const el = document.getElementById('detail-history');
    if (!el) return;
    if (!snap.exists()) { el.innerHTML = '<p style="color:#9ca3af;font-size:.85rem;">No payments recorded yet.</p>'; return; }
    const deposits = [];
    snap.forEach(c => { deposits.push({ id: c.key, ...c.val() }); });
    deposits.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const total = deposits.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const sym2  = SYM[p.currency] || p.currency;
    el.innerHTML = `
      <div class="rcp-reg-table-wrap">
        <table class="rcp-reg-table" style="width:100%;">
          <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Note</th></tr></thead>
          <tbody>
            ${deposits.map(d => `<tr>
              <td>${fmtDate(d.date) || '—'}</td>
              <td style="font-weight:600;color:#059669;">${sym2}${parseFloat(d.amount).toLocaleString()}</td>
              <td style="color:#64748b;">${esc(d.method || '—')}</td>
              <td style="color:#64748b;">${esc(d.note || '—')}</td>
            </tr>`).join('')}
            <tr style="background:#f8fafc;font-weight:700;">
              <td>Total</td><td style="color:#059669;">${sym2}${total.toLocaleString()}</td><td></td><td></td>
            </tr>
          </tbody>
        </table>
      </div>`;
  });
}

window.acceptPendingDeposit = async function(id, pendingId, amount, date, note, method) {
  if (!confirm(`Accept payment of ${SYM[allPlans[id]?.currency] || ''}${amount}?`)) return;
  try {
    await recordDeposit(id, amount, date, note, method, pendingId);
    openDetail(id); // refresh detail view
  } catch (err) { alert('Error: ' + err.message); }
};

window.rejectPendingDeposit = async function(id, pendingId) {
  if (!confirm('Reject this client payment submission?')) return;
  try {
    await update(ref(db), {
      [`savings_portal/${id}/pending_deposits/${pendingId}/status`]: 'rejected'
    });
    openDetail(id);
  } catch (err) { alert('Error: ' + err.message); }
};

// ── Staff UI setup ─────────────────────────────────────────────
function setupStaffUI() {
  document.getElementById('np-package').addEventListener('change', function() {
    document.getElementById('np-custom-wrap').style.display = this.value === 'Other' ? '' : 'none';
  });
  document.getElementById('np-type').addEventListener('change', function() {
    document.getElementById('np-fixed-wrap').style.display = this.value === 'fixed' ? '' : 'none';
  });
  document.getElementById('btn-gen-pin').addEventListener('click', () => {
    document.getElementById('np-pin').value = String(Math.floor(1000 + Math.random() * 9000));
  });

  document.getElementById('btn-new-plan').addEventListener('click', async () => {
    document.getElementById('np-status').className = 'rcp-status';
    document.getElementById('np-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('np-pin').value   = String(Math.floor(1000 + Math.random() * 9000));
    await loadLeadsForSelect();
    openModal('modal-new-plan');
  });

  // Save new plan
  document.getElementById('save-plan-btn').addEventListener('click', async () => {
    const name   = document.getElementById('np-name').value.trim();
    const pkgSel = document.getElementById('np-package').value;
    const pkg    = pkgSel === 'Other' ? (document.getElementById('np-custom').value.trim() || 'Other') : pkgSel;
    const travel = document.getElementById('np-travel').value;
    const cur    = document.getElementById('np-currency').value;
    const target = parseFloat(document.getElementById('np-target').value) || 0;
    const type   = document.getElementById('np-type').value;
    const pin    = document.getElementById('np-pin').value.trim();
    const st     = document.getElementById('np-status');

    if (!name || !pkg || !travel || !target || !pin) {
      st.textContent = 'Name, package, travel type, target amount and PIN are required.';
      st.className = 'rcp-status show error'; return;
    }
    if (!/^\d{4}$/.test(pin)) {
      st.textContent = 'PIN must be exactly 4 digits.';
      st.className = 'rcp-status show error'; return;
    }

    const btn = document.getElementById('save-plan-btn');
    btn.disabled = true; btn.textContent = 'Creating…';
    st.textContent = 'Saving…'; st.className = 'rcp-status show info';

    try {
      const newId      = push(ref(db, 'savings_plans')).key;
      const instAmt    = type === 'fixed' ? (parseFloat(document.getElementById('np-installment').value) || 0) : 0;
      const instFreq   = type === 'fixed' ? document.getElementById('np-frequency').value : '';
      const startDate  = document.getElementById('np-start').value || new Date().toISOString().split('T')[0];
      const targetDate = document.getElementById('np-deadline').value || '';
      const plan = {
        clientName: name, clientEmail: document.getElementById('np-email').value.trim(),
        clientPhone: document.getElementById('np-phone').value.trim(),
        package: pkg, travelType: travel, currency: cur,
        targetAmount: target, totalSaved: 0, status: 'active',
        planType: type, installmentAmount: instAmt, installmentFrequency: instFreq,
        linkedLeadId: document.getElementById('np-lead').value || '',
        startDate, targetDate,
        notes: document.getElementById('np-notes').value.trim(),
        accessPin: pin, createdAt: Date.now(), createdBy: currentUser.uid, updatedAt: Date.now()
      };
      const updates = {};
      updates[`savings_plans/${newId}`]  = plan;
      updates[`savings_portal/${newId}`] = {
        clientName: plan.clientName, package: plan.package, travelType: plan.travelType,
        currency: plan.currency, targetAmount: plan.targetAmount, totalSaved: 0,
        status: 'active', planType: plan.planType, installmentAmount: instAmt,
        installmentFrequency: instFreq, startDate, targetDate,
        accessPin: pin, lastUpdated: Date.now()
      };
      await update(ref(db), updates);
      st.textContent = '✓ Savings plan created!'; st.className = 'rcp-status show success';
      setTimeout(() => {
        closeModal('modal-new-plan');
        document.getElementById('new-plan-form').reset();
        document.getElementById('np-custom-wrap').style.display = 'none';
        document.getElementById('np-fixed-wrap').style.display = 'none';
      }, 1300);
    } catch (err) {
      st.textContent = 'Error: ' + err.message; st.className = 'rcp-status show error';
    } finally { btn.disabled = false; btn.textContent = 'Create Plan'; }
  });

  // Save direct deposit
  document.getElementById('save-deposit-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('dep-amount').value) || 0;
    const date   = document.getElementById('dep-date').value;
    const method = document.getElementById('dep-method').value;
    const note   = document.getElementById('dep-note').value.trim();
    const st     = document.getElementById('dep-status');
    if (!amount || amount <= 0) {
      st.textContent = 'Please enter a valid amount.'; st.className = 'rcp-status show error'; return;
    }
    const btn = document.getElementById('save-deposit-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await recordDeposit(activePlanId, amount, date, note || method, method, null);
      st.textContent = '✓ Payment recorded.'; st.className = 'rcp-status show success';
      setTimeout(() => closeModal('modal-deposit'), 1200);
    } catch (err) {
      st.textContent = 'Error: ' + err.message; st.className = 'rcp-status show error';
    } finally { btn.disabled = false; btn.textContent = 'Record Payment'; }
  });

  // Detail buttons
  document.getElementById('detail-deposit-btn').addEventListener('click', () => {
    closeModal('modal-plan-detail');
    openDeposit(activePlanId);
  });

  document.getElementById('detail-link-btn').addEventListener('click', () => {
    const p   = allPlans[activePlanId];
    const url = `${location.origin}${location.pathname}?id=${activePlanId}`;
    navigator.clipboard.writeText(url)
      .then(() => alert(`Client link copied!\n\nShare this link:\n${url}\n\nPIN: ${p.accessPin}`))
      .catch(() => prompt(`Copy this link (PIN: ${p.accessPin}):`, url));
  });

  document.getElementById('detail-target-btn').addEventListener('click', () => {
    const p = allPlans[activePlanId];
    const sym = SYM[p.currency] || p.currency;
    document.getElementById('et-plan-info').innerHTML =
      `<strong>${esc(p.clientName)}</strong> · ${esc(p.package)}<br>
       Current target: ${sym}${parseFloat(p.targetAmount || 0).toLocaleString()}`;
    document.getElementById('et-amount').value   = p.targetAmount || '';
    document.getElementById('et-deadline').value = p.targetDate || '';
    document.getElementById('et-status').className = 'rcp-status';
    closeModal('modal-plan-detail');
    openModal('modal-edit-target');
  });

  document.getElementById('save-target-btn').addEventListener('click', async () => {
    const amount   = parseFloat(document.getElementById('et-amount').value) || 0;
    const deadline = document.getElementById('et-deadline').value;
    const st       = document.getElementById('et-status');
    if (!amount || amount <= 0) {
      st.textContent = 'Please enter a valid target amount.'; st.className = 'rcp-status show error'; return;
    }
    const btn = document.getElementById('save-target-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const updates = {};
      updates[`savings_plans/${activePlanId}/targetAmount`]    = amount;
      updates[`savings_plans/${activePlanId}/targetDate`]      = deadline || null;
      updates[`savings_plans/${activePlanId}/updatedAt`]       = Date.now();
      updates[`savings_portal/${activePlanId}/targetAmount`]   = amount;
      updates[`savings_portal/${activePlanId}/targetDate`]     = deadline || null;
      updates[`savings_portal/${activePlanId}/lastUpdated`]    = Date.now();
      await update(ref(db), updates);
      st.textContent = '✓ Target updated.'; st.className = 'rcp-status show success';
      setTimeout(() => closeModal('modal-edit-target'), 1200);
    } catch (err) {
      st.textContent = 'Error: ' + err.message; st.className = 'rcp-status show error';
    } finally { btn.disabled = false; btn.textContent = 'Update Target'; }
  });

  document.getElementById('detail-complete-btn').addEventListener('click', async () => {
    if (!confirm('Mark this savings plan as completed?')) return;
    const u = {};
    u[`savings_plans/${activePlanId}/status`]    = 'completed';
    u[`savings_plans/${activePlanId}/updatedAt`] = Date.now();
    u[`savings_portal/${activePlanId}/status`]   = 'completed';
    await update(ref(db), u);
    closeModal('modal-plan-detail');
  });

  document.getElementById('detail-cancel-btn').addEventListener('click', async () => {
    if (!confirm('Cancel this savings plan?')) return;
    const u = {};
    u[`savings_plans/${activePlanId}/status`]    = 'cancelled';
    u[`savings_plans/${activePlanId}/updatedAt`] = Date.now();
    u[`savings_portal/${activePlanId}/status`]   = 'cancelled';
    await update(ref(db), u);
    closeModal('modal-plan-detail');
  });

  // Filters
  ['sv-search', 'sv-status', 'sv-travel'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', applyFilters)
  );

  // Modals
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })
  );

  // User menu
  const menuBtn  = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  const bd       = document.getElementById('dropdown-bd');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    bd.style.display = open ? 'block' : 'none';
  });
  bd.addEventListener('click', () => { dropdown.classList.remove('open'); bd.style.display = 'none'; });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth); location.href = 'crm-login.html';
  });
}

async function loadLeadsForSelect() {
  const snap = await get(ref(db, 'crm_leads'));
  const sel  = document.getElementById('np-lead');
  sel.innerHTML = '<option value="">— None —</option>';
  if (!snap.exists()) return;
  snap.forEach(c => {
    const l = c.val();
    const name = `${l.firstName || ''} ${l.lastName || ''}`.trim();
    sel.appendChild(new Option(name + (l.receiptNumber ? ` (${l.receiptNumber})` : ''), c.key));
  });
}

// ── Shared helpers ─────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
