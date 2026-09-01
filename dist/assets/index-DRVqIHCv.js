(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const l of document.querySelectorAll('link[rel="modulepreload"]'))n(l);new MutationObserver(l=>{for(const r of l)if(r.type==="childList")for(const u of r.addedNodes)u.tagName==="LINK"&&u.rel==="modulepreload"&&n(u)}).observe(document,{childList:!0,subtree:!0});function a(l){const r={};return l.integrity&&(r.integrity=l.integrity),l.referrerPolicy&&(r.referrerPolicy=l.referrerPolicy),l.crossOrigin==="use-credentials"?r.credentials="include":l.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(l){if(l.ep)return;l.ep=!0;const r=a(l);fetch(l.href,r)}})();const f=Array.from({length:13},(t,e)=>e+8),y="grid-journal-v1",p=new Date,$=p.toISOString().slice(0,10),b=new Intl.DateTimeFormat("ko-KR",{weekday:"long"}).format(p),v={tasks:[{id:crypto.randomUUID(),title:"주간 리포트 초안",due:$.replaceAll("-",""),done:!1},{id:crypto.randomUUID(),title:"디자인 피드백 정리",due:"",done:!1}],plan:{},actual:{}};let s;try{s={...v,...JSON.parse(localStorage.getItem(y)||"{}")}}catch{s=v}let o=null;const k=document.querySelector("#app");function d(){localStorage.setItem(y,JSON.stringify(s))}function m(t=""){return t.replace(/[&<>'"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[e])}function g(t){return t===12?"오후 12시":t<12?`오전 ${t}시`:`오후 ${t-12}시`}function S(t){return/^\d{8}$/.test(t)?`${Number(t.slice(4,6))}월 ${Number(t.slice(6))}일`:""}function L(t){const e=t.trim().match(/^(.*?)(?:\s*\((\d{8})\))?$/);return{title:e?.[1]?.trim()||"",due:e?.[2]||""}}function i(){const t=new Set(Object.values(s.plan).flat().map(a=>a.id)),e=s.tasks.filter(a=>!t.has(a.id));k.innerHTML=`
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
          <strong>${String(p.getMonth()+1).padStart(2,"0")} / ${String(p.getDate()).padStart(2,"0")}</strong>
          <span>${p.getFullYear()} · ${b}</span>
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
          ${e.length?e.map(a=>`
            <article class="task-card ${o===a.id?"selected":""}" draggable="true" data-task-id="${a.id}" tabindex="0">
              <span class="drag-handle" aria-hidden="true">⠿</span>
              <span class="task-copy"><strong>${m(a.title)}</strong>${a.due?`<small>마감 · ${S(a.due)}</small>`:"<small>기한 없음</small>"}</span>
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
          ${f.map(a=>E(a)).join("")}
        </div>
      </section>
      <footer><span>Keep the day, one square at a time.</span><span>${$.replaceAll("-",".")}</span></footer>
    </main>
    <div class="toast" role="status" aria-live="polite"></div>
  `,D()}function E(t){const e=s.plan[t]||[],a=s.actual[t]||[];return`
    <div class="time-label">${g(t)}<small>${String(t).padStart(2,"0")}:00</small></div>
    <div class="time-cell plan-cell" data-hour="${t}">
      ${e.map(n=>{const l=Object.values(s.actual).flat().some(r=>r.sourcePlanId===n.id);return`<div class="plan-item ${l?"committed":""}">
          <label><input type="checkbox" data-commit="${n.id}" data-hour="${t}" ${l?"checked disabled":""} /><span>${m(n.title)}</span></label>
          <button type="button" class="cancel-action" data-cancel-plan="${n.id}" data-hour="${t}">계획 취소</button>
        </div>`}).join("")}
      ${e.length?"":'<button class="cell-placeholder" type="button">+ 계획 배치</button>'}
    </div>
    <div class="time-cell actual-cell" data-actual-hour="${t}">
      ${a.map(n=>`<div class="actual-item"><span class="check-mark">✓</span><span><strong>${m(n.title)}</strong><small>${m(n.completedAt)}${n.sourcePlanId?" · 계획에서 실행":""}</small></span><button type="button" class="cancel-action" data-remove-log="${n.id}" data-hour="${t}">실행 취소</button></div>`).join("")}
      <form class="quick-log" data-log-form="${t}"><input placeholder="실행 내용 기록" aria-label="${g(t)} 실행 내용" /><button aria-label="기록 추가">＋</button></form>
    </div>`}function c(t){const e=document.querySelector(".toast");e.textContent=t,e.classList.add("show"),setTimeout(()=>e.classList.remove("show"),1800)}function h(t,e){const a=s.tasks.find(n=>n.id===t);if(a){if(s.plan[e]||=[],s.plan[e].some(n=>n.id===t))return c("이미 이 시간에 배치된 할 일이에요.");s.plan[e].push({id:a.id,title:a.title}),o=null,d(),i(),c(`${g(Number(e))}에 배치했어요.`)}}function D(){document.querySelector("#task-form").addEventListener("submit",t=>{t.preventDefault();const e=document.querySelector("#task-input"),a=L(e.value);if(a.title){if(a.due&&!/^\d{8}$/.test(a.due))return c("마감일은 YYYYMMDD 형식으로 적어주세요.");s.tasks.unshift({id:crypto.randomUUID(),...a,done:!1}),d(),i()}}),document.querySelectorAll(".task-card").forEach(t=>{t.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",t.dataset.taskId),e.dataTransfer.effectAllowed="copy",t.classList.add("dragging")}),t.addEventListener("dragend",()=>t.classList.remove("dragging")),t.addEventListener("click",e=>{e.target.closest("button")||(o=o===t.dataset.taskId?null:t.dataset.taskId,i())}),t.addEventListener("keydown",e=>{(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),o=t.dataset.taskId,i())})}),document.querySelectorAll("[data-remove]").forEach(t=>t.addEventListener("click",()=>{s.tasks=s.tasks.filter(e=>e.id!==t.dataset.remove),Object.keys(s.plan).forEach(e=>{s.plan[e]=s.plan[e].filter(a=>a.id!==t.dataset.remove)}),d(),i()})),document.querySelectorAll(".plan-cell").forEach(t=>{t.addEventListener("dragover",e=>{e.preventDefault(),t.classList.add("drop-ready")}),t.addEventListener("dragleave",()=>t.classList.remove("drop-ready")),t.addEventListener("drop",e=>{e.preventDefault(),h(e.dataTransfer.getData("text/plain"),t.dataset.hour)}),t.querySelector(".cell-placeholder")?.addEventListener("click",()=>{o?h(o,t.dataset.hour):c("먼저 위에서 할 일을 선택해주세요.")})}),document.querySelectorAll("[data-commit]").forEach(t=>t.addEventListener("change",()=>{if(!t.checked)return;const e=t.dataset.hour,a=s.plan[e].find(u=>u.id===t.dataset.commit),n=new Date,l=Math.min(f.at(-1),Math.max(f[0],n.getHours())),r=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")} 완료`;s.actual[l]||=[],s.actual[l].push({id:crypto.randomUUID(),sourcePlanId:a.id,title:a.title,completedAt:r}),d(),setTimeout(()=>{i(),c("실행 내역에 커밋했어요.")},180)})),document.querySelectorAll("[data-cancel-plan]").forEach(t=>t.addEventListener("click",()=>{const e=t.dataset.hour;s.plan[e]=s.plan[e].filter(a=>a.id!==t.dataset.cancelPlan),d(),i(),c("할 일 목록으로 되돌렸어요.")})),document.querySelectorAll("[data-log-form]").forEach(t=>t.addEventListener("submit",e=>{e.preventDefault();const a=t.querySelector("input");if(!a.value.trim())return;const n=t.dataset.logForm;s.actual[n]||=[],s.actual[n].push({id:crypto.randomUUID(),title:a.value.trim(),completedAt:`${String(n).padStart(2,"0")}:00 직접 기록`}),d(),i()})),document.querySelectorAll("[data-remove-log]").forEach(t=>t.addEventListener("click",()=>{s.actual[t.dataset.hour]=s.actual[t.dataset.hour].filter(e=>e.id!==t.dataset.removeLog),d(),i()}))}i();
