import './style.css';

const HOURS = Array.from({ length: 13 }, (_, index) => index + 8);
const STORAGE_KEY = 'grid-journal-v1';
const today = new Date();
const toLocalISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoToday = toLocalISO(today);

const defaultState = {
  tasks: [
    { id: crypto.randomUUID(), title: '주간 리포트 초안', due: isoToday.replaceAll('-', ''), done: false },
    { id: crypto.randomUUID(), title: '디자인 피드백 정리', due: '', done: false },
  ],
  plan: {},
  actual: {},
};

let state;
try {
  state = { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
} catch {
  state = defaultState;
}

let selectedTaskId = null;
let editingTaskId = null;
let selectedDate = isoToday;
let calendarOpen = false;
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const app = document.querySelector('#app');

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function hourLabel(hour) {
  if (hour === 12) return '오후 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}

function dueLabel(value) {
  if (!/^\d{8}$/.test(value)) return '';
  return `${Number(value.slice(4, 6))}월 ${Number(value.slice(6))}일`;
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
  const plannedTaskIds = new Set(Object.values(state.plan).flat().map((item) => item.id));
  const openTasks = state.tasks.filter((task) => !plannedTaskIds.has(task.id));
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
        <div class="date-picker-wrap">
          <button type="button" class="date-stamp" id="date-picker-button" aria-expanded="${calendarOpen}" aria-controls="calendar-panel">
            <strong>${String(displayDate.getMonth() + 1).padStart(2, '0')} / ${String(displayDate.getDate()).padStart(2, '0')}</strong>
            <span>${displayDate.getFullYear()} · ${shortDay}</span>
          </button>
          ${calendarOpen ? calendarMarkup() : ''}
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
              <input value="${escapeHtml(`${task.title}${task.due ? ` (${task.due})` : ''}`)}" aria-label="할 일과 마감일 수정" />
              <button type="submit">저장</button>
              <button type="button" data-cancel-edit>취소</button>
            </form>` : `
            <article class="task-card ${selectedTaskId === task.id ? 'selected' : ''}" draggable="true" data-task-id="${task.id}" tabindex="0">
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${escapeHtml(task.title)}</strong>${task.due ? `<small>마감 · ${dueLabel(task.due)}</small>` : '<small>기한 없음</small>'}</span>
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
  `;
  bindEvents();
}

function timeRow(hour) {
  const plans = state.plan[hour] || [];
  const logs = state.actual[hour] || [];
  return `
    <div class="time-label">${hourLabel(hour)}<small>${String(hour).padStart(2, '0')}:00</small></div>
    <div class="time-cell plan-cell" data-hour="${hour}">
      ${plans.map((item) => {
        const committed = Object.values(state.actual).flat().some((log) => log.sourcePlanId === item.id);
        return `<div class="plan-item ${committed ? 'committed' : ''}">
          <label><input type="checkbox" data-commit="${item.id}" data-hour="${hour}" ${committed ? 'checked disabled' : ''} /><span>${escapeHtml(item.title)}</span></label>
          <button type="button" class="cancel-action" data-cancel-plan="${item.id}" data-hour="${hour}">계획 취소</button>
        </div>`;
      }).join('')}
      ${!plans.length ? '<button class="cell-placeholder" type="button">+ 계획 배치</button>' : ''}
    </div>
    <div class="time-cell actual-cell" data-actual-hour="${hour}">
      ${logs.map((log) => `<div class="actual-item"><span class="check-mark">✓</span><span><strong>${escapeHtml(log.title)}</strong><small>${escapeHtml(log.completedAt)}${log.sourcePlanId ? ' · 계획에서 실행' : ''}</small></span><button type="button" class="cancel-action" data-remove-log="${log.id}" data-hour="${hour}">실행 취소</button></div>`).join('')}
      <form class="quick-log" data-log-form="${hour}"><input placeholder="실행 내용 기록" aria-label="${hourLabel(hour)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`;
}

function notify(message) {
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function addPlan(taskId, hour) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.plan[hour] ||= [];
  if (state.plan[hour].some((item) => item.id === taskId)) return notify('이미 이 시간에 배치된 할 일이에요.');
  state.plan[hour].push({ id: task.id, title: task.title });
  selectedTaskId = null;
  save(); render(); notify(`${hourLabel(Number(hour))}에 배치했어요.`);
}

function bindEvents() {
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
  });
  document.querySelectorAll('[data-calendar-date]').forEach((button) => button.addEventListener('click', () => {
    selectedDate = button.dataset.calendarDate;
    const chosen = dateFromISO(selectedDate);
    calendarMonth = new Date(chosen.getFullYear(), chosen.getMonth(), 1);
    calendarOpen = false;
    render();
  }));

  if (calendarOpen) {
    setTimeout(() => document.addEventListener('click', closeCalendarOnOutside, { once: true }), 0);
  }

  document.querySelector('#task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.querySelector('#task-input');
    const parsed = parseTask(input.value);
    if (!parsed.title) return;
    if (parsed.due && !/^\d{8}$/.test(parsed.due)) return notify('마감일은 YYYYMMDD 형식으로 적어주세요.');
    state.tasks.unshift({ id: crypto.randomUUID(), ...parsed, done: false });
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

  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    state.tasks = state.tasks.filter((task) => task.id !== button.dataset.remove);
    Object.keys(state.plan).forEach((hour) => { state.plan[hour] = state.plan[hour].filter((item) => item.id !== button.dataset.remove); });
    save(); render();
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
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const parsed = parseTask(form.querySelector('input').value);
      if (!parsed.title) return notify('할 일 내용을 입력해주세요.');
      const taskId = form.dataset.editForm;
      state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, ...parsed } : task);
      Object.keys(state.plan).forEach((hour) => {
        state.plan[hour] = state.plan[hour].map((plan) => plan.id === taskId ? { ...plan, title: parsed.title } : plan);
      });
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

  document.querySelectorAll('[data-commit]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    if (!checkbox.checked) return;
    const planHour = checkbox.dataset.hour;
    const item = state.plan[planHour].find((plan) => plan.id === checkbox.dataset.commit);
    const now = new Date();
    const executionHour = Math.min(HOURS.at(-1), Math.max(HOURS[0], now.getHours()));
    const completedAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 완료`;
    state.actual[executionHour] ||= [];
    state.actual[executionHour].push({ id: crypto.randomUUID(), sourcePlanId: item.id, title: item.title, completedAt });
    save(); setTimeout(() => { render(); notify('실행 내역에 커밋했어요.'); }, 180);
  }));

  document.querySelectorAll('[data-cancel-plan]').forEach((button) => button.addEventListener('click', () => {
    const hour = button.dataset.hour;
    state.plan[hour] = state.plan[hour].filter((plan) => plan.id !== button.dataset.cancelPlan);
    save(); render(); notify('할 일 목록으로 되돌렸어요.');
  }));

  document.querySelectorAll('[data-log-form]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    if (!input.value.trim()) return;
    const hour = form.dataset.logForm;
    state.actual[hour] ||= [];
    state.actual[hour].push({ id: crypto.randomUUID(), title: input.value.trim(), completedAt: `${String(hour).padStart(2, '0')}:00 직접 기록` });
    save(); render();
  }));

  document.querySelectorAll('[data-remove-log]').forEach((button) => button.addEventListener('click', () => {
    state.actual[button.dataset.hour] = state.actual[button.dataset.hour].filter((log) => log.id !== button.dataset.removeLog);
    save(); render();
  }));
}

function closeCalendarOnOutside(event) {
  if (event.target.closest('.date-picker-wrap')) return;
  calendarOpen = false;
  render();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && calendarOpen && !editingTaskId) {
    calendarOpen = false;
    render();
  }
});

render();
