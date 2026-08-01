(async()=>{
  const root=document.querySelector('#quizRoot');
  if(!root)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let bank=[];let current=null;let selected=null;let filter='전체';
  const recentKey='kna-policy-quiz-recent';
  const recent=()=>{try{return JSON.parse(localStorage.getItem(recentKey)||'[]')}catch{return[]}};
  const remember=id=>localStorage.setItem(recentKey,JSON.stringify([id,...recent().filter(x=>x!==id)].slice(0,12)));
  const cls=d=>d==='쉬움'?'easy':d==='보통'?'medium':'hard';
  function pick(){
    const pool=bank.filter(x=>filter==='전체'||x.difficulty===filter);
    const used=new Set(recent());
    const fresh=pool.filter(x=>!used.has(x.id));
    const candidates=fresh.length?fresh:pool;
    current=candidates[Math.floor(Math.random()*candidates.length)];selected=null;render();
  }
  function render(){
    if(!current){root.innerHTML='<div class="empty-state">퀴즈를 불러오지 못했습니다.</div>';return;}
    root.innerHTML=`<div class="quiz-toolbar"><div class="quiz-filters">${['전체','쉬움','보통','어려움'].map(x=>`<button class="quiz-filter ${filter===x?'active':''}" data-difficulty="${x}">${x==='전체'?'난이도 전체':x}</button>`).join('')}</div><span class="quiz-progress">검토된 문제은행 ${bank.length}문제 중 무작위 출제</span></div>
    <article class="quiz-card"><div class="quiz-meta"><span class="difficulty-badge ${cls(current.difficulty)}">난이도 · ${esc(current.difficulty)}</span><span class="quiz-category">${esc(current.category)}</span></div><h2 class="quiz-question">${esc(current.question)}</h2><div class="quiz-choices">${current.choices.map((c,i)=>`<button class="quiz-choice" data-choice="${i}"><span class="choice-num">${i+1}</span><span>${esc(c)}</span></button>`).join('')}</div><div class="quiz-actions"><button class="btn btn-primary" id="submitQuiz" disabled>정답 제출</button><button class="btn btn-outline" id="nextQuiz">다른 문제</button></div><div id="quizResult"></div></article>`;
    root.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.difficulty;pick()}));
    root.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.choice);root.querySelectorAll('.quiz-choice').forEach(x=>x.classList.toggle('selected',x===b));root.querySelector('#submitQuiz').disabled=false;}));
    root.querySelector('#nextQuiz').addEventListener('click',pick);
    root.querySelector('#submitQuiz').addEventListener('click',submit);
  }
  function submit(){
    if(selected===null)return;remember(current.id);
    const correct=selected===current.answer;
    root.querySelectorAll('.quiz-choice').forEach((b,i)=>{b.disabled=true;if(i===current.answer)b.classList.add('correct');else if(i===selected)b.classList.add('wrong');});
    root.querySelector('#submitQuiz').disabled=true;
    root.querySelector('#quizResult').innerHTML=`<div class="quiz-result"><h3>${correct?'정답입니다.':'아쉽지만 오답입니다.'}</h3><p><strong>해설</strong><br>${esc(current.explanation)}</p><div class="quiz-source">출처: <a href="${esc(current.source.url)}" target="_blank" rel="noopener noreferrer">${esc(current.source.title)}</a></div></div>`;
  }
  try{const r=await fetch(`data/policy-quiz.json?ts=${Date.now()}`);if(!r.ok)throw new Error();const p=await r.json();bank=p.items||[];pick();}catch{root.innerHTML='<div class="auth-message show error">정책 퀴즈 자료를 불러오지 못했습니다.</div>';}
})();
