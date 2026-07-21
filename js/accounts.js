import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getDatabase, ref, push, set, get, onValue, update, remove
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const app  = initializeApp({
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

// ── Constants ────────────────────────────────────────────────
const CURRENCIES = ['CAD', 'NGN', 'GBP', 'SAR'];
const CUR_SYM    = { CAD:'CA$', NGN:'₦', GBP:'£', SAR:'﷼' };
const CUR_FLAG   = { CAD:'🇨🇦', NGN:'🇳🇬', GBP:'🇬🇧', SAR:'🇸🇦' };
const CUR_NAME   = { CAD:'Canadian Dollar', NGN:'Nigerian Naira', GBP:'British Pound', SAR:'Saudi Riyal' };
const PAGE_SIZE  = 30;

const EXP_CAT_ICONS = {
  'Flights':'✈️','Hotel / Accommodation':'🏨','Visas & Documentation':'🛂',
  'Ground Transport':'🚌','Meals & Catering':'🍱','Marketing & Advertising':'📢',
  'Office & Admin':'💼','Staff / Agent Payments':'👤','Makkah Services':'🕌','Miscellaneous':'📦'
};
const INC_CAT_ICONS = {
  'Umrah Package':'🕋','Hajj Package':'🕌','Ramadan Package':'🌙',
  'December Package':'📅','Islamic Vacation':'✈️','Consultation Fee':'💬',
  'Deposit':'💰','Other':'📋'
};

// ── State ────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let allIncome      = [];   // [{id, ...}]
let allExpenses    = [];   // [{id, ...}]
let filtIncome     = [];
let filtExpenses   = [];
let incPage = 1, expPage = 1;
let pendingDelete  = null; // { path, id }

// ── Auth guard ───────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = 'crm-login.html?returnTo=accounts.html'; return; }
  currentUser = user;

  const snap = await get(ref(db, `crm_staff/${user.uid}`));
  currentProfile = snap.exists() ? snap.val() : { name: user.email, role: 'agent' };

  document.getElementById('user-initials').textContent =
    (currentProfile.name || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-name').textContent = currentProfile.name;

  setupUI();
  subscribeIncome();
  subscribeExpenses();
  subscribeReceipts();
  setDefaultDates();
});

// ── Subscriptions ─────────────────────────────────────────────
function subscribeIncome() {
  onValue(ref(db, 'accounts_income'), snap => {
    allIncome = [];
    if (snap.exists()) snap.forEach(c => { allIncome.push({ id: c.key, ...c.val() }); });
    allIncome.sort((a, b) => (b.date||'').localeCompare(a.date||''));
    applyIncomeFilters();
    renderOverview();
  });
}

function subscribeExpenses() {
  onValue(ref(db, 'accounts_expenses'), snap => {
    allExpenses = [];
    if (snap.exists()) snap.forEach(c => { allExpenses.push({ id: c.key, ...c.val() }); });
    allExpenses.sort((a, b) => (b.date||'').localeCompare(a.date||''));
    applyExpenseFilters();
    renderOverview();
  });
}

// ── Receipt sync ──────────────────────────────────────────────
// One income entry per receipt (not per payment). Amount = totalPaid, updated
// whenever payments change. accounts_synced[rKey] = { incId, totalPaid }.
// Old per-payment keys (rKey_0, rKey_1 …) are detected and skipped to avoid
// double-counting data synced before this approach was adopted.
function subscribeReceipts() {
  onValue(ref(db, 'receipts'), async snap => {
    if (!snap.exists()) return;
    const receipts = snap.val();

    const syncSnap = await get(ref(db, 'accounts_synced'));
    const synced   = syncSnap.exists() ? syncSnap.val() : {};
    const updates  = {};

    Object.entries(receipts).forEach(([rKey, reg]) => {
      const totalPaid = parseFloat(reg.totalPaid) || 0;
      const regDate   = typeof reg.createdAt === 'string'
        ? reg.createdAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const existing = synced[rKey];

      if (existing && typeof existing === 'object' && existing.incId) {
        // Skip legacy markers (old per-payment approach already has an entry)
        if (existing.incId === '__legacy__') return;
        // Already synced with new per-receipt approach — update if payment changed
        if (existing.totalPaid !== totalPaid) {
          const tot = parseFloat(reg.totalAmount) || 0;
          updates[`accounts_income/${existing.incId}/amount`]      = totalPaid;
          updates[`accounts_income/${existing.incId}/totalAmount`] = tot;
          updates[`accounts_income/${existing.incId}/notes`]       =
            `Receipt ${reg.registrationId || ''} · Paid ${totalPaid} / Total ${tot} ${reg.currency || ''}`.trim();
          updates[`accounts_synced/${rKey}/totalPaid`] = totalPaid;
        }
        return;
      }

      // Check for old per-payment entries (rKey_0, rKey_1 …)
      const hasLegacyEntries = Object.keys(synced).some(k => k.startsWith(rKey + '_'));
      if (hasLegacyEntries) {
        // Mark as legacy so we don't re-create on next load
        updates[`accounts_synced/${rKey}`] = { incId: '__legacy__', totalPaid };
        return;
      }

      // New receipt — create one income entry
      const incId = push(ref(db, 'accounts_income')).key;
      updates[`accounts_income/${incId}`] = {
        description:   `${reg.clientName || 'Client'} — ${reg.package || 'Package'}`,
        clientName:    reg.clientName || '',
        amount:        totalPaid,
        totalAmount:   parseFloat(reg.totalAmount) || 0,
        currency:      reg.currency || 'CAD',
        category:      mapPackageToCategory(reg.package),
        date:          regDate,
        source:        'receipt',
        receiptKey:    rKey,
        receiptNumber: reg.registrationId || '',
        notes:         `Receipt ${reg.registrationId || ''} · Paid ${totalPaid} / Total ${reg.totalAmount || 0} ${reg.currency || ''}`.trim(),
        createdAt:     Date.now(),
        createdBy:     currentUser?.uid || ''
      };
      updates[`accounts_synced/${rKey}`] = { incId, totalPaid };
    });

    if (Object.keys(updates).length) {
      await update(ref(db), updates);
    }
  });
}

function mapPackageToCategory(pkg) {
  if (!pkg) return 'Other';
  const p = pkg.toLowerCase();
  if (p.includes('hajj'))     return 'Hajj Package';
  if (p.includes('ramadan'))  return 'Ramadan Package';
  if (p.includes('december')) return 'December Package';
  if (p.includes('vacation')) return 'Islamic Vacation';
  return 'Umrah Package';
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview() {
  renderCurrencyCards();
  renderRecent();
}

function renderCurrencyCards() {
  const grid = document.getElementById('currency-grid');
  if (!grid) return;

  grid.innerHTML = CURRENCIES.map(cur => {
    const totalInc = allIncome.filter(r => r.currency === cur).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    const totalExp = allExpenses.filter(r => r.currency === cur).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    const net      = totalInc - totalExp;
    const sym      = CUR_SYM[cur];
    return `
      <div class="cur-card">
        <div class="cur-card-header">
          <span class="cur-flag">${CUR_FLAG[cur]}</span>
          <div>
            <h3>${CUR_NAME[cur]}</h3>
            <div class="cur-code">${cur}</div>
          </div>
        </div>
        <div class="cur-card-body">
          <div class="cur-stat">
            <div class="cs-label">Income</div>
            <div class="cs-val cs-income">${fmt(totalInc, cur)}</div>
          </div>
          <div class="cur-stat">
            <div class="cs-label">Expenses</div>
            <div class="cs-val cs-expense">${fmt(totalExp, cur)}</div>
          </div>
        </div>
        <div class="cur-net-bar">
          <div class="cur-net-label">Net Balance</div>
          <div class="cur-net-val ${net >= 0 ? 'cs-net-pos' : 'cs-net-neg'}">${net >= 0 ? '+' : ''}${fmt(net, cur)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderRecent() {
  const wrap = document.getElementById('recent-list');
  if (!wrap) return;
  const inc = allIncome.slice(0, 8).map(r => ({ ...r, kind:'income' }));
  const exp = allExpenses.slice(0, 8).map(r => ({ ...r, kind:'expense' }));
  const combined = [...inc, ...exp].sort((a, b) => (b.date||'').localeCompare(a.date||'')).slice(0, 12);

  if (!combined.length) { wrap.innerHTML = '<p style="color:#94a3b8;font-size:.875rem;">No transactions yet.</p>'; return; }

  wrap.innerHTML = combined.map(t => {
    const icon = t.kind === 'income'
      ? (INC_CAT_ICONS[t.category] || '💰')
      : (EXP_CAT_ICONS[t.category] || '📤');
    return `<div class="txn-row">
      <div class="txn-icon ${t.kind}">${icon}</div>
      <div class="txn-info">
        <div class="txn-desc">${esc(t.description||'—')}</div>
        <div class="txn-meta">${fmtDate(t.date)} · ${esc(t.category||'')}</div>
      </div>
      <div class="txn-amt ${t.kind}">${t.kind === 'income' ? '+' : '−'}${fmt(parseFloat(t.amount)||0, t.currency)}</div>
    </div>`;
  }).join('');
}

// ── Income tab ────────────────────────────────────────────────
function applyIncomeFilters() {
  const q      = (document.getElementById('inc-search')?.value || '').toLowerCase();
  const cur    = document.getElementById('inc-cur')?.value || '';
  const cat    = document.getElementById('inc-cat')?.value || '';
  const source = document.getElementById('inc-source')?.value || '';
  const month  = document.getElementById('inc-month')?.value || '';

  filtIncome = allIncome.filter(r => {
    if (cur    && r.currency !== cur)                             return false;
    if (cat    && r.category !== cat)                             return false;
    if (source && r.source   !== source)                          return false;
    if (month  && !(r.date||'').startsWith(month))                return false;
    if (q && !(r.description||'').toLowerCase().includes(q)
           && !(r.clientName||'').toLowerCase().includes(q))      return false;
    return true;
  });

  incPage = 1;
  renderIncomeTable();
  renderIncomeTotals();
}

function renderIncomeTable() {
  const tbody = document.getElementById('income-body');
  const start = (incPage - 1) * PAGE_SIZE;
  const page  = filtIncome.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = '<tr><td class="empty-td" colspan="7">No income entries found.</td></tr>';
    renderPagination('inc', 0);
    return;
  }
  tbody.innerHTML = page.map(r => `<tr>
    <td style="white-space:nowrap;">${fmtDate(r.date)}</td>
    <td>
      <div style="font-weight:600;">${esc(r.description||'—')}</div>
      ${r.clientName ? `<div style="font-size:.75rem;color:#94a3b8;">${esc(r.clientName)}</div>` : ''}
    </td>
    <td><span class="cat-badge">${esc(r.category||'—')}</span></td>
    <td>${r.source === 'receipt'
      ? `<span class="source-pill src-receipt">🧾 Receipt${r.receiptNumber ? ' ' + r.receiptNumber : ''}</span>`
      : `<span class="source-pill src-manual">✏️ Manual</span>`}</td>
    <td><strong>${r.currency}</strong></td>
    <td class="right">
      <div class="amt-income">${fmt(parseFloat(r.amount)||0, r.currency)}</div>
      ${r.source === 'receipt' && r.totalAmount > r.amount
        ? `<div style="font-size:.71rem;color:#94a3b8;">of ${fmt(parseFloat(r.totalAmount)||0, r.currency)}</div>`
        : ''}
    </td>
    <td>
      ${r.source !== 'receipt'
        ? `<button class="btn-secondary" style="padding:4px 10px;font-size:.75rem;" onclick="editIncome('${r.id}')">Edit</button>
           <button class="btn-danger" style="margin-left:4px;" onclick="confirmDelete('accounts_income','${r.id}','income entry')">✕</button>`
        : `<span style="font-size:.72rem;color:#94a3b8;">auto</span>`}
    </td>
  </tr>`).join('');
  renderPagination('inc', filtIncome.length);
}

function renderIncomeTotals() {
  const wrap = document.getElementById('income-totals');
  if (!wrap) return;
  wrap.innerHTML = CURRENCIES.map(cur => {
    const total = filtIncome.filter(r => r.currency === cur).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    if (!total) return '';
    return `<div class="sum-card income-card" style="min-width:160px;">
      <div class="s-label">${CUR_FLAG[cur]} ${cur} Income</div>
      <div class="s-val" style="font-size:1.1rem;">${fmt(total, cur)}</div>
    </div>`;
  }).join('');
}

// ── Expense tab ───────────────────────────────────────────────
function applyExpenseFilters() {
  const q     = (document.getElementById('exp-search')?.value || '').toLowerCase();
  const cur   = document.getElementById('exp-cur')?.value || '';
  const cat   = document.getElementById('exp-cat')?.value || '';
  const month = document.getElementById('exp-month')?.value || '';

  filtExpenses = allExpenses.filter(r => {
    if (cur   && r.currency !== cur)                              return false;
    if (cat   && r.category !== cat)                              return false;
    if (month && !(r.date||'').startsWith(month))                 return false;
    if (q && !(r.description||'').toLowerCase().includes(q)
           && !(r.vendor||'').toLowerCase().includes(q))          return false;
    return true;
  });

  expPage = 1;
  renderExpenseTable();
  renderExpenseTotals();
}

function renderExpenseTable() {
  const tbody = document.getElementById('expense-body');
  const start = (expPage - 1) * PAGE_SIZE;
  const page  = filtExpenses.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = '<tr><td class="empty-td" colspan="7">No expense entries found.</td></tr>';
    renderPagination('exp', 0);
    return;
  }
  tbody.innerHTML = page.map(r => `<tr>
    <td style="white-space:nowrap;">${fmtDate(r.date)}</td>
    <td>
      <div style="font-weight:600;">${esc(r.description||'—')}</div>
      ${r.vendor ? `<div style="font-size:.75rem;color:#94a3b8;">${esc(r.vendor)}</div>` : ''}
    </td>
    <td><span class="cat-badge">${(EXP_CAT_ICONS[r.category]||'') + ' ' + esc(r.category||'—')}</span></td>
    <td><strong>${r.currency}</strong></td>
    <td class="right amt-expense">${fmt(parseFloat(r.amount)||0, r.currency)}</td>
    <td style="font-size:.78rem;color:#94a3b8;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.notes||'—')}</td>
    <td>
      <button class="btn-secondary" style="padding:4px 10px;font-size:.75rem;" onclick="editExpense('${r.id}')">Edit</button>
      <button class="btn-danger" style="margin-left:4px;" onclick="confirmDelete('accounts_expenses','${r.id}','expense')">✕</button>
    </td>
  </tr>`).join('');
  renderPagination('exp', filtExpenses.length);
}

function renderExpenseTotals() {
  const wrap = document.getElementById('expense-totals');
  if (!wrap) return;
  wrap.innerHTML = CURRENCIES.map(cur => {
    const total = filtExpenses.filter(r => r.currency === cur).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    if (!total) return '';
    return `<div class="sum-card expense-card" style="min-width:160px;">
      <div class="s-label">${CUR_FLAG[cur]} ${cur} Expenses</div>
      <div class="s-val" style="font-size:1.1rem;">${fmt(total, cur)}</div>
    </div>`;
  }).join('');
}

// ── Reports ───────────────────────────────────────────────────
window.renderReports = function() {
  const from = document.getElementById('rpt-from').value;
  const to   = document.getElementById('rpt-to').value;
  const cur  = document.getElementById('rpt-cur').value;

  const filterFn = r =>
    (!cur   || r.currency === cur) &&
    (!from  || r.date >= from) &&
    (!to    || r.date <= to);

  const inc = allIncome.filter(filterFn);
  const exp = allExpenses.filter(filterFn);

  const grid = document.getElementById('report-grid');

  // P&L per currency
  const plCards = CURRENCIES.map(c => {
    if (cur && c !== cur) return '';
    const totalInc = inc.filter(r => r.currency === c).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    const totalExp = exp.filter(r => r.currency === c).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
    const net = totalInc - totalExp;
    if (!totalInc && !totalExp) return '';
    return `
      <div class="report-card">
        <div class="report-card-header">
          <h3>${CUR_FLAG[c]} Profit &amp; Loss — ${c}</h3>
        </div>
        <div class="report-card-body">
          <div class="pl-row"><span>Total Income</span><span class="r-val" style="color:var(--green);">${fmt(totalInc, c)}</span></div>
          <div class="pl-row"><span>Total Expenses</span><span class="r-val" style="color:var(--red);">${fmt(totalExp, c)}</span></div>
          <div class="pl-row"><span>Net Profit / Loss</span>
            <span class="r-val ${net >= 0 ? 'pl-total-pos' : 'pl-total-neg'}">${net >= 0 ? '+' : ''}${fmt(net, c)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // Expense breakdown by category
  const expByCat = {};
  exp.forEach(r => {
    const k = (r.category||'Other') + '|||' + (r.currency||'CAD');
    expByCat[k] = (expByCat[k] || 0) + (parseFloat(r.amount)||0);
  });
  const expCatTotal = exp.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
  const expCatRows  = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const [cat, c] = k.split('|||');
    const pct = expCatTotal > 0 ? ((v / expCatTotal) * 100).toFixed(0) : 0;
    return `<div class="report-row">
      <span class="r-label">${(EXP_CAT_ICONS[cat]||'') + ' ' + esc(cat)}</span>
      <span class="r-val">${fmt(v, c)} <span class="r-pct">${pct}%</span></span>
    </div>
    <div class="cat-bar-wrap"><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${pct}%;background:var(--red);opacity:.7;"></div></div></div>`;
  }).join('');

  // Income breakdown by category
  const incByCat = {};
  inc.forEach(r => {
    const k = (r.category||'Other') + '|||' + (r.currency||'CAD');
    incByCat[k] = (incByCat[k] || 0) + (parseFloat(r.amount)||0);
  });
  const incCatTotal = inc.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
  const incCatRows  = Object.entries(incByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const [cat, c] = k.split('|||');
    const pct = incCatTotal > 0 ? ((v / incCatTotal) * 100).toFixed(0) : 0;
    return `<div class="report-row">
      <span class="r-label">${(INC_CAT_ICONS[cat]||'') + ' ' + esc(cat)}</span>
      <span class="r-val">${fmt(v, c)} <span class="r-pct">${pct}%</span></span>
    </div>
    <div class="cat-bar-wrap"><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${pct}%;"></div></div></div>`;
  }).join('');

  grid.innerHTML = plCards +
    `<div class="report-card">
      <div class="report-card-header"><h3>📥 Income by Category</h3></div>
      <div class="report-card-body">${incCatRows || '<p style="color:#94a3b8;font-size:.85rem;">No data.</p>'}</div>
    </div>
    <div class="report-card">
      <div class="report-card-header"><h3>📤 Expenses by Category</h3></div>
      <div class="report-card-body">${expCatRows || '<p style="color:#94a3b8;font-size:.85rem;">No data.</p>'}</div>
    </div>`;
};

// ── Add / Edit Income ─────────────────────────────────────────
document.getElementById('btn-add-income').addEventListener('click', () => {
  document.getElementById('income-form').reset();
  document.getElementById('inc-edit-id').value = '';
  document.getElementById('income-form').elements['date'].value = todayStr();
  document.getElementById('modal-income').querySelector('h3').textContent = 'Add Income';
  openModal('modal-income');
});

window.editIncome = (id) => {
  const rec = allIncome.find(r => r.id === id);
  if (!rec) return;
  const form = document.getElementById('income-form');
  form.reset();
  document.getElementById('inc-edit-id').value = id;
  document.getElementById('modal-income').querySelector('h3').textContent = 'Edit Income';
  ['description','amount','currency','date','category','clientName','notes'].forEach(f => {
    const el = form.elements[f]; if (el && rec[f] != null) el.value = rec[f];
  });
  openModal('modal-income');
};

document.getElementById('save-income-btn').addEventListener('click', async () => {
  const form = document.getElementById('income-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('save-income-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const data = getFormData(form);
  data.amount    = parseFloat(data.amount) || 0;
  data.source    = 'manual';
  data.updatedAt = Date.now();

  const editId = document.getElementById('inc-edit-id').value;
  try {
    if (editId) {
      await update(ref(db, `accounts_income/${editId}`), data);
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.uid;
      await push(ref(db, 'accounts_income'), data);
    }
    closeModal('modal-income');
  } catch (err) { alert('Save failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Income'; }
});

// ── Add / Edit Expense ────────────────────────────────────────
document.getElementById('btn-add-expense').addEventListener('click', () => {
  document.getElementById('expense-form').reset();
  document.getElementById('exp-edit-id').value = '';
  document.getElementById('expense-form').elements['date'].value = todayStr();
  document.getElementById('modal-expense').querySelector('h3').textContent = 'Add Expense';
  openModal('modal-expense');
});

window.editExpense = (id) => {
  const rec = allExpenses.find(r => r.id === id);
  if (!rec) return;
  const form = document.getElementById('expense-form');
  form.reset();
  document.getElementById('exp-edit-id').value = id;
  document.getElementById('modal-expense').querySelector('h3').textContent = 'Edit Expense';
  ['description','amount','currency','date','category','vendor','notes'].forEach(f => {
    const el = form.elements[f]; if (el && rec[f] != null) el.value = rec[f];
  });
  openModal('modal-expense');
};

document.getElementById('save-expense-btn').addEventListener('click', async () => {
  const form = document.getElementById('expense-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = document.getElementById('save-expense-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const data = getFormData(form);
  data.amount    = parseFloat(data.amount) || 0;
  data.updatedAt = Date.now();

  const editId = document.getElementById('exp-edit-id').value;
  try {
    if (editId) {
      await update(ref(db, `accounts_expenses/${editId}`), data);
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.uid;
      await push(ref(db, 'accounts_expenses'), data);
    }
    closeModal('modal-expense');
  } catch (err) { alert('Save failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Expense'; }
});

// ── Delete ────────────────────────────────────────────────────
window.confirmDelete = (path, id, label) => {
  pendingDelete = { path, id };
  document.getElementById('delete-msg').textContent = `Delete this ${label}? This cannot be undone.`;
  openModal('modal-delete');
};

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (!pendingDelete) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    await remove(ref(db, `${pendingDelete.path}/${pendingDelete.id}`));
    closeModal('modal-delete');
  } catch (err) { alert('Delete failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Delete'; pendingDelete = null; }
});

// ── Pagination ────────────────────────────────────────────────
function renderPagination(prefix, total) {
  const pages   = Math.ceil(total / PAGE_SIZE);
  const row     = document.getElementById(`${prefix}-pg-row`);
  if (!row) return;
  if (pages <= 1) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  const curPage = prefix === 'inc' ? incPage : expPage;
  const start   = (curPage - 1) * PAGE_SIZE + 1;
  const end     = Math.min(curPage * PAGE_SIZE, total);
  document.getElementById(`${prefix}-pg-info`).textContent = `Showing ${start}–${end} of ${total}`;
  const btns = document.getElementById(`${prefix}-pg-btns`);
  btns.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.className   = 'pg-btn' + (i === curPage ? ' active' : '');
    b.textContent = i;
    b.onclick = () => {
      if (prefix === 'inc') { incPage = i; renderIncomeTable(); }
      else                  { expPage = i; renderExpenseTable(); }
      renderPagination(prefix, total);
    };
    btns.appendChild(b);
  }
}

// ── UI setup ──────────────────────────────────────────────────
function setupUI() {
  // Tabs
  document.querySelectorAll('.acc-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.acc-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.acc-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'reports') renderReports();
    });
  });

  // Income filters
  ['inc-search','inc-cur','inc-cat','inc-source','inc-month'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', applyIncomeFilters);
  });

  // Expense filters
  ['exp-search','exp-cur','exp-cat','exp-month'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', applyExpenseFilters);
  });

  // Modals
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })
  );

  // User menu
  const chip = document.getElementById('user-chip');
  const dd   = document.getElementById('user-dd');
  const bd   = document.getElementById('dd-bd');
  chip.addEventListener('click', e => {
    e.stopPropagation();
    const open = dd.classList.toggle('open');
    bd.style.display = open ? 'block' : 'none';
  });
  bd.addEventListener('click', () => { dd.classList.remove('open'); bd.style.display = 'none'; });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth); location.href = 'crm-login.html';
  });
}

function setDefaultDates() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = String(now.getMonth() + 1).padStart(2, '0');
  const today = `${y}-${m}-${String(now.getDate()).padStart(2,'0')}`;
  const first = `${y}-${m}-01`;
  document.getElementById('rpt-from').value = first;
  document.getElementById('rpt-to').value   = today;
}

// ── Helpers ───────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function getFormData(form) {
  const d = {};
  new FormData(form).forEach((v, k) => { d[k] = v; });
  return d;
}

function fmt(val, cur) {
  const sym = CUR_SYM[cur] || (cur + ' ');
  if (!val && val !== 0) return '—';
  return sym + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return s; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
