/* ===========================
   NUESTROS AHORROS - app.js
   =========================== */

// ===== CONSTANTS =====
const EXPENSE_CATS = [
  { id: 'food',     label: 'Comida',      emoji: '🍕' },
  { id: 'transport',label: 'Transporte',  emoji: '🚗' },
  { id: 'entertain',label: 'Diversión',   emoji: '🎬' },
  { id: 'health',   label: 'Salud',       emoji: '💊' },
  { id: 'clothing', label: 'Ropa',        emoji: '👗' },
  { id: 'home',     label: 'Hogar',       emoji: '🏠' },
  { id: 'education',label: 'Educación',   emoji: '📚' },
  { id: 'tech',     label: 'Tecnología',  emoji: '💻' },
  { id: 'pets',     label: 'Mascotas',    emoji: '🐾' },
  { id: 'travel',   label: 'Viajes',      emoji: '✈️' },
  { id: 'gifts',    label: 'Regalos',     emoji: '🎁' },
  { id: 'other',    label: 'Otro',        emoji: '💰' },
];
const INCOME_CATS = [
  { id: 'salary',   label: 'Salario',     emoji: '💼' },
  { id: 'freelance',label: 'Freelance',   emoji: '💻' },
  { id: 'gift',     label: 'Regalo',      emoji: '🎁' },
  { id: 'invest',   label: 'Inversión',   emoji: '📈' },
  { id: 'bonus',    label: 'Bono',        emoji: '🎉' },
  { id: 'other',    label: 'Otro',        emoji: '💰' },
];
const SAVINGS_CATS = [
  { id: 'emergency',label: 'Emergencia',  emoji: '🏦' },
  { id: 'goal',     label: 'Meta',        emoji: '🎯' },
  { id: 'invest',   label: 'Inversión',   emoji: '📈' },
  { id: 'vacation', label: 'Vacaciones',  emoji: '🏖️' },
  { id: 'other',    label: 'Otro',        emoji: '💰' },
];

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ===== STATE =====
let state = {
  transactions: [],
  goals: [],
  budgets: {},
  settings: {
    person1: 'Yo',
    person2: 'Mi Amor',
    currency: '$',
    expectedIncome: 0,
    savingsPct: 20,
  }
};

// Current calendar view
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedCalDay = null;

// Chart instances (to destroy before re-creating)
let chartCategory = null;
let chartMonthly = null;

// ===== PERSISTENCE =====
function loadState() {
  try {
    const saved = localStorage.getItem('ahorro-v2');
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch(e) { console.error('Error loading state', e); }
}

function saveState() {
  localStorage.setItem('ahorro-v2', JSON.stringify(state));
}

// ===== UTILITIES =====
function fmt(amount) {
  const n = Number(amount) || 0;
  return state.settings.currency + n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

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

// ===== BALANCE CALCULATIONS =====
function getBalance() {
  return state.transactions.reduce((acc, tx) => {
    if (tx.type === 'income') return acc + tx.amount;
    if (tx.type === 'expense') return acc - tx.amount;
    if (tx.type === 'savings') return acc - tx.amount;
    return acc;
  }, 0);
}

function getMonthStats(year, month) {
  const txs = state.transactions.filter(tx => {
    const d = new Date(tx.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const savings  = txs.filter(t => t.type === 'savings').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, savings, txs };
}

function getDayTxs(year, month, day) {
  return state.transactions.filter(tx => {
    const d = new Date(tx.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
}

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  // Render on navigation
  if (name === 'dashboard')    renderDashboard();
  if (name === 'transactions') renderTransactions();
  if (name === 'calendar')     renderCalendar();
  if (name === 'goals')        renderGoals();
  if (name === 'reports')      renderReports();
  if (name === 'settings')     renderSettings();

  window.scrollTo(0, 0);
}

// ===== DASHBOARD =====
function renderDashboard() {
  const now = new Date();
  const stats = getMonthStats(now.getFullYear(), now.getMonth());
  const balance = getBalance();

  document.getElementById('hero-balance').textContent = fmt(balance);
  document.getElementById('header-balance').textContent = fmt(balance);
  document.getElementById('hero-income').textContent = fmt(stats.income);
  document.getElementById('hero-expense').textContent = fmt(stats.expenses);
  document.getElementById('hero-savings').textContent = fmt(stats.savings);
  document.getElementById('header-date').textContent = now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });

  // Budget alert
  const alertEl = document.getElementById('budget-alert');
  const alerts = [];
  EXPENSE_CATS.forEach(cat => {
    const budget = state.budgets[cat.id];
    if (!budget) return;
    const spent = stats.txs.filter(t => t.type === 'expense' && t.category === cat.id).reduce((s, t) => s + t.amount, 0);
    const pct = (spent / budget) * 100;
    if (pct >= 80) {
      alerts.push(`${cat.emoji} ${cat.label}: ${Math.round(pct)}% del presupuesto (${fmt(spent)} de ${fmt(budget)})`);
    }
  });
  if (alerts.length > 0) {
    alertEl.innerHTML = '<strong>⚠️ Alerta de presupuesto:</strong><br>' + alerts.join('<br>');
    alertEl.classList.remove('hidden');
  } else {
    alertEl.classList.add('hidden');
  }

  // Recent transactions (last 8)
  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const recent = sorted.slice(0, 8);
  document.getElementById('recent-list').innerHTML = recent.length > 0
    ? recent.map(txHTML).join('')
    : '<div class="empty-tx"><div class="empty-icon">💸</div><p>No hay movimientos aún</p></div>';

  // Dashboard goals row
  const goalsEl = document.getElementById('dash-goals');
  if (state.goals.length === 0) {
    goalsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Crea tu primera meta 🎯</div>';
  } else {
    goalsEl.innerHTML = state.goals.map(g => {
      const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
      return `<div class="dash-goal-card" onclick="showPage('goals')">
        <div class="dash-goal-icon">${g.icon}</div>
        <div class="dash-goal-name">${g.name}</div>
        <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${pct}%"></div></div>
        <div class="dash-goal-pct">${pct}%</div>
      </div>`;
    }).join('');
  }
}

function txHTML(tx) {
  const cat = getCatInfo(tx.type, tx.category);
  const sign = tx.type === 'income' ? '+' : '-';
  const badge = tx.recurring ? `<span class="tx-recurring-badge">🔄 recurrente</span>` : '';
  return `<div class="tx-item">
    <div class="tx-icon ${tx.type}">${cat.emoji}</div>
    <div class="tx-info">
      <div class="tx-desc">${tx.description || cat.label} ${badge}</div>
      <div class="tx-meta">${fmtDate(tx.date)} · <span class="tx-person-badge">${personLabel(tx.person)}</span></div>
    </div>
    <div class="tx-right">
      <div class="tx-amount ${tx.type}">${sign}${fmt(tx.amount)}</div>
    </div>
    <button class="tx-delete-btn" onclick="deleteTx('${tx.id}',event)" title="Eliminar"><i class="fas fa-trash"></i></button>
  </div>`;
}

// ===== TRANSACTIONS =====
function renderTransactions() {
  updateFilterOptions();
  const search   = (document.getElementById('search-input')?.value || '').toLowerCase();
  const typeF    = document.getElementById('filter-type')?.value || '';
  const personF  = document.getElementById('filter-person')?.value || '';
  const catF     = document.getElementById('filter-category')?.value || '';
  const monthF   = document.getElementById('filter-month')?.value || '';

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
  if (search)  txs = txs.filter(t => {
    const cat = getCatInfo(t.type, t.category);
    return (t.description || '').toLowerCase().includes(search)
      || cat.label.toLowerCase().includes(search);
  });

  txs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const savings  = txs.filter(t => t.type === 'savings').reduce((s, t) => s + t.amount, 0);

  document.getElementById('tx-summary-bar').innerHTML = `
    <div class="sum-item"><div class="sum-label">Ingresos</div><div class="sum-val" style="color:var(--income)">${fmt(income)}</div></div>
    <div class="sum-item"><div class="sum-label">Gastos</div><div class="sum-val" style="color:var(--expense)">${fmt(expenses)}</div></div>
    <div class="sum-item"><div class="sum-label">Ahorros</div><div class="sum-val" style="color:var(--savings)">${fmt(savings)}</div></div>
  `;

  document.getElementById('transactions-list').innerHTML = txs.length > 0
    ? txs.map(txHTML).join('')
    : '<div class="empty-tx"><div class="empty-icon">🔍</div><p>No hay resultados</p></div>';

  // Update person filter labels
  const fp1 = document.getElementById('fp1');
  const fp2 = document.getElementById('fp2');
  if (fp1) fp1.textContent = state.settings.person1;
  if (fp2) fp2.textContent = state.settings.person2;
}

function updateFilterOptions() {
  const catSel = document.getElementById('filter-category');
  if (!catSel) return;
  const current = catSel.value;
  const allCats = [...EXPENSE_CATS, ...INCOME_CATS, ...SAVINGS_CATS];
  const unique = allCats.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  catSel.innerHTML = '<option value="">Categoría</option>' +
    unique.map(c => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('');

  // Month filter
  const monthSel = document.getElementById('filter-month');
  if (!monthSel) return;
  const currentM = monthSel.value;
  const months = new Set();
  state.transactions.forEach(t => {
    const d = new Date(t.date + 'T12:00:00');
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  });
  const sortedMonths = [...months].sort().reverse();
  monthSel.innerHTML = '<option value="">Mes</option>' +
    sortedMonths.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const label = `${MONTHS_ES[mo]} ${y}`;
      return `<option value="${m}" ${m === currentM ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

// ===== DELETE TRANSACTION =====
function deleteTx(id, event) {
  event.stopPropagation();
  if (!confirm('¿Eliminar este movimiento?')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  renderDashboard();
  renderTransactions();
  showToast('Movimiento eliminado');
}

// ===== CALENDAR =====
function renderCalendar() {
  document.getElementById('cal-title').textContent = `${MONTHS_ES[calMonth]} ${calYear}`;
  const stats = getMonthStats(calYear, calMonth);
  document.getElementById('cal-month-summary').textContent =
    `Ingresos ${fmt(stats.income)} · Gastos ${fmt(stats.expenses)} · Ahorros ${fmt(stats.savings)}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  let html = '';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayTxs = getDayTxs(calYear, calMonth, d);
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const isSelected = selectedCalDay === d;

    const hasIncome  = dayTxs.some(t => t.type === 'income');
    const hasExpense = dayTxs.some(t => t.type === 'expense');
    const hasSavings = dayTxs.some(t => t.type === 'savings');

    const dotHtml = dayTxs.length > 0 ? `<div class="cal-day-dots">
      ${hasIncome  ? '<span style="background:var(--income)"></span>'  : ''}
      ${hasExpense ? '<span style="background:var(--expense)"></span>' : ''}
      ${hasSavings ? '<span style="background:var(--savings)"></span>' : ''}
    </div>` : '';

    const totalExpense = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const amountLabel = totalExpense > 0 ? `<div class="cal-day-amount">-${fmt(totalExpense)}</div>` : '';

    const classes = ['cal-day', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    html += `<div class="${classes}" onclick="selectCalDay(${d})">${d}${dotHtml}${amountLabel}</div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;

  if (selectedCalDay !== null) showDayDetail(selectedCalDay);
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  selectedCalDay = null;
  document.getElementById('cal-day-detail').classList.add('hidden');
  renderCalendar();
}

function selectCalDay(day) {
  selectedCalDay = day;
  renderCalendar();
}

function showDayDetail(day) {
  const txs = getDayTxs(calYear, calMonth, day);
  const date = new Date(calYear, calMonth, day);
  document.getElementById('cal-day-title').textContent = date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  const detail = document.getElementById('cal-day-detail');
  detail.classList.remove('hidden');

  if (txs.length === 0) {
    document.getElementById('cal-day-list').innerHTML = '<div class="empty-tx"><p>Sin movimientos este día</p><button class="btn-primary" style="margin-top:10px" onclick="openTxModal(\'expense\')">+ Agregar</button></div>';
  } else {
    document.getElementById('cal-day-list').innerHTML = txs.map(txHTML).join('');
  }
}

function closeDayDetail() {
  selectedCalDay = null;
  document.getElementById('cal-day-detail').classList.add('hidden');
  renderCalendar();
}

// ===== GOALS =====
function renderGoals() {
  const container = document.getElementById('goals-container');
  const noGoals = document.getElementById('no-goals');

  if (state.goals.length === 0) {
    container.innerHTML = '';
    noGoals.classList.remove('hidden');
    return;
  }
  noGoals.classList.add('hidden');

  container.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
    const isComplete = g.currentAmount >= g.targetAmount;

    let deadlineHtml = '';
    if (g.deadline) {
      const dl = new Date(g.deadline + 'T12:00:00');
      const daysLeft = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
      const label = daysLeft < 0 ? '⚠️ Venció' : daysLeft === 0 ? '🔥 Hoy!' : `📅 ${daysLeft} días restantes`;
      deadlineHtml = `<div class="goal-deadline">${label} · ${dl.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</div>`;
    }

    const contribsHtml = g.contributions && g.contributions.length > 0
      ? `<div class="goal-contributions">
          <div class="goal-contributions-title">Últimos aportes</div>
          ${[...g.contributions].reverse().slice(0,5).map(c =>
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
          <button class="goal-action-btn" onclick="editGoal('${g.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="goal-action-btn danger" onclick="deleteGoal('${g.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="goal-amounts">
        <div>
          <div class="goal-current">${fmt(g.currentAmount)}</div>
          <div class="goal-target">de ${fmt(g.targetAmount)}</div>
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

  // KPIs
  const savingsRate = stats.income > 0 ? Math.round((stats.savings / stats.income) * 100) : 0;
  const net = stats.income - stats.expenses - stats.savings;
  document.getElementById('rep-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Ingresos</div><div class="kpi-value income">${fmt(stats.income)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Gastos</div><div class="kpi-value expense">${fmt(stats.expenses)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Ahorrado</div><div class="kpi-value savings">${fmt(stats.savings)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Sobrante</div><div class="kpi-value balance">${fmt(net)}</div><div class="kpi-sub">Tasa ahorro: ${savingsRate}%</div></div>
  `;

  // Category chart
  const expTxs = stats.txs.filter(t => t.type === 'expense');
  const catTotals = {};
  expTxs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catEntries = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);

  const palette = ['#7C3AED','#EC4899','#059669','#2563EB','#F59E0B','#EF4444','#10B981','#6366F1','#F97316','#8B5CF6','#06B6D4','#84CC16'];

  if (chartCategory) { chartCategory.destroy(); chartCategory = null; }
  const catCtx = document.getElementById('chart-category');
  if (catEntries.length > 0) {
    chartCategory = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: catEntries.map(([id]) => {
          const info = getCatInfo('expense', id);
          return `${info.emoji} ${info.label}`;
        }),
        datasets: [{ data: catEntries.map(([,v]) => v), backgroundColor: palette, borderWidth: 2, borderColor: '#fff' }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, cutout: '65%' }
    });
    document.getElementById('cat-legend').innerHTML = catEntries.map(([id, val], i) => {
      const info = getCatInfo('expense', id);
      const pct = stats.expenses > 0 ? Math.round((val / stats.expenses) * 100) : 0;
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

  // Monthly chart (last 6 months)
  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    let y = year, m = month - i;
    while (m < 0) { m += 12; y--; }
    const s = getMonthStats(y, m);
    last6.push({ label: MONTHS_ES[m].slice(0,3), income: s.income, expenses: s.expenses, savings: s.savings });
  }

  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  chartMonthly = new Chart(document.getElementById('chart-monthly'), {
    type: 'bar',
    data: {
      labels: last6.map(x => x.label),
      datasets: [
        { label: 'Ingresos', data: last6.map(x => x.income), backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 6 },
        { label: 'Gastos',   data: last6.map(x => x.expenses), backgroundColor: 'rgba(220,38,38,0.7)', borderRadius: 6 },
        { label: 'Ahorros',  data: last6.map(x => x.savings), backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 6 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins', size: 11 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => fmt(v) } },
        x: { grid: { display: false } }
      }
    }
  });

  // Person stats
  const p1txs = stats.txs.filter(t => t.person === 'person1' && t.type === 'expense');
  const p2txs = stats.txs.filter(t => t.person === 'person2' && t.type === 'expense');
  const p1spent = p1txs.reduce((s,t) => s + t.amount, 0);
  const p2spent = p2txs.reduce((s,t) => s + t.amount, 0);
  const p1inc   = stats.txs.filter(t => t.person === 'person1' && t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const p2inc   = stats.txs.filter(t => t.person === 'person2' && t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const total   = p1spent + p2spent || 1;

  document.getElementById('person-stats').innerHTML = `<div class="person-stats">
    <div class="person-stat-item">
      <div class="person-stat-name"><span>👤 ${state.settings.person1}</span><span>${fmt(p1spent)}</span></div>
      <div class="person-stat-bar"><div class="person-stat-fill" style="width:${Math.round(p1spent/total*100)}%"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Ingresos: ${fmt(p1inc)}</div>
    </div>
    <div class="person-stat-item">
      <div class="person-stat-name"><span>💕 ${state.settings.person2}</span><span>${fmt(p2spent)}</span></div>
      <div class="person-stat-bar"><div class="person-stat-fill" style="width:${Math.round(p2spent/total*100)}%;background:linear-gradient(90deg,var(--secondary),#F97316)"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Ingresos: ${fmt(p2inc)}</div>
    </div>
  </div>`;

  // Budget progress
  renderBudgetProgress(stats);
}

function renderBudgetProgress(stats) {
  const el = document.getElementById('budget-progress');
  const cats = EXPENSE_CATS.filter(c => state.budgets[c.id]);
  if (cats.length === 0) {
    el.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--text-muted)">Sin presupuestos configurados. Establece límites por categoría.</div>';
    return;
  }
  el.innerHTML = '<div class="budget-progress-list">' + cats.map(cat => {
    const budget = state.budgets[cat.id];
    const spent  = stats.txs.filter(t => t.type === 'expense' && t.category === cat.id).reduce((s,t) => s + t.amount, 0);
    const pct    = Math.min(100, Math.round((spent / budget) * 100));
    const isWarn = pct >= 75 && pct < 100;
    const isOver = pct >= 100;
    return `<div class="budget-item">
      <div class="budget-item-hdr">
        <span class="budget-item-name">${cat.emoji} ${cat.label}</span>
        <span class="budget-item-val ${isOver ? 'over' : ''}">${fmt(spent)} / ${fmt(budget)}</span>
      </div>
      <div class="budget-bar"><div class="budget-fill ${isOver ? 'over' : isWarn ? 'warn' : ''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') + '</div>';
}

function initReportSelectors() {
  const now = new Date();
  const monthSel = document.getElementById('rep-month');
  const yearSel  = document.getElementById('rep-year');
  if (!monthSel || monthSel.children.length > 0) return;

  monthSel.innerHTML = MONTHS_ES.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
  yearSel.innerHTML = years.map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');
}

// ===== SETTINGS =====
function renderSettings() {
  document.getElementById('s-p1').value = state.settings.person1;
  document.getElementById('s-p2').value = state.settings.person2;
  document.getElementById('s-currency').value = state.settings.currency;
  document.getElementById('s-income').value = state.settings.expectedIncome || '';
  document.getElementById('s-savings-pct').value = state.settings.savingsPct || 20;
}

function saveSettings() {
  state.settings.person1 = document.getElementById('s-p1').value.trim() || 'Yo';
  state.settings.person2 = document.getElementById('s-p2').value.trim() || 'Mi Amor';
  state.settings.currency = document.getElementById('s-currency').value;
  state.settings.expectedIncome = parseFloat(document.getElementById('s-income').value) || 0;
  state.settings.savingsPct = parseFloat(document.getElementById('s-savings-pct').value) || 20;
  saveState();
  updatePersonLabels();
  showToast('✅ Ajustes guardados');
}

function updatePersonLabels() {
  ['ptab-p1','cptab-p1'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.settings.person1;
  });
  ['ptab-p2','cptab-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.settings.person2;
  });
  ['modal-p1'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.settings.person1;
  });
  ['modal-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.settings.person2;
  });
}

function clearAll() {
  if (!confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Estás seguro? Se perderán todos tus movimientos y metas.')) return;
  state.transactions = [];
  state.goals = [];
  state.budgets = {};
  saveState();
  renderDashboard();
  showToast('🗑️ Datos borrados');
}

// ===== TRANSACTION MODAL =====
let currentTxType = 'expense';

function openTxModal(type) {
  currentTxType = type || 'expense';
  const modal = document.getElementById('modal-tx');
  modal.classList.remove('hidden');

  // Reset form
  document.getElementById('tx-edit-id').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-date').value = todayStr();
  document.getElementById('tx-recurring').checked = false;

  // Set active type tab
  document.querySelectorAll('.mtype-tab').forEach(t => t.classList.toggle('active', t.dataset.type === currentTxType));

  // Category group visibility
  document.getElementById('tx-recurring-group').classList.toggle('hidden', currentTxType !== 'expense');

  buildCatGrid(currentTxType);
  resetPersonTabs(document.querySelector('#modal-tx .person-tab'));

  updateCurrencySymbols();
  updatePersonLabels();
  document.getElementById('tx-amount').focus();
}

function closeTxModal() {
  document.getElementById('modal-tx').classList.add('hidden');
}

function switchTxType(type) {
  currentTxType = type;
  document.querySelectorAll('.mtype-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('tx-recurring-group').classList.toggle('hidden', type !== 'expense');
  buildCatGrid(type);
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
  const active = container.querySelector('.person-tab.active');
  return active ? active.dataset.p : 'person1';
}

function getActiveCat() {
  const active = document.querySelector('#tx-cat-grid .cat-btn.active');
  return active ? active.dataset.cat : 'other';
}

function saveTx() {
  const amount = parseFloat(document.getElementById('tx-amount').value);
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa un monto válido'); return; }

  const desc = document.getElementById('tx-desc').value.trim();
  const date = document.getElementById('tx-date').value || todayStr();
  const cat  = getActiveCat();
  const person = getActivePerson(document.querySelector('#modal-tx .person-tabs'));
  const recurring = document.getElementById('tx-recurring').checked;
  const editId = document.getElementById('tx-edit-id').value;

  if (editId) {
    const tx = state.transactions.find(t => t.id === editId);
    if (tx) { tx.amount = amount; tx.description = desc; tx.date = date; tx.category = cat; tx.person = person; tx.recurring = recurring; }
  } else {
    state.transactions.push({ id: uid(), type: currentTxType, amount, category: cat, description: desc, date, person, recurring, createdAt: Date.now() });
  }

  saveState();
  closeTxModal();
  renderDashboard();
  showToast(`✅ ${currentTxType === 'income' ? 'Ingreso' : currentTxType === 'savings' ? 'Ahorro' : 'Gasto'} guardado`);
}

// ===== GOAL MODAL =====
function openGoalModal(goalId) {
  const modal = document.getElementById('modal-goal');
  modal.classList.remove('hidden');

  document.getElementById('goal-edit-id').value = goalId || '';
  document.getElementById('goal-modal-title').textContent = goalId ? 'Editar Meta' : 'Nueva Meta';

  // Icon grid
  document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(b => b.addEventListener('click', function() {
    document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
  }));

  if (goalId) {
    const g = state.goals.find(g => g.id === goalId);
    if (!g) return;
    document.getElementById('goal-name').value = g.name;
    document.getElementById('goal-target').value = g.targetAmount;
    document.getElementById('goal-deadline').value = g.deadline || '';
    document.getElementById('goal-notes').value = g.notes || '';
    document.querySelectorAll('#goal-icon-grid .icon-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.icon === g.icon);
    });
  } else {
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-deadline').value = '';
    document.getElementById('goal-notes').value = '';
    document.querySelectorAll('#goal-icon-grid .icon-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  }

  updateCurrencySymbols();
}

function closeGoalModal() { document.getElementById('modal-goal').classList.add('hidden'); }
function editGoal(id) { openGoalModal(id); }

function saveGoal() {
  const name   = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name)   { showToast('⚠️ Escribe el nombre de la meta'); return; }
  if (!target || target <= 0) { showToast('⚠️ Ingresa el monto objetivo'); return; }

  const icon     = document.querySelector('#goal-icon-grid .icon-btn.active')?.dataset.icon || '🎯';
  const deadline = document.getElementById('goal-deadline').value || null;
  const notes    = document.getElementById('goal-notes').value.trim();
  const editId   = document.getElementById('goal-edit-id').value;

  if (editId) {
    const g = state.goals.find(g => g.id === editId);
    if (g) { g.name = name; g.icon = icon; g.targetAmount = target; g.deadline = deadline; g.notes = notes; }
  } else {
    state.goals.push({ id: uid(), name, icon, targetAmount: target, currentAmount: 0, deadline, notes, contributions: [] });
  }

  saveState();
  closeGoalModal();
  renderGoals();
  renderDashboard();
  showToast('✅ Meta guardada');
}

function deleteGoal(id) {
  if (!confirm('¿Eliminar esta meta?')) return;
  state.goals = state.goals.filter(g => g.id !== id);
  saveState();
  renderGoals();
  renderDashboard();
  showToast('Meta eliminada');
}

// ===== CONTRIBUTE MODAL =====
function openContribModal(goalId) {
  const g = state.goals.find(g => g.id === goalId);
  if (!g) return;
  const modal = document.getElementById('modal-contrib');
  modal.classList.remove('hidden');
  document.getElementById('contrib-goal-id').value = goalId;
  document.getElementById('contrib-amount').value = '';
  const remaining = g.targetAmount - g.currentAmount;
  const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
  document.getElementById('contrib-goal-info').innerHTML = `
    <div class="ci-icon">${g.icon}</div>
    <div class="ci-name">${g.name}</div>
    <div class="ci-progress">${fmt(g.currentAmount)} de ${fmt(g.targetAmount)} · Faltan ${fmt(remaining)} · ${pct}%</div>
  `;
  updateCurrencySymbols();
  const firstBtn = document.querySelector('#modal-contrib .person-tab');
  if (firstBtn) resetPersonTabs(firstBtn);
}

function closeContribModal() { document.getElementById('modal-contrib').classList.add('hidden'); }

function saveContrib() {
  const amount = parseFloat(document.getElementById('contrib-amount').value);
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa un monto'); return; }

  const goalId = document.getElementById('contrib-goal-id').value;
  const person = getActivePerson(document.querySelector('#modal-contrib .person-tabs'));
  const g = state.goals.find(g => g.id === goalId);
  if (!g) return;

  g.currentAmount += amount;
  if (!g.contributions) g.contributions = [];
  g.contributions.push({ amount, person, date: todayStr() });

  // Also add as savings transaction
  state.transactions.push({
    id: uid(),
    type: 'savings',
    amount,
    category: 'goal',
    description: `Meta: ${g.name}`,
    date: todayStr(),
    person,
    createdAt: Date.now()
  });

  saveState();
  closeContribModal();
  renderGoals();
  renderDashboard();

  if (g.currentAmount >= g.targetAmount) {
    showToast('🎉 ¡Felicidades! ¡Meta cumplida!', 4000);
  } else {
    showToast(`✅ +${fmt(amount)} agregado a "${g.name}"`);
  }
}

// ===== BUDGET MODAL =====
function openBudgetModal() {
  const modal = document.getElementById('modal-budget');
  modal.classList.remove('hidden');
  document.getElementById('budget-form-list').innerHTML = EXPENSE_CATS.map(cat => `
    <div class="budget-form-item">
      <span class="budget-form-emoji">${cat.emoji}</span>
      <span class="budget-form-label">${cat.label}</span>
      <input type="number" class="budget-form-input" data-cat="${cat.id}"
        placeholder="Sin límite" min="0"
        value="${state.budgets[cat.id] || ''}">
    </div>
  `).join('');
}

function closeBudgetModal() { document.getElementById('modal-budget').classList.add('hidden'); }

function saveBudgets() {
  document.querySelectorAll('.budget-form-input').forEach(input => {
    const val = parseFloat(input.value);
    if (val > 0) state.budgets[input.dataset.cat] = val;
    else delete state.budgets[input.dataset.cat];
  });
  saveState();
  closeBudgetModal();
  renderReports();
  showToast('✅ Presupuestos guardados');
}

// ===== CURRENCY SYMBOLS =====
function updateCurrencySymbols() {
  const sym = state.settings.currency;
  ['tx-currency-sym','goal-curr','contrib-curr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
}

// ===== EXPORT / IMPORT =====
function exportJSON() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ahorros-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Exportado correctamente');
}

function exportCSV() {
  const rows = [['ID','Tipo','Monto','Categoría','Descripción','Fecha','Persona','Recurrente']];
  state.transactions.forEach(t => {
    const cat = getCatInfo(t.type, t.category);
    rows.push([t.id, t.type, t.amount, cat.label, t.description || '', t.date, personLabel(t.person), t.recurring ? 'Si' : 'No']);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `ahorros-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📄 CSV exportado');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.transactions) throw new Error('Formato inválido');
      if (!confirm(`¿Importar ${imported.transactions.length} movimientos? Los datos actuales se reemplazarán.`)) return;
      state = { ...state, ...imported };
      saveState();
      renderDashboard();
      showToast(`✅ ${imported.transactions.length} movimientos importados`);
    } catch(err) {
      showToast('❌ Error al importar: archivo inválido');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== CLICK OUTSIDE MODALS =====
document.getElementById('modal-tx').addEventListener('click', function(e) {
  if (e.target === this) closeTxModal();
});
document.getElementById('modal-goal').addEventListener('click', function(e) {
  if (e.target === this) closeGoalModal();
});
document.getElementById('modal-contrib').addEventListener('click', function(e) {
  if (e.target === this) closeContribModal();
});
document.getElementById('modal-budget').addEventListener('click', function(e) {
  if (e.target === this) closeBudgetModal();
});

// ===== INIT =====
function init() {
  loadState();
  updatePersonLabels();
  updateCurrencySymbols();
  renderDashboard();

  // Load settings UI
  document.getElementById('s-p1').value = state.settings.person1;
  document.getElementById('s-p2').value = state.settings.person2;
  document.getElementById('s-currency').value = state.settings.currency;
  document.getElementById('s-income').value = state.settings.expectedIncome || '';
  document.getElementById('s-savings-pct').value = state.settings.savingsPct || 20;

  // Set today on tx modal
  document.getElementById('tx-date').value = todayStr();
}

document.addEventListener('DOMContentLoaded', init);
