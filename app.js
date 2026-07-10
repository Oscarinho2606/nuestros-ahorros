/* ===========================
   NUESTROS AHORROS - app.js
   Backend: Supabase (PostgreSQL)
   =========================== */

// ===== SUPABASE CONFIG =====
// 1. Ve a https://supabase.com → Tu proyecto → Settings → API
// 2. Copia "Project URL" y "anon public" key y pégalos abajo
const SUPABASE_URL      = 'https://rlzjezuobijptqqasytq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-TpSbhCtDYFYAH-AmESmzg_X5fkKBG3';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== CONSTANTS =====
const EXPENSE_CATS = [
  { id: 'food',      label: 'Comida',      emoji: '🍕' },
  { id: 'transport', label: 'Transporte',  emoji: '🚗' },
  { id: 'entertain', label: 'Diversión',   emoji: '🎬' },
  { id: 'health',    label: 'Salud',       emoji: '💊' },
  { id: 'clothing',  label: 'Ropa',        emoji: '👗' },
  { id: 'home',      label: 'Hogar',       emoji: '🏠' },
  { id: 'education', label: 'Educación',   emoji: '📚' },
  { id: 'tech',      label: 'Tecnología',  emoji: '💻' },
  { id: 'pets',      label: 'Mascotas',    emoji: '🐾' },
  { id: 'travel',    label: 'Viajes',      emoji: '✈️' },
  { id: 'gifts',     label: 'Regalos',     emoji: '🎁' },
  { id: 'other',     label: 'Otro',        emoji: '💰' },
];
const INCOME_CATS = [
  { id: 'salary',    label: 'Salario',     emoji: '💼' },
  { id: 'freelance', label: 'Freelance',   emoji: '💻' },
  { id: 'gift',      label: 'Regalo',      emoji: '🎁' },
  { id: 'invest',    label: 'Inversión',   emoji: '📈' },
  { id: 'bonus',     label: 'Bono',        emoji: '🎉' },
  { id: 'other',     label: 'Otro',        emoji: '💰' },
];
const SAVINGS_CATS = [
  { id: 'emergency', label: 'Emergencia',  emoji: '🏦' },
  { id: 'goal',      label: 'Meta',        emoji: '🎯' },
  { id: 'invest',    label: 'Inversión',   emoji: '📈' },
  { id: 'vacation',  label: 'Vacaciones',  emoji: '🏖️' },
  { id: 'other',     label: 'Otro',        emoji: '💰' },
];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ===== STATE (caché local de la BD) =====
let state = {
  transactions: [],
  goals: [],
  budgets: {},
  settings: { person1: 'Yo', person2: 'Mi Amor', currency: '$', expected_income: 0, savings_pct: 20 },
};

// Calendar state
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedCalDay = null;

// Pending payments state
state.pendingPayments = [];

// Chart instances
let chartCategory = null;
let chartMonthly  = null;

// Suppress realtime toast when we triggered the change ourselves
let suppressRealtimeToast = false;

// ===== LOADING UI =====
function showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }
function setConn(status) {
  const dot = document.getElementById('conn-dot');
  dot.className = 'conn-dot conn-' + status;
  dot.title = status === 'online' ? 'Conectado' : status === 'offline' ? 'Sin conexión' : 'Conectando...';
}

// ===== SUPABASE DB OPERATIONS =====
async function loadAll() {
  const [txRes, goalRes, budgetRes, settingsRes, pendingRes] = await Promise.all([
    db.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    db.from('goals').select('*, contributions(*)').order('created_at', { ascending: true }),
    db.from('budgets').select('*'),
    db.from('settings').select('*').eq('id', 'singleton').maybeSingle(),
    db.from('pending_payments').select('*').order('due_date', { ascending: true }),
  ]);

  if (txRes.error)   throw txRes.error;
  if (goalRes.error) throw goalRes.error;

  state.transactions    = txRes.data || [];
  state.goals           = goalRes.data || [];
  state.pendingPayments = pendingRes.data || [];
  state.budgets = {};
  (budgetRes.data || []).forEach(b => { state.budgets[b.category] = Number(b.amount); });
  if (settingsRes.data) state.settings = settingsRes.data;
}

async function dbAddTransaction(data) {
  const { data: row, error } = await db.from('transactions').insert(data).select().single();
  if (error) throw error;
  state.transactions.unshift(row);
  return row;
}

async function dbDeleteTransaction(id) {
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) throw error;
  state.transactions = state.transactions.filter(t => t.id !== id);
}

async function dbAddGoal(data) {
  const { data: row, error } = await db.from('goals').insert(data).select().single();
  if (error) throw error;
  row.contributions = [];
  state.goals.push(row);
  return row;
}

async function dbUpdateGoal(id, data) {
  const { error } = await db.from('goals').update(data).eq('id', id);
  if (error) throw error;
  const g = state.goals.find(g => g.id === id);
  if (g) Object.assign(g, data);
}

async function dbDeleteGoal(id) {
  const { error } = await db.from('goals').delete().eq('id', id);
  if (error) throw error;
  state.goals = state.goals.filter(g => g.id !== id);
}

async function dbAddContribution(goalId, amount, person, date) {
  const contrib = { goal_id: goalId, amount, person, date };
  const { data: row, error } = await db.from('contributions').insert(contrib).select().single();
  if (error) throw error;
  const newAmount = (state.goals.find(g => g.id === goalId)?.current_amount || 0) + amount;
  await db.from('goals').update({ current_amount: newAmount }).eq('id', goalId);
  const g = state.goals.find(g => g.id === goalId);
  if (g) {
    g.current_amount = newAmount;
    if (!g.contributions) g.contributions = [];
    g.contributions.push(row);
  }
  return newAmount;
}

async function dbSaveBudgets(budgets) {
  // Upsert each budget
  const rows = Object.entries(budgets).map(([category, amount]) => ({ category, amount }));
  if (rows.length > 0) {
    const { error } = await db.from('budgets').upsert(rows, { onConflict: 'category' });
    if (error) throw error;
  }
  // Delete removed budgets
  const kept = Object.keys(budgets);
  const all  = (await db.from('budgets').select('category')).data || [];
  const toDelete = all.filter(b => !kept.includes(b.category)).map(b => b.category);
  if (toDelete.length > 0) {
    await db.from('budgets').delete().in('category', toDelete);
  }
  state.budgets = budgets;
}

async function dbSaveSettings(settings) {
  const { error } = await db.from('settings').upsert({ id: 'singleton', ...settings }, { onConflict: 'id' });
  if (error) throw error;
  state.settings = { ...state.settings, ...settings };
}

// ===== REALTIME SUBSCRIPTIONS =====
function setupRealtime() {
  db.channel('ahorro-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, async () => {
      const { data } = await db.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
      state.transactions = data || [];
      renderCurrentPage();
      if (!suppressRealtimeToast) showToast('🔄 Sincronizado');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, async () => {
      const { data } = await db.from('goals').select('*, contributions(*)').order('created_at');
      state.goals = data || [];
      renderCurrentPage();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, async () => {
      const { data } = await db.from('goals').select('*, contributions(*)').order('created_at');
      state.goals = data || [];
      renderCurrentPage();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_payments' }, async () => {
      const { data } = await db.from('pending_payments').select('*').order('due_date', { ascending: true });
      state.pendingPayments = data || [];
      updatePendingBadge();
      renderPendingAlert();
      renderCurrentPage();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setConn('online');
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setConn('offline');
    });
}

// ===== UTILITIES =====
function fmt(amount) {
  const n = Number(amount) || 0;
  return state.settings.currency + n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function getCatInfo(type, catId) {
  const list = type === 'income' ? INCOME_CATS : type === 'savings' ? SAVINGS_CATS : EXPENSE_CATS;
  return list.find(c => c.id === catId) || { label: 'Otro', emoji: '💰' };
}

function personLabel(p) {
  return p === 'person1' ? state.settings.person1 : state.settings.person2;
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

function renderCurrentPage() {
  const id = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (id === 'dashboard')    renderDashboard();
  if (id === 'transactions') renderTransactions();
  if (id === 'calendar')     renderCalendar();
  if (id === 'goals')        renderGoals();
  if (id === 'reports')      renderReports();
  if (id === 'pending')      renderPending();
}

// ===== CALCULATIONS =====
function getBalance() {
  return state.transactions.reduce((acc, tx) => {
    if (tx.type === 'income')  return acc + Number(tx.amount);
    if (tx.type === 'expense') return acc - Number(tx.amount);
    if (tx.type === 'savings') return acc - Number(tx.amount);
    return acc;
  }, 0);
}

function getMonthStats(year, month) {
  const txs = state.transactions.filter(tx => {
    const d = new Date(tx.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const income   = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const savings  = txs.filter(t => t.type === 'savings').reduce((s, t) => s + Number(t.amount), 0);
  return { income, expenses, savings, txs };
}

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  if (name === 'dashboard')    renderDashboard();
  if (name === 'transactions') renderTransactions();
  if (name === 'calendar')     renderCalendar();
  if (name === 'goals')        renderGoals();
  if (name === 'reports')      renderReports();
  if (name === 'settings')     renderSettings();
  if (name === 'pending')      renderPending();
  window.scrollTo(0, 0);
}

// ===== DASHBOARD =====
function renderDashboard() {
  const now   = new Date();
  const stats = getMonthStats(now.getFullYear(), now.getMonth());
  const balance = getBalance();

  document.getElementById('hero-balance').textContent  = fmt(balance);
  document.getElementById('header-balance').textContent = fmt(balance);
  document.getElementById('hero-income').textContent   = fmt(stats.income);
  document.getElementById('hero-expense').textContent  = fmt(stats.expenses);
  document.getElementById('hero-savings').textContent  = fmt(stats.savings);
  document.getElementById('header-date').textContent   = now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });

  // Budget alerts
  const alertEl = document.getElementById('budget-alert');
  const alerts  = [];
  EXPENSE_CATS.forEach(cat => {
    const budget = state.budgets[cat.id];
    if (!budget) return;
    const spent = stats.txs.filter(t => t.type === 'expense' && t.category === cat.id).reduce((s, t) => s + Number(t.amount), 0);
    const pct   = (spent / budget) * 100;
    if (pct >= 80) alerts.push(`${cat.emoji} ${cat.label}: ${Math.round(pct)}% del presupuesto (${fmt(spent)} de ${fmt(budget)})`);
  });
  if (alerts.length > 0) {
    alertEl.innerHTML = '<strong>⚠️ Alerta de presupuesto:</strong><br>' + alerts.join('<br>');
    alertEl.classList.remove('hidden');
  } else {
    alertEl.classList.add('hidden');
  }

  // Recent transactions
  const recent = [...state.transactions].slice(0, 8);
  document.getElementById('recent-list').innerHTML = recent.length > 0
    ? recent.map(txHTML).join('')
    : '<div class="empty-tx"><div class="empty-icon">💸</div><p>No hay movimientos aún</p></div>';

  // Goals row
  const goalsEl = document.getElementById('dash-goals');
  goalsEl.innerHTML = state.goals.length === 0
    ? '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Crea tu primera meta 🎯</div>'
    : state.goals.map(g => {
        const pct = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
        return `<div class="dash-goal-card" onclick="showPage('goals')">
          <div class="dash-goal-icon">${g.icon}</div>
          <div class="dash-goal-name">${g.name}</div>
          <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${pct}%"></div></div>
          <div class="dash-goal-pct">${pct}%</div>
        </div>`;
      }).join('');
}

function txHTML(tx) {
  const cat  = getCatInfo(tx.type, tx.category);
  const sign = tx.type === 'income' ? '+' : '-';
  const badge = tx.recurring ? `<span class="tx-recurring-badge">🔄</span>` : '';
  return `<div class="tx-item">
    <div class="tx-icon ${tx.type}">${cat.emoji}</div>
    <div class="tx-info">
      <div class="tx-desc">${tx.description || cat.label} ${badge}</div>
      <div class="tx-meta">${fmtDate(tx.date)} · <span class="tx-person-badge">${personLabel(tx.person)}</span></div>
    </div>
    <div class="tx-right">
      <div class="tx-amount ${tx.type}">${sign}${fmt(tx.amount)}</div>
    </div>
    <button class="tx-delete-btn" onclick="deleteTx('${tx.id}',event)"><i class="fas fa-trash"></i></button>
  </div>`;
}

// ===== TRANSACTIONS =====
function renderTransactions() {
  updateFilterOptions();
  const search  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const typeF   = document.getElementById('filter-type')?.value   || '';
  const personF = document.getElementById('filter-person')?.value || '';
  const catF    = document.getElementById('filter-category')?.value || '';
  const monthF  = document.getElementById('filter-month')?.value  || '';

  let txs = [...state.transactions];
  if (typeF)   txs = txs.filter(t => t.type === typeF);
  if (personF) txs = txs.filter(t => t.person === personF);
  if (catF)    txs = txs.filter(t => t.category === catF);
  if (monthF) {
    const [y, m] = monthF.split('-').map(Number);
    txs = txs.filter(t => {
      const d = new Date(t.date + 'T12:00:00');
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }
  if (search) txs = txs.filter(t => {
    const cat = getCatInfo(t.type, t.category);
    return (t.description || '').toLowerCase().includes(search) || cat.label.toLowerCase().includes(search);
  });

  const income   = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const savings  = txs.filter(t => t.type === 'savings').reduce((s, t) => s + Number(t.amount), 0);

  document.getElementById('tx-summary-bar').innerHTML = `
    <div class="sum-item"><div class="sum-label">Ingresos</div><div class="sum-val" style="color:var(--income)">${fmt(income)}</div></div>
    <div class="sum-item"><div class="sum-label">Gastos</div><div class="sum-val" style="color:var(--expense)">${fmt(expenses)}</div></div>
    <div class="sum-item"><div class="sum-label">Ahorros</div><div class="sum-val" style="color:var(--savings)">${fmt(savings)}</div></div>
  `;

  document.getElementById('transactions-list').innerHTML = txs.length > 0
    ? txs.map(txHTML).join('')
    : '<div class="empty-tx"><div class="empty-icon">🔍</div><p>No hay resultados</p></div>';

  const fp1 = document.getElementById('fp1');
  const fp2 = document.getElementById('fp2');
  if (fp1) fp1.textContent = state.settings.person1;
  if (fp2) fp2.textContent = state.settings.person2;
}

function updateFilterOptions() {
  const catSel = document.getElementById('filter-category');
  if (!catSel) return;
  const cur = catSel.value;
  const all = [...EXPENSE_CATS, ...INCOME_CATS, ...SAVINGS_CATS].filter((c, i, a) => a.findIndex(x => x.id === c.id) === i);
  catSel.innerHTML = '<option value="">Categoría</option>' + all.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('');

  const monthSel = document.getElementById('filter-month');
  if (!monthSel) return;
  const curM = monthSel.value;
  const months = new Set();
  state.transactions.forEach(t => {
    const d = new Date(t.date + 'T12:00:00');
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  });
  monthSel.innerHTML = '<option value="">Mes</option>' + [...months].sort().reverse().map(m => {
    const [y, mo] = m.split('-').map(Number);
    return `<option value="${m}" ${m === curM ? 'selected' : ''}>${MONTHS_ES[mo]} ${y}</option>`;
  }).join('');
}

async function deleteTx(id, event) {
  event.stopPropagation();
  if (!confirm('¿Eliminar este movimiento?')) return;
  try {
    suppressRealtimeToast = true;
    await dbDeleteTransaction(id);
    renderDashboard();
    renderTransactions();
    showToast('Movimiento eliminado');
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al eliminar');
    console.error(e);
    suppressRealtimeToast = false;
  }
}

// ===== CALENDAR =====
function renderCalendar() {
  document.getElementById('cal-title').textContent = `${MONTHS_ES[calMonth]} ${calYear}`;
  const stats = getMonthStats(calYear, calMonth);
  document.getElementById('cal-month-summary').textContent =
    `Ingresos ${fmt(stats.income)} · Gastos ${fmt(stats.expenses)} · Ahorros ${fmt(stats.savings)}`;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date();
  let html = '';

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day other-month"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dayTxs    = state.transactions.filter(tx => {
      const dt = new Date(tx.date + 'T12:00:00');
      return dt.getFullYear() === calYear && dt.getMonth() === calMonth && dt.getDate() === d;
    });
    const isToday    = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const isSelected = selectedCalDay === d;
    const hasIncome  = dayTxs.some(t => t.type === 'income');
    const hasExpense = dayTxs.some(t => t.type === 'expense');
    const hasSavings = dayTxs.some(t => t.type === 'savings');
    const totalExp   = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    const dots = dayTxs.length > 0 ? `<div class="cal-day-dots">
      ${hasIncome  ? '<span style="background:var(--income)"></span>'  : ''}
      ${hasExpense ? '<span style="background:var(--expense)"></span>' : ''}
      ${hasSavings ? '<span style="background:var(--savings)"></span>' : ''}
    </div>` : '';

    const classes = ['cal-day', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    html += `<div class="${classes}" onclick="selectCalDay(${d})">${d}${dots}</div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;
  if (selectedCalDay !== null) showDayDetail(selectedCalDay);
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  selectedCalDay = null;
  document.getElementById('cal-day-detail').classList.add('hidden');
  renderCalendar();
}

function selectCalDay(day) {
  selectedCalDay = day;
  renderCalendar();
}

function showDayDetail(day) {
  const txs  = state.transactions.filter(tx => {
    const d = new Date(tx.date + 'T12:00:00');
    return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day;
  });
  const date = new Date(calYear, calMonth, day);
  document.getElementById('cal-day-title').textContent = date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const detail = document.getElementById('cal-day-detail');
  detail.classList.remove('hidden');
  document.getElementById('cal-day-list').innerHTML = txs.length > 0
    ? txs.map(txHTML).join('')
    : '<div class="empty-tx"><p>Sin movimientos este día</p><button class="btn-primary" style="margin-top:10px" onclick="openTxModal(\'expense\')">+ Agregar</button></div>';
}

function closeDayDetail() {
  selectedCalDay = null;
  document.getElementById('cal-day-detail').classList.add('hidden');
  renderCalendar();
}

// ===== GOALS =====
function renderGoals() {
  const container = document.getElementById('goals-container');
  const noGoals   = document.getElementById('no-goals');
  if (state.goals.length === 0) { container.innerHTML = ''; noGoals.classList.remove('hidden'); return; }
  noGoals.classList.add('hidden');

  container.innerHTML = state.goals.map(g => {
    const target  = Number(g.target_amount);
    const current = Number(g.current_amount);
    const pct     = Math.min(100, Math.round((current / target) * 100));
    const isComplete = current >= target;

    let deadlineHtml = '';
    if (g.deadline) {
      const dl = new Date(g.deadline + 'T12:00:00');
      const daysLeft = Math.ceil((dl - new Date()) / 86400000);
      const label = daysLeft < 0 ? '⚠️ Venció' : daysLeft === 0 ? '🔥 Hoy!' : `📅 ${daysLeft} días restantes`;
      deadlineHtml = `<div class="goal-deadline">${label}</div>`;
    }

    const contribsHtml = g.contributions?.length > 0
      ? `<div class="goal-contributions">
          <div class="goal-contributions-title">Últimos aportes</div>
          ${[...g.contributions].reverse().slice(0, 5).map(c =>
            `<div class="contrib-item">
              <span>${personLabel(c.person)} · ${fmtDate(c.date)}</span>
              <span style="color:var(--income);font-weight:600">+${fmt(c.amount)}</span>
            </div>`).join('')}
        </div>` : '';

    return `<div class="goal-card">
      <div class="goal-header">
        <div class="goal-icon-name">
          <div class="goal-icon">${g.icon}</div>
          <div>
            <div class="goal-name">${g.name}</div>
            ${deadlineHtml}
          </div>
        </div>
        <div class="goal-actions">
          <button class="goal-action-btn" onclick="editGoal('${g.id}')"><i class="fas fa-edit"></i></button>
          <button class="goal-action-btn danger" onclick="deleteGoal('${g.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="goal-amounts">
        <div>
          <div class="goal-current">${fmt(current)}</div>
          <div class="goal-target">de ${fmt(target)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:700;color:var(--primary)">${pct}%</div>
          <div style="font-size:11px;color:var(--text-muted)">completado</div>
        </div>
      </div>
      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width:${pct}%"></div>
      </div>
      ${g.notes ? `<div class="goal-notes">💭 ${g.notes}</div>` : ''}
      ${isComplete
        ? '<div class="goal-complete">🎉 ¡Meta cumplida! ¡Lo lograron juntos!</div>'
        : `<button class="goal-add-btn" onclick="openContribModal('${g.id}')"><i class="fas fa-plus"></i> Agregar dinero</button>`}
      ${contribsHtml}
    </div>`;
  }).join('');
}

// ===== REPORTS =====
function renderReports() {
  initReportSelectors();
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const month = parseInt(document.getElementById('rep-month')?.value ?? new Date().getMonth());
  const stats = getMonthStats(year, month);

  const savingsRate = stats.income > 0 ? Math.round((stats.savings / stats.income) * 100) : 0;
  const net = stats.income - stats.expenses - stats.savings;
  document.getElementById('rep-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Ingresos</div><div class="kpi-value income">${fmt(stats.income)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Gastos</div><div class="kpi-value expense">${fmt(stats.expenses)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Ahorrado</div><div class="kpi-value savings">${fmt(stats.savings)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Sobrante</div><div class="kpi-value balance">${fmt(net)}</div><div class="kpi-sub">Tasa ahorro: ${savingsRate}%</div></div>
  `;

  // Category doughnut
  const catTotals = {};
  stats.txs.filter(t => t.type === 'expense').forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + Number(t.amount);
  });
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const palette    = ['#7C3AED','#EC4899','#059669','#2563EB','#F59E0B','#EF4444','#10B981','#6366F1','#F97316','#8B5CF6','#06B6D4','#84CC16'];

  if (chartCategory) { chartCategory.destroy(); chartCategory = null; }
  const catCtx = document.getElementById('chart-category');
  if (catEntries.length > 0) {
    chartCategory = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: catEntries.map(([id]) => { const i = getCatInfo('expense', id); return `${i.emoji} ${i.label}`; }),
        datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: palette, borderWidth: 2, borderColor: '#fff' }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, cutout: '65%' }
    });
    document.getElementById('cat-legend').innerHTML = catEntries.map(([id, val], i) => {
      const info = getCatInfo('expense', id);
      const pct  = stats.expenses > 0 ? Math.round((val / stats.expenses) * 100) : 0;
      return `<div class="cat-legend-item">
        <div class="cat-legend-dot" style="background:${palette[i % palette.length]}"></div>
        <span class="cat-legend-label">${info.emoji} ${info.label}</span>
        <span class="cat-legend-val">${fmt(val)} <span style="color:var(--text-muted);font-weight:400">(${pct}%)</span></span>
      </div>`;
    }).join('');
  } else {
    catCtx.parentElement.innerHTML = '<div class="empty-tx"><p>Sin gastos este mes</p></div>';
    document.getElementById('cat-legend').innerHTML = '';
  }

  // Monthly bar chart (last 6 months)
  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    let y = year, m = month - i;
    while (m < 0) { m += 12; y--; }
    const s = getMonthStats(y, m);
    last6.push({ label: MONTHS_ES[m].slice(0, 3), income: s.income, expenses: s.expenses, savings: s.savings });
  }
  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  chartMonthly = new Chart(document.getElementById('chart-monthly'), {
    type: 'bar',
    data: {
      labels: last6.map(x => x.label),
      datasets: [
        { label: 'Ingresos', data: last6.map(x => x.income),   backgroundColor: 'rgba(5,150,105,0.75)',  borderRadius: 6 },
        { label: 'Gastos',   data: last6.map(x => x.expenses), backgroundColor: 'rgba(220,38,38,0.75)',  borderRadius: 6 },
        { label: 'Ahorros',  data: last6.map(x => x.savings),  backgroundColor: 'rgba(37,99,235,0.75)',  borderRadius: 6 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins', size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(v) } }, x: { grid: { display: false } } }
    }
  });

  // Person stats
  const p1exp = stats.txs.filter(t => t.person === 'person1' && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const p2exp = stats.txs.filter(t => t.person === 'person2' && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const p1inc = stats.txs.filter(t => t.person === 'person1' && t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0);
  const p2inc = stats.txs.filter(t => t.person === 'person2' && t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0);
  const total = p1exp + p2exp || 1;
  document.getElementById('person-stats').innerHTML = `<div class="person-stats">
    <div class="person-stat-item">
      <div class="person-stat-name"><span>👤 ${state.settings.person1}</span><span>${fmt(p1exp)} gastos</span></div>
      <div class="person-stat-bar"><div class="person-stat-fill" style="width:${Math.round(p1exp/total*100)}%"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Ingresos: ${fmt(p1inc)}</div>
    </div>
    <div class="person-stat-item">
      <div class="person-stat-name"><span>💕 ${state.settings.person2}</span><span>${fmt(p2exp)} gastos</span></div>
      <div class="person-stat-bar"><div class="person-stat-fill" style="width:${Math.round(p2exp/total*100)}%;background:linear-gradient(90deg,var(--secondary),#F97316)"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Ingresos: ${fmt(p2inc)}</div>
    </div>
  </div>`;

  // Budget progress
  renderBudgetProgress(stats);
}

function renderBudgetProgress(stats) {
  const el   = document.getElementById('budget-progress');
  const cats = EXPENSE_CATS.filter(c => state.budgets[c.id]);
  if (cats.length === 0) {
    el.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--text-muted)">Sin presupuestos. Establece límites por categoría.</div>';
    return;
  }
  el.innerHTML = '<div class="budget-progress-list">' + cats.map(cat => {
    const budget = state.budgets[cat.id];
    const spent  = stats.txs.filter(t => t.type === 'expense' && t.category === cat.id).reduce((s, t) => s + Number(t.amount), 0);
    const pct    = Math.min(100, Math.round((spent / budget) * 100));
    const cls    = pct >= 100 ? 'over' : pct >= 75 ? 'warn' : '';
    return `<div class="budget-item">
      <div class="budget-item-hdr">
        <span class="budget-item-name">${cat.emoji} ${cat.label}</span>
        <span class="budget-item-val ${cls}">${fmt(spent)} / ${fmt(budget)}</span>
      </div>
      <div class="budget-bar"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') + '</div>';
}

function initReportSelectors() {
  const now = new Date();
  const ms  = document.getElementById('rep-month');
  const ys  = document.getElementById('rep-year');
  if (!ms || ms.children.length > 0) return;
  ms.innerHTML = MONTHS_ES.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const years  = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
  ys.innerHTML = years.map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');
}

// ===== SETTINGS =====
function renderSettings() {
  document.getElementById('s-p1').value         = state.settings.person1;
  document.getElementById('s-p2').value         = state.settings.person2;
  document.getElementById('s-currency').value   = state.settings.currency;
  document.getElementById('s-income').value     = state.settings.expected_income || '';
  document.getElementById('s-savings-pct').value= state.settings.savings_pct || 20;
}

async function saveSettings() {
  const settings = {
    person1:         document.getElementById('s-p1').value.trim()         || 'Yo',
    person2:         document.getElementById('s-p2').value.trim()         || 'Mi Amor',
    currency:        document.getElementById('s-currency').value,
    expected_income: parseFloat(document.getElementById('s-income').value) || 0,
    savings_pct:     parseFloat(document.getElementById('s-savings-pct').value) || 20,
  };
  try {
    await dbSaveSettings(settings);
    updatePersonLabels();
    showToast('✅ Ajustes guardados');
  } catch(e) {
    showToast('❌ Error al guardar ajustes');
    console.error(e);
  }
}

async function clearAll() {
  if (!confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Completamente seguro? Se perderán todos los movimientos y metas.')) return;
  try {
    await db.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('contributions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('budgets').delete().neq('category', '');
    state.transactions = [];
    state.goals        = [];
    state.budgets      = {};
    renderDashboard();
    showToast('🗑️ Datos borrados');
  } catch(e) {
    showToast('❌ Error al borrar datos');
    console.error(e);
  }
}

// ===== PERSON LABELS =====
function updatePersonLabels() {
  [['ptab-p1','cptab-p1'], ['ptab-p2','cptab-p2']].forEach(([a, b], i) => {
    const name = i === 0 ? state.settings.person1 : state.settings.person2;
    [a, b].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name; });
  });
}

// ===== TRANSACTION MODAL =====
let currentTxType = 'expense';

function openTxModal(type) {
  currentTxType = type || 'expense';
  const modal = document.getElementById('modal-tx');
  modal.classList.remove('hidden');
  document.getElementById('tx-edit-id').value = '';
  document.getElementById('tx-amount').value  = '';
  document.getElementById('tx-desc').value    = '';
  document.getElementById('tx-date').value    = todayStr();
  document.getElementById('tx-recurring').checked = false;
  document.querySelectorAll('.mtype-tab').forEach(t => t.classList.toggle('active', t.dataset.type === currentTxType));
  document.getElementById('tx-recurring-group').classList.toggle('hidden', currentTxType !== 'expense');
  document.getElementById('tx-future-warning').classList.add('hidden');
  document.getElementById('tx-goal-group').classList.toggle('hidden', currentTxType !== 'savings');
  buildCatGrid(currentTxType);
  if (currentTxType === 'savings') buildGoalSelector();
  resetPersonTabs(document.querySelector('#modal-tx .person-tab'));
  updateCurrencySymbols();
  updatePersonLabels();
  setTimeout(() => document.getElementById('tx-amount').focus(), 100);
}

function closeTxModal() { document.getElementById('modal-tx').classList.add('hidden'); }

function switchTxType(type) {
  currentTxType = type;
  document.querySelectorAll('.mtype-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('tx-recurring-group').classList.toggle('hidden', type !== 'expense');
  document.getElementById('tx-future-warning').classList.add('hidden');
  document.getElementById('tx-goal-group').classList.toggle('hidden', type !== 'savings');
  buildCatGrid(type);
  if (type === 'savings') buildGoalSelector();
  if (type !== 'expense') document.getElementById('tx-future-warning').classList.add('hidden');
}

function onTxDateChange() {
  if (currentTxType !== 'expense') return;
  const val = document.getElementById('tx-date').value;
  if (!val) return;
  const txDate = new Date(val + 'T12:00:00');
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  document.getElementById('tx-future-warning').classList.toggle('hidden', txDate <= today);
}

function buildGoalSelector() {
  const container  = document.getElementById('tx-goal-selector');
  const unfinished = state.goals.filter(g => Number(g.current_amount) < Number(g.target_amount));

  if (unfinished.length === 0) {
    container.innerHTML = '<div class="goal-sel-item active" data-goal-id="" onclick="selectGoalItem(this)"><div class="goal-sel-icon">💰</div><div class="goal-sel-info"><div class="goal-sel-name">Sin meta específica</div></div></div><div style="font-size:12px;color:var(--text-muted);padding:4px">Crea una meta primero para asignar el ahorro</div>';
    return;
  }

  container.innerHTML = `
    <div class="goal-sel-item active" data-goal-id="" onclick="selectGoalItem(this)">
      <div class="goal-sel-icon">💰</div>
      <div class="goal-sel-info"><div class="goal-sel-name">Sin meta específica</div></div>
    </div>
    ${unfinished.map(g => {
      const pct = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
      return `<div class="goal-sel-item" data-goal-id="${g.id}" onclick="selectGoalItem(this)">
        <div class="goal-sel-icon">${g.icon}</div>
        <div class="goal-sel-info">
          <div class="goal-sel-name">${g.name}</div>
          <div class="goal-sel-progress">${fmt(g.current_amount)} de ${fmt(g.target_amount)} · ${pct}%</div>
          <div class="goal-sel-bar"><div class="goal-sel-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }).join('')}
  `;
}

function selectGoalItem(el) {
  document.querySelectorAll('#tx-goal-selector .goal-sel-item').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function getSelectedGoalId() {
  return document.querySelector('#tx-goal-selector .goal-sel-item.active')?.dataset.goalId || null;
}

function buildCatGrid(type) {
  const cats = type === 'income' ? INCOME_CATS : type === 'savings' ? SAVINGS_CATS : EXPENSE_CATS;
  document.getElementById('tx-cat-grid').innerHTML = cats.map((c, i) =>
    `<button type="button" class="cat-btn ${i === 0 ? 'active' : ''}" data-cat="${c.id}" onclick="selectCat(this)">
      <span class="cat-emoji">${c.emoji}</span>${c.label}
    </button>`).join('');
}

function selectCat(btn) {
  btn.closest('#tx-cat-grid').querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectPerson(btn) {
  btn.closest('.person-tabs').querySelectorAll('.person-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function resetPersonTabs(firstBtn) {
  if (!firstBtn) return;
  firstBtn.closest('.person-tabs').querySelectorAll('.person-tab').forEach(b => b.classList.remove('active'));
  firstBtn.classList.add('active');
}

function getActivePerson(container) {
  return container?.querySelector('.person-tab.active')?.dataset.p || 'person1';
}

function getActiveCat() {
  return document.querySelector('#tx-cat-grid .cat-btn.active')?.dataset.cat || 'other';
}

async function saveTx() {
  const amount = parseFloat(document.getElementById('tx-amount').value);
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa un monto válido'); return; }

  const date   = document.getElementById('tx-date').value || todayStr();
  const cat    = getActiveCat();
  const desc   = document.getElementById('tx-desc').value.trim();
  const person = getActivePerson(document.querySelector('#modal-tx .person-tabs'));

  try {
    suppressRealtimeToast = true;

    // Gasto con fecha futura → va automáticamente a Pagos Pendientes
    if (currentTxType === 'expense') {
      const txDate = new Date(date + 'T12:00:00');
      const today  = new Date(); today.setHours(0, 0, 0, 0);
      if (txDate > today) {
        const { data: row, error } = await db.from('pending_payments').insert({
          name:      desc || getCatInfo('expense', cat).label,
          amount, category: cat, due_date: date,
          person, recurring: document.getElementById('tx-recurring').checked,
          notes: '', paid: false,
        }).select().single();
        if (error) throw error;
        state.pendingPayments.push(row);
        state.pendingPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));
        closeTxModal();
        updatePendingBadge();
        renderPendingAlert();
        renderDashboard();
        showToast('📅 Guardado como pago pendiente');
        setTimeout(() => suppressRealtimeToast = false, 2000);
        return;
      }
    }

    // Ahorro → registra el movimiento y también contribuye a la meta seleccionada
    if (currentTxType === 'savings') {
      const goalId = getSelectedGoalId();
      await dbAddTransaction({ type: 'savings', amount, category: cat, description: desc, date, person, recurring: false });

      if (goalId) {
        const g = state.goals.find(g => g.id === goalId);
        if (g) {
          const newAmount = Number(g.current_amount) + amount;
          await db.from('goals').update({ current_amount: newAmount }).eq('id', goalId);
          await db.from('contributions').insert({ goal_id: goalId, amount, person, date });
          g.current_amount = newAmount;
          if (!g.contributions) g.contributions = [];
          g.contributions.push({ goal_id: goalId, amount, person, date, created_at: new Date().toISOString() });
          closeTxModal();
          renderDashboard();
          if (newAmount >= Number(g.target_amount)) {
            showToast('🎉 ¡Meta cumplida! ¡Lo lograron juntos!', 4000);
          } else {
            showToast(`✅ +${fmt(amount)} ahorrado → ${g.icon} ${g.name}`);
          }
          setTimeout(() => suppressRealtimeToast = false, 2000);
          return;
        }
      }
      closeTxModal();
      renderDashboard();
      showToast('✅ Ahorro guardado');
      setTimeout(() => suppressRealtimeToast = false, 2000);
      return;
    }

    // Ingreso o gasto de hoy/pasado → movimiento normal
    await dbAddTransaction({ type: currentTxType, amount, category: cat, description: desc, date, person, recurring: currentTxType === 'expense' && document.getElementById('tx-recurring').checked });
    closeTxModal();
    renderDashboard();
    showToast(`✅ ${currentTxType === 'income' ? 'Ingreso' : 'Gasto'} guardado`);
    if (currentTxType === 'income') showSavingsPlan(amount);
    setTimeout(() => suppressRealtimeToast = false, 2000);

  } catch(e) {
    showToast('❌ Error al guardar');
    console.error(e);
    suppressRealtimeToast = false;
  }
}

// ===== GOAL MODAL =====
function openGoalModal(goalId) {
  document.getElementById('modal-goal').classList.remove('hidden');
  document.getElementById('goal-edit-id').value = goalId || '';
  document.getElementById('goal-modal-title').textContent = goalId ? 'Editar Meta' : 'Nueva Meta';

  // Icon click handlers
  document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(b => {
    b.onclick = function() {
      document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
    };
  });

  if (goalId) {
    const g = state.goals.find(g => g.id === goalId);
    if (!g) return;
    document.getElementById('goal-name').value     = g.name;
    document.getElementById('goal-target').value   = g.target_amount;
    document.getElementById('goal-deadline').value = g.deadline || '';
    document.getElementById('goal-notes').value    = g.notes || '';
    document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(b => b.classList.toggle('active', b.dataset.icon === g.icon));
  } else {
    document.getElementById('goal-name').value     = '';
    document.getElementById('goal-target').value   = '';
    document.getElementById('goal-deadline').value = '';
    document.getElementById('goal-notes').value    = '';
    document.querySelectorAll('#goal-icon-grid .icon-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  }
  updateCurrencySymbols();
}

function closeGoalModal() { document.getElementById('modal-goal').classList.add('hidden'); }
function editGoal(id) { openGoalModal(id); }

async function saveGoal() {
  const name   = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name)           { showToast('⚠️ Escribe el nombre'); return; }
  if (!target || target <= 0) { showToast('⚠️ Ingresa el monto objetivo'); return; }

  const icon     = document.querySelector('#goal-icon-grid .icon-btn.active')?.dataset.icon || '🎯';
  const deadline = document.getElementById('goal-deadline').value || null;
  const notes    = document.getElementById('goal-notes').value.trim();
  const editId   = document.getElementById('goal-edit-id').value;

  try {
    suppressRealtimeToast = true;
    if (editId) {
      await dbUpdateGoal(editId, { name, icon, target_amount: target, deadline, notes });
    } else {
      await dbAddGoal({ name, icon, target_amount: target, current_amount: 0, deadline, notes });
    }
    closeGoalModal();
    renderGoals();
    renderDashboard();
    showToast('✅ Meta guardada');
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al guardar meta');
    console.error(e);
    suppressRealtimeToast = false;
  }
}

async function deleteGoal(id) {
  if (!confirm('¿Eliminar esta meta y todos sus aportes?')) return;
  try {
    suppressRealtimeToast = true;
    await dbDeleteGoal(id);
    renderGoals();
    renderDashboard();
    showToast('Meta eliminada');
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al eliminar');
    suppressRealtimeToast = false;
  }
}

// ===== CONTRIBUTE MODAL =====
function openContribModal(goalId) {
  const g = state.goals.find(g => g.id === goalId);
  if (!g) return;
  document.getElementById('modal-contrib').classList.remove('hidden');
  document.getElementById('contrib-goal-id').value = goalId;
  document.getElementById('contrib-amount').value  = '';
  const remaining = Number(g.target_amount) - Number(g.current_amount);
  const pct       = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
  document.getElementById('contrib-goal-info').innerHTML = `
    <div class="ci-icon">${g.icon}</div>
    <div class="ci-name">${g.name}</div>
    <div class="ci-progress">${fmt(g.current_amount)} de ${fmt(g.target_amount)} · Faltan ${fmt(remaining)} · ${pct}%</div>
  `;
  updateCurrencySymbols();
  resetPersonTabs(document.querySelector('#modal-contrib .person-tab'));
}

function closeContribModal() { document.getElementById('modal-contrib').classList.add('hidden'); }

async function saveContrib() {
  const amount = parseFloat(document.getElementById('contrib-amount').value);
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa un monto'); return; }
  const goalId = document.getElementById('contrib-goal-id').value;
  const person = getActivePerson(document.querySelector('#modal-contrib .person-tabs'));
  const g      = state.goals.find(g => g.id === goalId);
  if (!g) return;

  try {
    suppressRealtimeToast = true;
    const newAmount = await dbAddContribution(goalId, amount, person, todayStr());
    closeContribModal();
    renderGoals();
    renderDashboard();
    if (newAmount >= Number(g.target_amount)) {
      showToast('🎉 ¡Meta cumplida! ¡Lo lograron juntos!', 4000);
    } else {
      showToast(`✅ +${fmt(amount)} agregado a "${g.name}"`);
    }
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al agregar aporte');
    console.error(e);
    suppressRealtimeToast = false;
  }
}

// ===== BUDGET MODAL =====
function openBudgetModal() {
  document.getElementById('modal-budget').classList.remove('hidden');
  document.getElementById('budget-form-list').innerHTML = EXPENSE_CATS.map(cat => `
    <div class="budget-form-item">
      <span class="budget-form-emoji">${cat.emoji}</span>
      <span class="budget-form-label">${cat.label}</span>
      <input type="number" class="budget-form-input" data-cat="${cat.id}"
        placeholder="Sin límite" min="0" value="${state.budgets[cat.id] || ''}">
    </div>
  `).join('');
}

function closeBudgetModal() { document.getElementById('modal-budget').classList.add('hidden'); }

async function saveBudgets() {
  const budgets = {};
  document.querySelectorAll('.budget-form-input').forEach(input => {
    const val = parseFloat(input.value);
    if (val > 0) budgets[input.dataset.cat] = val;
  });
  try {
    await dbSaveBudgets(budgets);
    closeBudgetModal();
    renderReports();
    showToast('✅ Presupuestos guardados');
  } catch(e) {
    showToast('❌ Error al guardar presupuestos');
    console.error(e);
  }
}

// ===== CURRENCY =====
function updateCurrencySymbols() {
  const sym = state.settings.currency;
  ['tx-currency-sym', 'goal-curr', 'contrib-curr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
}

// ===== EXPORT / IMPORT =====
function exportJSON() {
  const data = JSON.stringify({ transactions: state.transactions, goals: state.goals, budgets: state.budgets }, null, 2);
  const a = document.createElement('a');
  a.href = 'data:application/json,' + encodeURIComponent(data);
  a.download = `ahorros-${todayStr()}.json`;
  a.click();
  showToast('📥 Exportado');
}

function exportCSV() {
  const rows = [['Tipo','Monto','Categoría','Descripción','Fecha','Persona','Recurrente']];
  state.transactions.forEach(t => {
    const cat = getCatInfo(t.type, t.category);
    rows.push([t.type, t.amount, cat.label, t.description || '', t.date, personLabel(t.person), t.recurring ? 'Si' : 'No']);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = `ahorros-${todayStr()}.csv`;
  a.click();
  showToast('📄 CSV exportado');
}

async function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.transactions) throw new Error('Formato inválido');
      if (!confirm(`¿Importar ${imported.transactions.length} movimientos? Se agregarán a los existentes.`)) return;
      showLoading();
      for (const tx of imported.transactions) {
        const { id, created_at, ...data } = tx;
        await db.from('transactions').insert(data);
      }
      await loadAll();
      hideLoading();
      renderDashboard();
      showToast(`✅ ${imported.transactions.length} movimientos importados`);
    } catch(err) {
      hideLoading();
      showToast('❌ Error al importar');
      console.error(err);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== PENDING PAYMENTS =====
function pendingDaysDiff(dueDateStr) {
  const due   = new Date(dueDateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86400000);
}

function pendingChip(diff, paid) {
  if (paid)       return `<span class="due-chip paid"><i class="fas fa-check"></i> Pagado</span>`;
  if (diff < 0)   return `<span class="due-chip overdue"><i class="fas fa-exclamation"></i> ${Math.abs(diff)} días vencido</span>`;
  if (diff === 0) return `<span class="due-chip today"><i class="fas fa-bell"></i> ¡Vence hoy!</span>`;
  if (diff <= 7)  return `<span class="due-chip upcoming"><i class="fas fa-calendar"></i> En ${diff} días</span>`;
  return          `<span class="due-chip future"><i class="fas fa-clock"></i> En ${diff} días</span>`;
}

function pendingItemHTML(p) {
  const diff    = pendingDaysDiff(p.due_date);
  const cls     = p.paid ? 'paid' : diff < 0 ? 'overdue' : diff === 0 ? 'due-today' : diff <= 7 ? 'upcoming' : '';
  const cat     = getCatInfo('expense', p.category);
  const actions = p.paid ? '' : `
    <div class="pending-item-actions">
      <button class="pay-btn" onclick="markPaid('${p.id}')"><i class="fas fa-check"></i> Marcar como pagado</button>
      <button class="pending-edit-btn" onclick="editPending('${p.id}')"><i class="fas fa-edit"></i></button>
      <button class="pending-del-btn"  onclick="deletePending('${p.id}')"><i class="fas fa-trash"></i></button>
    </div>`;
  return `<div class="pending-item ${cls}">
    <div class="pending-item-top">
      <div>
        <div class="pending-item-name">${cat.emoji} ${p.name}</div>
        <div class="pending-item-meta">
          ${pendingChip(diff, p.paid)}
          <span>${fmtDate(p.due_date)}</span>
          <span class="tx-person-badge">${personLabel(p.person)}</span>
          ${p.recurring ? '<span class="tx-recurring-badge">🔄 mensual</span>' : ''}
        </div>
        ${p.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">💭 ${p.notes}</div>` : ''}
      </div>
      <div class="pending-item-amount ${p.paid ? 'paid' : ''}">${fmt(p.amount)}</div>
    </div>
    ${actions}
  </div>`;
}

function renderPending() {
  const all      = state.pendingPayments;
  const today    = new Date(); today.setHours(0,0,0,0);
  const thisMonth= all.filter(p => p.paid && new Date(p.paid_at) >= new Date(today.getFullYear(), today.getMonth(), 1));

  const overdue  = all.filter(p => !p.paid && pendingDaysDiff(p.due_date) < 0);
  const dueToday = all.filter(p => !p.paid && pendingDaysDiff(p.due_date) === 0);
  const upcoming = all.filter(p => !p.paid && pendingDaysDiff(p.due_date) > 0 && pendingDaysDiff(p.due_date) <= 7);
  const future   = all.filter(p => !p.paid && pendingDaysDiff(p.due_date) > 7);

  const setGroup = (groupId, listId, items) => {
    document.getElementById(groupId).classList.toggle('hidden', items.length === 0);
    document.getElementById(listId).innerHTML = items.map(pendingItemHTML).join('');
  };
  setGroup('pending-overdue',  'pending-overdue-list',  overdue);
  setGroup('pending-today',    'pending-today-list',    dueToday);
  setGroup('pending-upcoming', 'pending-upcoming-list', upcoming);
  setGroup('pending-future',   'pending-future-list',   future);
  setGroup('pending-paid',     'pending-paid-list',     thisMonth);

  const hasAny = overdue.length + dueToday.length + upcoming.length + future.length + thisMonth.length > 0;
  document.getElementById('no-pending').classList.toggle('hidden', hasAny);
}

function renderPendingAlert() {
  const alertEl  = document.getElementById('pending-alert');
  if (!alertEl) return;
  const overdue  = state.pendingPayments.filter(p => !p.paid && pendingDaysDiff(p.due_date) < 0);
  const dueToday = state.pendingPayments.filter(p => !p.paid && pendingDaysDiff(p.due_date) === 0);
  const urgent   = [...overdue, ...dueToday];

  if (urgent.length === 0) { alertEl.classList.add('hidden'); return; }

  const total = urgent.reduce((s, p) => s + Number(p.amount), 0);
  const overdueText  = overdue.length  > 0 ? `${overdue.length} vencido${overdue.length > 1 ? 's' : ''}` : '';
  const todayText    = dueToday.length > 0 ? `${dueToday.length} vence${dueToday.length > 1 ? 'n' : ''} hoy` : '';
  const subtitle     = [overdueText, todayText].filter(Boolean).join(' · ');

  alertEl.classList.remove('hidden');
  alertEl.innerHTML = `
    <i class="fas fa-bell"></i>
    <div class="pending-alert-text">
      <div class="pending-alert-title">⚠️ Tienes pagos urgentes — ${fmt(total)}</div>
      <div class="pending-alert-sub">${subtitle} · Toca para ver</div>
    </div>
    <i class="fas fa-chevron-right"></i>
  `;
}

function updatePendingBadge() {
  const badge  = document.getElementById('pending-badge');
  if (!badge) return;
  const urgent = state.pendingPayments.filter(p => !p.paid && pendingDaysDiff(p.due_date) <= 0).length;
  if (urgent > 0) {
    badge.textContent = urgent;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Pending modal
function openPendingModal(editId) {
  document.getElementById('modal-pending').classList.remove('hidden');
  document.getElementById('pending-edit-id').value = editId || '';
  document.getElementById('pending-modal-title').textContent = editId ? 'Editar Pago' : 'Nuevo Pago Pendiente';

  if (editId) {
    const p = state.pendingPayments.find(p => p.id === editId);
    if (!p) return;
    document.getElementById('pending-name').value      = p.name;
    document.getElementById('pending-amount').value    = p.amount;
    document.getElementById('pending-date').value      = p.due_date;
    document.getElementById('pending-notes').value     = p.notes || '';
    document.getElementById('pending-recurring').checked = p.recurring;
    buildPendingCatGrid(p.category);
    const personBtn = document.querySelector(`#modal-pending .person-tab[data-p="${p.person}"]`);
    if (personBtn) { resetPersonTabs(document.querySelector('#modal-pending .person-tab')); personBtn.classList.add('active'); }
  } else {
    document.getElementById('pending-name').value   = '';
    document.getElementById('pending-amount').value = '';
    document.getElementById('pending-date').value   = todayStr();
    document.getElementById('pending-notes').value  = '';
    document.getElementById('pending-recurring').checked = false;
    buildPendingCatGrid();
    resetPersonTabs(document.querySelector('#modal-pending .person-tab'));
  }
  updateCurrencySymbols();
  document.getElementById('pending-curr').textContent = state.settings.currency;
  updatePersonLabels();
}

function buildPendingCatGrid(activeCat) {
  document.getElementById('pending-cat-grid').innerHTML = EXPENSE_CATS.map((c, i) =>
    `<button type="button" class="cat-btn ${(activeCat ? c.id === activeCat : i === 0) ? 'active' : ''}" data-cat="${c.id}" onclick="selectCat(this)">
      <span class="cat-emoji">${c.emoji}</span>${c.label}
    </button>`).join('');
}

function closePendingModal() { document.getElementById('modal-pending').classList.add('hidden'); }
function editPending(id)     { openPendingModal(id); }

async function savePending() {
  const name   = document.getElementById('pending-name').value.trim();
  const amount = parseFloat(document.getElementById('pending-amount').value);
  const date   = document.getElementById('pending-date').value;
  if (!name)           { showToast('⚠️ Escribe qué debes pagar'); return; }
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa el monto'); return; }
  if (!date)           { showToast('⚠️ Selecciona la fecha límite'); return; }

  const cat    = document.querySelector('#pending-cat-grid .cat-btn.active')?.dataset.cat || 'other';
  const person = getActivePerson(document.querySelector('#modal-pending .person-tabs'));
  const data   = {
    name, amount, category: cat, due_date: date,
    person, recurring: document.getElementById('pending-recurring').checked,
    notes: document.getElementById('pending-notes').value.trim(), paid: false,
  };

  const editId = document.getElementById('pending-edit-id').value;
  try {
    suppressRealtimeToast = true;
    if (editId) {
      await db.from('pending_payments').update(data).eq('id', editId);
      const idx = state.pendingPayments.findIndex(p => p.id === editId);
      if (idx >= 0) state.pendingPayments[idx] = { ...state.pendingPayments[idx], ...data };
    } else {
      const { data: row, error } = await db.from('pending_payments').insert(data).select().single();
      if (error) throw error;
      state.pendingPayments.push(row);
      state.pendingPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));
    }
    closePendingModal();
    updatePendingBadge();
    renderPendingAlert();
    renderPending();
    showToast('✅ Pago guardado');
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al guardar'); console.error(e);
    suppressRealtimeToast = false;
  }
}

async function markPaid(id) {
  const p = state.pendingPayments.find(p => p.id === id);
  if (!p) return;
  if (!confirm(`¿Marcar "${p.name}" como pagado y registrarlo como gasto?`)) return;

  try {
    suppressRealtimeToast = true;
    // Registrar como gasto
    await dbAddTransaction({
      type: 'expense', amount: Number(p.amount), category: p.category,
      description: p.name, date: todayStr(), person: p.person, recurring: false,
    });
    // Marcar como pagado
    await db.from('pending_payments').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', id);
    const idx = state.pendingPayments.findIndex(x => x.id === id);
    if (idx >= 0) { state.pendingPayments[idx].paid = true; state.pendingPayments[idx].paid_at = new Date().toISOString(); }

    // Si es recurrente, crear el próximo mes
    if (p.recurring) {
      const next = new Date(p.due_date + 'T12:00:00');
      next.setMonth(next.getMonth() + 1);
      const nextDate = next.toISOString().split('T')[0];
      const { data: row } = await db.from('pending_payments').insert({
        name: p.name, amount: p.amount, category: p.category,
        due_date: nextDate, person: p.person, recurring: true, notes: p.notes, paid: false,
      }).select().single();
      if (row) state.pendingPayments.push(row);
      state.pendingPayments.sort((a, b) => a.due_date.localeCompare(b.due_date));
    }

    updatePendingBadge();
    renderPendingAlert();
    renderPending();
    renderDashboard();
    showToast(`✅ "${p.name}" pagado y registrado como gasto`);
    setTimeout(() => suppressRealtimeToast = false, 2000);
  } catch(e) {
    showToast('❌ Error al marcar como pagado'); console.error(e);
    suppressRealtimeToast = false;
  }
}

async function deletePending(id) {
  if (!confirm('¿Eliminar este pago pendiente?')) return;
  try {
    await db.from('pending_payments').delete().eq('id', id);
    state.pendingPayments = state.pendingPayments.filter(p => p.id !== id);
    updatePendingBadge();
    renderPendingAlert();
    renderPending();
    showToast('Pago eliminado');
  } catch(e) { showToast('❌ Error al eliminar'); }
}

// ===== SAVINGS PLAN =====
function showSavingsPlan(incomeAmount) {
  const pct      = Number(state.settings.savings_pct) || 20;
  const toSave   = incomeAmount * (pct / 100);
  const now      = new Date();

  // Pagos pendientes del mes actual que aún no están pagados
  const pendingThisMonth = state.pendingPayments
    .filter(p => !p.paid)
    .filter(p => {
      const d = new Date(p.due_date + 'T12:00:00');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  const totalPending = pendingThisMonth.reduce((s, p) => s + Number(p.amount), 0);
  const available    = incomeAmount - toSave - totalPending;

  const pendingRows = pendingThisMonth.length > 0
    ? pendingThisMonth.map(p => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);padding:4px 0">
        <span>${getCatInfo('expense', p.category).emoji} ${p.name}</span>
        <span style="font-weight:600;color:var(--expense)">${fmt(p.amount)}</span>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-muted);padding:4px 0">Sin pagos pendientes este mes 🎉</div>';

  document.getElementById('savings-plan-content').innerHTML = `
    <div class="savings-plan-card">
      <div class="savings-plan-label">Ingreso recibido</div>
      <div class="savings-plan-income">${fmt(incomeAmount)}</div>
    </div>
    <div class="savings-plan-rows">
      <div class="savings-plan-row">
        <div class="savings-plan-row-icon">🏦</div>
        <div class="savings-plan-row-info">
          <div class="savings-plan-row-label">Ahorra (${pct}%)</div>
          <div class="savings-plan-row-val savings">${fmt(toSave)}</div>
        </div>
      </div>
      <div class="savings-plan-row">
        <div class="savings-plan-row-icon">📅</div>
        <div class="savings-plan-row-info">
          <div class="savings-plan-row-label">Pagos pendientes este mes</div>
          <div class="savings-plan-row-val expense">${fmt(totalPending)}</div>
          <div style="margin-top:6px">${pendingRows}</div>
        </div>
      </div>
      <div class="savings-plan-row" style="background:var(--primary-light)">
        <div class="savings-plan-row-icon">✅</div>
        <div class="savings-plan-row-info">
          <div class="savings-plan-row-label">Disponible para gastar</div>
          <div class="savings-plan-row-val balance">${fmt(Math.max(0, available))}</div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-savings-plan').classList.remove('hidden');
}

// ===== MIGRATE FROM LOCALSTORAGE =====
async function migrateFromLocalStorage() {
  const raw = localStorage.getItem('ahorro-v2') || localStorage.getItem('ahorro-state');
  if (!raw) {
    showToast('No se encontraron datos anteriores en este navegador');
    return;
  }

  let old;
  try { old = JSON.parse(raw); } catch(e) { showToast('❌ Error leyendo datos locales'); return; }

  const txCount   = old.transactions?.length || 0;
  const goalCount = old.goals?.length || 0;
  if (txCount === 0 && goalCount === 0) { showToast('No hay datos para migrar'); return; }

  if (!confirm(`Se encontraron ${txCount} movimientos y ${goalCount} metas.\n¿Subirlos a Supabase ahora?`)) return;

  showLoading();
  try {
    // Migrar transacciones
    if (old.transactions?.length > 0) {
      const txs = old.transactions.map(t => ({
        type:        t.type,
        amount:      Number(t.amount),
        category:    t.category || 'other',
        description: t.description || '',
        date:        t.date,
        person:      t.person || 'person1',
        recurring:   t.recurring || false,
      }));
      const { error } = await db.from('transactions').insert(txs);
      if (error) throw error;
    }

    // Migrar metas
    for (const g of (old.goals || [])) {
      const { data: newGoal, error: ge } = await db.from('goals').insert({
        name:           g.name,
        icon:           g.icon || '🎯',
        target_amount:  Number(g.targetAmount || g.target_amount || 0),
        current_amount: Number(g.currentAmount || g.current_amount || 0),
        deadline:       g.deadline || null,
        notes:          g.notes || '',
      }).select().single();
      if (ge) throw ge;

      // Migrar aportes de cada meta
      if (g.contributions?.length > 0 && newGoal) {
        const contribs = g.contributions.map(c => ({
          goal_id: newGoal.id,
          amount:  Number(c.amount),
          person:  c.person || 'person1',
          date:    c.date || new Date().toISOString().split('T')[0],
        }));
        await db.from('contributions').insert(contribs);
      }
    }

    // Migrar presupuestos
    if (old.budgets && Object.keys(old.budgets).length > 0) {
      const rows = Object.entries(old.budgets).map(([category, amount]) => ({ category, amount: Number(amount) }));
      await db.from('budgets').upsert(rows, { onConflict: 'category' });
    }

    // Migrar ajustes
    if (old.settings) {
      await db.from('settings').upsert({
        id:              'singleton',
        person1:         old.settings.person1 || 'Yo',
        person2:         old.settings.person2 || 'Mi Amor',
        currency:        old.settings.currency || '$',
        expected_income: Number(old.settings.expectedIncome || old.settings.expected_income || 0),
        savings_pct:     Number(old.settings.savingsPct || old.settings.savings_pct || 20),
      }, { onConflict: 'id' });
    }

    await loadAll();
    hideLoading();

    // Ocultar tarjeta de migración
    document.getElementById('migration-card')?.remove();
    localStorage.removeItem('ahorro-v2');
    localStorage.removeItem('ahorro-state');

    renderDashboard();
    showToast(`✅ ${txCount} movimientos migrados a Supabase`, 4000);
  } catch(e) {
    hideLoading();
    showToast('❌ Error durante la migración');
    console.error(e);
  }
}

// ===== MODAL OVERLAY CLOSE =====
['modal-tx','modal-goal','modal-contrib','modal-budget','modal-pending'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      if (id === 'modal-tx')      closeTxModal();
      if (id === 'modal-goal')    closeGoalModal();
      if (id === 'modal-contrib') closeContribModal();
      if (id === 'modal-budget')  closeBudgetModal();
      if (id === 'modal-pending') closePendingModal();
    }
  });
});

// ===== INIT =====
async function init() {
  setConn('connecting');
  showLoading();
  try {
    await loadAll();
    await autoMigrateIfNeeded();
    setConn('online');
    setupRealtime();
    updatePersonLabels();
    updateCurrencySymbols();
    updatePendingBadge();
    renderPendingAlert();
    renderDashboard();
  } catch(e) {
    setConn('offline');
    console.error('Error conectando a Supabase:', e);
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-box">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h3 style="margin-bottom:8px">Sin conexión</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
          Verifica que la URL y la clave de Supabase<br>estén configuradas en app.js
        </p>
        <button class="btn-primary" onclick="location.reload()">Reintentar</button>
      </div>
    `;
    return;
  }
  hideLoading();
}

async function autoMigrateIfNeeded() {
  const raw = localStorage.getItem('ahorro-v2') || localStorage.getItem('ahorro-state');
  if (!raw) return;

  let old;
  try { old = JSON.parse(raw); } catch(e) { return; }

  const txCount = old.transactions?.length || 0;
  const goalCount = old.goals?.length || 0;
  if (txCount === 0 && goalCount === 0) {
    localStorage.removeItem('ahorro-v2');
    localStorage.removeItem('ahorro-state');
    return;
  }

  // Migrar transacciones
  if (old.transactions?.length > 0) {
    const txs = old.transactions.map(t => ({
      type:        t.type,
      amount:      Number(t.amount),
      category:    t.category || 'other',
      description: t.description || '',
      date:        t.date,
      person:      t.person || 'person1',
      recurring:   t.recurring || false,
    }));
    await db.from('transactions').insert(txs);
  }

  // Migrar metas
  for (const g of (old.goals || [])) {
    const { data: newGoal } = await db.from('goals').insert({
      name:           g.name,
      icon:           g.icon || '🎯',
      target_amount:  Number(g.targetAmount || g.target_amount || 0),
      current_amount: Number(g.currentAmount || g.current_amount || 0),
      deadline:       g.deadline || null,
      notes:          g.notes || '',
    }).select().single();

    if (newGoal && g.contributions?.length > 0) {
      const contribs = g.contributions.map(c => ({
        goal_id: newGoal.id,
        amount:  Number(c.amount),
        person:  c.person || 'person1',
        date:    c.date || new Date().toISOString().split('T')[0],
      }));
      await db.from('contributions').insert(contribs);
    }
  }

  // Migrar presupuestos
  if (old.budgets && Object.keys(old.budgets).length > 0) {
    const rows = Object.entries(old.budgets).map(([category, amount]) => ({ category, amount: Number(amount) }));
    await db.from('budgets').upsert(rows, { onConflict: 'category' });
  }

  // Migrar ajustes
  if (old.settings) {
    await db.from('settings').upsert({
      id:              'singleton',
      person1:         old.settings.person1 || 'Yo',
      person2:         old.settings.person2 || 'Mi Amor',
      currency:        old.settings.currency || '$',
      expected_income: Number(old.settings.expectedIncome || old.settings.expected_income || 0),
      savings_pct:     Number(old.settings.savingsPct || old.settings.savings_pct || 20),
    }, { onConflict: 'id' });
  }

  // Limpiar localStorage y recargar datos desde Supabase
  localStorage.removeItem('ahorro-v2');
  localStorage.removeItem('ahorro-state');
  await loadAll();
}

document.addEventListener('DOMContentLoaded', init);
