import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, update, remove, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const app = initializeApp({
  apiKey: "AIzaSyDK3r2QlBbErNqs0L4DIuzrJi_ue-4z0MA",
  authDomain: "deenvoyage-f065a.firebaseapp.com",
  databaseURL: "https://deenvoyage-f065a-default-rtdb.firebaseio.com",
  projectId: "deenvoyage-f065a",
  storageBucket: "deenvoyage-f065a.appspot.com",
  messagingSenderId: "76816405729",
  appId: "1:76816405729:web:d1db037c0a7c27c6f613a0"
});
const auth = getAuth(app);
const db   = getDatabase(app);

const leadId = new URLSearchParams(location.search).get('id');
if (!leadId) { alert('No lead ID.'); location.href = 'crm.html'; }

let currentUser    = null;
let currentProfile = null;
let lead           = null;
let allStaff       = {};

const STATUS_LABELS = {
  new:'New Lead', in_discussion:'In Discussion', deposit_paid:'Deposit Paid',
  paid_full:'Paid Full', will_pay:'Will Pay', follow_up:'Needs Follow-up',
  competitor:'Competitor', diy:'DIY', cancelled:'Cancelled', completed:'Completed', refund:'Refund'
};
const TRAVEL_LABELS = {
  hajj:'🕌 Hajj', umrah:'🕋 Umrah', ramadan:'🌙 Ramadan Umrah',
  december:'📅 December Umrah', vacation:'✈️ Islamic Vacation'
};
const TYPE_LABELS = {
  call:'📞 Call', whatsapp:'💬 WhatsApp', email:'✉️ Email',
  in_person:'🤝 In Person', note:'📝 Note'
};
const SYM = { CAD:'$', NGN:'₦', GBP:'£' };

// ── Auth guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = `crm-login.html?returnTo=crm-lead.html${location.search}`; return; }
  currentUser = user;

  const snap = await get(ref(db, `crm_staff/${user.uid}`));
  currentProfile = snap.exists() ? snap.val() : { name: user.email, role: 'agent' };

  document.getElementById('user-initials').textContent =
    (currentProfile.name || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-name').textContent = currentProfile.name;

  const staffSnap = await get(ref(db, 'crm_staff'));
  allStaff = staffSnap.exists() ? staffSnap.val() : {};
  populateAgentSelect();

  subscribeToLead();
  setupModals();
  setupUserMenu();
});

// ── Real-time lead subscription ───────────────────────────────
function subscribeToLead() {
  onValue(ref(db, `crm_leads/${leadId}`), snap => {
    if (!snap.exists()) {
      document.getElementById('lead-content').innerHTML = '<p style="color:#6b7280;">Lead not found.</p>';
      return;
    }
    lead = { id: leadId, ...snap.val() };
    renderDetail();
    document.title = `${lead.firstName || ''} ${lead.lastName || ''} — Deen Voyage CRM`.trim();
  });

  onValue(ref(db, `crm_interactions/${leadId}`), snap => {
    const wrap = document.getElementById('timeline-wrap');
    if (!wrap) return;
    if (!snap.exists()) { wrap.innerHTML = '<p style="color:#9ca3af;font-size:.85rem;">No interactions logged yet.</p>'; return; }
    const items = [];
    snap.forEach(c => items.push({ id: c.key, ...c.val() }));
    items.sort((a, b) => (b.date || 0) - (a.date || 0));
    wrap.innerHTML = items.map(i => `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div class="tl-meta">
          <span class="tl-type">${TYPE_LABELS[i.type] || i.type}</span>
          ${fmtDateTime(i.date)} · ${esc(i.agentName || 'Staff')}
        </div>
        <div class="tl-notes">${esc(i.notes || '')}</div>
        ${i.nextAction ? `<div class="tl-next">→ Next: ${esc(i.nextAction)}${i.nextActionDate ? ' by ' + fmtDate(i.nextActionDate) : ''}</div>` : ''}
      </div>
    `).join('');
  });
}

// ── Render lead detail ────────────────────────────────────────
function renderDetail() {
  const name    = `${lead.firstName||''} ${lead.lastName||''}`.trim();
  const initials = name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
  const status  = lead.status || 'new';
  const cur     = lead.currency || 'CAD';
  const sym     = SYM[cur] || '$';
  const quoted  = parseFloat(lead.quotedPrice) || 0;
  const paid    = parseFloat(lead.totalPaid)  || 0;
  const balance = quoted - paid;
  const pct     = quoted > 0 ? Math.min((paid / quoted) * 100, 100).toFixed(0) : 0;
  const agent   = allStaff[lead.assignedTo]?.name || 'Unassigned';
  const waNum   = (lead.whatsapp || lead.phone || '').replace(/\D/g, '');

  document.getElementById('lead-content').innerHTML = `
    <div class="lead-detail-header">
      <div class="lead-avatar">${initials}</div>
      <div>
        <h1>${esc(name || 'Unknown Client')}</h1>
        <div class="meta">
          <span class="badge-status s-${status}">${STATUS_LABELS[status]}</span>
          ${TRAVEL_LABELS[lead.travelType] ? `<span>·</span><span>${TRAVEL_LABELS[lead.travelType]}</span>` : ''}
          <span>·</span><span>Added ${fmtDate(new Date(lead.createdAt||0).toISOString().slice(0,10))}</span>
        </div>
      </div>
      <div class="lead-actions">
        ${waNum ? `<a href="https://wa.me/${waNum}" target="_blank" rel="noopener"
          style="background:#25d366;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:.83rem;font-weight:600;">
          💬 WhatsApp</a>` : ''}
        <button class="btn-primary-crm btn-sm" onclick="window._openModal('modal-edit-lead')">✏️ Edit</button>
        <button class="btn-primary-crm btn-sm" onclick="window._openInteraction()"
          style="background:var(--accent);">+ Log Interaction</button>
        ${lead.receiptKey
          ? `<span style="background:#fef3c7;color:#92400e;padding:6px 12px;border-radius:6px;font-size:.82rem;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🧾 ${esc(lead.receiptNumber || 'Receipt')}</span>`
          : `<button class="btn-primary-crm btn-sm" onclick="window._openReceiptModal()" style="background:#059669;">🧾 Create Receipt</button>`
        }
      </div>
    </div>

    <div class="lead-grid" style="margin-bottom:16px;">
      <!-- Contact -->
      <div class="card-crm">
        <div class="card-crm-header"><h2>📇 Contact</h2></div>
        <div class="card-crm-body">
          <div class="info-grid">
            <div class="info-item"><div class="ilabel">Phone</div><div class="ival">${esc(lead.phone||'—')}</div></div>
            <div class="info-item"><div class="ilabel">WhatsApp</div><div class="ival">${esc(lead.whatsapp||lead.phone||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Email</div><div class="ival">${esc(lead.email||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Country</div><div class="ival">${esc(lead.country||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Source</div><div class="ival">${esc(lead.source||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Agent</div><div class="ival">${esc(agent)}</div></div>
          </div>
        </div>
      </div>

      <!-- Travel -->
      <div class="card-crm">
        <div class="card-crm-header"><h2>✈️ Travel</h2></div>
        <div class="card-crm-body">
          <div class="info-grid">
            <div class="info-item"><div class="ilabel">Travel Type</div><div class="ival">${TRAVEL_LABELS[lead.travelType]||'—'}</div></div>
            <div class="info-item"><div class="ilabel">Travel Month</div><div class="ival">${lead.travelMonth ? fmtMonth(lead.travelMonth) : '—'}</div></div>
            <div class="info-item"><div class="ilabel">Room Type</div><div class="ival">${esc(lead.roomType||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Travelers</div><div class="ival">${lead.travelersCount||1}</div></div>
            <div class="info-item"><div class="ilabel">Package Pref.</div><div class="ival">${esc(lead.packagePreference||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Follow-up Date</div><div class="ival">${lead.followUpDate ? fmtDate(lead.followUpDate) : '—'}</div></div>
          </div>
        </div>
      </div>

      <!-- Financials -->
      <div class="card-crm">
        <div class="card-crm-header"><h2>💰 Financials (${cur})</h2></div>
        <div class="card-crm-body">
          <div class="fin-row">
            <div class="fin-item"><div class="f-label">Quoted</div><div class="f-val">${sym}${quoted.toLocaleString()}</div></div>
            <div class="fin-item"><div class="f-label">Paid</div><div class="f-val paid-color">${sym}${paid.toLocaleString()}</div></div>
            <div class="fin-item"><div class="f-label">Balance Due</div><div class="f-val ${balance > 0 ? 'due-color' : ''}">${sym}${balance.toLocaleString()}</div></div>
          </div>
          <div class="progress-bar-crm"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <p style="font-size:.73rem;color:#9ca3af;margin:5px 0 0;">${pct}% paid${lead.paymentDueDate ? ' · Due ' + fmtDate(lead.paymentDueDate) : ''}</p>
        </div>
      </div>

      <!-- Passport -->
      <div class="card-crm">
        <div class="card-crm-header"><h2>🛂 Passport</h2></div>
        <div class="card-crm-body">
          <div class="info-grid">
            <div class="info-item"><div class="ilabel">Type</div><div class="ival">${esc(lead.passportType||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Number</div><div class="ival">${esc(lead.passportNumber||'—')}</div></div>
            <div class="info-item"><div class="ilabel">Expiry</div><div class="ival">${lead.passportExpiry ? fmtDate(lead.passportExpiry) : '—'}</div></div>
            <div class="info-item"><div class="ilabel">Country of Issue</div><div class="ival">${esc(lead.passportCountry||'—')}</div></div>
          </div>
        </div>
      </div>
    </div>

    ${lead.notes ? `
    <div class="card-crm" style="margin-bottom:16px;">
      <div class="card-crm-header"><h2>📝 Notes</h2></div>
      <div class="card-crm-body" style="white-space:pre-wrap;font-size:.875rem;">${esc(lead.notes)}</div>
    </div>` : ''}

    <!-- Timeline -->
    <div class="card-crm">
      <div class="card-crm-header">
        <h2>📅 Interactions</h2>
        <button class="btn-primary-crm btn-sm" onclick="window._openInteraction()">+ Log</button>
      </div>
      <div class="card-crm-body">
        <div class="timeline" id="timeline-wrap">
          <p style="color:#9ca3af;font-size:.85rem;">Loading…</p>
        </div>
      </div>
    </div>
  `;

  // Populate edit form
  populateEditForm();

  // Responsive grid
  if (window.innerWidth < 700) {
    document.querySelector('.lead-grid').style.gridTemplateColumns = '1fr';
  }
}

// ── Edit form ─────────────────────────────────────────────────
function populateEditForm() {
  const form = document.getElementById('edit-lead-form');
  if (!form || !lead) return;
  [
    'firstName','lastName','email','phone','whatsapp','country','travelType','travelMonth',
    'roomType','travelersCount','packagePreference','passportType','passportNumber',
    'passportExpiry','passportCountry','status','followUpDate','source','assignedTo',
    'currency','quotedPrice','totalPaid','paymentDueDate','notes'
  ].forEach(f => {
    const el = form.elements[f];
    if (el && lead[f] != null) el.value = lead[f];
  });
}

function populateAgentSelect() {
  const sel = document.getElementById('edit-agent-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Unassigned</option>';
  Object.entries(allStaff).forEach(([uid, s]) => sel.appendChild(new Option(s.name, uid)));
}

document.getElementById('save-edit-btn').addEventListener('click', async () => {
  const form = document.getElementById('edit-lead-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('save-edit-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const data = getFormData(form);
    data.quotedPrice    = parseFloat(data.quotedPrice) || 0;
    data.totalPaid      = parseFloat(data.totalPaid)  || 0;
    data.travelersCount = parseInt(data.travelersCount) || 1;
    data.updatedAt      = Date.now();
    await update(ref(db, `crm_leads/${leadId}`), data);
    closeModal('modal-edit-lead');
  } catch (err) { alert('Failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
});

document.getElementById('delete-lead-btn').addEventListener('click', async () => {
  if (currentProfile.role !== 'admin') { alert('Only admins can delete leads.'); return; }
  if (!confirm('Permanently delete this lead and all its interactions?')) return;
  try {
    await Promise.all([
      remove(ref(db, `crm_leads/${leadId}`)),
      remove(ref(db, `crm_interactions/${leadId}`))
    ]);
    location.href = 'crm.html';
  } catch (err) { alert('Delete failed: ' + err.message); }
});

// ── Log interaction ───────────────────────────────────────────
window._openInteraction = function () {
  const form = document.getElementById('interaction-form');
  form.reset();
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  form.elements['date'].value = now.toISOString().slice(0, 16);
  openModal('modal-interaction');
};

document.getElementById('save-interaction-btn').addEventListener('click', async () => {
  const form = document.getElementById('interaction-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('save-interaction-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const data = getFormData(form);
    data.date      = data.date ? new Date(data.date).getTime() : Date.now();
    data.agentUid  = currentUser.uid;
    data.agentName = currentProfile.name;
    const newStatus = data.newStatus;
    delete data.newStatus;

    await push(ref(db, `crm_interactions/${leadId}`), data);

    if (newStatus && newStatus !== lead.status) {
      const upd = { status: newStatus, updatedAt: Date.now() };
      if (data.nextActionDate) upd.followUpDate = data.nextActionDate;
      await update(ref(db, `crm_leads/${leadId}`), upd);
    }

    closeModal('modal-interaction');
  } catch (err) { alert('Failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Log It'; }
});

// ── Modals ────────────────────────────────────────────────────
function setupModals() {
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })
  );
}
window._openModal = openModal;

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── User menu ─────────────────────────────────────────────────
function setupUserMenu() {
  const btn      = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  const bd       = document.getElementById('dropdown-bd');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    bd.style.display = open ? 'block' : 'none';
  });
  bd.addEventListener('click', () => { dropdown.classList.remove('open'); bd.style.display = 'none'; });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth); location.href = 'crm-login.html';
  });
}

// ── Receipt creation ──────────────────────────────────────────
const KNOWN_PACKAGES = ['August Umrah 2027','November Umrah 2026','December Umrah 2026','Hajj 2027'];

window._openReceiptModal = function() {
  const name = `${lead.firstName||''} ${lead.lastName||''}`.trim();
  const pref = lead.packagePreference || '';
  const isKnown = KNOWN_PACKAGES.includes(pref);

  document.getElementById('rc-name').value     = name;
  document.getElementById('rc-email').value    = lead.email || '';
  document.getElementById('rc-package').value  = isKnown ? pref : (pref ? 'Other' : '');
  document.getElementById('rc-custom-wrap').style.display = (!isKnown && pref) ? '' : 'none';
  document.getElementById('rc-custom').value   = (!isKnown && pref) ? pref : '';
  document.getElementById('rc-currency').value = lead.currency || 'CAD';
  document.getElementById('rc-total').value    = lead.quotedPrice || '';
  document.getElementById('rc-paid').value     = lead.totalPaid || '0';
  document.getElementById('rc-date').value     = new Date().toISOString().split('T')[0];
  document.getElementById('rc-note').value     = '';
  const st = document.getElementById('rc-status');
  st.textContent = ''; st.className = 'rcp-status';
  openModal('modal-receipt');
};

async function genReceiptNum() {
  const result = await runTransaction(ref(db, 'receiptCounter'), n => (n || 0) + 1);
  return 'DV-' + new Date().getFullYear() + '-' + String(result.snapshot.val()).padStart(4, '0');
}

document.getElementById('save-receipt-btn').addEventListener('click', async () => {
  const name  = document.getElementById('rc-name').value.trim();
  const email = document.getElementById('rc-email').value.trim();
  const pkgSel = document.getElementById('rc-package').value;
  const pkg   = pkgSel === 'Other'
    ? (document.getElementById('rc-custom').value.trim() || 'Other')
    : pkgSel;
  const cur   = document.getElementById('rc-currency').value;
  const total = parseFloat(document.getElementById('rc-total').value) || 0;
  const paid  = parseFloat(document.getElementById('rc-paid').value) || 0;
  const date  = document.getElementById('rc-date').value;
  const note  = document.getElementById('rc-note').value.trim();
  const st    = document.getElementById('rc-status');

  if (!name || !pkg || !total) {
    st.textContent = 'Client name, package and total amount are required.';
    st.className   = 'rcp-status show error';
    return;
  }

  const btn = document.getElementById('save-receipt-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  st.textContent = 'Generating receipt number…'; st.className = 'rcp-status show info';

  try {
    const receiptNum = await genReceiptNum().catch(() => 'DV-' + Date.now());
    const receiptKey = push(ref(db, 'receipts')).key;
    const payments   = paid > 0
      ? [{ receiptNumber: receiptNum, date, amount: paid, note: note || 'Initial payment', timestamp: Date.now() }]
      : [];
    const reg = {
      registrationId: receiptNum, clientName: name, clientEmail: email,
      package: pkg, currency: cur, totalAmount: total,
      payments, totalPaid: paid, balance: total - paid,
      linkedLeadId: leadId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    const newStatus = (paid >= total && total > 0) ? 'paid_full'
                    : paid > 0                      ? 'deposit_paid'
                    : lead.status;

    const updates = {};
    updates[`receipts/${receiptKey}`]                 = reg;
    updates[`crm_leads/${leadId}/receiptKey`]         = receiptKey;
    updates[`crm_leads/${leadId}/receiptNumber`]      = receiptNum;
    updates[`crm_leads/${leadId}/quotedPrice`]        = total;
    updates[`crm_leads/${leadId}/totalPaid`]          = paid;
    updates[`crm_leads/${leadId}/currency`]           = cur;
    updates[`crm_leads/${leadId}/syncedFromReceipt`]  = true;
    updates[`crm_leads/${leadId}/status`]             = newStatus;
    updates[`crm_leads/${leadId}/updatedAt`]          = Date.now();

    await update(ref(db), updates);
    st.textContent = `✓ Receipt ${receiptNum} created.`; st.className = 'rcp-status show success';
    setTimeout(() => closeModal('modal-receipt'), 1400);
  } catch (err) {
    st.textContent = 'Error: ' + err.message; st.className = 'rcp-status show error';
  } finally {
    btn.disabled = false; btn.textContent = 'Create Receipt';
  }
});

// ── Helpers ───────────────────────────────────────────────────
function getFormData(form) {
  const d = {};
  new FormData(form).forEach((v, k) => { d[k] = v; });
  return d;
}
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' }); }
  catch { return s; }
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return '—'; }
}
function fmtMonth(m) {
  if (!m) return '—';
  try { const [y, mo] = m.split('-'); return new Date(y, mo-1).toLocaleString('en-CA', { month:'long', year:'numeric' }); }
  catch { return m; }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
