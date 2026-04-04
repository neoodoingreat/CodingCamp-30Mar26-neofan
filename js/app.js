// ─── LocalStorage Keys ───────────────────────────────────────────────────────
const LS_TRANSACTIONS = 'ebv_transactions';
const LS_THEME        = 'ebv_theme';
const LS_BUDGET       = 'ebv_budget_limit';

// ─── Category Color Map ───────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Food:      '#FF6384',
  Transport: '#36A2EB',
  Fun:       '#FFCE56',
};

// ─── AppState ─────────────────────────────────────────────────────────────────
// In-memory state that mirrors LocalStorage.
// monthFilter is session-only and is never persisted.
let AppState = {
  transactions: [],   // Transaction[]
  theme:        'light', // 'light' | 'dark'
  budgetLimit:  null, // number | null
  monthFilter:  null, // { year: number, month: number } | null
};

// ─── State Manager ────────────────────────────────────────────────────────────

/**
 * Hydrate AppState from LocalStorage.
 * Uses safe JSON parsing with try/catch; falls back to defaults on any error.
 * Requirements: 6.3, 6.4, 7.5, 9.3
 */
function loadState() {
  // Transactions
  try {
    const raw = localStorage.getItem(LS_TRANSACTIONS);
    AppState.transactions = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(AppState.transactions)) {
      AppState.transactions = [];
    }
  } catch (_) {
    AppState.transactions = [];
  }

  // Theme — Requirements: 7.5, 7.6
  try {
    const savedTheme = localStorage.getItem(LS_THEME);
    AppState.theme = savedTheme === 'dark' ? 'dark' : 'light';
  } catch (_) {
    AppState.theme = 'light';
  }
  applyTheme(AppState.theme);

  // Budget limit
  try {
    const savedBudget = localStorage.getItem(LS_BUDGET);
    if (savedBudget !== null) {
      const parsed = parseFloat(savedBudget);
      AppState.budgetLimit = isFinite(parsed) && parsed > 0 ? parsed : null;
    } else {
      AppState.budgetLimit = null;
    }
  } catch (_) {
    AppState.budgetLimit = null;
  }

  // monthFilter is session-only — always starts as null
  AppState.monthFilter = null;
}

/**
 * Serialize transactions, theme, and budgetLimit to LocalStorage.
 * monthFilter is intentionally excluded (session-only state).
 * Requirements: 6.1, 6.2, 7.4, 9.2
 */
function saveState() {
  try {
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(AppState.transactions));
  } catch (_) { /* storage quota exceeded or private-browsing restriction */ }

  try {
    localStorage.setItem(LS_THEME, AppState.theme);
  } catch (_) {}

  try {
    if (AppState.budgetLimit !== null) {
      localStorage.setItem(LS_BUDGET, String(AppState.budgetLimit));
    } else {
      localStorage.removeItem(LS_BUDGET);
    }
  } catch (_) {}
}

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validates transaction input fields.
 * Pure function — no side effects.
 * Requirements: 2.4, 2.5
 *
 * @param {string} name
 * @param {*} amount
 * @param {string} category
 * @returns {{ valid: true } | { valid: false, errors: { name?: string, amount?: string, category?: string } }}
 */
function validateTransaction(name, amount, category) {
  const errors = {};

  if (typeof name !== 'string' || name.trim() === '') {
    errors.name = 'Item name is required.';
  }

  const numAmount = Number(amount);
  if (amount === '' || amount === null || amount === undefined || !isFinite(numAmount) || numAmount <= 0) {
    errors.amount = 'Amount must be a positive number greater than zero.';
  }

  const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];
  if (!VALID_CATEGORIES.includes(category)) {
    errors.category = 'Category must be one of: Food, Transport, Fun.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ─── Transaction Manager ──────────────────────────────────────────────────────

/**
 * Creates a new Transaction, appends it to AppState, persists, and re-renders.
 * Requirements: 2.3, 6.1, 8.4
 *
 * @param {string} name
 * @param {number|string} amount
 * @param {string} category
 */
function addTransaction(name, amount, category) {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString();

  const transaction = {
    id,
    name:      name.trim(),
    amount:    Number(amount),
    category,
    createdAt: new Date().toISOString(),
  };

  AppState.transactions.push(transaction);
  saveState();
  render();
}

/**
 * Removes the transaction with the given id, persists, and re-renders.
 * Requirements: 3.4, 6.2
 *
 * @param {string} id
 */
function deleteTransaction(id) {
  AppState.transactions = AppState.transactions.filter(t => t.id !== id);
  saveState();
  render();
}

// ─── Form Wiring ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  const form        = document.getElementById('transaction-form');
  const nameInput   = document.getElementById('item-name');
  const amountInput = document.getElementById('amount');
  const categoryEl  = document.getElementById('category');
  const errorName   = document.getElementById('error-name');
  const errorAmount = document.getElementById('error-amount');
  const errorCat    = document.getElementById('error-category');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const name     = nameInput.value;
    const amount   = amountInput.value;
    const category = categoryEl.value;

    // Clear previous errors
    errorName.textContent   = '';
    errorAmount.textContent = '';
    errorCat.textContent    = '';

    const result = validateTransaction(name, amount, category);

    if (!result.valid) {
      // Requirements: 2.5 — show inline error per invalid field
      if (result.errors.name)     errorName.textContent   = result.errors.name;
      if (result.errors.amount)   errorAmount.textContent = result.errors.amount;
      if (result.errors.category) errorCat.textContent    = result.errors.category;
      return;
    }

    // Requirements: 2.3 — create transaction
    addTransaction(name, amount, category);

    // Requirements: 2.6 — clear fields and return focus
    form.reset();
    nameInput.focus();
  });
});

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Updates the balance display with the sum of all amounts in the given list.
 * Formats as "$X.XX" currency.
 * Requirements: 4.1, 4.2, 4.3, 4.4
 *
 * @param {Transaction[]} transactions
 */
function renderBalance(transactions) {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const balanceAmountEl = document.getElementById('balance-amount');
  if (balanceAmountEl) {
    balanceAmountEl.textContent = '$' + total.toFixed(2);
  }
}

/**
 * Renders the transaction list into #transaction-list.
 * Each item shows name, formatted amount, category, and a Delete button.
 * Requirements: 3.1, 3.2, 3.3, 3.5
 *
 * @param {Transaction[]} transactions
 */
function renderTransactionList(transactions) {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  transactions.forEach(function (t) {
    const li = document.createElement('li');
    li.className = 'transaction-item';
    li.dataset.id = t.id;

    const info = document.createElement('span');
    info.className = 'transaction-info';
    info.textContent = t.name + ' — $' + t.amount.toFixed(2) + ' (' + t.category + ')';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', 'Delete transaction: ' + t.name);
    deleteBtn.addEventListener('click', function () {
      deleteTransaction(t.id);
    });

    li.appendChild(info);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

/**
 * Applies or removes the over-limit warning style and message.
 * Requirements: 9.4, 9.5, 9.6, 9.7
 *
 * @param {number} balance
 * @param {number|null} budgetLimit
 */
function renderBudgetWarning(balance, budgetLimit) {
  const balanceDisplay = document.getElementById('balance-display');
  const warningEl = document.getElementById('budget-warning');

  if (budgetLimit !== null && balance > budgetLimit) {
    if (balanceDisplay) balanceDisplay.classList.add('over-limit');
    if (warningEl) {
      warningEl.textContent = 'Warning: You have exceeded your spending limit of $' + budgetLimit.toFixed(2) + '!';
      warningEl.hidden = false;
    }
  } else {
    if (balanceDisplay) balanceDisplay.classList.remove('over-limit');
    if (warningEl) {
      warningEl.textContent = '';
      warningEl.hidden = true;
    }
  }
}

/**
 * Top-level render function. Reads AppState, applies monthFilter to derive
 * the active transaction set, then calls all sub-renderers in sequence.
 * Requirements: 3.5, 4.3, 5.3, 8.2, 8.3
 */
function render() {
  let activeTransactions = AppState.transactions;

  // Apply month filter if set
  if (AppState.monthFilter !== null) {
    const { year, month } = AppState.monthFilter;
    activeTransactions = AppState.transactions.filter(function (t) {
      const d = new Date(t.createdAt);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }

  // Calculate balance from active (filtered or full) transactions
  const balance = activeTransactions.reduce(function (sum, t) { return sum + t.amount; }, 0);

  renderBalance(activeTransactions);
  renderTransactionList(activeTransactions);

  // Show monthly total separately when filter is active (Requirement 8.3)
  const monthlyTotalEl = document.getElementById('monthly-total');
  if (monthlyTotalEl) {
    if (AppState.monthFilter !== null) {
      monthlyTotalEl.textContent = 'Monthly total: $' + balance.toFixed(2);
      monthlyTotalEl.hidden = false;
    } else {
      monthlyTotalEl.textContent = '';
      monthlyTotalEl.hidden = true;
    }
  }

  // Guard: updateChart is implemented in task 8
  if (typeof updateChart === 'function') {
    updateChart(activeTransactions);
  }

  renderBudgetWarning(balance, AppState.budgetLimit);

  // Sync budget limit input to reflect current AppState (Requirements: 9.1, 9.3)
  const budgetInputEl = document.getElementById('budget-limit');
  if (budgetInputEl) {
    budgetInputEl.value = AppState.budgetLimit !== null ? AppState.budgetLimit : '';
  }
}

// ─── Chart Controller ─────────────────────────────────────────────────────────

let chartInstance = null;

/**
 * Aggregates transaction amounts by category and updates the Chart.js pie chart.
 * On first call, creates a new Chart instance on #spending-chart.
 * On subsequent calls, updates the existing instance's data and calls update().
 * Handles an empty transaction list gracefully (renders an empty chart).
 * Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * @param {Transaction[]} transactions
 */
function updateChart(transactions) {
  const canvas = document.getElementById('spending-chart');
  if (!canvas) return;

  // Aggregate amounts by category
  const totals = {};
  Object.keys(CATEGORY_COLORS).forEach(function (cat) {
    totals[cat] = 0;
  });
  transactions.forEach(function (t) {
    if (totals.hasOwnProperty(t.category)) {
      totals[t.category] += t.amount;
    }
  });

  const labels = Object.keys(CATEGORY_COLORS);
  const data   = labels.map(function (cat) { return totals[cat]; });
  const colors = labels.map(function (cat) { return CATEGORY_COLORS[cat]; });

  if (chartInstance === null) {
    // First call — create the Chart instance
    chartInstance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data:            data,
          backgroundColor: colors,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
  } else {
    // Subsequent calls — update data in place
    chartInstance.data.datasets[0].data = data;
    chartInstance.update();
  }
}

// ─── Theme Controller ─────────────────────────────────────────────────────────

/**
 * Applies the given theme to the page and persists it.
 * Toggles the `.dark` CSS class on <html> and saves via saveState().
 * Does NOT call render() — theme changes don't require re-rendering data.
 * Requirements: 7.2, 7.3, 7.4
 *
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  AppState.theme = theme === 'dark' ? 'dark' : 'light';
  if (AppState.theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  saveState();
}

// Wire theme toggle button — Requirements: 7.1
document.addEventListener('DOMContentLoaded', function () {
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      applyTheme(AppState.theme === 'dark' ? 'light' : 'dark');
    });
  }
});

// ─── Monthly Filter Controller ────────────────────────────────────────────────

/**
 * Sets the month filter to the given year and month, then re-renders.
 * AppState.monthFilter is session-only and is never persisted.
 * Requirements: 8.1, 8.5
 *
 * @param {number} year  - Full four-digit year, e.g. 2024
 * @param {number} month - 1-based month number (1 = January … 12 = December)
 */
function setMonthFilter(year, month) {
  AppState.monthFilter = { year, month };
  render();
}

/**
 * Clears the active month filter and re-renders the full transaction list.
 * Requirements: 8.5
 */
function clearMonthFilter() {
  AppState.monthFilter = null;
  render();
}

// Wire month selector and clear-filter button — Requirements: 8.1, 8.5
document.addEventListener('DOMContentLoaded', function () {
  const monthSelector  = document.getElementById('month-selector');
  const clearFilterBtn = document.getElementById('clear-filter-btn');

  if (monthSelector) {
    monthSelector.addEventListener('change', function () {
      const value = monthSelector.value; // format: "YYYY-MM" or "" when cleared
      if (value) {
        const parts = value.split('-');
        const year  = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (!isNaN(year) && !isNaN(month)) {
          setMonthFilter(year, month);
        }
      } else {
        clearMonthFilter();
      }
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', function () {
      if (monthSelector) monthSelector.value = '';
      clearMonthFilter();
    });
  }
});

// ─── Budget Limit Input Wiring ────────────────────────────────────────────────
// Requirements: 9.1, 9.2

document.addEventListener('DOMContentLoaded', function () {
  const budgetInput = document.getElementById('budget-limit');
  if (!budgetInput) return;

  // Sync input value from saved state on load
  if (AppState.budgetLimit !== null) {
    budgetInput.value = AppState.budgetLimit;
  }

  budgetInput.addEventListener('change', function () {
    const parsed = parseFloat(budgetInput.value);
    if (isFinite(parsed) && parsed > 0) {
      AppState.budgetLimit = parsed;
    } else {
      AppState.budgetLimit = null;
    }
    saveState();
    render();
  });
});

// ─── Page-load Entry Point ───────────────────────────────────────────────────
// Requirements: 6.3, 6.4, 7.5, 9.3
// loadState() hydrates AppState from LocalStorage AND applies the saved theme
// (applyTheme is called internally by loadState), then render() paints the UI.
document.addEventListener('DOMContentLoaded', function () {
  loadState();
  render();
});
