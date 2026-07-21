import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getDatabase, ref, push, set, get, onValue, update, remove
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

const SERVER_URL = 'https://deenvoyage-email-server.onrender.com';

// ── State ────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let allLeads       = [];
let allStaff       = {};
let filteredLeads  = [];
let allReceipts    = {};          // key → receipt object
let activeReg      = null;
let activeRegKey   = null;
let currentReceiptData = null;
const PAGE_SIZE    = 25;
let currentPage    = 1;

const STATUS_LABELS = {
  new:'New Lead', in_discussion:'In Discussion', deposit_paid:'Deposit Paid',
  paid_full:'Paid Full', will_pay:'Will Pay', follow_up:'Needs Follow-up',
  competitor:'Competitor', diy:'DIY', cancelled:'Cancelled', completed:'Completed', refund:'Refund'
};
const TRAVEL_LABELS = {
  hajj:'🕌 Hajj', umrah:'🕋 Umrah', ramadan:'🌙 Ramadan',
  december:'📅 December', vacation:'✈️ Vacation'
};
const SOURCE_LABELS = {
  website:'🌐 Web', whatsapp:'💬 WhatsApp', phone:'📞 Phone',
  referral:'🤝 Referral', social:'📱 Social', walk_in:'🚶 Walk-in'
};
const CUR_SYM = { CAD:'CA$', NGN:'₦', GBP:'£', USD:'$' };

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = 'crm-login.html'; return; }
  currentUser = user;

  const snap = await get(ref(db, `crm_staff/${user.uid}`));
  if (snap.exists()) {
    currentProfile = snap.val();
  } else {
    const allSnap = await get(ref(db, 'crm_staff'));
    currentProfile = {
      name: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: allSnap.exists() ? 'agent' : 'admin',
      createdAt: Date.now()
    };
    await set(ref(db, `crm_staff/${user.uid}`), currentProfile);
  }

  document.getElementById('user-initials').textContent =
    (currentProfile.name || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-name').textContent    = currentProfile.name;
  document.getElementById('user-role-label').textContent = currentProfile.role;

  // Show staff tab only for admins
  if (currentProfile.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }

  await loadStaff();
  subscribeLeads();
  subscribeReceipts();
  setupUI();
  initReceiptDates();
});

// ════════════════════════════════════════════════════════════
//  STAFF
// ════════════════════════════════════════════════════════════
async function loadStaff() {
  const snap = await get(ref(db, 'crm_staff'));
  allStaff = snap.exists() ? snap.val() : {};
  renderStaffTable();
  populateAgentSelects();
}

function populateAgentSelects() {
  const filterSel  = document.getElementById('filter-agent');
  const addSel     = document.getElementById('add-agent-select');
  filterSel.innerHTML = '<option value="">All Agents</option>';
  addSel.innerHTML    = '<option value="">Unassigned</option>';
  Object.entries(allStaff).forEach(([uid, s]) => {
    filterSel.appendChild(new Option(s.name, uid));
    addSel.appendChild(new Option(s.name, uid));
  });
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-body');
  if (!tbody) return;
  const entries = Object.entries(allStaff);
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af;">No staff members yet.</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(([uid, s]) => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.email)}</td>
      <td><span class="role-badge role-${s.role}">${s.role}</span></td>
      <td style="color:#9ca3af;font-size:.8rem;">${s.createdAt ? fmtDate(new Date(s.createdAt).toISOString().slice(0,10)) : '—'}</td>
      <td>${uid !== currentUser.uid && currentProfile.role === 'admin'
        ? `<button class="btn-secondary-crm btn-sm" onclick="removeAgent('${uid}','${esc(s.name)}')">Remove</button>`
        : '<span style="color:#d1d5db;font-size:.78rem;">you</span>'
      }</td>
    </tr>
  `).join('');
}

// Add agent using secondary Firebase app (doesn't sign out the admin)
document.getElementById('save-agent-btn').addEventListener('click', async () => {
  const name   = document.getElementById('ag-name').value.trim();
  const email  = document.getElementById('ag-email').value.trim();
  const role   = document.getElementById('ag-role').value;
  const status = document.getElementById('ag-status');

  if (!name || !email) { showStatus(status, 'Name and email are required.', 'error'); return; }

  const btn = document.getElementById('save-agent-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  showStatus(status, 'Creating account…', 'info');

  // Random temp password — agent will reset via email
  const tempPass = 'Dv!' + Math.random().toString(36).slice(2, 10) + '9';

  // Use a secondary app instance so the admin stays logged in
  const secondaryApp = initializeApp(FIREBASE_CONFIG, 'AgentCreate-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPass);
    const uid  = cred.user.uid;

    // Save profile
    await set(ref(db, `crm_staff/${uid}`), {
      name, email, role, createdAt: Date.now(), addedBy: currentUser.uid
    });

    // Send password reset so they can set their own password
    await sendPasswordResetEmail(secondaryAuth, email);

    allStaff[uid] = { name, email, role, createdAt: Date.now() };
    renderStaffTable();
    populateAgentSelects();
    showStatus(status, `Account created! Password setup email sent to ${email}.`, 'success');
    document.getElementById('add-agent-form').reset();
  } catch (err) {
    const msgs = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email':        'Invalid email address.',
      'auth/weak-password':        'Password too weak (internal error).',
    };
    showStatus(status, msgs[err.code] || err.message, 'error');
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
    btn.disabled = false; btn.textContent = 'Create Account';
  }
});

window.removeAgent = async (uid, name) => {
  if (!confirm(`Remove ${name} from the CRM? Their Firebase Auth account will remain but they will lose CRM access.`)) return;
  try {
    await remove(ref(db, `crm_staff/${uid}`));
    delete allStaff[uid];
    renderStaffTable();
    populateAgentSelects();
  } catch (err) { alert('Error: ' + err.message); }
};

document.getElementById('btn-add-agent')?.addEventListener('click', () => {
  document.getElementById('ag-status').className = 'rcp-status';
  openModal('modal-add-agent');
});

// ════════════════════════════════════════════════════════════
//  LEADS
// ════════════════════════════════════════════════════════════
function subscribeLeads() {
  onValue(ref(db, 'crm_leads'), snap => {
    allLeads = [];
    if (snap.exists()) snap.forEach(c => { allLeads.push({ id: c.key, ...c.val() }); });
    renderStats();
    applyFilters();
  });
}

// Sync /registrations (website booking forms) once per record
async function syncRegistrations() {
  const snap = await get(ref(db, 'registrations'));
  if (!snap.exists()) return;
  const byEmail = new Set(allLeads.map(l => l.email).filter(Boolean));
  const byPhone = new Set(allLeads.map(l => l.phone).filter(Boolean));
  const updates = {};
  snap.forEach(child => {
    const r = child.val();
    if (r.syncedToCRM) return;
    if (r.email && byEmail.has(r.email)) { updates[`registrations/${child.key}/syncedToCRM`] = true; return; }
    if (r.phone && byPhone.has(r.phone)) { updates[`registrations/${child.key}/syncedToCRM`] = true; return; }
    const id = push(ref(db, 'crm_leads')).key;
    updates[`crm_leads/${id}`] = {
      firstName: r.firstName || '', lastName: r.lastName || '',
      email: r.email || '', phone: r.phone || '',
      travelType: normTravel(r.travelType), roomType: r.roomType || '',
      passportType: r.passportType || '', travelMonth: r.travelStartDate || '',
      status: 'new', source: 'website', currency: 'CAD',
      quotedPrice: 0, totalPaid: 0,
      syncedFromRegistration: true, registrationId: child.key,
      createdAt: Date.now(), updatedAt: Date.now(), createdBy: currentUser.uid
    };
    updates[`registrations/${child.key}/syncedToCRM`] = true;
    r.email && byEmail.add(r.email);
    r.phone && byPhone.add(r.phone);
  });
  if (Object.keys(updates).length) await update(ref(db), updates);
}

// ════════════════════════════════════════════════════════════
//  RECEIPTS → CRM sync
// ════════════════════════════════════════════════════════════
function subscribeReceipts() {
  onValue(ref(db, 'receipts'), async snap => {
    allReceipts = snap.exists() ? snap.val() : {};
    rcpRenderRegs();
    await syncReceiptsToCRM();
  });
}

let _crmSyncing = false;
async function syncReceiptsToCRM() {
  if (!Object.keys(allReceipts).length || _crmSyncing) return;
  _crmSyncing = true;
  try {
    // Read crm_leads from DB directly — avoids race where allLeads isn't loaded yet
    const leadsSnap = await get(ref(db, 'crm_leads'));
    const leadsMap  = {};   // receiptKey → { id, lead }
    if (leadsSnap.exists()) {
      leadsSnap.forEach(c => {
        const l = c.val();
        if (l.receiptKey) leadsMap[l.receiptKey] = { id: c.key, ...l };
      });
    }

    const updates = {};

    Object.entries(allReceipts).forEach(([key, r]) => {
      if (leadsMap[key]) {
        const existing = leadsMap[key];
        if (existing.totalPaid !== r.totalPaid || existing.quotedPrice !== r.totalAmount) {
          updates[`crm_leads/${existing.id}/totalPaid`]   = r.totalPaid || 0;
          updates[`crm_leads/${existing.id}/quotedPrice`] = r.totalAmount || 0;
          updates[`crm_leads/${existing.id}/currency`]    = r.currency || 'CAD';
          updates[`crm_leads/${existing.id}/updatedAt`]   = Date.now();
          if (r.balance <= 0 && r.totalAmount > 0 && existing.status !== 'paid_full' && existing.status !== 'completed') {
            updates[`crm_leads/${existing.id}/status`] = 'paid_full';
          }
        }
        return;
      }

      // New receipt — create CRM lead
      const nameParts = (r.clientName || '').split(' ');
      const lastName  = nameParts.length > 1 ? nameParts.pop() : '';
      const firstName = nameParts.join(' ');
      const id = push(ref(db, 'crm_leads')).key;
      updates[`crm_leads/${id}`] = {
        firstName, lastName,
        email: r.clientEmail || '',
        phone: '',
        travelType: normTravel(r.package),
        packagePreference: r.package || '',
        status: r.balance <= 0 && r.totalAmount > 0 ? 'paid_full' : r.totalPaid > 0 ? 'deposit_paid' : 'new',
        source: 'receipt_app',
        currency: r.currency || 'CAD',
        quotedPrice: r.totalAmount || 0,
        totalPaid: r.totalPaid || 0,
        receiptKey: key,
        receiptNumber: r.registrationId || '',
        syncedFromReceipt: true,
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        updatedAt: Date.now(),
        createdBy: currentUser?.uid || ''
      };
      leadsMap[key] = { id };  // prevent duplicates within same run
    });

    if (Object.keys(updates).length) await update(ref(db), updates);
  } finally {
    _crmSyncing = false;
  }
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const today = new Date(); today.setHours(0,0,0,0);
  document.getElementById('stat-total').textContent      = allLeads.length;
  document.getElementById('stat-paid').textContent       = allLeads.filter(l => l.status === 'paid_full').length;
  document.getElementById('stat-discussion').textContent = allLeads.filter(l => l.status === 'in_discussion').length;
  document.getElementById('stat-followup').textContent   = allLeads.filter(l =>
    l.status === 'follow_up' || (l.followUpDate && new Date(l.followUpDate) <= today)
  ).length;
  const rev = allLeads.filter(l => l.currency === 'CAD' || !l.currency).reduce((s, l) => s + (parseFloat(l.totalPaid) || 0), 0);
  document.getElementById('stat-revenue').textContent = '$' + rev.toLocaleString('en-CA', { maximumFractionDigits: 0 });
}

// ── Filters ──────────────────────────────────────────────────
function applyFilters() {
  const q      = (document.getElementById('search-input').value || '').toLowerCase();
  const status = document.getElementById('filter-status').value;
  const travel = document.getElementById('filter-travel').value;
  const agent  = document.getElementById('filter-agent').value;

  filteredLeads = allLeads.filter(l => {
    if (status && l.status !== status) return false;
    if (travel && l.travelType !== travel) return false;
    if (agent  && l.assignedTo !== agent) return false;
    if (q) {
      const name = `${l.firstName||''} ${l.lastName||''}`.toLowerCase();
      if (!name.includes(q) && !(l.email||'').toLowerCase().includes(q) && !(l.phone||'').includes(q)) return false;
    }
    return true;
  });
  filteredLeads.sort((a, b) => (b.updatedAt||b.createdAt||0) - (a.updatedAt||a.createdAt||0));
  currentPage = 1;
  renderTable();
  renderPagination();
}

// ── Table ─────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('leads-body');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredLeads.slice(start, start + PAGE_SIZE);
  const today = new Date(); today.setHours(0,0,0,0);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📋</div><p>No leads found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = page.map(l => {
    const name     = `${l.firstName||''} ${l.lastName||''}`.trim() || 'Unknown';
    const status   = l.status || 'new';
    const agentName = allStaff[l.assignedTo]?.name || '—';
    const overdue  = l.followUpDate && new Date(l.followUpDate) <= today && ['follow_up','will_pay'].includes(status);
    return `<tr>
      <td>
        <div class="lead-name"><a href="crm-lead.html?id=${l.id}">${esc(name)}</a></div>
        <div class="lead-phone">${esc(l.phone||'')} ${l.receiptNumber ? '<span style="font-size:.72rem;color:#c8a84b;">🧾 '+esc(l.receiptNumber)+'</span>' : ''}</div>
      </td>
      <td><span class="badge-travel">${TRAVEL_LABELS[l.travelType]||'—'}</span></td>
      <td><span class="badge-status s-${status}">${STATUS_LABELS[status]||status}</span></td>
      <td style="${overdue?'color:#ef4444;font-weight:700;':''}">${l.followUpDate ? fmtDate(l.followUpDate) : '—'}</td>
      <td>${SOURCE_LABELS[l.source]||l.source||'—'}</td>
      <td>${esc(agentName)}</td>
      <td style="color:#9ca3af;font-size:.76rem;">${fmtDate(new Date(l.createdAt||0).toISOString().slice(0,10))}</td>
      <td>
        <button style="background:none;border:none;cursor:pointer;color:#6b7280;padding:4px 6px;" onclick="openStatusModal('${l.id}','${status}','${l.followUpDate||''}')">✏️</button>
        <a href="crm-lead.html?id=${l.id}" style="color:var(--primary);text-decoration:none;font-size:.78rem;padding:4px 6px;">View →</a>
      </td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const total = filteredLeads.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const row   = document.getElementById('pagination-row');
  if (total <= PAGE_SIZE) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  document.getElementById('pagination-info').textContent =
    `Showing ${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE, total)} of ${total}`;
  const btns = document.getElementById('pagination-btns');
  btns.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.className = 'page-btn' + (i === currentPage ? ' active' : '');
    b.textContent = i;
    b.onclick = () => { currentPage = i; renderTable(); renderPagination(); };
    btns.appendChild(b);
  }
}

// ── Add Lead ──────────────────────────────────────────────────
document.getElementById('btn-add-lead').addEventListener('click', () => openModal('modal-add-lead'));

document.getElementById('save-lead-btn').addEventListener('click', async () => {
  const form    = document.getElementById('add-lead-form');
  const errDiv  = document.getElementById('lead-save-error');
  errDiv.style.display = 'none';

  const firstName = form.querySelector('[name="firstName"]').value.trim();
  const lastName  = form.querySelector('[name="lastName"]').value.trim();
  const phone     = form.querySelector('[name="phone"]').value.trim();
  if (!firstName || !lastName || !phone) {
    errDiv.textContent = 'First name, last name and phone are required.';
    errDiv.style.display = 'block';
    return;
  }

  const btn = document.getElementById('save-lead-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const data = formData(form);
    data.quotedPrice    = parseFloat(data.quotedPrice) || 0;
    data.totalPaid      = parseFloat(data.totalPaid) || 0;
    data.travelersCount = parseInt(data.travelersCount) || 1;
    data.createdAt      = Date.now();
    data.updatedAt      = Date.now();
    data.createdBy      = currentUser.uid;

    const notes = data.notes || '';
    delete data.notes;

    const newRef = push(ref(db, 'crm_leads'));
    await set(newRef, { ...data, notes });

    if (notes) {
      await push(ref(db, `crm_interactions/${newRef.key}`), {
        type: 'note', notes, date: Date.now(),
        agentUid: currentUser.uid, agentName: currentProfile.name
      });
    }
    closeModal('modal-add-lead');
    form.reset();
  } catch (err) {
    errDiv.textContent = 'Save failed: ' + err.message;
    errDiv.style.display = 'block';
  }
  finally { btn.disabled = false; btn.textContent = 'Save Lead'; }
});

// ── Quick Status ──────────────────────────────────────────────
window.openStatusModal = (leadId, status, followUpDate) => {
  document.getElementById('status-lead-id').value       = leadId;
  document.getElementById('status-select').value        = status;
  document.getElementById('status-followup-date').value = followUpDate;
  document.getElementById('status-note').value          = '';
  openModal('modal-status');
};

document.getElementById('save-status-btn').addEventListener('click', async () => {
  const leadId    = document.getElementById('status-lead-id').value;
  const newStatus = document.getElementById('status-select').value;
  const fuDate    = document.getElementById('status-followup-date').value;
  const note      = document.getElementById('status-note').value.trim();
  const btn = document.getElementById('save-status-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await update(ref(db, `crm_leads/${leadId}`), {
      status: newStatus, followUpDate: fuDate || null, updatedAt: Date.now()
    });
    if (note) {
      await push(ref(db, `crm_interactions/${leadId}`), {
        type: 'note',
        notes: `Status → ${STATUS_LABELS[newStatus] || newStatus}. ${note}`,
        date: Date.now(), agentUid: currentUser.uid, agentName: currentProfile.name
      });
    }
    closeModal('modal-status');
  } catch (err) { alert('Failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Update'; }
});

// ════════════════════════════════════════════════════════════
//  RECEIPTS — full embedded app
// ════════════════════════════════════════════════════════════
function initReceiptDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('rn-date').value = today;
  document.getElementById('ra-date').value = today;
  rcpUpdatePreview();
}

window.rcpSwitchMode = function(mode) {
  const workspace = document.getElementById('rcp-workspace');
  const list      = document.getElementById('rcp-list');
  document.getElementById('rcp-tab-new').classList.toggle('active', mode === 'new');
  document.getElementById('rcp-tab-add').classList.toggle('active', mode === 'add');
  document.getElementById('rcp-form-new').style.display = mode === 'new' ? '' : 'none';
  document.getElementById('rcp-form-add').style.display = mode === 'add' ? '' : 'none';
  workspace.style.display = mode === 'list' ? 'none' : '';
  list.style.display      = mode === 'list' ? '' : 'none';
  if (mode === 'new') rcpResetNew();
};

window.rcpOnPackageChange = function() {
  const sel = document.getElementById('rn-package').value;
  document.getElementById('rn-custom-wrap').style.display = sel === 'Other' ? '' : 'none';
  rcpUpdatePreview();
};

function rcpGetPackageLabel() {
  const sel = document.getElementById('rn-package').value;
  if (sel === 'Other') return document.getElementById('rn-custom').value.trim() || 'Other';
  return sel;
}

function rcpFmt(val, cur) {
  const sym = CUR_SYM[cur] || cur + ' ';
  if (val === null || val === undefined || isNaN(val)) return '—';
  return sym + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

window.rcpUpdatePreview = function() {
  const name  = document.getElementById('rn-name').value.trim();
  const email = document.getElementById('rn-email').value.trim();
  const pkg   = rcpGetPackageLabel();
  const cur   = document.getElementById('rn-currency').value;
  const total = parseFloat(document.getElementById('rn-total').value) || 0;
  const paid  = parseFloat(document.getElementById('rn-paid').value) || 0;
  const date  = document.getElementById('rn-date').value;
  const bal   = total - paid;
  const disp  = document.getElementById('rn-balance');
  disp.classList.toggle('paid', paid >= total && total > 0);
  disp.textContent = (total || paid) ? rcpFmt(bal, cur) : '—';
  const num = currentReceiptData?.receiptNumber || ('DV-' + new Date().getFullYear() + '-XXXX');
  const payments = paid > 0 ? [{ date, amount: paid, note: document.getElementById('rn-note').value.trim() || 'Initial payment' }] : [];
  rcpRenderPreview({ name, email, pkg, cur, total, payments, receiptNumber: num, date });
};

window.rcpUpdateAddPreview = function() {
  if (!activeReg) return;
  const newPaid    = parseFloat(document.getElementById('ra-paid').value) || 0;
  const totalPaid  = (activeReg.totalPaid || 0) + newPaid;
  const bal        = activeReg.totalAmount - totalPaid;
  const cur        = activeReg.currency;
  const date       = document.getElementById('ra-date').value;
  const note       = document.getElementById('ra-note').value.trim();
  const disp       = document.getElementById('ra-balance');
  disp.classList.toggle('paid', bal <= 0 && activeReg.totalAmount > 0);
  disp.textContent = rcpFmt(bal, cur);
  const existing   = Array.isArray(activeReg.payments) ? activeReg.payments : Object.values(activeReg.payments || {});
  const payments   = [...existing];
  if (newPaid > 0) payments.push({ date, amount: newPaid, note: note || 'Payment' });
  rcpRenderPreview({
    name: activeReg.clientName, email: activeReg.clientEmail,
    pkg: activeReg.package, cur, total: activeReg.totalAmount,
    payments, receiptNumber: activeReg.registrationId, date
  });
};

function rcpRenderPreview({ name, email, pkg, cur, total, payments, receiptNumber, date }) {
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const bal       = total - totalPaid;
  currentReceiptData = { name, email, pkg, cur, total, payments, receiptNumber, date, totalPaid, bal };

  document.getElementById('rcp-preview-num').textContent  = receiptNumber;
  document.getElementById('rv-number').textContent        = 'Receipt #: ' + receiptNumber;
  document.getElementById('rv-date').textContent          = 'Date: ' + rcpFmtDate(date);
  document.getElementById('rv-name').textContent          = name || '—';
  document.getElementById('rv-email').textContent         = email || '';
  document.getElementById('rv-pkg-total').textContent     = rcpFmt(total, cur);
  document.getElementById('rv-total-paid').textContent    = rcpFmt(totalPaid, cur);
  document.getElementById('rv-balance').textContent       = rcpFmt(bal, cur);

  const row   = document.getElementById('rv-bal-row');
  const badge = document.getElementById('rv-badge');
  row.classList.toggle('paid', bal <= 0 && total > 0);
  badge.className   = 'rcp-badge ' + (bal <= 0 && total > 0 ? 'rcp-badge-paid' : 'rcp-badge-owing');
  badge.textContent = bal <= 0 && total > 0 ? 'Paid in Full' : 'Owing';

  const tbody = document.getElementById('rv-payments-body');
  if (!payments.length) {
    tbody.innerHTML = `<tr><td>${esc(pkg||'—')}</td><td>—</td><td>—</td></tr>`;
    return;
  }
  let rows = `<tr><td colspan="3" style="background:#f8fafc;font-size:.75rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;padding:7px 13px;">${esc(pkg||'—')}</td></tr>`;
  payments.forEach(p => {
    rows += `<tr class="rcp-sub-row">
      <td style="padding-left:20px;">${esc(p.note||'Payment')}</td>
      <td style="white-space:nowrap;">${rcpFmtDate(p.date)}</td>
      <td>${rcpFmt(p.amount, cur)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows;
}

// Wire new-form inputs to live preview
['rn-name','rn-email','rn-package','rn-custom','rn-currency','rn-total','rn-date','rn-paid','rn-note'].forEach(id => {
  const el = document.getElementById(id);
  if (el) { el.addEventListener('input', rcpUpdatePreview); el.addEventListener('change', rcpUpdatePreview); }
});

async function rcpGenReceiptNum() {
  const counterRef = ref(db, 'receiptCounter');
  return new Promise((resolve, reject) => {
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js').then(({ runTransaction }) => {
      runTransaction(counterRef, current => (current || 0) + 1)
        .then(result => {
          const n = String(result.snapshot.val()).padStart(4, '0');
          resolve('DV-' + new Date().getFullYear() + '-' + n);
        })
        .catch(reject);
    });
  });
}

window.rcpSaveNew = async function() {
  const name  = document.getElementById('rn-name').value.trim();
  const email = document.getElementById('rn-email').value.trim();
  const pkg   = rcpGetPackageLabel();
  const cur   = document.getElementById('rn-currency').value;
  const total = parseFloat(document.getElementById('rn-total').value) || 0;
  const paid  = parseFloat(document.getElementById('rn-paid').value) || 0;
  const date  = document.getElementById('rn-date').value;
  const note  = document.getElementById('rn-note').value.trim();
  const status = document.getElementById('rn-status');

  if (!name || !pkg || !total) {
    showStatus(status, 'Please fill in client name, package and total amount.', 'error'); return;
  }

  showStatus(status, 'Generating receipt number…', 'info');
  let receiptNum;
  try { receiptNum = await rcpGenReceiptNum(); }
  catch { receiptNum = 'DV-' + Date.now(); }

  const payment = { receiptNumber: receiptNum, date, amount: paid, note: note || 'Initial payment', timestamp: Date.now() };
  const reg = {
    registrationId: receiptNum, clientName: name, clientEmail: email,
    package: pkg, currency: cur, totalAmount: total,
    payments: paid > 0 ? [payment] : [],
    totalPaid: paid, balance: total - paid,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  showStatus(status, 'Saving…', 'info');
  try {
    await push(ref(db, 'receipts'), reg);
    currentReceiptData = { ...currentReceiptData, receiptNumber: receiptNum };
    rcpRenderPreview({ name, email, pkg, cur, total, payments: reg.payments, receiptNumber: receiptNum, date });
    showStatus(status, '✓ Saved! Receipt ready to download or send.', 'success');
  } catch (e) { showStatus(status, 'Error: ' + e.message, 'error'); }
};

window.rcpSearch = function(query) {
  const q       = query.toLowerCase().trim();
  const results = document.getElementById('ra-results');
  if (!q) { results.classList.remove('open'); return; }
  const matches = Object.entries(allReceipts).filter(([k, r]) =>
    (r.clientName||'').toLowerCase().includes(q) || (r.registrationId||'').toLowerCase().includes(q)
  );
  results.innerHTML = matches.length
    ? matches.map(([k, r]) => `
        <div class="rcp-result-item" onclick="rcpLoadClient('${k}')">
          <div class="ri-name">${esc(r.clientName)}</div>
          <div class="ri-meta">${esc(r.package)} · ${r.registrationId} · Balance: ${rcpFmt(r.balance, r.currency)}</div>
        </div>`).join('')
    : '<div class="rcp-result-item" style="color:#9ca3af;">No matches found.</div>';
  results.classList.add('open');
};

window.rcpLoadClient = function(key) {
  activeReg    = allReceipts[key];
  activeRegKey = key;
  document.getElementById('ra-results').classList.remove('open');
  document.getElementById('ra-search').value = '';

  const totalPaid = activeReg.totalPaid || 0;
  document.getElementById('ra-cc-name').textContent = activeReg.clientName;
  document.getElementById('ra-cc-meta').innerHTML =
    `${esc(activeReg.package)} · ${activeReg.currency}<br>
     Total: ${rcpFmt(activeReg.totalAmount, activeReg.currency)} ·
     Paid: ${rcpFmt(totalPaid, activeReg.currency)} ·
     Balance: <strong>${rcpFmt(activeReg.balance, activeReg.currency)}</strong>
     <span class="balance-pill ${activeReg.balance<=0?'paid':'owing'}">${activeReg.balance<=0?'Paid in Full':'Owing'}</span>`;

  document.getElementById('ra-client-card').style.display = '';
  document.getElementById('ra-no-client').style.display   = 'none';
  document.getElementById('ra-paid').value = '';
  document.getElementById('ra-balance').textContent = rcpFmt(activeReg.balance, activeReg.currency);
  document.getElementById('ra-balance').classList.toggle('paid', activeReg.balance <= 0);

  const existing = Array.isArray(activeReg.payments) ? activeReg.payments : Object.values(activeReg.payments || {});
  rcpRenderPreview({
    name: activeReg.clientName, email: activeReg.clientEmail,
    pkg: activeReg.package, cur: activeReg.currency,
    total: activeReg.totalAmount, payments: existing,
    receiptNumber: activeReg.registrationId, date: new Date().toISOString().split('T')[0]
  });
};

window.rcpClearClient = function() {
  activeReg = null; activeRegKey = null;
  document.getElementById('ra-client-card').style.display = 'none';
  document.getElementById('ra-no-client').style.display   = '';
  document.getElementById('ra-search').value = '';
};

window.rcpAddPayment = async function() {
  if (!activeReg || !activeRegKey) return;
  const paid   = parseFloat(document.getElementById('ra-paid').value) || 0;
  const date   = document.getElementById('ra-date').value;
  const note   = document.getElementById('ra-note').value.trim();
  const status = document.getElementById('ra-status');

  if (!paid || paid <= 0) { showStatus(status, 'Please enter a payment amount.', 'error'); return; }

  const existing    = Array.isArray(activeReg.payments) ? activeReg.payments : Object.values(activeReg.payments || {});
  const newPayment  = { date, amount: paid, note: note || 'Payment', timestamp: Date.now() };
  const updPayments = [...existing, newPayment];
  const updPaid     = (activeReg.totalPaid || 0) + paid;
  const updBalance  = activeReg.totalAmount - updPaid;

  showStatus(status, 'Saving payment…', 'info');
  try {
    await update(ref(db, 'receipts/' + activeRegKey), {
      payments: updPayments, totalPaid: updPaid, balance: updBalance,
      updatedAt: new Date().toISOString()
    });
    activeReg = { ...activeReg, payments: updPayments, totalPaid: updPaid, balance: updBalance };
    allReceipts[activeRegKey] = activeReg;
    rcpLoadClient(activeRegKey);
    document.getElementById('ra-paid').value = '';
    document.getElementById('ra-note').value = '';
    showStatus(status, '✓ Payment added! Receipt ready.', 'success');
  } catch (e) { showStatus(status, 'Error: ' + e.message, 'error'); }
};

window.rcpSendEmail = async function() {
  if (!currentReceiptData) { alert('Generate a receipt first.'); return; }
  const { name, email, pkg, cur, total, totalPaid, bal, receiptNumber, date, payments } = currentReceiptData;
  if (!email) { alert('No email address on this receipt.'); return; }
  const statusId = document.getElementById('rn-status').closest('#rcp-form-new') ? 'rn-status' : 'ra-status';
  const status   = document.getElementById(statusId);
  try {
    showStatus(status, 'Connecting to email server…', 'info');
    await fetch(`${SERVER_URL}/health`);
    showStatus(status, `Sending to ${email}…`, 'info');
    const res = await fetch(`${SERVER_URL}/send-receipt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiptNumber, date, clientName: name, clientEmail: email,
        purpose: pkg, currency: cur, amount: total,
        amountPaid: totalPaid, balance: bal, payments
      })
    });
    const data = await res.json();
    if (data.success) showStatus(status, `✓ Receipt sent to ${email}`, 'success');
    else throw new Error(data.error || 'Server returned failure');
  } catch (e) {
    showStatus(status, 'Failed: ' + e.message, 'error');
  }
};

window.rcpRenderRegs = function() {
  const search = (document.getElementById('rcp-reg-search')?.value || '').toLowerCase();
  const pkg    = document.getElementById('rcp-reg-pkg')?.value || '';
  const st     = document.getElementById('rcp-reg-status')?.value || '';
  const tbody  = document.getElementById('rcp-reg-tbody');
  if (!tbody) return;

  let rows = Object.entries(allReceipts).filter(([k, r]) => {
    if (search && !(r.clientName||'').toLowerCase().includes(search) && !(r.registrationId||'').toLowerCase().includes(search)) return false;
    if (pkg && r.package !== pkg) return false;
    if (st === 'paid'  && r.balance > 0)  return false;
    if (st === 'owing' && r.balance <= 0) return false;
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#9ca3af;">No registrations found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(([k, r]) => {
    const isPaid = r.balance <= 0;
    return `<tr>
      <td style="font-family:monospace;font-size:.78rem;">${esc(r.registrationId||'—')}</td>
      <td><strong>${esc(r.clientName||'')}</strong><br><span style="font-size:.74rem;color:#9ca3af;">${esc(r.clientEmail||'')}</span></td>
      <td><span class="pkg-badge">${esc(r.package||'—')}</span></td>
      <td>${rcpFmt(r.totalAmount, r.currency)}</td>
      <td style="color:#16a34a;">${rcpFmt(r.totalPaid||0, r.currency)}</td>
      <td style="color:${isPaid?'#16a34a':'#ef4444'};">${rcpFmt(r.balance, r.currency)}</td>
      <td><span class="balance-pill ${isPaid?'paid':'owing'}">${isPaid?'Paid':'Owing'}</span></td>
      <td><button class="btn-secondary-crm btn-sm" onclick="rcpOpenAddPayment('${k}')">+ Payment</button></td>
    </tr>`;
  }).join('');
};

window.rcpOpenAddPayment = function(key) {
  rcpSwitchMode('add');
  rcpLoadClient(key);
};

function rcpResetNew() {
  ['rn-name','rn-email','rn-total','rn-paid','rn-note','rn-custom'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('rn-package').value = '';
  document.getElementById('rn-date').value    = new Date().toISOString().split('T')[0];
  document.getElementById('rn-custom-wrap').style.display = 'none';
  document.getElementById('rn-balance').textContent = '—';
  document.getElementById('rn-balance').classList.remove('paid');
  document.getElementById('rn-status').className = 'rcp-status';
  currentReceiptData = null;
  document.getElementById('rv-payments-body').innerHTML =
    '<tr><td colspan="3" style="color:#9ca3af;text-align:center;padding:20px;">Fill in the form to preview.</td></tr>';
  ['rv-number','rv-date','rv-name','rv-email','rv-pkg-total','rv-total-paid','rv-balance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = id === 'rv-number' ? 'Receipt #: —' : id === 'rv-date' ? 'Date: —' : '—';
  });
  document.getElementById('rcp-preview-num').textContent = '—';
}

document.addEventListener('click', e => {
  if (!e.target.closest('.rcp-search-wrap')) {
    document.getElementById('ra-results')?.classList.remove('open');
  }
});

function rcpFmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ════════════════════════════════════════════════════════════
//  UI SETUP
// ════════════════════════════════════════════════════════════
function setupUI() {
  // Tabs
  document.querySelectorAll('.crm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crm-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'staff') { loadStaff(); }
    });
  });

  // Lead filters
  ['search-input','filter-status','filter-travel','filter-agent'].forEach(id =>
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

  // Run registration sync and deduplication once
  syncRegistrations();
  deduplicateLeads();
}

// ════════════════════════════════════════════════════════════
//  DEDUPLICATION
// ════════════════════════════════════════════════════════════
async function deduplicateLeads() {
  const snap = await get(ref(db, 'crm_leads'));
  if (!snap.exists()) return;

  const byReceiptKey = {};
  const byEmail      = {};
  const updates      = {};

  snap.forEach(c => {
    const l = { id: c.key, ...c.val() };
    if (l.receiptKey) {
      (byReceiptKey[l.receiptKey] = byReceiptKey[l.receiptKey] || []).push(l);
    } else if (l.email) {
      const key = l.email.toLowerCase();
      (byEmail[key] = byEmail[key] || []).push(l);
    }
  });

  // For receipt-sourced leads: keep the most recently updated entry
  Object.values(byReceiptKey).forEach(group => {
    if (group.length <= 1) return;
    group.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    group.slice(1).forEach(l => { updates[`crm_leads/${l.id}`] = null; });
  });

  // For manual leads: keep the most recently updated entry per email
  Object.values(byEmail).forEach(group => {
    if (group.length <= 1) return;
    group.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    group.slice(1).forEach(l => { updates[`crm_leads/${l.id}`] = null; });
  });

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function formData(form) {
  const d = {};
  new FormData(form).forEach((v, k) => { d[k] = v; });
  return d;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' });
  } catch { return dateStr; }
}

function normTravel(s) {
  return { hajj:'hajj', umrah:'umrah', ramadan:'ramadan', december:'december', vacation:'vacation' }[
    (s || '').toLowerCase().split(' ')[0]
  ] || 'umrah';
}

function showStatus(el, msg, type) {
  el.textContent  = msg;
  el.className    = 'rcp-status show ' + type;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
