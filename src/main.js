import './style.css';
import { isSupabaseConfigured, supabase } from './supabase.js';
import { cancelPlan, fetchJournal, hasRecordedExecution, insertExecution, insertPlan, insertTask, updateTask, voidExecution } from './journalRepository.js';

const HOURS = Array.from({ length: 13 }, (_, index) => index + 8);
const STORAGE_KEY = 'grid-journal-v1';
const JOURNAL_TIME_ZONE = 'Asia/Seoul';

function koreanClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JOURNAL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(value.year), month: Number(value.month), day: Number(value.day),
    hour: Number(value.hour), minute: Number(value.minute), second: Number(value.second),
  };
}

function koreanHour(dateValue) {
  return koreanClock(new Date(dateValue)).hour;
}

const initialKoreanClock = koreanClock();
const today = new Date(initialKoreanClock.year, initialKoreanClock.month - 1, initialKoreanClock.day);
const toLocalISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoToday = `${initialKoreanClock.year}-${String(initialKoreanClock.month).padStart(2, '0')}-${String(initialKoreanClock.day).padStart(2, '0')}`;

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
      executedAt: `${isoToday}T${String(hour).padStart(2, '0')}:00:00+09:00`,
      titleSnapshot: log.title,
      source: linkedPlan ? 'plan' : 'manual',
      status: 'recorded',
      createdAt: new Date().toISOString(),
      voidedAt: null,
    };
  }));
  return { tasks: tasks.length ? tasks : structuredClone(defaultState.tasks), plans, executions, modelVersion: 2 };
}

const pendingPlans = new Set();
let toastTimer;
let selectedTaskId = null;
let editingTaskId = null;
let selectedDate = isoToday;
let calendarOpen = false;
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let draggingTaskId = null;
let dragScrollFrame = null;
let dragScrollSpeed = 0;
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

function timelineHours() {
  const hours = new Set(HOURS);
  state.plans
    .filter((plan) => plan.journalDate === selectedDate)
    .forEach((plan) => hours.add(plan.scheduledHour));
  state.executions
    .filter((log) => log.journalDate === selectedDate && log.status === 'recorded')
    .forEach((log) => hours.add(koreanHour(log.executedAt)));
  return [...hours].sort((a, b) => a - b);
}

// Folder preview metadata stays on this browser, isolated by account.
function folderStorageKey() {
  return `grid-journal-folders-v1:${authState.user?.id || 'guest'}`;
}

function readFolders() {
  try {
    const value = JSON.parse(localStorage.getItem(folderStorageKey()));
    if (Array.isArray(value?.folders) && value.assignments && typeof value.assignments === 'object') return value;
  } catch { /* Start empty when stored preview data cannot be read. */ }
  return { folders: [], assignments: {} };
}

function saveFolders(workspace, key = folderStorageKey()) {
  try {
    localStorage.setItem(key, JSON.stringify(workspace));
    return true;
  } catch {
    notify('폴더를 저장하지 못했어요. 브라우저 저장 공간을 확인해주세요.');
    return false;
  }
}

function moveTaskToFolder(taskId, folderId, offerUndo = true) {
  const storageKey = folderStorageKey();
  const workspace = readFolders();
  if (!state.tasks.some((task) => task.id === taskId && task.status === 'open')) return;
  if (folderId && !workspace.folders.some((folder) => folder.id === folderId)) return;
  if ((workspace.assignments[taskId] || '') === folderId) return;
  const previousFolderId = workspace.assignments[taskId] || '';
  if (folderId) workspace.assignments[taskId] = folderId;
  else delete workspace.assignments[taskId];
  if (!saveFolders(workspace)) return;
  selectedTaskId = null;
  render();
  const folderName = workspace.folders.find((folder) => folder.id === folderId)?.name || '미분류';
  notify(`${folderName}(으)로 옮겼어요.`, offerUndo ? () => {
    if (folderStorageKey() === storageKey) moveTaskToFolder(taskId, previousFolderId, false);
  } : undefined);
}

function folderOptions(folders, selected = '') {
  return `<option value="">미분류</option>${folders.map((folder) => `<option value="${folder.id}" ${folder.id === selected ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}`;
}

function taskCards(tasks) {
  const workspace = readFolders();
  const destinations = [{ id: '', name: '미분류' }, ...workspace.folders];
  return `          ${tasks.length ? tasks.map((task) => editingTaskId === task.id ? `
            <form class="task-card task-edit-card" data-edit-form="${task.id}">
              <span class="edit-mark" aria-hidden="true">✎</span>
              <input value="${escapeHtml(`${task.title}${task.dueDate ? ` (${task.dueDate.replaceAll('-', '')})` : ''}`)}" aria-label="할 일과 마감일 수정" />
              <button type="submit">저장</button>
              <button type="button" data-cancel-edit>취소</button>
            </form>` : `
            <article class="task-card ${selectedTaskId === task.id ? 'selected' : ''}" draggable="true" data-task-id="${task.id}" tabindex="0">
              <div class="time-flags" role="group" aria-label="시간 계획 및 폴더 분류">
                ${[9, 13, 15].map((hour) => `<button type="button" class="time-flag" data-plan-task="${task.id}" data-plan-hour="${hour}" aria-label="${escapeHtml(task.title)}: ${selectedDate} ${hourLabel(hour)}에 계획">${String(hour).padStart(2, '0')}시</button>`).join('')}
                <button type="button" class="time-flag time-flag-more" data-time-picker="${task.id}" aria-label="다른 계획 시간 선택" aria-expanded="false" aria-controls="time-picker-${task.id}">＋</button>
                <button type="button" class="time-flag folder-flag" data-folder-picker="${task.id}" aria-label="${escapeHtml(task.title)} 폴더 분류" aria-expanded="false" aria-controls="folder-picker-${task.id}">폴더</button>
                <button type="button" class="time-flag due-flag" data-due-picker="${task.id}" aria-label="${escapeHtml(task.title)} 마감 기한 설정" aria-expanded="false" aria-controls="due-picker-${task.id}">D</button>
              </div>
              <div class="due-picker" id="due-picker-${task.id}" role="group" aria-label="마감 기한 설정" hidden>
                <p>마감 기한 설정</p>
                <div class="due-options">${[['24', '24시간 이내'], ['48', '48시간 이내'], ['week', '이번 주 이내'], ['month', '이번 달 이내']].map(([value, label]) => `<button type="button" data-due-task="${task.id}" data-due-option="${value}">${label}</button>`).join('')}</div>
                <button type="button" data-custom-due aria-expanded="false" aria-controls="due-form-${task.id}">시간 직접 설정</button>
                <form id="due-form-${task.id}" data-due-form="${task.id}" hidden>
                  <label>마감 날짜<input name="due" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required placeholder="YYYYMMDD" value="${task.dueDate ? task.dueDate.replaceAll('-', '') : ''}" /></label>
                  <button type="submit">설정</button>
                </form>
                <small>한국 시간 기준 · 날짜 단위로 저장돼요.</small>
              </div>
              <div class="folder-picker" id="folder-picker-${task.id}" role="group" aria-label="이동할 폴더" hidden>
                <p>이동할 폴더</p>
                <div class="folder-picker-options">${destinations.map((folder) => {
                  const current = (workspace.folders.some((item) => item.id === workspace.assignments[task.id]) ? workspace.assignments[task.id] : '') === folder.id;
                  return `<button type="button" data-classify-task="${task.id}" data-destination="${folder.id}" ${current ? 'disabled aria-current="true"' : ''}>${escapeHtml(folder.name)}${current ? ' · 현재' : ''}</button>`;
                }).join('')}</div>
                ${workspace.folders.length ? '' : '<small>새 폴더를 만들면 여기에 표시돼요.</small>'}
              </div>
              <div class="time-picker" id="time-picker-${task.id}" hidden>
                <p>${selectedDate} · 계획 시간</p>
                <div>${Array.from({ length: 24 }, (_, hour) => `<button type="button" data-plan-task="${task.id}" data-plan-hour="${hour}">${String(hour).padStart(2, '0')}시</button>`).join('')}</div>
              </div>
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${escapeHtml(task.title)}</strong>${task.dueDate ? `<small class="task-due">마감 · ${dueLabel(task.dueDate)}</small>` : '<small>기한 없음</small>'}</span>
              <button class="edit-task" type="button" data-edit="${task.id}" aria-label="할 일 수정">수정</button>
              <button class="remove-task" type="button" data-remove="${task.id}" aria-label="할 일 삭제">×</button>
            </article>`).join('') : '<p class="empty-tasks">표시할 할 일이 없어요.</p>'}`;
}

function render() {
  const workspace = readFolders();
  const folders = workspace.folders;
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
          <p>할 일을 폴더나 시간표로 끌어다 놓으세요</p>
        </div>
        <details class="folder-creator">
          <summary>＋ 새 폴더</summary>
          <form id="folder-form">
            <input name="folderName" maxlength="60" required placeholder="폴더 이름" aria-label="새 폴더 이름" autocomplete="off" />
            <button type="submit">만들기</button>
          </form>
        </details>
        <p class="folder-preview-note">폴더는 이 브라우저에 저장됩니다.</p>
        <form class="task-form" id="task-form">
          <span class="prompt">＋</span>
          ${folders.length ? `<select id="new-task-folder" aria-label="새 할 일 폴더">${folderOptions(folders)}</select>` : ''}
          <input id="task-input" autocomplete="off" placeholder="새 할 일 (마감일 YYYYMMDD)" aria-label="새 할 일" />
          <button type="submit">추가</button>
        </form>
        <div class="folder-grid" aria-label="폴더 목록">
          <details class="task-folder" data-unfiled-folder data-folder-drop="" ${workspace.unfiledCollapsed === false ? 'open' : ''}>
            <summary><span>미분류</span><small>남은 ${state.tasks.filter((task) => task.status === 'open' && !folders.some((folder) => folder.id === workspace.assignments[task.id])).length}</small></summary>
            <div class="task-list" id="task-list">
              ${taskCards(openTasks.filter((task) => !folders.some((folder) => folder.id === workspace.assignments[task.id])))}
            </div>
          </details>
          ${folders.map((folder) => `<details class="task-folder" data-folder="${folder.id}" data-folder-drop="${folder.id}" ${folder.collapsed ? '' : 'open'}>
            <summary><span>${escapeHtml(folder.name)}</span><small>남은 ${state.tasks.filter((task) => task.status === 'open' && workspace.assignments[task.id] === folder.id).length}</small></summary>
            <div class="task-list">${taskCards(openTasks.filter((task) => workspace.assignments[task.id] === folder.id))}</div>
          </details>`).join('')}
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
          ${timelineHours().map((hour) => timeRow(hour)).join('')}
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
  const logs = state.executions.filter((log) => log.journalDate === selectedDate && log.status === 'recorded' && koreanHour(log.executedAt) === hour);
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
        const executedTime = new Date(log.executedAt).toLocaleTimeString('ko-KR', { timeZone: JOURNAL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
        return `<div class="actual-item"><span class="check-mark">✓</span><span><strong>${escapeHtml(log.titleSnapshot)}</strong><small>${executedTime}${log.source === 'plan' ? ' · 계획에서 실행' : ' · 직접 기록'}</small></span><button type="button" class="cancel-action" data-remove-log="${log.id}">실행 취소</button></div>`;
      }).join('')}
      <form class="quick-log" data-log-form="${hour}"><input placeholder="실행 내용 기록" aria-label="${hourLabel(hour)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`;
}

function notify(message, undo) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '되돌리기';
    button.addEventListener('click', async () => {
      button.disabled = true;
      clearTimeout(toastTimer);
      await undo();
    }, { once: true });
    toast.append(button);
  }
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), undo ? 8000 : 1800);
}

async function undoPlanPlacement(planId) {
  const plan = state.plans.find((item) => item.id === planId && item.status === 'planned');
  if (!plan) return;
  if (state.executions.some((log) => log.planId === planId && log.status === 'recorded')) return notify('이미 실행한 계획이에요.');
  await performMutation(async () => {
    const updated = authState.user ? await cancelPlan(planId) : { ...plan, status: 'cancelled', cancelledAt: new Date().toISOString() };
    state.plans = state.plans.map((item) => item.id === planId ? updated : item);
  }, '계획 배치를 되돌렸어요.');
}

async function addPlan(taskId, hour) {
  const task = state.tasks.find((item) => item.id === taskId && item.status === 'open');
  const scheduledHour = Number(hour);
  if (!task || !Number.isInteger(scheduledHour) || scheduledHour < 0 || scheduledHour > 23) return;
  const journalDate = selectedDate;
  const userId = authState.user?.id;
  const key = `${userId || 'guest'}:${journalDate}:${taskId}`;
  if (pendingPlans.has(key)) return;
  if (state.plans.some((plan) => plan.taskId === taskId && plan.journalDate === journalDate && plan.status === 'planned')) return notify('이미 선택한 날짜의 계획에 배치된 할 일이에요.');
  const draft = {
    id: crypto.randomUUID(), taskId: task.id, journalDate, scheduledHour,
    titleSnapshot: task.title, status: 'planned', createdAt: new Date().toISOString(), cancelledAt: null,
  };
  pendingPlans.add(key);
  try {
    const created = userId ? await insertPlan(userId, draft) : draft;
    if (authState.user?.id !== userId || selectedDate !== journalDate) return;
    state.plans.push(created);
    selectedTaskId = null;
    save(); render();
    notify(`${journalDate} ${hourLabel(scheduledHour)}에 배치했어요.`, () => undoPlanPlacement(created.id));
  } catch (error) {
    console.error(error);
    notify('계획을 저장하지 못했어요. 다시 시도해주세요.');
  } finally {
    pendingPlans.delete(key);
  }
}

function parseDueDate(value) {
  if (!/^[0-9]{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (year < 1000) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function presetDueDate(option, now = new Date()) {
  const clock = koreanClock(now);
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day));
  if (option === '24' || option === '48') date.setUTCDate(date.getUTCDate() + Number(option) / 24);
  else if (option === 'week') date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7);
  else if (option === 'month') date.setUTCMonth(date.getUTCMonth() + 1, 0);
  else return null;
  return date.toISOString().slice(0, 10);
}

const pendingDueUpdates = new Set();
async function setTaskDueDate(taskId, dueDate) {
  if (!dueDate || pendingDueUpdates.has(taskId)) return;
  const userId = authState.user?.id;
  pendingDueUpdates.add(taskId);
  try {
    const updated = userId ? await updateTask(taskId, { dueDate }) : null;
    if (authState.user?.id !== userId) return;
    state.tasks = state.tasks.map((task) => task.id === taskId ? (updated || { ...task, dueDate, updatedAt: new Date().toISOString() }) : task);
    save(); render(); notify(`마감 기한을 ${dueDate}로 설정했어요.`);
  } catch (error) {
    console.error(error);
    notify('마감 기한을 저장하지 못했어요. 다시 시도해주세요.');
  } finally {
    pendingDueUpdates.delete(taskId);
  }
}

function closeTaskPickers() {
  document.querySelectorAll('.time-picker, .folder-picker, .due-picker').forEach((picker) => { picker.hidden = true; });
  document.querySelectorAll('[data-time-picker], [data-folder-picker], [data-due-picker]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.time-picker, .folder-picker, .due-picker, [data-time-picker], [data-folder-picker], [data-due-picker]')) closeTaskPickers();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const trigger = document.querySelector('[data-time-picker][aria-expanded="true"], [data-folder-picker][aria-expanded="true"], [data-due-picker][aria-expanded="true"]');
  closeTaskPickers();
  trigger?.focus();
});

function bindEvents() {
  document.querySelectorAll('[data-due-task]').forEach((button) => button.addEventListener('click', () => {
    setTaskDueDate(button.dataset.dueTask, presetDueDate(button.dataset.dueOption));
  }));
  document.querySelectorAll('[data-custom-due]').forEach((button) => button.addEventListener('click', () => {
    const form = document.getElementById(button.getAttribute('aria-controls'));
    form.hidden = !form.hidden;
    button.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) form.elements.due.focus();
  }));
  document.querySelectorAll('[data-due-form]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const dueDate = parseDueDate(form.elements.due.value.trim());
    if (!dueDate) { notify('실제 존재하는 날짜를 YYYYMMDD 형식으로 입력해주세요.'); form.elements.due.focus(); return; }
    setTaskDueDate(form.dataset.dueForm, dueDate);
  }));
  document.querySelectorAll('[data-classify-task]').forEach((button) => button.addEventListener('click', () => {
    moveTaskToFolder(button.dataset.classifyTask, button.dataset.destination);
  }));
  document.querySelectorAll('[data-plan-task]').forEach((button) => button.addEventListener('click', () => {
    addPlan(button.dataset.planTask, button.dataset.planHour);
  }));
  document.querySelectorAll('[data-time-picker], [data-folder-picker], [data-due-picker]').forEach((button) => button.addEventListener('click', () => {
    const picker = document.getElementById(button.getAttribute('aria-controls'));
    const opening = picker.hidden;
    closeTaskPickers();
    picker.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) picker.querySelector('button:not(:disabled)')?.focus();
  }));
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

  document.querySelector('#folder-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.folderName;
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const workspace = readFolders();
    if (workspace.folders.some((folder) => folder.name === name)) return notify('같은 이름의 폴더가 있어요.');
    const id = crypto.randomUUID();
    workspace.folders.push({ id, name, collapsed: false });
    if (!saveFolders(workspace)) return;
    render();
    document.querySelector('#new-task-folder').value = id;
    document.querySelector('#task-input').focus();
  });
  document.querySelector('[data-unfiled-folder]').addEventListener('toggle', (event) => {
    const details = event.currentTarget;
    if (!details.isConnected) return;
    const workspace = readFolders();
    if ((workspace.unfiledCollapsed !== false) === !details.open) return;
    workspace.unfiledCollapsed = !details.open;
    saveFolders(workspace);
  });
  document.querySelectorAll('[data-folder]').forEach((details) => details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    const workspace = readFolders();
    const folder = workspace.folders.find((item) => item.id === details.dataset.folder);
    if (!folder || folder.collapsed === !details.open) return;
    folder.collapsed = !details.open;
    saveFolders(workspace);
  }));
  document.querySelectorAll('[data-folder-drop]').forEach((target) => {
    target.addEventListener('dragover', (event) => {
      if (!draggingTaskId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      target.classList.add('folder-drop-ready');
    });
    target.addEventListener('dragleave', (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove('folder-drop-ready');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      const taskId = draggingTaskId;
      target.classList.remove('folder-drop-ready');
      if (!taskId || event.dataTransfer.getData('text/plain') !== taskId) return;
      const folderId = target.dataset.folderDrop;
      stopDragScroll();
      moveTaskToFolder(taskId, folderId);
    });
  });

  document.querySelector('#task-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#task-input');
    const parsed = parseTask(input.value);
    if (!parsed.title) return;
    if (parsed.due && !/^\d{8}$/.test(parsed.due)) return notify('마감일은 YYYYMMDD 형식으로 적어주세요.');
    const folderId = document.querySelector('#new-task-folder')?.value || '';
    const storageKey = folderStorageKey();
    let createdTask;
    const timestamp = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(), title: parsed.title,
      dueDate: parsed.due ? `${parsed.due.slice(0, 4)}-${parsed.due.slice(4, 6)}-${parsed.due.slice(6, 8)}` : null,
      status: 'open', createdAt: timestamp, updatedAt: timestamp,
    };
    if (authState.user) {
      const success = await performMutation(async () => {
        createdTask = await insertTask(authState.user.id, draft);
        state.tasks.unshift(createdTask);
      });
      if (!success) return;
    } else {
      createdTask = draft;
      state.tasks.unshift(draft);
    }
    if (folderId && folderStorageKey() === storageKey) {
      const workspace = readFolders();
      workspace.assignments[createdTask.id] = folderId;
      saveFolders(workspace, storageKey);
    }
    save(); render();
    const folderSelect = document.querySelector('#new-task-folder');
    if (folderSelect) folderSelect.value = folderId;
  });

  document.querySelectorAll('.task-card[data-task-id]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      if (event.target.closest('button, input, .time-picker, .folder-picker, .due-picker')) { event.preventDefault(); return; }
      closeTaskPickers();
      draggingTaskId = card.dataset.taskId;
      event.dataTransfer.setData('text/plain', card.dataset.taskId);
      event.dataTransfer.effectAllowed = 'copyMove';
      card.classList.add('dragging');
      document.body.classList.add('is-dragging-task');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      stopDragScroll();
    });
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, select, .time-picker, .folder-picker, .due-picker')) return;
      selectedTaskId = selectedTaskId === card.dataset.taskId ? null : card.dataset.taskId;
      render();
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card) return;
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
    cell.addEventListener('dragover', (event) => { if (!draggingTaskId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; cell.classList.add('drop-ready'); });
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
    const kst = koreanClock(now);
    const executionHour = kst.hour;
    const executedAt = `${selectedDate}T${String(executionHour).padStart(2, '0')}:${String(kst.minute).padStart(2, '0')}:${String(kst.second).padStart(2, '0')}+09:00`;
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
      executedAt: `${selectedDate}T${String(hour).padStart(2, '0')}:00:00+09:00`, titleSnapshot: input.value.trim(),
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

function runDragScroll() {
  if (!draggingTaskId || dragScrollSpeed === 0) {
    dragScrollFrame = null;
    return;
  }
  window.scrollBy({ top: dragScrollSpeed, behavior: 'auto' });
  dragScrollFrame = requestAnimationFrame(runDragScroll);
}

function stopDragScroll() {
  document.querySelectorAll('.folder-drop-ready').forEach((target) => target.classList.remove('folder-drop-ready'));
  draggingTaskId = null;
  dragScrollSpeed = 0;
  document.body.classList.remove('is-dragging-task', 'drag-scroll-up', 'drag-scroll-down');
  if (dragScrollFrame) cancelAnimationFrame(dragScrollFrame);
  dragScrollFrame = null;
}

document.addEventListener('dragover', (event) => {
  if (!draggingTaskId) return;
  const edgeSize = Math.min(150, window.innerHeight * 0.22);
  const distanceFromBottom = window.innerHeight - event.clientY;
  let nextSpeed = 0;
  if (event.clientY < edgeSize) {
    nextSpeed = -Math.ceil(5 + 17 * (1 - event.clientY / edgeSize));
  } else if (distanceFromBottom < edgeSize) {
    nextSpeed = Math.ceil(5 + 17 * (1 - distanceFromBottom / edgeSize));
  }
  dragScrollSpeed = nextSpeed;
  document.body.classList.toggle('drag-scroll-up', nextSpeed < 0);
  document.body.classList.toggle('drag-scroll-down', nextSpeed > 0);
  if (nextSpeed !== 0 && !dragScrollFrame) dragScrollFrame = requestAnimationFrame(runDragScroll);
});

document.addEventListener('drop', stopDragScroll);

render();

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    handleAuthUser(data.session?.user || null);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthUser(session?.user || null);
  });
}
