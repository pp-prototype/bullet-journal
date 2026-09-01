(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const l of document.querySelectorAll('link[rel="modulepreload"]'))n(l);new MutationObserver(l=>{for(const r of l)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&n(i)}).observe(document,{childList:!0,subtree:!0});function s(l){const r={};return l.integrity&&(r.integrity=l.integrity),l.referrerPolicy&&(r.referrerPolicy=l.referrerPolicy),l.crossOrigin==="use-credentials"?r.credentials="include":l.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(l){if(l.ep)return;l.ep=!0;const r=s(l);fetch(l.href,r)}})();const $=Array.from({length:13},(t,e)=>e+8),y="grid-journal-v1",u=new Date,h=u.toISOString().slice(0,10),L=new Intl.DateTimeFormat("ko-KR",{weekday:"long"}).format(u),g={tasks:[{id:crypto.randomUUID(),title:"주간 리포트 초안",due:h.replaceAll("-",""),done:!1},{id:crypto.randomUUID(),title:"디자인 피드백 정리",due:"",done:!1}],plan:{},actual:{}};let a;try{a={...g,...JSON.parse(localStorage.getItem(y)||"{}")}}catch{a=g}let o=null;const S=document.querySelector("#app");function c(){localStorage.setItem(y,JSON.stringify(a))}function m(t=""){return t.replace(/[&<>'"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[e])}function f(t){return t===12?"오후 12시":t<12?`오전 ${t}시`:`오후 ${t-12}시`}function k(t){return/^\d{8}$/.test(t)?`${Number(t.slice(4,6))}월 ${Number(t.slice(6))}일`:""}function E(t){const e=t.trim().match(/^(.*?)(?:\s*\((\d{8})\))?$/);return{title:e?.[1]?.trim()||"",due:e?.[2]||""}}function d(){const t=a.tasks.filter(e=>!e.done);S.innerHTML=`
    <main class="page-shell">
      <header class="masthead">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">✣</span>
          <div>
            <p class="eyebrow">DAILY BULLET JOURNAL</p>
            <h1>오늘의 기록</h1>
          </div>
        </div>
        <div class="date-stamp">
          <strong>${String(u.getMonth()+1).padStart(2,"0")} / ${String(u.getDate()).padStart(2,"0")}</strong>
          <span>${u.getFullYear()} · ${L}</span>
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
          ${t.length?t.map(e=>`
            <article class="task-card ${o===e.id?"selected":""}" draggable="true" data-task-id="${e.id}" tabindex="0">
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${m(e.title)}</strong>${e.due?`<small>마감 · ${k(e.due)}</small>`:"<small>기한 없음</small>"}</span>
              <button class="remove-task" type="button" data-remove="${e.id}" aria-label="할 일 삭제">×</button>
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
          ${$.map(e=>D(e)).join("")}
        </div>
      </section>
      <footer><span>Keep the day, one square at a time.</span><span>${h.replaceAll("-",".")}</span></footer>
    </main>
    <div class="toast" role="status" aria-live="polite"></div>
  `,A()}function D(t){const e=a.plan[t]||[],s=a.actual[t]||[];return`
    <div class="time-label">${f(t)}<small>${String(t).padStart(2,"0")}:00</small></div>
    <div class="time-cell plan-cell" data-hour="${t}">
      ${e.map(n=>`<label class="plan-item"><input type="checkbox" data-commit="${n.id}" data-hour="${t}" /><span>${m(n.title)}</span></label>`).join("")}
      ${e.length?"":'<button class="cell-placeholder" type="button">+ 계획 배치</button>'}
    </div>
    <div class="time-cell actual-cell" data-actual-hour="${t}">
      ${s.map(n=>`<div class="actual-item"><span class="check-mark">✓</span><span><strong>${m(n.title)}</strong><small>${m(n.completedAt)}</small></span><button type="button" data-remove-log="${n.id}" data-hour="${t}" aria-label="기록 삭제">×</button></div>`).join("")}
      <form class="quick-log" data-log-form="${t}"><input placeholder="실행 내용 기록" aria-label="${f(t)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`}function p(t){const e=document.querySelector(".toast");e.textContent=t,e.classList.add("show"),setTimeout(()=>e.classList.remove("show"),1800)}function v(t,e){const s=a.tasks.find(n=>n.id===t);if(s){if(a.plan[e]||=[],a.plan[e].some(n=>n.id===t))return p("이미 이 시간에 배치된 할 일이에요.");a.plan[e].push({id:s.id,title:s.title}),o=null,c(),d(),p(`${f(Number(e))}에 배치했어요.`)}}function A(){document.querySelector("#task-form").addEventListener("submit",t=>{t.preventDefault();const e=document.querySelector("#task-input"),s=E(e.value);if(s.title){if(s.due&&!/^\d{8}$/.test(s.due))return p("마감일은 YYYYMMDD 형식으로 적어주세요.");a.tasks.unshift({id:crypto.randomUUID(),...s,done:!1}),c(),d()}}),document.querySelectorAll(".task-card").forEach(t=>{t.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",t.dataset.taskId),e.dataTransfer.effectAllowed="copy",t.classList.add("dragging")}),t.addEventListener("dragend",()=>t.classList.remove("dragging")),t.addEventListener("click",e=>{e.target.closest("button")||(o=o===t.dataset.taskId?null:t.dataset.taskId,d())}),t.addEventListener("keydown",e=>{(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),o=t.dataset.taskId,d())})}),document.querySelectorAll("[data-remove]").forEach(t=>t.addEventListener("click",()=>{a.tasks=a.tasks.filter(e=>e.id!==t.dataset.remove),Object.keys(a.plan).forEach(e=>{a.plan[e]=a.plan[e].filter(s=>s.id!==t.dataset.remove)}),c(),d()})),document.querySelectorAll(".plan-cell").forEach(t=>{t.addEventListener("dragover",e=>{e.preventDefault(),t.classList.add("drop-ready")}),t.addEventListener("dragleave",()=>t.classList.remove("drop-ready")),t.addEventListener("drop",e=>{e.preventDefault(),v(e.dataTransfer.getData("text/plain"),t.dataset.hour)}),t.querySelector(".cell-placeholder")?.addEventListener("click",()=>{o?v(o,t.dataset.hour):p("먼저 위에서 할 일을 선택해주세요.")})}),document.querySelectorAll("[data-commit]").forEach(t=>t.addEventListener("change",()=>{if(!t.checked)return;const e=t.dataset.hour,s=a.plan[e].find(i=>i.id===t.dataset.commit),n=new Date,l=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")} 완료`;a.actual[e]||=[],a.actual[e].push({id:crypto.randomUUID(),title:s.title,completedAt:l}),a.plan[e]=a.plan[e].filter(i=>i.id!==s.id),Object.values(a.plan).some(i=>i.some(b=>b.id===s.id))||(a.tasks=a.tasks.map(i=>i.id===s.id?{...i,done:!0}:i)),c(),setTimeout(()=>{d(),p("실행 내역에 커밋했어요.")},180)})),document.querySelectorAll("[data-log-form]").forEach(t=>t.addEventListener("submit",e=>{e.preventDefault();const s=t.querySelector("input");if(!s.value.trim())return;const n=t.dataset.logForm;a.actual[n]||=[],a.actual[n].push({id:crypto.randomUUID(),title:s.value.trim(),completedAt:`${String(n).padStart(2,"0")}:00 직접 기록`}),c(),d()})),document.querySelectorAll("[data-remove-log]").forEach(t=>t.addEventListener("click",()=>{a.actual[t.dataset.hour]=a.actual[t.dataset.hour].filter(e=>e.id!==t.dataset.removeLog),c(),d()}))}d();
