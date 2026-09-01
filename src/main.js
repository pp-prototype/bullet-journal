import './style.css';
import { isSupabaseConfigured, supabase } from './supabase.js';
import { cancelPlan, fetchJournal, hasRecordedExecution, insertExecution, insertPlan, insertTask, updateTask, voidExecution } from './journalRepository.js';

const HOURS = Array.from({ length: 13 }, (_, index) => index + 8);
const STORAGE_KEY = 'grid-journal-v1';
const today = new Date();
const toLocalISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoToday = toLocalISO(today);

const defaultState = {
  tasks: [
    { id: crypto.randomUUID(), title: '주간 리포트 초안', dueDate: isoToday, status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: crypto.randomUUID(), title: '디자인 피드백 정리', dueDate: null, status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  plans: [],
  executions: [],
  modelVersion: 2,
};

let state;
try {
  state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
} catch {
  state = defaultState;
}
let localState = state;
let remoteRequestId = 0;
let activeRemoteUserId = null;

function normalizeState(raw) {
  if (!raw) return structuredClone(defaultState);
  if (raw.modelVersion === 2 && Array.isArray(raw.plans) && Array.isArray(raw.executions)) return raw;
  const tasks = (raw.tasks || []).map((task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.due ? `${task.due.slice(0, 4)}-${task.due.slice(4, 6)}-${task.due.slice(6, 8)}` : null,
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const plans = Object.entries(raw.plan || {}).flatMap(([hour, items]) => items.map((item) => ({
    id: crypto.randomUUID(),
    taskId: item.id,
    journalDate: isoToday,
    scheduledHour: Number(hour),
    titleSnapshot: item.title,
    status: 'planned',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  })));
  const planByLegacyTask = new Map(plans.map((plan) => [plan.taskId, plan]));
  const executions = Object.entries(raw.actual || {}).flatMap(([hour, logs]) => logs.map((log) => {
    const linkedPlan = log.sourcePlanId ? planByLegacyTask.get(log.sourcePlanId) : null;
    return {
      id: log.id,
      taskId: linkedPlan?.taskId || null,
      planId: linkedPlan?.id || null,
      journalDate: isoToday,
      executedAt: `${isoToday}T${String(hour).padStart(2, '0')}:00:00`,
      titleSnapshot: log.title,
      source: linkedPlan ? 'plan' : 'manual',
      status: 'recorded',
      createdAt: new Date().toISOString(),
      voidedAt: null,
    };
  }));
  return { tasks: tasks.length ? tasks : structuredClone(defaultState.tasks), plans, executions, modelVersion: 2 };
}

let selectedTaskId = null;
let editingTaskId = null;
let selectedDate = isoToday;
let calendarOpen = false;
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let authState = {
  loading: isSupabaseConfigured,
  user: null,
  modalOpen: false,
  mode: 'login',
  message: '',
  error: '',
  dataLoading: false,
};

const app = document.querySelector('#app');

function save() {
  if (authState.user) return;
  localState = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

async function loadRemoteJournal() {
  if (!authState.user) return;
  const requestId = ++remoteRequestId;
  authState = { ...authState, dataLoading: true };
  render();
  try {
    const remoteState = await fetchJournal(authState.user.id, selectedDate);
    if (requestId !== remoteRequestId) return;
    state = { ...remoteState, modelVersion: 2 };
    authState = { ...authState, dataLoading: false };
    render();
  } catch (error) {
    if (requestId !== remoteRequestId) return;
    console.error(error);
    authState = { ...authState, dataLoading: false };
    render();
    notify('서버 기록을 불러오지 못했어요. 테이블 설정을 확인해주세요.');
  }
}

async function performMutation(action, successMessage) {
  try {
    await action();
    save();
    render();
    if (successMessage) notify(successMessage);
    return true;
  } catch (error) {
    console.error(error);
    render();
    notify('저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    return false;
  }
}

function handleAuthUser(user) {
  const nextUserId = user?.id || null;
  authState = { ...authState, loading: false, user: user || null };
  if (nextUserId === activeRemoteUserId) {
    render();
    return;
  }
  activeRemoteUserId = nextUserId;
  remoteRequestId += 1;
  if (user) {
    state = { tasks: [], plans: [], executions: [], modelVersion: 2 };
    render();
    loadRemoteJournal();
  } else {
    state = localState;
    authState = { ...authState, dataLoading: false };
    render();
  }
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function hourLabel(hour) {
  if (hour === 12) return '오후 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}

function dueLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return `${Number(value.slice(5, 7))}월 ${Number(value.slice(8))}일`;
}

function dateFromISO(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function calendarMarkup() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const firstCell = new Date(year, month, 1 - mondayOffset);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    const iso = toLocalISO(date);
    const classes = [date.getMonth() !== month ? 'outside' : '', iso === isoToday ? 'today' : '', iso === selectedDate ? 'selected' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="calendar-day ${classes}" data-calendar-date="${iso}" aria-label="${iso}">${date.getDate()}</button>`;
  }).join('');
  return `<div class="calendar-panel" id="calendar-panel">
    <div class="calendar-head">
      <button type="button" data-calendar-prev aria-label="이전 달">←</button>
      <strong>${year}년 ${month + 1}월</strong>
      <button type="button" data-calendar-next aria-label="다음 달">→</button>
    </div>
    <div class="calendar-weekdays">${['월','화','수','목','금','토','일'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="calendar-days">${cells}</div>
    <button type="button" class="today-button" data-calendar-today>오늘로 돌아가기</button>
  </div>`;
}

function authMarkup() {
  if (!authState.modalOpen) return '';
  const signingUp = authState.mode === 'signup';
  return `<div class="auth-backdrop" data-close-auth>
    <section class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" class="auth-close" data-close-auth aria-label="닫기">×</button>
      <p class="eyebrow">PRIVATE JOURNAL</p>
      <h2 id="auth-title">${signingUp ? '계정 만들기' : '기록에 로그인'}</h2>
      <p class="auth-description">${signingUp ? '어디서든 같은 불릿저널을 이어서 기록하세요.' : '저장한 계획과 실행 기록을 다시 불러옵니다.'}</p>
      ${authState.error ? `<p class="auth-feedback error">${escapeHtml(authState.error)}</p>` : ''}
      ${authState.message ? `<p class="auth-feedback">${escapeHtml(authState.message)}</p>` : ''}
      <form class="auth-form" id="auth-form">
        <label>이메일<input type="email" name="email" autocomplete="email" required placeholder="name@example.com" /></label>
        <label>비밀번호<input type="password" name="password" autocomplete="${signingUp ? 'new-password' : 'current-password'}" minlength="6" required placeholder="6자 이상" /></label>
        <button type="submit">${signingUp ? '회원가입' : '로그인'}</button>
      </form>
      <button type="button" class="auth-switch" data-auth-mode="${signingUp ? 'login' : 'signup'}">
        ${signingUp ? '이미 계정이 있나요? 로그인' : '처음인가요? 계정 만들기'}
      </button>
    </section>
  </div>`;
}

function parseTask(input) {
  const value = input.trim();
  const dueMatch = value.match(/\s*\((\d{8})\)\s*$/);
  return {
    title: dueMatch ? value.slice(0, dueMatch.index).trim() : value,
    due: dueMatch?.[1] || '',
  };
}

function render() {
  const displayDate = dateFromISO(selectedDate);
  const shortDay = new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(displayDate);
  const plannedTaskIds = new Set(state.plans.filter((plan) => plan.journalDate === selectedDate && plan.status === 'planned').map((plan) => plan.taskId));
  const openTasks = state.tasks.filter((task) => task.status === 'open' && !plannedTaskIds.has(task.id));
  app.innerHTML = `
    <main class="page-shell">
      <header class="masthead">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">✣</span>
          <div>
            <p class="eyebrow">DAILY BULLET JOURNAL</p>
            <h1>오늘의 기록</h1>
          </div>
        </div>
        <div class="header-actions">
          ${authState.user ? `<div class="user-menu"><span>${escapeHtml(authState.user.email || '사용자')}</span><button type="button" id="logout-button">로그아웃</button></div>` : `<button type="button" class="login-button" id="login-button" ${!isSupabaseConfigured ? 'disabled' : ''}>${authState.loading ? '확인 중…' : '로그인'}</button>`}
          <div class="date-picker-wrap">
          <button type="button" class="date-stamp" id="date-picker-button" aria-expanded="${calendarOpen}" aria-controls="calendar-panel">
            <strong>${String(displayDate.getMonth() + 1).padStart(2, '0')} / ${String(displayDate.getDate()).padStart(2, '0')}</strong>
            <span>${displayDate.getFullYear()} · ${shortDay}</span>
          </button>
          ${calendarOpen ? calendarMarkup() : ''}
          </div>
        </div>
      </header>

      <section class="task-board" aria-labelledby="task-heading">
        <div class="section-heading">
          <div>
            <span class="section-no">01</span>
            <h2 id="task-heading">할 일 목록</h2>
          </div>
          <p>할 일을 시간표로 끌어다 놓으세요</p>
        </div>
        <form class="task-form" id="task-form">
          <span class="prompt">＋</span>
          <input id="task-input" autocomplete="off" placeholder="새 할 일 (마감일 YYYYMMDD)" aria-label="새 할 일" />
          <button type="submit">추가</button>
        </form>
        <div class="task-list" id="task-list">
          ${openTasks.length ? openTasks.map((task) => editingTaskId === task.id ? `
            <form class="task-card task-edit-card" data-edit-form="${task.id}">
              <span class="edit-mark" aria-hidden="true">✎</span>
              <input value="${escapeHtml(`${task.title}${task.dueDate ? ` (${task.dueDate.replaceAll('-', '')})` : ''}`)}" aria-label="할 일과 마감일 수정" />
              <button type="submit">저장</button>
              <button type="button" data-cancel-edit>취소</button>
            </form>` : `
            <article class="task-card ${selectedTaskId === task.id ? 'selected' : ''}" draggable="true" data-task-id="${task.id}" tabindex="0">
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${escapeHtml(task.title)}</strong>${task.dueDate ? `<small>마감 · ${dueLabel(task.dueDate)}</small>` : '<small>기한 없음</small>'}</span>
              <button class="edit-task" type="button" data-edit="${task.id}" aria-label="할 일 수정">수정</button>
              <button class="remove-task" type="button" data-remove="${task.id}" aria-label="할 일 삭제">×</button>
            </article>`).join('') : '<p class="empty-tasks">목록이 비어 있어요. 오늘 할 일을 하나 적어보세요.</p>'}
        </div>
        <p class="mobile-hint">모바일에서는 할 일을 누른 다음 계획 시간대를 선택하세요.</p>
      </section>

      <section class="journal" aria-labelledby="journal-heading">
        <div class="section-heading journal-heading">
          <div>
            <span class="section-no">02</span>
            <h2 id="journal-heading">타임라인</h2>
          </div>
          <div class="legend"><span><i class="plan-dot"></i> 계획</span><span><i class="actual-dot"></i> 실행</span></div>
        </div>
        <div class="timeline-grid">
          <div class="column-title"><span>PLAN</span><strong>오늘의 계획</strong></div>
          <div class="column-title actual-title"><span>LOG</span><strong>실제 실행</strong></div>
          ${HOURS.map((hour) => timeRow(hour)).join('')}
        </div>
      </section>
      <footer><span>Keep the day, one square at a time.</span><span>${selectedDate.replaceAll('-', '.')}</span></footer>
    </main>
    <div class="toast" role="status" aria-live="polite"></div>
    ${authMarkup()}
  `;
  bindEvents();
}

function timeRow(hour) {
  const plans = state.plans.filter((plan) => plan.journalDate === selectedDate && plan.scheduledHour === hour);
  const logs = state.executions.filter((log) => log.journalDate === selectedDate && new Date(log.executedAt).getHours() === hour);
  const activePlans = plans.filter((plan) => plan.status === 'planned');
  return `
    <div class="time-label">${hourLabel(hour)}<small>${String(hour).padStart(2, '0')}:00</small></div>
    <div class="time-cell plan-cell" data-hour="${hour}">
      ${plans.map((item) => {
        const committed = state.executions.some((log) => log.planId === item.id && log.status === 'recorded');
        const cancelled = item.status === 'cancelled';
        return `<div class="plan-item ${committed ? 'committed' : ''} ${cancelled ? 'cancelled' : ''}">
          <label>${cancelled ? '<span class="status-mark">–</span>' : `<input type="checkbox" data-commit="${item.id}" ${committed ? 'checked disabled' : ''} />`}<span>${escapeHtml(item.titleSnapshot)}</span></label>
          ${cancelled ? '<small class="history-state">취소된 계획</small>' : `<button type="button" class="cancel-action" data-cancel-plan="${item.id}">계획 취소</button>`}
        </div>`;
      }).join('')}
      ${!activePlans.length ? '<button class="cell-placeholder" type="button">+ 계획 배치</button>' : ''}
    </div>
    <div class="time-cell actual-cell" data-actual-hour="${hour}">
      ${logs.map((log) => {
        const voided = log.status === 'voided';
        const executedTime = new Date(log.executedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `<div class="actual-item ${voided ? 'voided' : ''}"><span class="check-mark">${voided ? '–' : '✓'}</span><span><strong>${escapeHtml(log.titleSnapshot)}</strong><small>${executedTime}${log.source === 'plan' ? ' · 계획에서 실행' : ' · 직접 기록'}</small></span>${voided ? '<small class="history-state">실행 취소</small>' : `<button type="button" class="cancel-action" data-remove-log="${log.id}">실행 취소</button>`}</div>`;
      }).join('')}
      <form class="quick-log" data-log-form="${hour}"><input placeholder="실행 내용 기록" aria-label="${hourLabel(hour)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`;
}

function notify(message) {
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

async function addPlan(taskId, hour) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (state.plans.some((plan) => plan.taskId === taskId && plan.journalDate === selectedDate && plan.status === 'planned')) return notify('이미 오늘 계획에 배치된 할 일이에요.');
  const draft = {
    id: crypto.randomUUID(), taskId: task.id, journalDate: selectedDate, scheduledHour: Number(hour),
    titleSnapshot: task.title, status: 'planned', createdAt: new Date().toISOString(), cancelledAt: null,
  };
  if (authState.user) {
    const success = await performMutation(async () => {
      state.plans.push(await insertPlan(authState.user.id, draft));
    });
    if (!success) return;
  } else {
    state.plans.push(draft);
  }
  selectedTaskId = null;
  save(); render(); notify(`${hourLabel(Number(hour))}에 배치했어요.`);
}

function bindEvents() {
  document.querySelector('#login-button')?.addEventListener('click', () => {
    authState = { ...authState, modalOpen: true, error: '', message: '' };
    render();
    document.querySelector('#auth-form input')?.focus();
  });

  document.querySelector('#logout-button')?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) notify('로그아웃하지 못했어요. 다시 시도해주세요.');
  });

  document.querySelectorAll('[data-close-auth]').forEach((element) => element.addEventListener('click', (event) => {
    if (event.currentTarget.classList.contains('auth-backdrop') && event.target !== event.currentTarget) return;
    authState = { ...authState, modalOpen: false, error: '', message: '' };
    render();
  }));

  document.querySelector('[data-auth-mode]')?.addEventListener('click', (event) => {
    authState = { ...authState, mode: event.currentTarget.dataset.authMode, error: '', message: '' };
    render();
    document.querySelector('#auth-form input')?.focus();
  });

  document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = '처리 중…';
    const credentials = { email: data.get('email').trim(), password: data.get('password') };
    const result = authState.mode === 'signup'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    if (result.error) {
      authState = { ...authState, error: authErrorMessage(result.error.message), message: '' };
    } else if (authState.mode === 'signup' && !result.data.session) {
      authState = { ...authState, error: '', message: '확인 이메일을 보냈습니다. 인증 후 로그인해주세요.' };
    } else {
      authState = { ...authState, modalOpen: false, error: '', message: '' };
    }
    render();
  });

  document.querySelector('#date-picker-button').addEventListener('click', () => {
    calendarOpen = !calendarOpen;
    render();
  });

  document.querySelector('[data-calendar-prev]')?.addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    render();
  });
  document.querySelector('[data-calendar-next]')?.addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    render();
  });
  document.querySelector('[data-calendar-today]')?.addEventListener('click', () => {
    selectedDate = isoToday;
    calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    calendarOpen = false;
    render();
    if (authState.user) loadRemoteJournal();
  });
  document.querySelectorAll('[data-calendar-date]').forEach((button) => button.addEventListener('click', () => {
    selectedDate = button.dataset.calendarDate;
    const chosen = dateFromISO(selectedDate);
    calendarMonth = new Date(chosen.getFullYear(), chosen.getMonth(), 1);
    calendarOpen = false;
    render();
    if (authState.user) loadRemoteJournal();
  }));

  if (calendarOpen) {
    setTimeout(() => document.addEventListener('click', closeCalendarOnOutside, { once: true }), 0);
  }

  document.querySelector('#task-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#task-input');
    const parsed = parseTask(input.value);
    if (!parsed.title) return;
    if (parsed.due && !/^\d{8}$/.test(parsed.due)) return notify('마감일은 YYYYMMDD 형식으로 적어주세요.');
    const timestamp = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(), title: parsed.title,
      dueDate: parsed.due ? `${parsed.due.slice(0, 4)}-${parsed.due.slice(4, 6)}-${parsed.due.slice(6, 8)}` : null,
      status: 'open', createdAt: timestamp, updatedAt: timestamp,
    };
    if (authState.user) {
      const success = await performMutation(async () => {
        state.tasks.unshift(await insertTask(authState.user.id, draft));
      });
      if (!success) return;
    } else {
      state.tasks.unshift(draft);
    }
    save(); render();
  });

  document.querySelectorAll('.task-card[data-task-id]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.taskId);
      event.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      selectedTaskId = selectedTaskId === card.dataset.taskId ? null : card.dataset.taskId;
      render();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectedTaskId = card.dataset.taskId; render(); }
    });
  });

  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
    const taskId = button.dataset.remove;
    if (authState.user) {
      await performMutation(async () => {
        const updated = await updateTask(taskId, { status: 'archived' });
        state.tasks = state.tasks.map((task) => task.id === taskId ? updated : task);
      });
    } else {
      state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, status: 'archived', updatedAt: new Date().toISOString() } : task);
      save(); render();
    }
  }));

  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
    editingTaskId = button.dataset.edit;
    selectedTaskId = null;
    render();
    const input = document.querySelector('[data-edit-form] input');
    input?.focus();
    input?.select();
  }));

  document.querySelectorAll('[data-edit-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const parsed = parseTask(form.querySelector('input').value);
      if (!parsed.title) return notify('할 일 내용을 입력해주세요.');
      const taskId = form.dataset.editForm;
      const changes = { title: parsed.title, dueDate: parsed.due ? `${parsed.due.slice(0, 4)}-${parsed.due.slice(4, 6)}-${parsed.due.slice(6, 8)}` : null };
      if (authState.user) {
        const success = await performMutation(async () => {
          const updated = await updateTask(taskId, changes);
          state.tasks = state.tasks.map((task) => task.id === taskId ? updated : task);
        });
        if (!success) return;
      } else {
        state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, ...changes, updatedAt: new Date().toISOString() } : task);
      }
      editingTaskId = null;
      save(); render(); notify('할 일을 수정했어요.');
    });
    form.querySelector('input').addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { editingTaskId = null; render(); }
    });
  });

  document.querySelectorAll('[data-cancel-edit]').forEach((button) => button.addEventListener('click', () => {
    editingTaskId = null;
    render();
  }));

  document.querySelectorAll('.plan-cell').forEach((cell) => {
    cell.addEventListener('dragover', (event) => { event.preventDefault(); cell.classList.add('drop-ready'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-ready'));
    cell.addEventListener('drop', (event) => { event.preventDefault(); addPlan(event.dataTransfer.getData('text/plain'), cell.dataset.hour); });
    cell.querySelector('.cell-placeholder')?.addEventListener('click', () => {
      if (selectedTaskId) addPlan(selectedTaskId, cell.dataset.hour);
      else notify('먼저 위에서 할 일을 선택해주세요.');
    });
  });

  document.querySelectorAll('[data-commit]').forEach((checkbox) => checkbox.addEventListener('change', async () => {
    if (!checkbox.checked) return;
    const item = state.plans.find((plan) => plan.id === checkbox.dataset.commit && plan.status === 'planned');
    if (!item) return;
    const now = new Date();
    const executionHour = Math.min(HOURS.at(-1), Math.max(HOURS[0], now.getHours()));
    const executedAt = `${selectedDate}T${String(executionHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const draft = {
      id: crypto.randomUUID(), taskId: item.taskId, planId: item.id, journalDate: selectedDate,
      executedAt, titleSnapshot: item.titleSnapshot, source: 'plan', status: 'recorded',
      createdAt: now.toISOString(), voidedAt: null,
    };
    if (authState.user) {
      const success = await performMutation(async () => {
        state.executions.push(await insertExecution(authState.user.id, draft));
        const updatedTask = await updateTask(item.taskId, { status: 'completed' });
        state.tasks = state.tasks.map((task) => task.id === item.taskId ? updatedTask : task);
      });
      if (!success) return;
    } else {
      state.executions.push(draft);
      state.tasks = state.tasks.map((task) => task.id === item.taskId ? { ...task, status: 'completed', updatedAt: now.toISOString() } : task);
    }
    save(); setTimeout(() => { render(); notify('실행 내역에 커밋했어요.'); }, 180);
  }));

  document.querySelectorAll('[data-cancel-plan]').forEach((button) => button.addEventListener('click', async () => {
    const planId = button.dataset.cancelPlan;
    if (authState.user) {
      await performMutation(async () => {
        const updated = await cancelPlan(planId);
        state.plans = state.plans.map((plan) => plan.id === planId ? updated : plan);
        const updatedTask = await updateTask(updated.taskId, { status: 'open' });
        state.tasks = state.tasks.map((task) => task.id === updated.taskId ? updatedTask : task);
      }, '할 일 목록으로 되돌렸어요.');
    } else {
      const target = state.plans.find((plan) => plan.id === planId);
      state.plans = state.plans.map((plan) => plan.id === planId ? { ...plan, status: 'cancelled', cancelledAt: new Date().toISOString() } : plan);
      state.tasks = state.tasks.map((task) => task.id === target?.taskId ? { ...task, status: 'open', updatedAt: new Date().toISOString() } : task);
      save(); render(); notify('할 일 목록으로 되돌렸어요.');
    }
  }));

  document.querySelectorAll('[data-log-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    if (!input.value.trim()) return;
    const hour = form.dataset.logForm;
    const timestamp = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(), taskId: null, planId: null, journalDate: selectedDate,
      executedAt: `${selectedDate}T${String(hour).padStart(2, '0')}:00:00`, titleSnapshot: input.value.trim(),
      source: 'manual', status: 'recorded', createdAt: timestamp, voidedAt: null,
    };
    if (authState.user) {
      const success = await performMutation(async () => {
        state.executions.push(await insertExecution(authState.user.id, draft));
      });
      if (!success) return;
    } else {
      state.executions.push(draft);
    }
    save(); render();
  }));

  document.querySelectorAll('[data-remove-log]').forEach((button) => button.addEventListener('click', async () => {
    const executionId = button.dataset.removeLog;
    if (authState.user) {
      await performMutation(async () => {
        const updated = await voidExecution(executionId);
        state.executions = state.executions.map((log) => log.id === executionId ? updated : log);
        if (updated.taskId && !await hasRecordedExecution(updated.taskId)) {
          const updatedTask = await updateTask(updated.taskId, { status: 'open' });
          state.tasks = state.tasks.map((task) => task.id === updated.taskId ? updatedTask : task);
        }
      });
    } else {
      const target = state.executions.find((log) => log.id === executionId);
      state.executions = state.executions.map((log) => log.id === executionId ? { ...log, status: 'voided', voidedAt: new Date().toISOString() } : log);
      const stillRecorded = target?.taskId && state.executions.some((log) => log.taskId === target.taskId && log.status === 'recorded');
      if (target?.taskId && !stillRecorded) {
        state.tasks = state.tasks.map((task) => task.id === target.taskId ? { ...task, status: 'open', updatedAt: new Date().toISOString() } : task);
      }
      save(); render();
    }
  }));
}

function authErrorMessage(message) {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호를 확인해주세요.';
  if (/user already registered/i.test(message)) return '이미 가입된 이메일입니다.';
  if (/email not confirmed/i.test(message)) return '이메일 인증을 먼저 완료해주세요.';
  if (/password/i.test(message) && /characters|least/i.test(message)) return '비밀번호는 6자 이상이어야 합니다.';
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function closeCalendarOnOutside(event) {
  if (event.target.closest('.date-picker-wrap')) return;
  calendarOpen = false;
  render();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && authState.modalOpen) {
    authState = { ...authState, modalOpen: false, error: '', message: '' };
    render();
    return;
  }
  if (event.key === 'Escape' && calendarOpen && !editingTaskId) {
    calendarOpen = false;
    render();
  }
});

render();

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    handleAuthUser(data.session?.user || null);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthUser(session?.user || null);
  });
}
