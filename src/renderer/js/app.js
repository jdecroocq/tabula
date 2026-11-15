document.addEventListener('contextmenu', e => e.preventDefault());

let globalAppVersion = '';

let db = { 
  accounts: [], 
  categories: [], 
  transactions: [], 
  rules: [], 
  recurrences: [], 
  pending_recurrences: [], 
  last_opened: null 
};
let searchQuery = '';
let currentOpType = 'expense';

let visibleCount = 50;

let modalMode = 'create';
let editingTransactionId = null;
let deletingTransactionId = null;
let contextMenuTxId = null;

let editingRecurrenceIndex = null;

function getOccurrencesBetween(startDateStr, endDateStr, frequency) {
  const occurrences = [];
  const start = new Date(startDateStr + 'T12:00:00');
  const end = new Date(endDateStr + 'T12:00:00');

  if (isNaN(start) || isNaN(end) || start >= end) return occurrences;

  let current = new Date(start);
  current.setDate(current.getDate() + 1); 

  while (current <= end) {
    let isMatch = false;

    if (frequency.type === 'weekly') {
      if (current.getDay() === frequency.day) isMatch = true;
    } 
    else if (frequency.type === 'monthly') {
      const lastDayOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      const targetDay = Math.min(frequency.day, lastDayOfMonth);
      if (current.getDate() === targetDay) isMatch = true;
    } 
    else if (frequency.type === 'yearly') {
      if (current.getMonth() === frequency.month && current.getDate() === frequency.day) {
        isMatch = true;
      }
      if (frequency.month === 1 && frequency.day === 29 && current.getMonth() === 1 && current.getDate() === 28) {
        const nextYear = new Date(current.getFullYear(), 2, 0);
        if (nextYear.getDate() !== 29) isMatch = true;
      }
    }

    if (isMatch) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      occurrences.push(`${y}-${m}-${d}`);
    }

    current.setDate(current.getDate() + 1);
  }

  return occurrences;
}

async function checkRecurrences() {
  const now = new Date();
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (!db.last_opened) {
    await window.tabula.updateLastOpened(nowStr);
    db.last_opened = nowStr;
    return;
  }

  if (db.last_opened === nowStr) return;

  let newPending = [...(db.pending_recurrences || [])];

  db.recurrences.forEach(rec => {
    const dates = getOccurrencesBetween(db.last_opened, nowStr, rec.frequency);
    
    dates.forEach(dateStr => {
      const alreadyPending = newPending.some(p => p.recurrence_id === rec.id && p.date === dateStr);
      
      if (!alreadyPending) {
        newPending.push({
          id: 'pend_' + crypto.randomUUID(),
          recurrence_id: rec.id,
          date: dateStr,
          type: rec.type,
          amount_cents: rec.amount_cents,
          account_id: rec.account_id,
          to_account_id: rec.to_account_id || null,
          category_id: rec.category_id || null,
          payee: rec.payee || '',
          note: rec.note || ''
        });
      }
    });
  });

  if (newPending.length > (db.pending_recurrences || []).length) {
    db.pending_recurrences = newPending;
    await window.tabula.updatePendingRecurrences(newPending);
  }

  await window.tabula.updateLastOpened(nowStr);
  db.last_opened = nowStr;
}


// ===== OUTILS =====

function formatMoney(cents) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(cents / 100);
}

function formatDate(isoDate) {
  if (!isoDate) return '--/--/----';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function normalizeSearchText(str) {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function flashInputError(el) {
  if (!el) return;
  el.classList.add('input-error');
  setTimeout(() => el.classList.remove('input-error'), 900);
}

function parseMoneyInput(raw) {
  if (typeof raw === 'number') return Math.round(raw);
  if (!raw) return null;

  const clean = raw.toString().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);

  if (isNaN(num)) return null;
  return Math.round(num * 100); 
}



function formatMoneyInput(cents) {
  if (cents === null || cents === undefined || isNaN(cents)) return '0,00';
  const euros = cents / 100;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(euros);
}

function setupMoneyInput(input, options = { allowNegative: false, allowEmpty: false, onCommit: null }) {
  if (!input || input._hasMoneySetup) return;
  input._hasMoneySetup = true;

  input._previousValidCents = parseMoneyInput(input.value);

  input.addEventListener('input', () => {
    if (options.onSignDetected) {
      if (input.value.includes('+')) {
        options.onSignDetected('income');
        input.value = input.value.replace(/\+/g, '');
      } else if (input.value.includes('-')) {
        options.onSignDetected('expense');
        input.value = input.value.replace(/-/g, '');
      }
    }
    const allowed = options.allowNegative ? /[^0-9.,+\-\s]/g : /[^0-9.,\s]/g;
    input.value = input.value.replace(allowed, '');
  });

  input.addEventListener('focus', () => {
    input._previousValidCents = parseMoneyInput(input.value);
    setTimeout(() => input.select(), 20);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = (options.allowEmpty && input._previousValidCents === null) ? '' : formatMoneyInput(input._previousValidCents || 0);
      input.blur();
    }
  });

  input.addEventListener('blur', () => {
    const raw = input.value.trim();

    if (options.allowEmpty && raw === '') {
      input.value = '';
      input._previousValidCents = null;
      if (options.onCommit) options.onCommit(null, '');
      return;
    }

    let cents = parseMoneyInput(input.value);

    if (cents !== null) {
      if (!options.allowNegative && cents < 0) cents = Math.abs(cents);

      if (options.allowEmpty && cents === 0) {
        input.value = '';
        input._previousValidCents = null;
        if (options.onCommit) options.onCommit(null, '');
        return;
      }

      input._previousValidCents = cents;
      input.value = formatMoneyInput(cents);
      if (options.onCommit) options.onCommit(cents, input.value);
    } else {
      input.value = (options.allowEmpty && input._previousValidCents === null) ? '' : formatMoneyInput(input._previousValidCents || 0);
      if (options.onCommit) options.onCommit(input._previousValidCents, input.value);
    }
  });
}

function setupCharCounter(segmentEl, inputEl, maxLimit, onCommit) {
  const counterEl = segmentEl.querySelector('.char-counter');
  inputEl._previousValidText = inputEl.value;

  function updateDisplay() {
    const len = inputEl.value.length;
    counterEl.innerText = `${len}/${maxLimit}`;
    counterEl.classList.toggle('overflow', len > maxLimit);
  }

  inputEl.addEventListener('focus', () => {
    inputEl._previousValidText = inputEl.value;
    updateDisplay();
  });

  inputEl.addEventListener('input', updateDisplay);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputEl.blur(); 
    } else if (e.key === 'Escape') {
      e.preventDefault();
      inputEl.value = inputEl._previousValidText;
      inputEl.blur();
    }
  });

  inputEl.addEventListener('blur', () => {
    const cleanText = inputEl.value.trim();

    if (inputEl.value.length > maxLimit || cleanText === '') {
      inputEl.value = inputEl._previousValidText;
    } else {
      inputEl._previousValidText = cleanText;
      inputEl.value = cleanText;
      onCommit(cleanText);
    }
    updateDisplay();
  });
}


// ===== UI: AUTO-COMPLÉTION =====

const payeeInput = document.getElementById('op-payee');
const suggestionsMenu = document.getElementById('payee-suggestions');
const suggestionsList = suggestionsMenu.querySelector('.select-menu');
let selectedSuggestionIndex = -1;

payeeInput.addEventListener('input', () => {
  if (modalMode === 'rule') {
    suggestionsMenu.style.display = 'none';
    return; 
  }
  
  const val = payeeInput.value;
  
  if (val.startsWith('/') && !val.includes(' ')) {
    const query = val.substring(1).toLowerCase();
    const matchingRules = db.rules.filter(r => r.keyword && r.keyword.toLowerCase().startsWith(query));

    suggestionsList.innerHTML = '';

    if (matchingRules.length === 0) {
      suggestionsList.innerHTML = '<div class="select-option select-no-result">Aucune règle</div>';
    } else {
      matchingRules.forEach((rule, idx) => {
        const option = document.createElement('div');
        option.className = 'select-option';
        if (idx === 0) selectedSuggestionIndex = 0; 
        option.innerHTML = `
          <span class="rule-suggestion-key">/${rule.keyword}</span>
          <span class="rule-suggestion-name">${rule.name || 'Sans nom'}</span>
        `;
        option.addEventListener('mousedown', (e) => {
          e.preventDefault(); 
          applyRuleSuggestion(rule);
        });
        suggestionsList.appendChild(option);
      });
    }

    suggestionsMenu.style.display = 'block';
  } else {
    suggestionsMenu.style.display = 'none';
    selectedSuggestionIndex = -1;
  }
});

document.addEventListener('click', (e) => {
  if (e.target !== payeeInput && !suggestionsMenu.contains(e.target)) {
    suggestionsMenu.style.display = 'none';
  }
});

payeeInput.addEventListener('keydown', (e) => {
  if (modalMode === 'rule') return;
  if (suggestionsMenu.style.display === 'none') return;

  const options = suggestionsList.querySelectorAll('.select-option:not(.select-no-result)');
  if (options.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % options.length;
    updateSuggestionFocus(options);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + options.length) % options.length;
    updateSuggestionFocus(options);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const activeOption = options[selectedSuggestionIndex];
    if (activeOption) {
      activeOption.dispatchEvent(new Event('mousedown'));
    }
  } else if (e.key === 'Escape') {
    suggestionsMenu.style.display = 'none';
  }
});

function updateSuggestionFocus(options) {
  options.forEach((opt, idx) => {
    opt.classList.toggle('selected', idx === selectedSuggestionIndex);
  });
}

function applyRuleSuggestion(rule) {
  setType(rule.type || 'expense');
  
  if (rule.amount_cents > 0) {
    document.getElementById('op-amount').value = formatMoneyInput(rule.amount_cents);
  }
  
  if (rule.account_id) selectDropdownValue('#op-account', rule.account_id);
  if (rule.to_account_id) selectDropdownValue('#op-to-account', rule.to_account_id);
  if (rule.category_id) selectDropdownValue('#op-category', rule.category_id);
  
  if (rule.note) document.getElementById('op-note').value = rule.note;
  
  payeeInput.value = rule.payee || '';
  
  suggestionsMenu.style.display = 'none';
  payeeInput.focus();
}

function selectDropdownValue(selector, value) {
  const select = document.querySelector(selector);
  if (!select) return;
  const option = select.querySelector(`.select-option[data-value="${value}"]`);
  if (option) {
    selectOption(select, option);
  }
}


// ===== UI: SELECTS =====

function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(select => {
    const trigger = select.querySelector('.select-trigger');
    const menu = select.querySelector('.select-menu');

    if (!trigger || !menu) return; 

    trigger.onclick = (e) => {
      if (e.target.classList.contains('select-search-input')) return;

      e.stopPropagation();
      const isOpen = select.classList.contains('open');

      document.querySelectorAll('.custom-select.open').forEach(s => {
        if (s !== select) closeCustomSelect(s);
      });

      if (isOpen) {
        closeCustomSelect(select);
      } else {
        openCustomSelect(select);
      }
    };

    menu.onclick = (e) => {
      const option = e.target.closest('.select-option');
      if (!option || option.classList.contains('select-no-result')) return;

      e.stopPropagation();
      selectOption(select, option);
    };
  });
}

function openCustomSelect(select) {
  select.classList.add('open');

  const trigger = select.querySelector('.select-trigger');
  const label = select.querySelector('.select-label');
  const menu = select.querySelector('.select-menu');

  select._originalText = label ? label.innerText : '';

  if (label) label.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'select-search-input';
  input.placeholder = select._originalText || 'Sélectionner...';
  input.autocomplete = 'off';
  input.spellcheck = false;

  trigger.insertBefore(input, trigger.firstChild);

  setTimeout(() => input.focus(), 20);

  input.oninput = () => {
    filterSelectOptions(menu, input.value);
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstVisible = Array.from(menu.querySelectorAll('.select-option:not(.select-no-result)')).find(opt => opt.style.display !== 'none');
      if (firstVisible) selectOption(select, firstVisible);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCustomSelect(select);
    }
  };
}

function closeCustomSelect(select) {
  select.classList.remove('open');

  const trigger = select.querySelector('.select-trigger');
  const label = select.querySelector('.select-label');
  const input = select.querySelector('.select-search-input');
  const menu = select.querySelector('.select-menu');

  if (input) input.remove();

  if (label) {
    label.style.display = '';
    if (select._originalText) label.innerText = select._originalText;
  }

  if (menu) {
    menu.querySelectorAll('.select-option').forEach(opt => opt.style.display = '');
    const noResult = menu.querySelector('.select-no-result');
    if (noResult) noResult.remove();
  }
}

function selectOption(select, option) {
  const label = select.querySelector('.select-label');
  const menu = select.querySelector('.select-menu');

  menu.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
  option.classList.add('selected');

  const selectedText = option.innerText;
  select._originalText = selectedText; 
  if (label) label.innerText = selectedText;

  const val = option.getAttribute('data-value');
  select.setAttribute('data-value', val);
  select.dispatchEvent(new CustomEvent('change', { detail: { value: val } }));

  closeCustomSelect(select);
}

function filterSelectOptions(menu, query) {
  const cleanQuery = query.toLowerCase().trim();
  const options = Array.from(menu.querySelectorAll('.select-option:not(.select-no-result)'));
  let matchCount = 0;

  options.forEach(opt => {
    const match = opt.innerText.toLowerCase().includes(cleanQuery);
    opt.style.display = match ? '' : 'none';
    if (match) matchCount++;
  });

  let noResultEl = menu.querySelector('.select-no-result');
  if (matchCount === 0) {
    if (!noResultEl) {
      noResultEl = document.createElement('div');
      noResultEl.className = 'select-option select-no-result';
      noResultEl.innerText = 'Aucun résultat';
      menu.appendChild(noResultEl);
    }
  } else if (noResultEl) {
    noResultEl.remove();
  }
}

window.addEventListener('click', () => {
  document.querySelectorAll('.custom-select.open').forEach(s => closeCustomSelect(s));
});


// ===== THÈME =====

let savedTheme = localStorage.getItem('tabula-theme') || 'system';
let tempTheme = savedTheme;

function applyVisualTheme(theme) {
  if (theme === 'system') {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    document.body.classList.toggle('light-mode', prefersLight);
  } else if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  const active = settingsModal.classList.contains('active') ? tempTheme : savedTheme;
  if (active === 'system') {
    document.body.classList.toggle('light-mode', e.matches);
  }
});

function calculateBalances() {
  const accountBalances = {};
  db.accounts.forEach(acc => { accountBalances[acc.id] = acc.initial_balance_cents || 0; });

  db.transactions.forEach(tx => {
    if (tx.type === 'income') {
      accountBalances[tx.account_id] = (accountBalances[tx.account_id] || 0) + tx.amount_cents;
    } else if (tx.type === 'expense') {
      accountBalances[tx.account_id] = (accountBalances[tx.account_id] || 0) - tx.amount_cents;
    } else if (tx.type === 'transfer') {
      accountBalances[tx.account_id] = (accountBalances[tx.account_id] || 0) - tx.amount_cents;
      if (tx.to_account_id) {
        accountBalances[tx.to_account_id] = (accountBalances[tx.to_account_id] || 0) + tx.amount_cents;
      }
    }
  });

  return {
    total: Object.values(accountBalances).reduce((sum, val) => sum + val, 0),
    byAccount: accountBalances
  };
}

const CAROUSEL_STABLE_MS = 3000;
const CAROUSEL_ANIM_MS = 2000;
const CAROUSEL_EASING = 'cubic-bezier(0.65, 0, 0.15, 1)';
const SNAP_ANIM_MS = 800;
const SNAP_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SNAP_THRESHOLD = 30;


// ===== CARROUSEL =====

let currentSlide = 1;
let autoRotateTimer = null;
let snapTimeout = null;
let isAutoRotating = true;
let totalRealSlides = 0;

function renderBalanceCarousel() {
  const track = document.getElementById('carousel-track');
  const dotsContainer = document.getElementById('carousel-dots');
  const balances = calculateBalances();

  const slidesData = [
    { title: "Solde total", balance: balances.total },
    ...db.accounts.map(acc => ({
      title: `Compte • ${acc.name}`,
      balance: balances.byAccount[acc.id] || 0
    }))
  ];

  totalRealSlides = slidesData.length;

  if (totalRealSlides <= 1) {
    currentSlide = 0;
    track.innerHTML = createSlideHTML(slidesData[0]);
    dotsContainer.innerHTML = '';
    return;
  }

  const renderData = [
    slidesData[totalRealSlides - 1],
    ...slidesData,
    slidesData[0]
  ];

  track.innerHTML = renderData.map(s => createSlideHTML(s)).join('');

  dotsContainer.innerHTML = '';
  slidesData.forEach((slide, idx) => {
    const dot = document.createElement('button');
    dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
    dot.title = slide.title;
    dot.addEventListener('click', () => goToSlide(idx + 1, true));
    dotsContainer.appendChild(dot);
  });

  currentSlide = 1;
  updateTrackPosition(false);

  clearTimeout(autoRotateTimer);
  clearTimeout(snapTimeout);
  if (isAutoRotating) {
    scheduleNextRotation();
  }

  setupCarouselSwipe(track);
}

function updateBalanceCarouselValues() {
  const track = document.getElementById('carousel-track');
  if (!track || !track.children.length) {
    renderBalanceCarousel();
    return;
  }

  const balances = calculateBalances();
  const slidesData = [
    { title: "Solde total", balance: balances.total },
    ...db.accounts.map(acc => ({
      title: `Compte • ${acc.name}`,
      balance: balances.byAccount[acc.id] || 0
    }))
  ];

  const totalSlides = slidesData.length;
  if (totalSlides <= 1) return;

  const renderData = [
    slidesData[totalSlides - 1],
    ...slidesData,
    slidesData[0]
  ];

  Array.from(track.children).forEach((slideEl, idx) => {
    const slide = renderData[idx];
    if (!slide) return;

    const formatted = formatMoney(slide.balance).replace(/[\u202F\u00A0]/g, ' ');
    const [amount, currency] = formatted.split(/\s(?=[^\s]+$)/);
    
    const amountEl = slideEl.querySelector('.slide-amount');
    if (amountEl) {
      amountEl.innerHTML = `${amount} <span class="slide-currency">${currency}</span>`;
    }
  });
}

function createSlideHTML(slide) {
  const formatted = formatMoney(slide.balance).replace(/[\u202F\u00A0]/g, ' ');
  const [amount, currency] = formatted.split(/\s(?=[^\s]+$)/);
  return `
    <div class="carousel-slide">
      <span class="slide-label">${slide.title}</span>
      <div class="slide-amount">
        ${amount} <span class="slide-currency">${currency}</span>
      </div>
    </div>
  `;
}

function updateTrackPosition(animate = true, duration = CAROUSEL_ANIM_MS, easing = CAROUSEL_EASING) {
  const track = document.getElementById('carousel-track');
  const dots = document.querySelectorAll('.carousel-dot');

  if (track) {
    track.style.transition = animate ? `transform ${duration}ms ${easing}` : 'none';
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
  }

  if (dots.length > 0) {
    let realIndex = 0;
    if (currentSlide === 0) {
      realIndex = totalRealSlides - 1;
    } else if (currentSlide === totalRealSlides + 1) {
      realIndex = 0;
    } else {
      realIndex = currentSlide - 1;
    }

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === realIndex);
    });
  }
}

function normalizePositionSync() {
  if (currentSlide === totalRealSlides + 1) {
    currentSlide = 1;
    updateTrackPosition(false);
  } else if (currentSlide === 0) {
    currentSlide = totalRealSlides;
    updateTrackPosition(false);
  }
}

function goToSlide(index, stopAuto = false) {
  normalizePositionSync();
  currentSlide = index;
  updateTrackPosition(true, SNAP_ANIM_MS, SNAP_EASING);

  if (stopAuto) {
    clearTimeout(autoRotateTimer);
    clearTimeout(snapTimeout);
    autoRotateTimer = null;
    isAutoRotating = false;
  }
}

function scheduleNextRotation() {
  if (!isAutoRotating || totalRealSlides <= 1) return;

  autoRotateTimer = setTimeout(() => {
    if (!isAutoRotating) return;

    currentSlide++;
    updateTrackPosition(true, CAROUSEL_ANIM_MS, CAROUSEL_EASING);

    clearTimeout(snapTimeout);
    snapTimeout = setTimeout(() => {
      normalizePositionSync();
      scheduleNextRotation();
    }, CAROUSEL_ANIM_MS);

  }, CAROUSEL_STABLE_MS);
}

function setupCarouselSwipe(track) {
  const viewport = document.querySelector('.carousel-viewport');
  let isDragging = false;
  let startX = 0;
  let currentDeltaX = 0;
  let startTranslateX = 0;

  viewport.onmousedown = (e) => {
    if (e.button !== 0 || totalRealSlides <= 1) return;

    clearTimeout(autoRotateTimer);
    clearTimeout(snapTimeout);
    autoRotateTimer = null;
    isAutoRotating = false;

    normalizePositionSync();

    isDragging = true;
    startX = e.clientX;
    currentDeltaX = 0;

    track.style.transition = 'none';
    startTranslateX = -currentSlide * viewport.clientWidth;
  };

  window.onmousemove = (e) => {
    if (!isDragging) return;
    currentDeltaX = e.clientX - startX;
    track.style.transform = `translateX(${startTranslateX + currentDeltaX}px)`;
  };

  window.onmouseup = () => {
    if (!isDragging) return;
    isDragging = false;

    if (currentDeltaX < -SNAP_THRESHOLD) {
      currentSlide++;
    } else if (currentDeltaX > SNAP_THRESHOLD) {
      currentSlide--;
    }

    currentSlide = Math.max(0, Math.min(totalRealSlides + 1, currentSlide));

    updateTrackPosition(true, SNAP_ANIM_MS, SNAP_EASING);

    if (currentSlide === totalRealSlides + 1 || currentSlide === 0) {
      clearTimeout(snapTimeout);
      snapTimeout = setTimeout(() => {
        normalizePositionSync();
      }, SNAP_ANIM_MS);
    }
  };
}

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  visibleCount = 50;
  renderTransactions();
});


// ===== TABLEAU =====

function renderTransactions() {
  const tbody = document.getElementById('transactions-body');
  const emptyState = document.getElementById('empty-state');
  const tableCard = document.getElementById('transactions-table-card');
  const loadMoreContainer = document.getElementById('load-more-container');

  let list = [...db.transactions];

  list.sort((a, b) => b.date.localeCompare(a.date));

  if (searchQuery) {
    const queryTokens = normalizeSearchText(searchQuery).split(/\s+/).filter(t => t.length > 0);

    list = list.filter(tx => {
      const category = db.categories.find(c => c.id === tx.category_id);
      const account = db.accounts.find(a => a.id === tx.account_id);
      const toAccount = tx.to_account_id ? db.accounts.find(a => a.id === tx.to_account_id) : null;

      const fullRowText = [
        tx.payee,
        tx.note,
        category ? category.name : (tx.type === 'transfer' ? 'Virement interne' : 'Divers'),
        account ? account.name : '',
        toAccount ? toAccount.name : '',
        formatDate(tx.date),
        tx.date,
        (tx.amount_cents / 100).toString().replace('.', ','),
        (tx.amount_cents / 100).toString(),
        formatMoney(tx.amount_cents)
      ].join(' ');

      const normalizedRow = normalizeSearchText(fullRowText);
      return queryTokens.every(token => normalizedRow.includes(token));
    });
  }

  if (list.length === 0) {
    tableCard.style.display = 'none';
    emptyState.style.display = 'flex';

    const titleEl = document.getElementById('empty-state-title');
    const descEl = document.getElementById('empty-state-desc');

    if (db.transactions.length === 0) {
      titleEl.innerText = "Aucune opération enregistrée";
      descEl.innerText = "Enregistrez votre première dépense, recette ou virement pour commencer.";
    } else {
      titleEl.innerText = "Aucun résultat";
      descEl.innerText = "Aucune opération ne correspond à votre recherche.";
    }
    return;
  }

  tableCard.style.display = 'block';
  emptyState.style.display = 'none';
  tbody.innerHTML = '';

  const sliced = list.slice(0, visibleCount);
  loadMoreContainer.style.display = list.length > visibleCount ? 'block' : 'none';

  sliced.forEach(tx => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', tx.id);

    const category = db.categories.find(c => c.id === tx.category_id);
    const account = db.accounts.find(a => a.id === tx.account_id);
    const toAccount = tx.to_account_id ? db.accounts.find(a => a.id === tx.to_account_id) : null;

    let amountClass = 'neutral';
    let sign = '';
    let categoryDisplay = category ? category.name : (tx.type === 'transfer' ? 'Virement interne' : 'Divers');
    let accountDisplay = account ? account.name : '--';

    if (tx.type === 'income') {
      amountClass = 'positive';
      sign = '+ ';
    } else if (tx.type === 'expense') {
      amountClass = 'negative';
      sign = '- ';
    } else if (tx.type === 'transfer') {
      const fromName = account ? account.name : '--';
      const toName = toAccount ? toAccount.name : '--';
      accountDisplay = `${fromName} vers ${toName}`;
    }

    const hasNote = tx.note && tx.note.trim() !== '';
    const noteContent = hasNote ? tx.note : 'Aucun commentaire';
    const noteClass = hasNote ? 'note-text' : 'note-text empty-note';

    tr.innerHTML = `
      <td class="font-mono text-muted">${formatDate(tx.date)}</td>
      <td>
        <div class="cell-description">
          <span class="truncate-text desc-text">${tx.payee || '-'}</span>
          <span class="${noteClass}">${noteContent}</span>
        </div>
      </td>
      <td class="text-muted"><span>${categoryDisplay}</span></td>
      <td class="text-muted"><span>${accountDisplay}</span></td>
      <td class="amount ${amountClass}" style="text-align: right;">${sign}${formatMoney(tx.amount_cents)}</td>
    `;

    tr.addEventListener('click', () => {
      tr.classList.toggle('expanded');
    });

    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, tx.id);
    });

    tbody.appendChild(tr);
  });
}

document.getElementById('load-more-btn').addEventListener('click', () => {
  visibleCount += 50;
  renderTransactions();
});

const contextMenu = document.getElementById('row-context-menu');


// ===== MENU CONTEXTUEL =====

function openContextMenu(x, y, txId) {
  contextMenuTxId = txId;
  const menuWidth = 150;
  const menuHeight = 110;
  const posX = (x + menuWidth > window.innerWidth) ? x - menuWidth : x;
  const posY = (y + menuHeight > window.innerHeight) ? y - menuHeight : y;

  contextMenu.style.left = `${posX}px`;
  contextMenu.style.top = `${posY}px`;
  contextMenu.classList.add('open');
}

function closeContextMenu() {
  contextMenu.classList.remove('open');
  contextMenuTxId = null;
}

contextMenu.querySelector('.action-edit').addEventListener('click', () => {
  const tx = db.transactions.find(t => t.id === contextMenuTxId);
  closeContextMenu();
  if (tx) openEditModal(tx);
});

contextMenu.querySelector('.action-duplicate').addEventListener('click', () => {
  const tx = db.transactions.find(t => t.id === contextMenuTxId);
  closeContextMenu();
  if (tx) openDuplicateModal(tx);
});

contextMenu.querySelector('.action-delete').addEventListener('click', () => {
  const id = contextMenuTxId;
  closeContextMenu();
  openDeleteModal(id);
});

window.addEventListener('click', closeContextMenu);

const opModal = document.getElementById('operation-modal');
const opForm = document.getElementById('operation-form');
const modalTitle = opModal.querySelector('h2');
const modalSubmitBtn = document.getElementById('save-op-btn');


// ===== MODALES =====

function openCreateModal() {
  if (document.getElementById('payee-suggestions')) document.getElementById('payee-suggestions').style.display = 'none';

  modalMode = 'create';
  editingTransactionId = null;
  modalTitle.innerText = "Nouvelle opération";
  modalSubmitBtn.innerText = "Enregistrer";

  document.querySelector('#group-payee label').innerHTML = 'Description <span class="label-hint">(tapez / pour les règles)</span>'

  opModal.classList.add('active');
  document.getElementById('op-date').disabled = false;
  document.getElementById('op-date').parentElement.querySelector('label').innerHTML = "Date";
  document.getElementById('op-amount').parentElement.parentElement.querySelector('label').innerHTML = "Montant";
  document.getElementById('op-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('op-amount').value = '';
  document.getElementById('op-payee').value = '';
  document.getElementById('op-note').value = '';

  setupMoneyInput(document.getElementById('op-amount'), {
    allowNegative: false,
    allowEmpty: true,
    onSignDetected: (type) => setType(type)
  });

  setType('expense');
  populateModalDropdowns();
  setTimeout(() => document.getElementById('op-amount').focus(), 50);

  const amountInput = document.getElementById('op-amount');
  amountInput.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      e.preventDefault(); 
      amountInput.value = ''; 
      


      const payeeInput = document.getElementById('op-payee');
      payeeInput.focus();
      payeeInput.value = '/';
      
      payeeInput.dispatchEvent(new Event('input'));
    }
  });
}

function openEditModal(tx) {
  modalMode = 'edit';
  editingTransactionId = tx.id;
  modalTitle.innerText = "Modifier l'opération";
  modalSubmitBtn.innerText = "Mettre à jour";

  document.querySelector('#group-payee label').innerHTML = 'Description <span class="label-hint">(tapez / pour les règles)</span>'

  opModal.classList.add('active');
  document.getElementById('op-date').disabled = false;
  document.getElementById('op-date').parentElement.querySelector('label').innerHTML = "Date";
  document.getElementById('op-amount').parentElement.parentElement.querySelector('label').innerHTML = "Montant";
  document.getElementById('op-date').value = tx.date;
  document.getElementById('op-amount').value = (tx.amount_cents / 100).toFixed(2).replace('.', ',');
  document.getElementById('op-payee').value = tx.payee || '';
  document.getElementById('op-note').value = tx.note || '';

  setType(tx.type);
  setupDropdown('#op-account', db.accounts, tx.account_id);
  setupDropdown('#op-to-account', db.accounts, tx.to_account_id || db.accounts[0]?.id);
  setupDropdown('#op-category', db.categories, tx.category_id || db.categories[0]?.id);
  setupMoneyInput(document.getElementById('op-amount'), { allowNegative: false });

  setTimeout(() => document.getElementById('op-amount').focus(), 50);

  const amountInput = document.getElementById('op-amount');
  amountInput.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      e.preventDefault(); 
      amountInput.value = ''; 
      


      const payeeInput = document.getElementById('op-payee');
      payeeInput.focus();
      payeeInput.value = '/';
      
      payeeInput.dispatchEvent(new Event('input'));
    }
  });
}

function openDuplicateModal(tx) {
  modalMode = 'create';
  editingTransactionId = null;
  modalTitle.innerText = "Nouvelle opération";
  modalSubmitBtn.innerText = "Enregistrer";

  document.querySelector('#group-payee label').innerHTML = 'Description <span class="label-hint">(tapez / pour les règles)</span>'

  opModal.classList.add('active');
  document.getElementById('op-date').disabled = false;
  document.getElementById('op-date').parentElement.querySelector('label').innerHTML = "Date";
  document.getElementById('op-amount').parentElement.parentElement.querySelector('label').innerHTML = "Montant";
  document.getElementById('op-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('op-amount').value = (tx.amount_cents / 100).toFixed(2).replace('.', ',');
  document.getElementById('op-payee').value = tx.payee || '';
  document.getElementById('op-note').value = tx.note || '';

  setType(tx.type);
  setupDropdown('#op-account', db.accounts, tx.account_id);
  setupDropdown('#op-to-account', db.accounts, tx.to_account_id || db.accounts[0]?.id);
  setupDropdown('#op-category', db.categories, tx.category_id || db.categories[0]?.id);

  setTimeout(() => document.getElementById('op-amount').focus(), 50);

  const amountInput = document.getElementById('op-amount');
  amountInput.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      e.preventDefault(); 
      amountInput.value = ''; 
      


      const payeeInput = document.getElementById('op-payee');
      payeeInput.focus();
      payeeInput.value = '/';
      
      payeeInput.dispatchEvent(new Event('input'));
    }
  });
}

function openRecurrenceOpModal(rec, index) {
  modalMode = 'recurrence';
  editingRecurrenceIndex = index; 
  modalTitle.innerText = "Configuration de l'opération";
  modalSubmitBtn.innerText = "Sauvegarder";

  opModal.classList.add('active');
  const suggestions = document.getElementById('payee-suggestions');
  if (suggestions) suggestions.style.display = 'none';

  const dateInput = document.getElementById('op-date');
  const dateLabel = dateInput.parentElement.querySelector('label');
  dateInput.value = ''; 
  dateInput.disabled = true;
  dateLabel.innerHTML = 'Date <span class="label-hint">(Automatique)</span>';

  const amountInput = document.getElementById('op-amount');
  const amountLabel = amountInput.parentElement.parentElement.querySelector('label');
  amountInput.value = rec.amount_cents > 0 ? formatMoneyInput(rec.amount_cents) : '';
  amountLabel.innerHTML = 'Montant';

  document.querySelector('#group-payee label').innerHTML = 'Description';

  setupMoneyInput(amountInput, { allowNegative: false, allowEmpty: false });

  document.getElementById('op-payee').value = rec.payee || '';
  document.getElementById('op-note').value = rec.note || '';
  setType(rec.type || 'expense');

  setupDropdown('#op-account', db.accounts, rec.account_id || db.accounts[0]?.id);
  setupDropdown('#op-to-account', db.accounts, rec.to_account_id || db.accounts[1]?.id || db.accounts[0]?.id);
  setupDropdown('#op-category', db.categories, rec.category_id || db.categories[0]?.id);

  setTimeout(() => amountInput.focus(), 50);
}

function openRuleConfigModal(rule, index) {
  modalMode = 'rule';
  editingTransactionId = index; 
  modalTitle.innerText = "Configuration de l'opération";
  modalSubmitBtn.innerText = "Sauvegarder";

  document.querySelector('#group-payee label').innerHTML = 'Description';

  opModal.classList.add('active');
  
  const dateInput = document.getElementById('op-date');
  const dateLabel = dateInput.parentElement.querySelector('label');
  dateInput.value = '';
  dateInput.disabled = true;
  dateLabel.innerHTML = 'Date <span class="label-hint">(Automatique)</span>';

  const amountInput = document.getElementById('op-amount');
  const amountLabel = amountInput.parentElement.parentElement.querySelector('label');
  amountInput.value = rule.amount_cents > 0 ? (rule.amount_cents / 100).toFixed(2).replace('.', ',') : '';
  amountLabel.innerHTML = 'Montant <span class="label-hint">(Optionnel)</span>';
  
  setupMoneyInput(amountInput, { allowNegative: false, allowEmpty: true });

  document.getElementById('op-payee').value = rule.payee || '';
  document.getElementById('op-note').value = rule.note || '';
  setType(rule.type || 'expense');

  setupDropdown('#op-account', db.accounts, rule.account_id || db.accounts[0]?.id);
  setupDropdown('#op-to-account', db.accounts, rule.to_account_id || db.accounts[1]?.id || db.accounts[0]?.id);
  setupDropdown('#op-category', db.categories, rule.category_id || db.categories[0]?.id);

  setTimeout(() => amountInput.focus(), 50);
}

function closeOpModal() {
  opModal.classList.remove('active');
  const suggestions = document.getElementById('payee-suggestions');
  if (suggestions) suggestions.style.display = 'none';
  editingRecurrenceIndex = null;
}

document.getElementById('open-new-op-btn').addEventListener('click', openCreateModal);
document.getElementById('cancel-modal-btn').addEventListener('click', closeOpModal);

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => setType(btn.getAttribute('data-type')));
});

function setType(type) {
  currentOpType = type;
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-type') === type);
  });

  const groupCategory = document.getElementById('group-category');
  const groupToAccount = document.getElementById('group-to-account');
  const labelAccountSource = document.getElementById('label-account-source');

  if (type === 'transfer') {
    groupCategory.style.display = 'none';
    groupToAccount.style.display = 'flex';
    labelAccountSource.innerText = 'Compte Source';
  } else {
    groupCategory.style.display = 'flex';
    groupToAccount.style.display = 'none';
    labelAccountSource.innerText = 'Compte';
  }
}

function populateModalDropdowns() {
  setupDropdown('#op-account', db.accounts, db.accounts[0]?.id);
  setupDropdown('#op-to-account', db.accounts, db.accounts[1]?.id || db.accounts[0]?.id);
  setupDropdown('#op-category', db.categories, db.categories[0]?.id);
}

function setupDropdown(selector, items, defaultId) {
  const container = document.querySelector(selector);
  if (!container) return;
  const menu = container.querySelector('.select-menu');
  const triggerLabel = container.querySelector('.select-label');

  menu.innerHTML = '';
  items.forEach(item => {
    const isSelected = item.id === defaultId;
    if (isSelected) {
      triggerLabel.innerText = item.name;
      container.setAttribute('data-value', item.id);
    }
    menu.innerHTML += `<div class="select-option ${isSelected ? 'selected' : ''}" data-value="${item.id}">${item.name}</div>`;
  });
}

opForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const amountCents = parseMoneyInput(document.getElementById('op-amount').value) || 0;
  const isRule = modalMode === 'rule';
  const isRecurrence = modalMode === 'recurrence';

  if ((!isRule && !isRecurrence && amountCents <= 0) || (isRecurrence && amountCents <= 0)) {
    const amountInput = document.getElementById('op-amount');
    amountInput.focus();
    flashInputError(amountInput);
    return;
  }

  const txData = {
    date: (isRule || isRecurrence) ? '' : document.getElementById('op-date').value,
    type: currentOpType,
    payee: document.getElementById('op-payee').value,
    note: document.getElementById('op-note').value,
    account_id: document.querySelector('#op-account').getAttribute('data-value'),
    to_account_id: currentOpType === 'transfer' ? document.querySelector('#op-to-account').getAttribute('data-value') : null,
    category_id: currentOpType === 'transfer' ? null : document.querySelector('#op-category').getAttribute('data-value'),
    amount_cents: amountCents
  };

  if (currentOpType === 'transfer' && txData.account_id === txData.to_account_id) {
    flashInputError(document.querySelector('#op-account .select-trigger'));
    flashInputError(document.querySelector('#op-to-account .select-trigger'));
    return;
  }

  if (isRule) {
    tempRules[editingTransactionId] = {
      ...tempRules[editingTransactionId],
      ...txData
    };
    renderSettingsRules();
    closeOpModal();
    return;
  }

  if (isRecurrence) {
    tempRecurrences[editingRecurrenceIndex] = {
      ...tempRecurrences[editingRecurrenceIndex],
      ...txData
    };
    renderSettingsRecurrences();
    closeOpModal();
    return;
  }

  if (modalMode === 'edit') {
    txData.id = editingTransactionId;
    const updated = await window.tabula.updateTransaction(txData);
    const idx = db.transactions.findIndex(t => t.id === editingTransactionId);
    if (idx !== -1) db.transactions[idx] = updated;
  } else {
    const saved = await window.tabula.addTransaction(txData);
    db.transactions.unshift(saved);
  }

  renderBalanceCarousel();
  renderTransactions();
  closeOpModal();
});

const deleteModal = document.getElementById('delete-modal');
function openDeleteModal(id) {
  deletingTransactionId = id;
  deleteModal.classList.add('active');
}
document.getElementById('cancel-delete-btn').addEventListener('click', () => {
  deleteModal.classList.remove('active');
  deletingTransactionId = null;
});
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (deletingTransactionId) {
    await window.tabula.deleteTransaction(deletingTransactionId);
    db.transactions = db.transactions.filter(t => t.id !== deletingTransactionId);
    renderBalanceCarousel();
    renderTransactions();
    deleteModal.classList.remove('active');
    deletingTransactionId = null;
  }
});

const settingsModal = document.getElementById('settings-modal');
const accountsListEl = document.getElementById('settings-accounts-list');
const categoriesListEl = document.getElementById('settings-categories-list');
const rulesListEl = document.getElementById('settings-rules-list');
const recurrencesListEl = document.getElementById('settings-recurrences-list');
let tempAccounts = [], tempCategories = [], tempRules = [], tempRecurrences = [];

let pendingSettingsDeleteType = null;
let pendingSettingsDeleteIndex = null;

function openSettingsDeleteModal(type, index, item) {
  pendingSettingsDeleteType = type;
  pendingSettingsDeleteIndex = index;
  
  const descEl = document.getElementById('settings-delete-desc');
  const countEl = document.getElementById('settings-delete-count');

  if (type === 'rule' || type === 'recurrence') {
    descEl.innerText = "La suppression de cet élément prendra effet lors de l'enregistrement des paramètres.";
    countEl.style.display = 'none';
    document.getElementById('settings-delete-modal').classList.add('active');
    return;
  }

  countEl.style.display = 'block';
  const label = type === 'account' ? 'ce compte' : 'cette catégorie';

  let linkedCount = 0;
  if (type === 'account') {
    linkedCount = db.transactions.filter(t => t.account_id === item.id || t.to_account_id === item.id).length;
  } else if (type === 'category') {
    linkedCount = db.transactions.filter(t => t.category_id === item.id).length;
  }

  descEl.innerText = `La suppression de ${label} supprimera toutes les écritures associées. Cette action prendra effet et deviendra définitive lors de l'enregistrement des paramètres.`;
  countEl.innerText = `Nombre d'opérations dépendantes : ${linkedCount}`;

  document.getElementById('settings-delete-modal').classList.add('active');
}


// ===== DONNÉES & PARAMÈTRES =====

function openSettingsModal() {
  tempAccounts = JSON.parse(JSON.stringify(db.accounts));
  tempCategories = JSON.parse(JSON.stringify(db.categories));
  tempRules = JSON.parse(JSON.stringify(db.rules || [])); 
  tempRecurrences = JSON.parse(JSON.stringify(db.recurrences || []));
  tempTheme = savedTheme;
  tempDataPath = savedDataPath;

  const pathInput = document.getElementById('db-path-input');
  if (pathInput) pathInput.value = tempDataPath || '';

  renderSettingsAccounts();
  renderSettingsCategories();
  renderSettingsRecurrences();
  renderSettingsRules();
  resetUpdateView();

  const themeSelect = document.getElementById('settings-theme-select');
  if (themeSelect) {
    const activeOpt = themeSelect.querySelector(`.select-option[data-value="${tempTheme}"]`);
    if (activeOpt) {
      themeSelect.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
      activeOpt.classList.add('selected');
      themeSelect.querySelector('.select-label').innerText = activeOpt.innerText;
    }
  }

  settingsModal.classList.add('active');
}

function closeSettingsModal() {
  settingsModal.classList.remove('active');
  applyVisualTheme(savedTheme);
}

document.getElementById('nav-settings-btn').addEventListener('click', openSettingsModal);
document.getElementById('cancel-settings-btn').addEventListener('click', closeSettingsModal);

document.getElementById('settings-theme-select').addEventListener('change', (e) => {
  tempTheme = e.detail.value;
  applyVisualTheme(tempTheme);
});

function validateAccountsList() {
  let isValid = true;
  const nameCounts = {};
  
  tempAccounts.forEach(acc => {
    const clean = acc.name.trim().toLowerCase();
    if (clean) nameCounts[clean] = (nameCounts[clean] || 0) + 1;
  });

  const rows = accountsListEl.querySelectorAll('.settings-row');
  tempAccounts.forEach((acc, idx) => {
    const clean = acc.name.trim().toLowerCase();
    const segment = rows[idx]?.querySelector('.settings-name-segment');
    const input = rows[idx]?.querySelector('.acc-name-input');

    if (clean === '' || nameCounts[clean] > 1) {
      isValid = false;
      flashInputError(rows[idx]);
      if (input && document.activeElement !== input) input.focus();
    }
  });

  return isValid;
}

function validateCategoriesList() {
  let isValid = true;
  const nameCounts = {};

  tempCategories.forEach(cat => {
    const clean = cat.name.trim().toLowerCase();
    if (clean) nameCounts[clean] = (nameCounts[clean] || 0) + 1;
  });

  const rows = categoriesListEl.querySelectorAll('.settings-row');
  tempCategories.forEach((cat, idx) => {
    const clean = cat.name.trim().toLowerCase();
    const segment = rows[idx]?.querySelector('.settings-name-segment');
    const input = rows[idx]?.querySelector('.cat-name-input');

    if (clean === '' || nameCounts[clean] > 1) {
      isValid = false;
      flashInputError(rows[idx]);
      if (input && document.activeElement !== input) input.focus();
    }
  });

  return isValid;
}

function renderSettingsAccounts() {
  accountsListEl.innerHTML = '';
  tempAccounts.forEach((acc, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('data-id', acc.id);
    const initialEuros = formatMoneyInput(acc.initial_balance_cents);

    row.innerHTML = `
      <div class="settings-name-segment">
        <input type="text" class="settings-input acc-name-input" value="${acc.name}" placeholder="Nom du compte">
        <span class="char-counter">0/8</span>
      </div>

      <div class="settings-divider"></div>

      <div class="settings-amount-segment">
        <input type="text" class="settings-input acc-balance-input" value="${initialEuros}" placeholder="0,00">
        <span class="currency-symbol">€</span>
      </div>

      <div class="settings-row-actions">
        <button type="button" class="settings-row-btn drag-handle" title="Déplacer"><svg class="icon"><use href="icons.svg#icon-drag"></use></svg></button>
        <button type="button" class="settings-row-btn delete-btn" title="Supprimer"><svg class="icon"><use href="icons.svg#icon-trash"></use></svg></button>
      </div>
    `;

    const nameSegment = row.querySelector('.settings-name-segment');
    const nameInput = row.querySelector('.acc-name-input');
    setupCharCounter(nameSegment, nameInput, 8, (val) => { acc.name = val; });

    const balanceInput = row.querySelector('.acc-balance-input');
    setupMoneyInput(balanceInput, {
      allowNegative: true,
      onCommit: (cents) => { acc.initial_balance_cents = cents; }
    });

    row.querySelector('.delete-btn').addEventListener('click', () => {
      openSettingsDeleteModal('account', idx, acc);
    });

    accountsListEl.appendChild(row);
  });
  
  setupDragAndDrop(accountsListEl, tempAccounts, renderSettingsAccounts);
}

function renderSettingsCategories() {
  categoriesListEl.innerHTML = '';
  tempCategories.forEach((cat, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('data-id', cat.id);

    row.innerHTML = `
      <div class="settings-name-segment">
        <input type="text" class="settings-input cat-name-input" value="${cat.name}" placeholder="Nom de la catégorie">
        <span class="char-counter">0/24</span>
      </div>
      
      <div class="settings-row-actions">
        <button type="button" class="settings-row-btn drag-handle" title="Déplacer"><svg class="icon"><use href="icons.svg#icon-drag"></use></svg></button>
        <button type="button" class="settings-row-btn delete-btn" title="Supprimer"><svg class="icon"><use href="icons.svg#icon-trash"></use></svg></button>
      </div>
    `;

    const nameSegment = row.querySelector('.settings-name-segment');
    const nameInput = row.querySelector('.cat-name-input');
    setupCharCounter(nameSegment, nameInput, 24, (val) => { cat.name = val; });

    row.querySelector('.delete-btn').addEventListener('click', () => {
      openSettingsDeleteModal('category', idx, cat);
    });

    categoriesListEl.appendChild(row);
  });

  setupDragAndDrop(categoriesListEl, tempCategories, renderSettingsCategories);
}

function renderSettingsRecurrences() {
  recurrencesListEl.innerHTML = '';
  tempRecurrences.forEach((rec, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('data-id', rec.id);

    row.innerHTML = `
      <div class="settings-name-segment">
        <input type="text" class="settings-input rec-name-input" value="${rec.name || ''}" placeholder="Nom de la récurrence">
      </div>

      <div class="settings-row-actions">
        <button type="button" class="settings-row-btn rec-calendar-btn" title="Configurer la fréquence"><svg class="icon"><use href="icons.svg#icon-calendar"></use></svg></button>
        <button type="button" class="settings-row-btn rec-edit-op-btn" title="Modifier l'opération"><svg class="icon"><use href="icons.svg#icon-edit"></use></svg></button>
        <button type="button" class="settings-row-btn drag-handle" title="Déplacer"><svg class="icon"><use href="icons.svg#icon-drag"></use></svg></button>
        <button type="button" class="settings-row-btn delete-btn" title="Supprimer"><svg class="icon"><use href="icons.svg#icon-trash"></use></svg></button>
      </div>
    `;

    const nameInput = row.querySelector('.rec-name-input');
    nameInput.addEventListener('input', () => {
      rec.name = nameInput.value;
    });

    row.querySelector('.rec-calendar-btn').addEventListener('click', () => {
      openFreqModal(rec, idx);
    });

    row.querySelector('.rec-edit-op-btn').addEventListener('click', () => {
      openRecurrenceOpModal(rec, idx);
    });

    row.querySelector('.delete-btn').addEventListener('click', () => {
      openSettingsDeleteModal('recurrence', idx, rec);
    });

    recurrencesListEl.appendChild(row);
  });

  setupDragAndDrop(recurrencesListEl, tempRecurrences, renderSettingsRecurrences);
}

const freqModal = document.getElementById('freq-modal');
const freqTypeSelect = document.getElementById('freq-type-select');
const freqDayOfWeekSelect = document.getElementById('freq-day-of-week');

function populateSelect(selectId, min, max, defaultValue) {
  const selectEl = document.getElementById(selectId);
  const menuEl = selectEl.querySelector('.select-menu');
  const labelEl = selectEl.querySelector('.select-label');
  
  menuEl.innerHTML = '';
  for (let i = min; i <= max; i++) {
    const isSelected = i === defaultValue;
    if (isSelected) labelEl.innerText = i;
    menuEl.innerHTML += `<div class="select-option ${isSelected ? 'selected' : ''}" data-value="${i}">${i}</div>`;
  }
}

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function populateMonthSelect(selectId, defaultValue) {
  const selectEl = document.getElementById(selectId);
  const menuEl = selectEl.querySelector('.select-menu');
  const labelEl = selectEl.querySelector('.select-label');
  
  menuEl.innerHTML = '';
  MONTHS_FR.forEach((month, idx) => {
    const isSelected = idx === defaultValue;
    if (isSelected) labelEl.innerText = month;
    menuEl.innerHTML += `<div class="select-option ${isSelected ? 'selected' : ''}" data-value="${idx}">${month}</div>`;
  });
}

function openFreqModal(rec, index) {
  editingRecurrenceIndex = index;
  
  const freq = rec.frequency || { type: 'monthly', day: 1 };

  populateSelect('freq-day-of-month', 1, 31, freq.day || 1);
  populateSelect('freq-day-of-year', 1, 31, freq.day || 1);
  populateMonthSelect('freq-month-of-year', freq.month || 0);

  initCustomSelects();

  const typeOption = freqTypeSelect.querySelector(`.select-option[data-value="${freq.type}"]`);
  if (typeOption) selectOption(freqTypeSelect, typeOption);

  if (freq.type === 'yearly') {
    const dayOpt = document.getElementById('freq-day-of-year').querySelector(`.select-option[data-value="${freq.day || 1}"]`);
    if (dayOpt) selectOption(document.getElementById('freq-day-of-year'), dayOpt);
    const monthOpt = document.getElementById('freq-month-of-year').querySelector(`.select-option[data-value="${freq.month || 0}"]`);
    if (monthOpt) selectOption(document.getElementById('freq-month-of-year'), monthOpt);
  } else if (freq.type === 'weekly') {
    const dayOption = freqDayOfWeekSelect.querySelector(`.select-option[data-value="${freq.day !== undefined ? freq.day : 1}"]`);
    if (dayOption) selectOption(freqDayOfWeekSelect, dayOption);
  } else if (freq.type === 'monthly') {
    const dayOpt = document.getElementById('freq-day-of-month').querySelector(`.select-option[data-value="${freq.day || 1}"]`);
    if (dayOpt) selectOption(document.getElementById('freq-day-of-month'), dayOpt);
  }

  updateFreqFields(freq.type);
  freqModal.classList.add('active');
}

function updateFreqFields(type) {
  document.getElementById('freq-monthly-fields').style.display = type === 'monthly' ? 'flex' : 'none';
  document.getElementById('freq-yearly-fields').style.display = type === 'yearly' ? 'flex' : 'none';
  document.getElementById('freq-weekly-fields').style.display = type === 'weekly' ? 'flex' : 'none';
}

freqTypeSelect.addEventListener('change', (e) => {
  updateFreqFields(e.detail.value);
});

document.getElementById('cancel-freq-btn').addEventListener('click', () => {
  freqModal.classList.remove('active');
});

document.getElementById('save-freq-btn').addEventListener('click', () => {
  if (editingRecurrenceIndex === null) return;

  const type = freqTypeSelect.getAttribute('data-value');
  let frequency = { type };

  if (type === 'monthly') {
    const day = parseInt(document.getElementById('freq-day-of-month').getAttribute('data-value')) || 1;
    frequency.day = day;
  } else if (type === 'yearly') {
    const day = parseInt(document.getElementById('freq-day-of-year').getAttribute('data-value')) || 1;
    const month = parseInt(document.getElementById('freq-month-of-year').getAttribute('data-value')) || 0;
    frequency.day = day;
    frequency.month = month;
  } else if (type === 'weekly') {
    const day = parseInt(freqDayOfWeekSelect.getAttribute('data-value'));
    frequency.day = day;
  }

  tempRecurrences[editingRecurrenceIndex].frequency = frequency;
  renderSettingsRecurrences();
  freqModal.classList.remove('active');
});

function renderSettingsRules() {
  rulesListEl.innerHTML = '';
  tempRules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('data-id', rule.id);

    row.innerHTML = `
      <div class="settings-name-segment">
        <input type="text" class="settings-input rule-name-input" value="${rule.name || ''}" placeholder="Nom de la règle">
        <span class="char-counter">0/12</span>
      </div>

      <div class="settings-divider"></div>

      <div class="settings-keyword-segment">
        <input type="text" class="settings-input rule-keyword-input" value="${rule.keyword ? '/' + rule.keyword : ''}" placeholder="/clé">
        <span class="char-counter">0/8</span>
      </div>

      <div class="settings-row-actions">
        <button type="button" class="settings-row-btn rule-edit-btn" title="Configurer la règle"><svg class="icon"><use href="icons.svg#icon-edit"></use></svg></button>
        <button type="button" class="settings-row-btn drag-handle" title="Déplacer"><svg class="icon"><use href="icons.svg#icon-drag"></use></svg></button>
        <button type="button" class="settings-row-btn delete-btn" title="Supprimer"><svg class="icon"><use href="icons.svg#icon-trash"></use></svg></button>
      </div>
    `;

    const nameSegment = row.querySelector('.settings-name-segment');
    const nameInput = row.querySelector('.rule-name-input');
    setupCharCounter(nameSegment, nameInput, 12, (val) => { rule.name = val; });

    const keywordSegment = row.querySelector('.settings-keyword-segment');
    const keywordInput = row.querySelector('.rule-keyword-input');
    const keywordCounter = keywordSegment.querySelector('.char-counter');

    function updateKwDisplay() {
      const val = keywordInput.value;
      const len = val.startsWith('/') ? val.length - 1 : val.length;
      keywordCounter.innerText = `${len}/8`;
      keywordCounter.classList.toggle('overflow', len > 8);
    }
    updateKwDisplay();

    keywordInput.addEventListener('focus', () => {
      if (!keywordInput.value.startsWith('/')) {
        keywordInput.value = '/' + keywordInput.value;
      }
      updateKwDisplay();
      keywordInput.setSelectionRange(keywordInput.value.length, keywordInput.value.length);
    });

    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && keywordInput.value === '/') {
        e.preventDefault();
      }
    });

    keywordInput.addEventListener('input', () => {
      let val = keywordInput.value;
      if (!val.startsWith('/')) {
        val = '/' + val;
      }
      val = '/' + val.substring(1).replace(/\//g, '').replace(/\s/g, '').toLowerCase();
      if (val.length > 9) {
        val = val.substring(0, 9);
      }
      keywordInput.value = val;
      rule.keyword = val.substring(1);
      updateKwDisplay();
    });

    keywordInput.addEventListener('blur', () => {
      if (keywordInput.value === '/') {
        keywordInput.value = '';
        rule.keyword = '';
      }
      updateKwDisplay();
    });

    row.querySelector('.rule-edit-btn').addEventListener('click', () => {
      openRuleConfigModal(rule, idx);
    });

    row.querySelector('.delete-btn').addEventListener('click', () => {
      openSettingsDeleteModal('rule', idx, rule);
    });

    rulesListEl.appendChild(row);
  });

  setupDragAndDrop(rulesListEl, tempRules, renderSettingsRules);
}

function validateRulesList() {
  let isValid = true;
  const keywordCounts = {};

  tempRules.forEach(rule => {
    const cleanKw = rule.keyword ? rule.keyword.trim().toLowerCase() : '';
    if (cleanKw) keywordCounts[cleanKw] = (keywordCounts[cleanKw] || 0) + 1;
  });

  const rows = rulesListEl.querySelectorAll('.settings-row');
  tempRules.forEach((rule, idx) => {
    const cleanKw = rule.keyword ? rule.keyword.trim().toLowerCase() : '';
    const row = rows[idx];
    
    if (cleanKw === '' || keywordCounts[cleanKw] > 1) {
      isValid = false;
      flashInputError(row);
      if (cleanKw === '') {
        row.querySelector('.rule-keyword-input').focus();
      }
    }
  });

  return isValid;
}

function setupDragAndDrop(containerEl, dataArray, renderCallback) {
  const rows = containerEl.querySelectorAll('.settings-row');
  const scrollContainer = containerEl.closest('.settings-content') || containerEl.parentElement;
  
  rows.forEach(row => {
    const handle = row.querySelector('.drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let placeholder = null;
    let rowRect = null;
    let currentIndex = -1;
    let placeholderIndex = -1;
    let originalData = [];

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      
      isDragging = true;
      rowRect = row.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      
      currentIndex = Array.from(containerEl.children).indexOf(row);
      originalData = [...dataArray]; 
      
      document.body.classList.add('is-dragging-active');

      placeholder = document.createElement('div');
      placeholder.className = 'settings-row-placeholder';
      containerEl.insertBefore(placeholder, row);
      
      row.classList.add('dragging');
      row.style.width = `${rowRect.width}px`;
      row.style.left = `${rowRect.left}px`;
      row.style.top = `${rowRect.top}px`;
      
      placeholderIndex = currentIndex;
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      document.addEventListener('keydown', onKeyDown, true);
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', onScroll);
      }
    });

    function onScroll() {
      if (!isDragging) return;
      onMouseMove({ clientX: lastMouseX, clientY: lastMouseY });
    }

    function onMouseMove(e) {
      if (!isDragging) return;

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      row.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      const allElements = Array.from(containerEl.children).filter(el => 
        el !== row && el.classList.contains('settings-row')
      );

      let newIndex = allElements.length;
      for (let i = 0; i < allElements.length; i++) {
        const elRect = allElements[i].getBoundingClientRect();
        
        if (e.clientY < elRect.top + (elRect.height / 2)) {
          newIndex = i;
          break;
        }
      }

      if (newIndex !== placeholderIndex) {
        const rowsToAnimate = Array.from(containerEl.querySelectorAll('.settings-row:not(.dragging)'));
        const firstRects = rowsToAnimate.map(r => r.getBoundingClientRect());

        const targetEl = allElements[newIndex];
        if (targetEl) {
          containerEl.insertBefore(placeholder, targetEl);
        } else {
          containerEl.appendChild(placeholder);
        }
        
        placeholderIndex = newIndex;

        rowsToAnimate.forEach((r, i) => {
          const lastRect = r.getBoundingClientRect();
          const delta = firstRects[i].top - lastRect.top;
          
          if (delta !== 0) {
            r.classList.remove('is-animating');
            r.style.transform = `translateY(${delta}px)`;
            void r.offsetHeight; 
            r.classList.add('is-animating');
            r.style.transform = '';
            setTimeout(() => {
              r.classList.remove('is-animating');
              r.style.transform = '';
            }, 200);
          }
        });
      }
    }

    function onMouseUp() {
      if (!isDragging) return;
      finishDrag(false);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishDrag(true);
      }
    }

    function finishDrag(cancel) {
      isDragging = false;
      
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown, true);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', onScroll);
      }
      document.body.classList.remove('is-dragging-active');

      if (cancel) {
        
        const deltaX = lastMouseX - startX;
        const deltaY = lastMouseY - startY;
        const currentTop = rowRect.top + deltaY;
        const currentLeft = rowRect.left + deltaX;
        const rowId = row.getAttribute('data-id');

        const currentRects = new Map();
        containerEl.querySelectorAll('.settings-row').forEach(el => {
          if (el !== row) {
            currentRects.set(el.getAttribute('data-id'), el.getBoundingClientRect());
          }
        });

        placeholder.remove();
        row.remove(); 

        dataArray.length = 0;
        dataArray.push(...originalData);
        renderCallback();

        const newRow = containerEl.querySelector(`.settings-row[data-id="${rowId}"]`);

        const elementsToAnimate = [];
        containerEl.querySelectorAll('.settings-row').forEach(el => {
          if (el === newRow) {
            el.style.visibility = 'hidden';
            return;
          }
          const id = el.getAttribute('data-id');
          const oldRect = currentRects.get(id);
          if (oldRect) {
            const newRect = el.getBoundingClientRect();
            const delta = oldRect.top - newRect.top;
            if (delta !== 0) {
              el.style.transform = `translateY(${delta}px)`;
              elementsToAnimate.push(el);
            }
          }
        });

        document.body.appendChild(row);
        row.style.transition = 'none';
        row.style.top = `${currentTop}px`;
        row.style.left = `${currentLeft}px`;
        row.style.transform = 'none';

        void row.offsetHeight;
        void containerEl.offsetHeight;

        row.classList.add('is-animating');
        if (newRow) {
          const targetRect = newRow.getBoundingClientRect();
          row.style.top = `${targetRect.top}px`;
          row.style.left = `${targetRect.left}px`;
        }

        elementsToAnimate.forEach(el => {
          el.classList.add('is-animating');
          el.style.transform = '';
        });

        setTimeout(() => {
          row.remove();
          if (newRow) newRow.style.visibility = '';
          elementsToAnimate.forEach(el => {
            el.classList.remove('is-animating');
            el.style.transform = '';
          });
        }, 200);

      } else {
        const placeholderRect = placeholder.getBoundingClientRect();
        
        const currentTop = rowRect.top + (lastMouseY - startY);
        const currentLeft = rowRect.left + (lastMouseX - startX);
        
        row.style.transition = 'none';
        row.style.top = `${currentTop}px`;
        row.style.left = `${currentLeft}px`;
        row.style.transform = 'none';
        
        void row.offsetHeight;
        
        row.classList.add('is-animating');
        row.style.top = `${placeholderRect.top}px`;
        row.style.left = `${placeholderRect.left}px`;

        setTimeout(() => {
          const siblingsWithoutDrag = Array.from(containerEl.children).filter(el => el !== row);
          const targetIndex = siblingsWithoutDrag.indexOf(placeholder);
          
          if (currentIndex !== targetIndex) {
            const [movedItem] = dataArray.splice(currentIndex, 1);
            dataArray.splice(targetIndex, 0, movedItem);
          }

          row.classList.remove('dragging');
          row.classList.remove('is-animating');
          row.style.transition = '';
          row.style.transform = '';
          row.style.width = '';
          row.style.left = '';
          row.style.top = '';
          
          renderCallback(); 
        }, 200);
      }
    }
  });
}

document.getElementById('settings-add-account-btn').addEventListener('click', () => {
  tempAccounts.push({ id: 'acc_' + crypto.randomUUID(), name: '', initial_balance_cents: 0 });
  renderSettingsAccounts();
  
  const lastRow = accountsListEl.querySelector('.settings-row:last-child .acc-name-input');
  if (lastRow) setTimeout(() => lastRow.focus(), 20);
});

document.getElementById('settings-add-category-btn').addEventListener('click', () => {
  tempCategories.push({ id: 'cat_' + crypto.randomUUID(), name: '' });
  renderSettingsCategories();

  const lastRow = categoriesListEl.querySelector('.settings-row:last-child .cat-name-input');
  if (lastRow) setTimeout(() => lastRow.focus(), 20);
});

document.getElementById('settings-add-recurrence-btn').addEventListener('click', () => {
  tempRecurrences.push({ 
    id: 'rec_' + crypto.randomUUID(), 
    name: '', 
    frequency: { type: 'monthly', day: 1 }, 
    type: 'expense',
    amount_cents: 0,
    account_id: '',
    category_id: '',
    payee: '',
    note: ''
  });
  renderSettingsRecurrences();
  
  const lastRow = recurrencesListEl.querySelector('.settings-row:last-child .rec-name-input');
  if (lastRow) setTimeout(() => lastRow.focus(), 20);
});

document.getElementById('settings-add-rule-btn').addEventListener('click', () => {
  tempRules.push({ 
    id: 'rule_' + crypto.randomUUID(), 
    name: '', 
    keyword: '', 
    type: 'expense', 
    amount_cents: 0, 
    account_id: '', 
    category_id: '', 
    note: '', 
    payee: '' 
  });
  renderSettingsRules();
  
  const lastRow = rulesListEl.querySelector('.settings-row:last-child .rule-name-input');
  if (lastRow) setTimeout(() => lastRow.focus(), 20);
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  if (!validateAccountsList() || !validateCategoriesList() || !validateRulesList()) return;

  const finalAccounts = tempAccounts.map(a => ({ ...a, name: a.name.trim() }));
  const finalCategories = tempCategories.map(c => ({ ...c, name: c.name.trim() }));

  if (tempDataPath && tempDataPath !== savedDataPath) {
    await window.tabula.setDataPath(tempDataPath);
    savedDataPath = tempDataPath;
  }

  await window.tabula.updateAccounts(finalAccounts);
  await window.tabula.updateCategories(finalCategories);
  await window.tabula.updateRules(tempRules);
  await window.tabula.updateRecurrences(tempRecurrences);

  savedTheme = tempTheme;
  localStorage.setItem('tabula-theme', savedTheme);

  await loadApp();
  settingsModal.classList.remove('active');
});

document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const currentActivePane = document.querySelector('.settings-pane.active');
    
    if (currentActivePane?.id === 'tab-accounts' && !validateAccountsList()) return;
    if (currentActivePane?.id === 'tab-categories' && !validateCategoriesList()) return;
    if (currentActivePane?.id === 'tab-rules' && !validateRulesList()) return;

    const externalUrl = tab.getAttribute('data-url');
    if (externalUrl) {
      if (window.tabula.openExternal) window.tabula.openExternal(externalUrl);
      return;
    }

    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(tab.getAttribute('data-target')).classList.add('active');
  });
});

const importWarningModal = document.getElementById('import-warning-modal');
const resetWarningModal = document.getElementById('reset-warning-modal');

document.getElementById('btn-export-backup').addEventListener('click', async () => {
  const success = await window.tabula.exportBackup();
  if (success) {
    const btn = document.getElementById('btn-export-backup');
    const oldText = btn.innerText;
    btn.innerText = 'Exporté !';
    setTimeout(() => { btn.innerText = oldText; }, 1500);
  }
});

document.getElementById('btn-import-backup').addEventListener('click', () => {
  importWarningModal.classList.add('active');
});
document.getElementById('cancel-import-warning-btn').addEventListener('click', () => {
  importWarningModal.classList.remove('active');
});
document.getElementById('confirm-import-warning-btn').addEventListener('click', async () => {
  importWarningModal.classList.remove('active');
  const success = await window.tabula.importBackup();
  if (success) {
    await loadApp();
    closeSettingsModal();
  }
});

document.getElementById('btn-reset-db').addEventListener('click', () => {
  document.getElementById('reset-warning-modal').classList.add('active');
});

document.getElementById('cancel-reset-warning-btn').addEventListener('click', () => {
  document.getElementById('reset-warning-modal').classList.remove('active');
});

document.getElementById('confirm-reset-warning-btn').addEventListener('click', async () => {
  document.getElementById('reset-warning-modal').classList.remove('active');
  
  await window.tabula.resetData();
  
  await loadApp();
  
  closeSettingsModal();
});

document.getElementById('cancel-settings-delete-btn').addEventListener('click', () => {
  document.getElementById('settings-delete-modal').classList.remove('active');
});

document.getElementById('confirm-settings-delete-btn').addEventListener('click', () => {
  document.getElementById('settings-delete-modal').classList.remove('active');
  if (pendingSettingsDeleteType === 'account') {
    tempAccounts.splice(pendingSettingsDeleteIndex, 1);
    renderSettingsAccounts();
  } else if (pendingSettingsDeleteType === 'category') {
    tempCategories.splice(pendingSettingsDeleteIndex, 1);
    renderSettingsCategories();
  } else if (pendingSettingsDeleteType === 'rule') {
    tempRules.splice(pendingSettingsDeleteIndex, 1);
    renderSettingsRules();
  } else if (pendingSettingsDeleteType === 'recurrence') {
    tempRecurrences.splice(pendingSettingsDeleteIndex, 1);
    renderSettingsRecurrences();
  }
});

let savedDataPath = '';
let tempDataPath = '';

async function refreshDataPathDisplay() {
  const inputEl = document.getElementById('db-path-input');
  if (window.tabula.getDataPath) {
    savedDataPath = await window.tabula.getDataPath();
    tempDataPath = savedDataPath;
    if (inputEl) inputEl.value = savedDataPath || '';
  }
}

async function handleManualPathCommit() {
  const typedPath = dbPathInput.value.trim();
  
  if (!typedPath || typedPath === savedDataPath) {
    tempDataPath = savedDataPath;
    dbPathInput.value = savedDataPath;
    return;
  }

  const res = await window.tabula.validateFile(typedPath);
  
  if (!res || !res.valid) {
    document.getElementById('incompatible-file-modal')?.classList.add('active');
    dbPathInput.value = savedDataPath;
    tempDataPath = savedDataPath;
  } else {
    tempDataPath = typedPath;
    tempAccounts = JSON.parse(JSON.stringify(res.data.accounts));
    tempCategories = JSON.parse(JSON.stringify(res.data.categories));
    renderSettingsAccounts();
    renderSettingsCategories();
  }
}

const dbPathInput = document.getElementById('db-path-input');
dbPathInput?.addEventListener('blur', handleManualPathCommit);
dbPathInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    dbPathInput.blur(); 
  }
});

document.getElementById('btn-browse-file')?.addEventListener('click', async () => {
  if (!window.tabula.selectDataFile) return;
  const res = await window.tabula.selectDataFile();
  if (!res) return; 

  if (!res.valid) {
    document.getElementById('incompatible-file-modal')?.classList.add('active');
    return;
  }

  tempDataPath = res.path;
  if (dbPathInput) dbPathInput.value = res.path;

  tempAccounts = JSON.parse(JSON.stringify(res.data.accounts));
  tempCategories = JSON.parse(JSON.stringify(res.data.categories));
  renderSettingsAccounts();
  renderSettingsCategories();
});

document.getElementById('btn-open-folder')?.addEventListener('click', () => {
  window.tabula.openDataFolder();
});

document.getElementById('close-incompatible-btn')?.addEventListener('click', () => {
  document.getElementById('incompatible-file-modal')?.classList.remove('active');
});

const updateStage = document.getElementById('update-stage');

function resetUpdateView() {
  if (!updateStage) return;
  
  const currentVerText = globalAppVersion ? `v${globalAppVersion}` : '';

  updateStage.innerHTML = `
    <svg class="icon icon-illu"><use href="icons.svg#icon-illu-update"></use></svg>
    <button type="button" class="btn" id="btn-check-update" style="margin-top: 4px;">Rechercher une mise à jour</button>
  `;

  document.getElementById('btn-check-update')?.addEventListener('click', runUpdateCheck);
}

async function runUpdateCheck() {
  const btn = document.getElementById('btn-check-update') || document.getElementById('btn-retry-update');
  
  if (btn) {
    btn.style.width = `${btn.offsetWidth}px`;
    btn.disabled = true;
    btn.innerText = 'Recherche...';
  }

  const res = await window.tabula.checkUpdate();

  if (!res || !res.success) {
    updateStage.innerHTML = `
      <svg class="icon icon-illu"><use href="icons.svg#icon-illu-network-problem"></use></svg>
      <p class="update-text">Oups ! La recherche a échoué. Vérifiez votre connexion Internet. Si le problème persiste, il peut s'agir d'une indisponibilité temporaire des serveurs.</p>
      <button type="button" class="btn" id="btn-retry-update" style="margin-top: 8px;">Réessayer</button>
    `;
    document.getElementById('btn-retry-update')?.addEventListener('click', runUpdateCheck);
    return;
  }

  if (res.hasUpdate) {
    const formattedDate = res.publishedAt ? formatDate(res.publishedAt) : '';
    const dateText = formattedDate ? `Publiée le ${formattedDate}` : '';

    updateStage.innerHTML = `
      <svg class="icon icon-illu"><use href="icons.svg#icon-illu-delivery"></use></svg>
      <p class="update-text">Une version plus récente est disponible !</p>
      
      <!-- La structure officielle sans aucun style en ligne -->
      <div class="settings-cards-group">
        <div class="settings-card">
          <div class="settings-card-info" style="text-align: left;">
            <span class="settings-card-title">Tabula v${res.latestVersion}</span>
            <span class="text-muted settings-card-desc">${dateText}</span>
          </div>
          <button type="button" class="btn" id="btn-get-update">Obtenir</button>
        </div>
      </div>
    `;

    document.getElementById('btn-get-update')?.addEventListener('click', () => {
      window.tabula.openExternal(res.releaseUrl);
    });
    return;
  }

  updateStage.innerHTML = `
    <svg class="icon icon-illu icon-green"><use href="icons.svg#icon-illu-check"></use></svg>
    <p class="update-text">Votre application est à jour.</p>
  `;
}

const wipModal = document.getElementById('wip-modal');
document.getElementById('nav-analytics-btn').addEventListener('click', () => wipModal.classList.add('active'));
document.getElementById('nav-export-btn').addEventListener('click', () => wipModal.classList.add('active'));
document.getElementById('close-wip-btn').addEventListener('click', () => wipModal.classList.remove('active'));

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target !== backdrop) return;
    
    if (backdrop.id === 'operation-modal') closeOpModal();
    else if (backdrop.id === 'settings-modal') { 
    }
    else if (backdrop.id === 'delete-modal') { backdrop.classList.remove('active'); deletingTransactionId = null; }
    else backdrop.classList.remove('active');
  });
});

document.addEventListener('keydown', (e) => {

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
    return;
  }

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {

    if (e.target.classList.contains('select-search-input')) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.target.blur();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.target.blur();
      return;
    }
  }

  const openSelect = document.querySelector('.custom-select.open');
  if (openSelect) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeCustomSelect(openSelect);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const menu = openSelect.querySelector('.select-menu');
      const firstVisible = Array.from(menu.querySelectorAll('.select-option:not(.select-no-result)')).find(opt => opt.style.display !== 'none');
      if (firstVisible) selectOption(openSelect, firstVisible);
      return;
    }
  }

  if (e.key === 'Escape') {

    const ctxMenu = document.getElementById('row-context-menu');
    if (ctxMenu && ctxMenu.classList.contains('open')) {
      closeContextMenu();
      return;
    }

    const activeModals = [
      { id: 'missing-file-modal', closeFn: () => document.getElementById('missing-file-modal').classList.remove('active') },
      { id: 'incompatible-file-modal', closeFn: () => document.getElementById('incompatible-file-modal').classList.remove('active') },
      { id: 'settings-delete-modal', closeFn: () => document.getElementById('settings-delete-modal').classList.remove('active') },
      { id: 'reset-warning-modal', closeFn: () => document.getElementById('reset-warning-modal').classList.remove('active') },
      { id: 'import-warning-modal', closeFn: () => document.getElementById('import-warning-modal').classList.remove('active') },
      { id: 'delete-modal', closeFn: () => document.getElementById('delete-modal').classList.remove('active') },
      { id: 'wip-modal', closeFn: () => document.getElementById('wip-modal').classList.remove('active') },
      { id: 'new-db-modal', closeFn: () => document.getElementById('new-db-modal').classList.remove('active') },
      { id: 'operation-modal', closeFn: closeOpModal },
      { id: 'freq-modal', closeFn: () => freqModal.classList.remove('active') },
      { id: 'settings-modal', closeFn: closeSettingsModal }
    ];

    for (let modal of activeModals) {
      const el = document.getElementById(modal.id);
      if (el && el.classList.contains('active')) {
        modal.closeFn();
        return;
      }
    }
  }

  if (e.key.toLowerCase() === 'n' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const anyModalOpen = document.querySelector('.modal-backdrop.active');
    if (!anyModalOpen) {
      e.preventDefault();
      openCreateModal();
    }
  }

  if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
    if (opModal.classList.contains('active')) {
      e.preventDefault();
      document.getElementById('save-op-btn').click();
    }
  }
});

window.addEventListener('wheel', (e) => {
  const activeModal = document.querySelector('.modal-backdrop.active');
  if (!activeModal) return;

  const isInsideScrollable = e.target.closest('.settings-content, .select-menu');
  if (isInsideScrollable) {
    return;
  }

  e.preventDefault();
}, { passive: false });


// ===== INIT =====

async function loadApp() {
  db = await window.tabula.getData();

  await checkRecurrences();
  if (!db.rules) db.rules = [];

  applyVisualTheme(savedTheme);

  const themeSelect = document.getElementById('settings-theme-select');
  if (themeSelect) {
    const activeOpt = themeSelect.querySelector(`.select-option[data-value="${savedTheme}"]`);
    if (activeOpt) {
      themeSelect.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
      activeOpt.classList.add('selected');
      themeSelect.querySelector('.select-label').innerText = activeOpt.innerText;
    }
  }

  if (window.tabula.getVersion) {
    const version = await window.tabula.getVersion();
    db._appVersion = version; 
    
    document.getElementById('app-version').innerText = `v${version}`;
    
    const updateVersionEl = document.getElementById('update-current-version');
    if (updateVersionEl) {
      updateVersionEl.innerText = `v${version}`;
    }
  }

  await refreshDataPathDisplay();

  if (window.tabula.getMissingPath) {
    const missing = await window.tabula.getMissingPath();
    if (missing) {
      document.getElementById('missing-file-modal')?.classList.add('active');
    }
  }

  initCustomSelects();
  renderBalanceCarousel();
  renderTransactions();
  renderPendingRecurrences();
}

document.getElementById('close-missing-file-btn')?.addEventListener('click', () => {
  document.getElementById('missing-file-modal')?.classList.remove('active');
});

function renderPendingRecurrences() {
  const panel = document.getElementById('recurrences-panel');
  const list = document.getElementById('recurrences-list');
  const countText = document.getElementById('recurrences-count-text');
  
  const pending = db.pending_recurrences || [];

  if (pending.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';

  const titleEl = panel.querySelector('.summary-text h3');
  const iconEl = panel.querySelector('.recurrences-summary .icon-illu');
  const footerEl = panel.querySelector('.recurrences-footer');

  if (pending.length === 1) {
    panel.classList.add('mode-single');
    titleEl.innerText = "Opération à valider";
    countText.innerText = "1 suggestion de récurrence à confirmer.";
    if (iconEl) iconEl.style.display = 'none';
    if (footerEl) footerEl.style.display = 'none';
  } else {
    panel.classList.remove('mode-single');
    titleEl.innerText = "Opérations à valider";
    countText.innerText = `${pending.length} suggestions de récurrences à confirmer.`;
    if (iconEl) iconEl.style.display = 'block';
    if (footerEl) footerEl.style.display = 'flex';
  }

  list.innerHTML = '';

  pending.forEach(item => {
    const isIncome = item.type === 'income';
    const sign = isIncome ? '+ ' : '- ';
    const amountClass = isIncome ? 'positive' : 'negative';
    
    const row = document.createElement('div');
    row.className = 'recurrence-row';

    row.innerHTML = `
      <div class="recurrence-info">
        <div class="recurrence-title" title="${item.payee || 'Sans description'}">
          ${item.payee || 'Sans description'}
        </div>
        <div class="recurrence-meta">${formatDate(item.date)}</div>
      </div>
      <div class="recurrence-amount ${amountClass}">
        ${sign}${formatMoney(item.amount_cents)}
      </div>
      <div class="recurrence-buttons">
        <button type="button" class="btn btn-square btn-ignore-single" title="Ignorer">
          <svg class="icon"><use href="icons.svg#icon-close"></use></svg>
        </button>
        <button type="button" class="btn btn-square btn-validate-single" title="Valider">
          <svg class="icon"><use href="icons.svg#icon-check"></use></svg>
        </button>
      </div>
    `;

    row.querySelector('.btn-ignore-single').addEventListener('click', async () => {
      db.pending_recurrences = db.pending_recurrences.filter(p => p.id !== item.id);
      
      await window.tabula.updatePendingRecurrences(db.pending_recurrences);
      
      renderPendingRecurrences();
    });

    row.querySelector('.btn-validate-single').addEventListener('click', async () => {
      const newTx = { ...item };
      delete newTx.recurrence_id;
      
      const saved = await window.tabula.addTransaction(newTx);
      
      db.transactions.unshift(saved);

      db.pending_recurrences = db.pending_recurrences.filter(p => p.id !== item.id);
      
      await window.tabula.updatePendingRecurrences(db.pending_recurrences);

      renderPendingRecurrences();
      renderTransactions();
      updateBalanceCarouselValues();
    });

    list.appendChild(row);
  });

  if (pending.length > 1) {
    document.getElementById('btn-ignore-all').onclick = async () => {
      db.pending_recurrences = [];
      await window.tabula.updatePendingRecurrences([]);
      renderPendingRecurrences();
    };

    document.getElementById('btn-validate-all').onclick = async () => {
      for (const item of pending) {
        const newTx = { ...item };
        delete newTx.recurrence_id;
        
        const saved = await window.tabula.addTransaction(newTx);
        db.transactions.unshift(saved);
      }
      
      db.pending_recurrences = [];
      await window.tabula.updatePendingRecurrences([]);
      
      renderPendingRecurrences();
      renderTransactions();
      updateBalanceCarouselValues();
    };
  }
}

loadApp();