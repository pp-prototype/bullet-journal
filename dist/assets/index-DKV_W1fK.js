(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))s(a);new MutationObserver(a=>{for(const d of a)if(d.type==="childList")for(const m of d.addedNodes)m.tagName==="LINK"&&m.rel==="modulepreload"&&s(m)}).observe(document,{childList:!0,subtree:!0});function n(a){const d={};return a.integrity&&(d.integrity=a.integrity),a.referrerPolicy&&(d.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?d.credentials="include":a.crossOrigin==="anonymous"?d.credentials="omit":d.credentials="same-origin",d}function s(a){if(a.ep)return;a.ep=!0;const d=n(a);fetch(a.href,d)}})();const k=Array.from({length:13},(t,e)=>e+8),q="grid-journal-v1",y=new Date,w=t=>`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`,$=w(y),L={tasks:[{id:crypto.randomUUID(),title:"주간 리포트 초안",due:$.replaceAll("-",""),done:!1},{id:crypto.randomUUID(),title:"디자인 피드백 정리",due:"",done:!1}],plan:{},actual:{}};let l;try{l={...L,...JSON.parse(localStorage.getItem(q)||"{}")}}catch{l=L}let u=null,f=null,g=$,i=!1,o=new Date(y.getFullYear(),y.getMonth(),1);const I=document.querySelector("#app");function c(){localStorage.setItem(q,JSON.stringify(l))}function v(t=""){return t.replace(/[&<>'"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[e])}function S(t){return t===12?"오후 12시":t<12?`오전 ${t}시`:`오후 ${t-12}시`}function O(t){return/^\d{8}$/.test(t)?`${Number(t.slice(4,6))}월 ${Number(t.slice(6))}일`:""}function A(t){const[e,n,s]=t.split("-").map(Number);return new Date(e,n-1,s)}function M(){const t=o.getFullYear(),e=o.getMonth(),n=(new Date(t,e,1).getDay()+6)%7,s=new Date(t,e,1-n),a=Array.from({length:42},(d,m)=>{const h=new Date(s);h.setDate(s.getDate()+m);const b=w(h);return`<button type="button" class="calendar-day ${[h.getMonth()!==e?"outside":"",b===$?"today":"",b===g?"selected":""].filter(Boolean).join(" ")}" data-calendar-date="${b}" aria-label="${b}">${h.getDate()}</button>`}).join("");return`<div class="calendar-panel" id="calendar-panel">
    <div class="calendar-head">
      <button type="button" data-calendar-prev aria-label="이전 달">←</button>
      <strong>${t}년 ${e+1}월</strong>
      <button type="button" data-calendar-next aria-label="다음 달">→</button>
    </div>
    <div class="calendar-weekdays">${["월","화","수","목","금","토","일"].map(d=>`<span>${d}</span>`).join("")}</div>
    <div class="calendar-days">${a}</div>
    <button type="button" class="today-button" data-calendar-today>오늘로 돌아가기</button>
  </div>`}function E(t){const e=t.trim(),n=e.match(/\s*\((\d{8})\)\s*$/);return{title:n?e.slice(0,n.index).trim():e,due:n?.[1]||""}}function r(){const t=A(g),e=new Intl.DateTimeFormat("ko-KR",{weekday:"long"}).format(t),n=new Set(Object.values(l.plan).flat().map(a=>a.id)),s=l.tasks.filter(a=>!n.has(a.id));I.innerHTML=`
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
          <button type="button" class="date-stamp" id="date-picker-button" aria-expanded="${i}" aria-controls="calendar-panel">
            <strong>${String(t.getMonth()+1).padStart(2,"0")} / ${String(t.getDate()).padStart(2,"0")}</strong>
            <span>${t.getFullYear()} · ${e}</span>
          </button>
          ${i?M():""}
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
          ${s.length?s.map(a=>f===a.id?`
            <form class="task-card task-edit-card" data-edit-form="${a.id}">
              <span class="edit-mark" aria-hidden="true">✎</span>
              <input value="${v(`${a.title}${a.due?` (${a.due})`:""}`)}" aria-label="할 일과 마감일 수정" />
              <button type="submit">저장</button>
              <button type="button" data-cancel-edit>취소</button>
            </form>`:`
            <article class="task-card ${u===a.id?"selected":""}" draggable="true" data-task-id="${a.id}" tabindex="0">
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${v(a.title)}</strong>${a.due?`<small>마감 · ${O(a.due)}</small>`:"<small>기한 없음</small>"}</span>
              <button class="edit-task" type="button" data-edit="${a.id}" aria-label="할 일 수정">수정</button>
              <button class="remove-task" type="button" data-remove="${a.id}" aria-label="할 일 삭제">×</button>
            </article>`).join(""):'<p class="empty-tasks">목록이 비어 있어요. 오늘 할 일을 하나 적어보세요.</p>'}
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
          ${k.map(a=>Y(a)).join("")}
        </div>
      </section>
      <footer><span>Keep the day, one square at a time.</span><span>${g.replaceAll("-",".")}</span></footer>
    </main>
    <div class="toast" role="status" aria-live="polite"></div>
  `,j()}function Y(t){const e=l.plan[t]||[],n=l.actual[t]||[];return`
    <div class="time-label">${S(t)}<small>${String(t).padStart(2,"0")}:00</small></div>
    <div class="time-cell plan-cell" data-hour="${t}">
      ${e.map(s=>{const a=Object.values(l.actual).flat().some(d=>d.sourcePlanId===s.id);return`<div class="plan-item ${a?"committed":""}">
          <label><input type="checkbox" data-commit="${s.id}" data-hour="${t}" ${a?"checked disabled":""} /><span>${v(s.title)}</span></label>
          <button type="button" class="cancel-action" data-cancel-plan="${s.id}" data-hour="${t}">계획 취소</button>
        </div>`}).join("")}
      ${e.length?"":'<button class="cell-placeholder" type="button">+ 계획 배치</button>'}
    </div>
    <div class="time-cell actual-cell" data-actual-hour="${t}">
      ${n.map(s=>`<div class="actual-item"><span class="check-mark">✓</span><span><strong>${v(s.title)}</strong><small>${v(s.completedAt)}${s.sourcePlanId?" · 계획에서 실행":""}</small></span><button type="button" class="cancel-action" data-remove-log="${s.id}" data-hour="${t}">실행 취소</button></div>`).join("")}
      <form class="quick-log" data-log-form="${t}"><input placeholder="실행 내용 기록" aria-label="${S(t)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`}function p(t){const e=document.querySelector(".toast");e.textContent=t,e.classList.add("show"),setTimeout(()=>e.classList.remove("show"),1800)}function D(t,e){const n=l.tasks.find(s=>s.id===t);if(n){if(l.plan[e]||=[],l.plan[e].some(s=>s.id===t))return p("이미 이 시간에 배치된 할 일이에요.");l.plan[e].push({id:n.id,title:n.title}),u=null,c(),r(),p(`${S(Number(e))}에 배치했어요.`)}}function j(){document.querySelector("#date-picker-button").addEventListener("click",()=>{i=!i,r()}),document.querySelector("[data-calendar-prev]")?.addEventListener("click",()=>{o=new Date(o.getFullYear(),o.getMonth()-1,1),r()}),document.querySelector("[data-calendar-next]")?.addEventListener("click",()=>{o=new Date(o.getFullYear(),o.getMonth()+1,1),r()}),document.querySelector("[data-calendar-today]")?.addEventListener("click",()=>{g=$,o=new Date(y.getFullYear(),y.getMonth(),1),i=!1,r()}),document.querySelectorAll("[data-calendar-date]").forEach(t=>t.addEventListener("click",()=>{g=t.dataset.calendarDate;const e=A(g);o=new Date(e.getFullYear(),e.getMonth(),1),i=!1,r()})),i&&setTimeout(()=>document.addEventListener("click",T,{once:!0}),0),document.querySelector("#task-form").addEventListener("submit",t=>{t.preventDefault();const e=document.querySelector("#task-input"),n=E(e.value);if(n.title){if(n.due&&!/^\d{8}$/.test(n.due))return p("마감일은 YYYYMMDD 형식으로 적어주세요.");l.tasks.unshift({id:crypto.randomUUID(),...n,done:!1}),c(),r()}}),document.querySelectorAll(".task-card[data-task-id]").forEach(t=>{t.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",t.dataset.taskId),e.dataTransfer.effectAllowed="copy",t.classList.add("dragging")}),t.addEventListener("dragend",()=>t.classList.remove("dragging")),t.addEventListener("click",e=>{e.target.closest("button")||(u=u===t.dataset.taskId?null:t.dataset.taskId,r())}),t.addEventListener("keydown",e=>{(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),u=t.dataset.taskId,r())})}),document.querySelectorAll("[data-remove]").forEach(t=>t.addEventListener("click",()=>{l.tasks=l.tasks.filter(e=>e.id!==t.dataset.remove),Object.keys(l.plan).forEach(e=>{l.plan[e]=l.plan[e].filter(n=>n.id!==t.dataset.remove)}),c(),r()})),document.querySelectorAll("[data-edit]").forEach(t=>t.addEventListener("click",()=>{f=t.dataset.edit,u=null,r();const e=document.querySelector("[data-edit-form] input");e?.focus(),e?.select()})),document.querySelectorAll("[data-edit-form]").forEach(t=>{t.addEventListener("submit",e=>{e.preventDefault();const n=E(t.querySelector("input").value);if(!n.title)return p("할 일 내용을 입력해주세요.");const s=t.dataset.editForm;l.tasks=l.tasks.map(a=>a.id===s?{...a,...n}:a),Object.keys(l.plan).forEach(a=>{l.plan[a]=l.plan[a].map(d=>d.id===s?{...d,title:n.title}:d)}),f=null,c(),r(),p("할 일을 수정했어요.")}),t.querySelector("input").addEventListener("keydown",e=>{e.key==="Escape"&&(f=null,r())})}),document.querySelectorAll("[data-cancel-edit]").forEach(t=>t.addEventListener("click",()=>{f=null,r()})),document.querySelectorAll(".plan-cell").forEach(t=>{t.addEventListener("dragover",e=>{e.preventDefault(),t.classList.add("drop-ready")}),t.addEventListener("dragleave",()=>t.classList.remove("drop-ready")),t.addEventListener("drop",e=>{e.preventDefault(),D(e.dataTransfer.getData("text/plain"),t.dataset.hour)}),t.querySelector(".cell-placeholder")?.addEventListener("click",()=>{u?D(u,t.dataset.hour):p("먼저 위에서 할 일을 선택해주세요.")})}),document.querySelectorAll("[data-commit]").forEach(t=>t.addEventListener("change",()=>{if(!t.checked)return;const e=t.dataset.hour,n=l.plan[e].find(m=>m.id===t.dataset.commit),s=new Date,a=Math.min(k.at(-1),Math.max(k[0],s.getHours())),d=`${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")} 완료`;l.actual[a]||=[],l.actual[a].push({id:crypto.randomUUID(),sourcePlanId:n.id,title:n.title,completedAt:d}),c(),setTimeout(()=>{r(),p("실행 내역에 커밋했어요.")},180)})),document.querySelectorAll("[data-cancel-plan]").forEach(t=>t.addEventListener("click",()=>{const e=t.dataset.hour;l.plan[e]=l.plan[e].filter(n=>n.id!==t.dataset.cancelPlan),c(),r(),p("할 일 목록으로 되돌렸어요.")})),document.querySelectorAll("[data-log-form]").forEach(t=>t.addEventListener("submit",e=>{e.preventDefault();const n=t.querySelector("input");if(!n.value.trim())return;const s=t.dataset.logForm;l.actual[s]||=[],l.actual[s].push({id:crypto.randomUUID(),title:n.value.trim(),completedAt:`${String(s).padStart(2,"0")}:00 직접 기록`}),c(),r()})),document.querySelectorAll("[data-remove-log]").forEach(t=>t.addEventListener("click",()=>{l.actual[t.dataset.hour]=l.actual[t.dataset.hour].filter(e=>e.id!==t.dataset.removeLog),c(),r()}))}function T(t){t.target.closest(".date-picker-wrap")||(i=!1,r())}document.addEventListener("keydown",t=>{t.key==="Escape"&&i&&!f&&(i=!1,r())});r();
