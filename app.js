// Spelling Stage — app logic
// Loads the word bank from words.json, then sets up speech, practice rounds,
// spaced repetition, the word list and the progress page.

fetch('words.json')
  .then(r => { if (!r.ok) throw new Error('Could not load words.json'); return r.json(); })
  .then(start)
  .catch(err => { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px">${err.message}. Run a local server (see README) instead of opening the file directly.</p>`); });

function start(WORDS){
const GROUP = 50;
const groups = [];
for (let i=0;i<WORDS.length;i+=GROUP){ const g=WORDS.slice(i,i+GROUP); groups.push({key:groups.length, from:g[0].id, to:g[g.length-1].id, first:g[0].word, last:g[g.length-1].word}); }
const groupOf = w => Math.floor((w.id-1)/GROUP);
const byId = Object.fromEntries(WORDS.map(w=>[w.id,w]));
const DAY = 864e5, INTERVALS=[0,1,2,4,8,16];

/* ---------- storage ---------- */
const KEY='spellingStage.v1';
let store = {stats:{}, settings:{voice:'', rate:0.85, len:20, order:'smart', groups:[0]}};
try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s){ store.stats=s.stats||{}; Object.assign(store.settings, s.settings||{}); } }catch(e){}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){} }
const st = id => store.stats[id];
function status(id){ const s=st(id); if(!s||!s.s) return 'new'; if(s.m>0 && s.b<2) return 'trouble'; return s.b>=3?'mastered':'learning'; }
const statusLabel={new:'New',learning:'Learning',mastered:'Mastered',trouble:'Trouble'};
function isDue(id){ const s=st(id); if(!s) return true; return Date.now()-s.l >= INTERVALS[s.b]*DAY; }

/* ---------- speech ---------- */
const synth = window.speechSynthesis;
let voices=[];
if(!synth || typeof SpeechSynthesisUtterance==='undefined') document.getElementById('ttsWarn').hidden=false;
function loadVoices(){
  if(!synth) return;
  voices = synth.getVoices().filter(v=>/^en/i.test(v.lang));
  const pref=['Samantha','Google US English','Microsoft Aria','Microsoft Jenny','Ava','Allison','Alex'];
  voices.sort((a,b)=>{ const s=v=>{const i=pref.findIndex(p=>v.name.includes(p)); return (i<0?50:i)+(/en[-_]US/i.test(v.lang)?0:20);}; return s(a)-s(b); });
  const sel=document.getElementById('voiceSel');
  sel.innerHTML = voices.length ? voices.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('') : '<option value="">Default voice</option>';
  if(store.settings.voice && voices.some(v=>v.name===store.settings.voice)) sel.value=store.settings.voice;
}
if(synth){ loadVoices(); synth.onvoiceschanged=loadVoices; }
let speakTimer;
function speak(text, rateMul=1){
  if(!synth) return;
  synth.cancel(); clearTimeout(speakTimer);
  speakTimer=setTimeout(()=>{
    const u=new SpeechSynthesisUtterance(text);
    const v=voices.find(v=>v.name===store.settings.voice) || voices[0];
    if(v){ u.voice=v; u.lang=v.lang; } else u.lang='en-US';
    u.rate=Math.max(0.3, store.settings.rate*rateMul);
    const b=document.getElementById('speakBtn');
    u.onstart=()=>b.classList.add('talking');
    u.onend=u.onerror=()=>b.classList.remove('talking');
    synth.speak(u);
  },60);
}
const sayWord = w => w.pronounceAs || w.word;
function letters(word){
  return [...word.normalize('NFD').replace(/[̀-ͯ]/g,'')].map(c=> c===' '?'space': c==='-'?'hyphen': c==="'"?'apostrophe': c.toUpperCase()).join(', ');
}

/* ---------- helpers ---------- */
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’‘]/g,"'").toLowerCase().trim().replace(/\s+/g,' ');
function maskSentence(w){
  let s=w.sentence;
  for(const sp of [w.word,...w.alternates]){ const re=new RegExp(sp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); s=s.replace(re,'_____'); }
  return s;
}
const SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>';
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

/* ---------- tabs ---------- */
const $=id=>document.getElementById(id);
let tab='practice';
function show(t){
  tab=t;
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current', b.dataset.tab===t?'page':'false'));
  const inDrill=!!session && !session.done;
  $('setup').hidden = !(t==='practice' && !session);
  $('drill').hidden = !(t==='practice' && inDrill);
  $('summary').hidden = !(t==='practice' && session && session.done);
  $('list').hidden = t!=='list';
  $('progress').hidden = t!=='progress';
  if(t==='list') renderList();
  if(t==='progress') renderProgress();
  if(t==='practice' && !session) renderSetup();
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.tab));

/* ---------- setup ---------- */
function renderSetup(){
  const S=store.settings;
  $('groups').innerHTML = groups.map(g=>`<button class="chip" data-g="${g.key}" aria-pressed="${S.groups.includes(g.key)}"><b>${g.from}–${g.to}</b><span>${esc(g.first)} … ${esc(g.last)}</span></button>`).join('');
  $('groups').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{
    const k=+c.dataset.g; const i=S.groups.indexOf(k);
    if(i>=0){ if(S.groups.length>1) S.groups.splice(i,1); } else S.groups.push(k);
    S.groups.sort((a,b)=>a-b); save(); renderSetup();
  });
  segSet('lenSeg', String(S.len)); segSet('orderSeg', S.order);
  const pool=poolWords();
  const due=pool.filter(w=>st(w.id)&&st(w.id).s&&isDue(w.id)).length;
  const fresh=pool.filter(w=>!st(w.id)||!st(w.id).s).length;
  $('poolInfo').textContent = `${pool.length} words selected · ${fresh} new · ${due} due for review`;
  const trouble=troubleWords();
  $('missedBtn').disabled=!trouble.length;
  $('missedBtn').textContent = trouble.length ? `Practice trouble words (${trouble.length})` : 'No trouble words yet';
  $('rate').value=S.rate; $('rateVal').textContent=`${Math.round(S.rate*100)}%`;
}
function segSet(id,v){ document.querySelectorAll('#'+id+' button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.v===v)); }
$('lenSeg').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; store.settings.len=+b.dataset.v; save(); segSet('lenSeg',b.dataset.v); };
$('orderSeg').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; store.settings.order=b.dataset.v; save(); segSet('orderSeg',b.dataset.v); };
$('voiceSel').onchange=e=>{ store.settings.voice=e.target.value; save(); };
$('rate').oninput=e=>{ store.settings.rate=+e.target.value; $('rateVal').textContent=`${Math.round(store.settings.rate*100)}%`; save(); };
$('testVoice').onclick=()=>speak('Your word is: butterfly. Butterfly.');
const poolWords=()=>WORDS.filter(w=>store.settings.groups.includes(groupOf(w)));
const troubleWords=()=>WORDS.filter(w=>{const s=st(w.id); return s && s.m>0 && s.b<3;}).sort((a,b)=>st(b.id).m-st(a.id).m || st(a.id).b-st(b.id).b);

function pickWords(pool, n, order){
  let list=[...pool];
  if(order==='shuffle') shuffle(list);
  else if(order==='smart'){
    const score=w=>{ const s=st(w.id); if(!s||!s.s) return 1+w.id/1e4; const due=isDue(w.id); if(due && s.b===0) return 0+Math.random()*.5; if(due) return 2+s.b*.1+Math.random()*.05; return 3+s.b+Math.random()*.5; };
    list.sort((a,b)=>score(a)-score(b));
    list = n ? list.slice(0,n) : list;
    return shuffle(list);
  }
  return n ? list.slice(0,n) : list;
}

/* ---------- session ---------- */
let session=null;
function startSession(words){
  if(!words.length) return;
  session={queue:words.map(w=>({id:w.id,attempt:1})), idx:0, first:{}, done:false, total:words.length};
  show('practice'); nextWord(true);
}
$('startBtn').onclick=()=>startSession(pickWords(poolWords(), store.settings.len, store.settings.order));
$('missedBtn').onclick=()=>startSession(shuffle(troubleWords().slice(0, store.settings.len||undefined)));
$('endBtn').onclick=()=>finish();

let cur=null, answered=false;
function nextWord(){
  if(session.idx>=session.queue.length) return finish();
  cur=session.queue[session.idx]; answered=false;
  const w=byId[cur.id];
  const n=session.idx+1, tot=session.queue.length;
  $('countTxt').textContent=`${n} of ${tot}`;
  $('barFill').style.width = `${(session.idx/tot)*100}%`;
  $('wordNo').textContent = `#${w.id}`;
  $('retryTag').hidden = cur.attempt===1;
  $('retryTag').textContent = cur.attempt===2 ? 'Second chance' : 'Third chance';
  $('facts').innerHTML='';
  document.querySelectorAll('.ask').forEach(a=>a.dataset.used='false');
  $('answerForm').hidden=false; $('feedback').hidden=true;
  $('answer').value=''; $('answer').focus();
  speak(sayWord(w));
}
$('speakBtn').onclick=()=>speak(sayWord(byId[cur.id]));
function addFact(key,label,value){
  if(!$('facts').querySelector(`[data-k="${key}"]`))
    $('facts').insertAdjacentHTML('beforeend',`<div class="fact" data-k="${key}"><div class="label">${label}</div><div class="v">${esc(value)}</div></div>`);
}
$('asks').onclick=e=>{
  const b=e.target.closest('.ask'); if(!b||!cur) return;
  const w=byId[cur.id]; b.dataset.used='true';
  switch(b.dataset.ask){
    case 'repeat': speak(sayWord(w)); break;
    case 'slow': speak(sayWord(w), .6); break;
    case 'def': addFact('def','Definition',w.definition); speak(w.definition.replace(/^—\s*/,'')); break;
    case 'pos': addFact('pos','Part of speech',w.partOfSpeech); speak(`It is ${/^[aeiou]/i.test(w.partOfSpeech)?'an':'a'} ${w.partOfSpeech}.`); break;
    case 'origin': addFact('origin','Language of origin',w.origin); speak(`Language of origin: ${w.origin}.`); break;
    case 'sent': addFact('sent','Sentence',maskSentence(w)); speak(w.sentence.replace(new RegExp(w.word,'i'), sayWord(w))); break;
  }
  if(!answered) $('answer').focus({preventScroll:true});
};
$('answerForm').onsubmit=e=>{ e.preventDefault(); const v=$('answer').value; if(!norm(v)) { $('answer').focus(); return; } grade(v); };
$('dunnoBtn').onclick=()=>grade('');

function lcsMarks(a,b){ // a = attempt, b = correct (arrays of chars, normalized)
  const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]= a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const inA=new Array(n).fill(false), inB=new Array(m).fill(false); let i=0,j=0;
  while(i<n&&j<m){ if(a[i]===b[j]){inA[i]=inB[j]=true;i++;j++;} else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++; }
  return {inA,inB};
}
function grade(raw){
  if(answered) return; answered=true;
  const w=byId[cur.id];
  const ok = !!norm(raw) && [w.word,...w.alternates].some(s=>norm(s)===norm(raw));
  // spaced repetition: first attempt this round decides the box
  if(cur.attempt===1){
    const s=store.stats[w.id] || {b:0,s:0,m:0,l:0};
    s.s++; s.l=Date.now();
    if(ok){ s.b=Math.min(5,s.b+1); } else { s.b=0; s.m++; }
    store.stats[w.id]=s; save();
    session.first[w.id]=ok;
  }
  let requeued=false;
  if(!ok && cur.attempt<3){ session.queue.push({id:w.id,attempt:cur.attempt+1}); requeued=true; }
  $('answerForm').hidden=true;
  const fb=$('feedback'); fb.hidden=false; fb.className='feedback '+(ok?'ok':'no');
  const alt = w.alternates.length ? `<div class="muted" style="font-size:14px">Also accepted: ${w.alternates.map(esc).join(', ')}</div>` : '';
  let body;
  if(ok){
    body=`<h3>${cur.attempt===1?'Correct!':'Got it this time!'}</h3><div class="spell">${esc(w.word)}</div>${alt}`;
  } else {
    const A=[...norm(raw)], B=[...w.word];
    const {inA,inB}=lcsMarks(A,[...norm(w.word)]);
    const corr=B.map((c,i)=>inB[i]?esc(c):`<span class="x">${esc(c)}</span>`).join('');
    const mine=raw.trim()? A.map((c,i)=>inA[i]?esc(c):`<span class="gone">${esc(c)}</span>`).join('') : '<span class="muted">(skipped)</span>';
    body=`<h3>${raw.trim()?'Not quite':'Here it is'}</h3>
      <div class="cmp"><span class="label">Correct</span><span class="spell">${corr}</span>
      ${raw.trim()?`<span class="label">You wrote</span><span class="spell small">${mine}</span>`:''}</div>${alt}
      <div class="hint">${requeued?'This word comes back at the end of the round.':'We will keep it on your trouble list for next time.'} Underlined letters are the ones to watch.</div>`;
  }
  fb.innerHTML = body + `<div class="row"><button class="btn" id="spellOut">Spell it out loud</button><button class="btn primary" id="nextBtn">${session.idx+1>=session.queue.length?'Finish round':'Next word'} →</button></div>`;
  $('spellOut').onclick=()=>speak(`${sayWord(w)}. ${letters(w.word)}. ${sayWord(w)}.`, .85);
  $('nextBtn').onclick=()=>{ session.idx++; nextWord(); };
  $('nextBtn').focus();
  if(!ok) speak(`${sayWord(w)}. ${letters(w.word)}.`, .85);
}

function finish(){
  session.done=true; if(synth) synth.cancel();
  const ids=Object.keys(session.first).map(Number);
  const right=ids.filter(id=>session.first[id]).length, missed=ids.filter(id=>!session.first[id]);
  const pct= ids.length? Math.round(right/ids.length*100):0;
  const head = !ids.length ? 'Round ended' : pct===100 ? 'Perfect round!' : pct>=80 ? 'Great round!' : 'Good practice!';
  $('summary').innerHTML = `
    <h2 style="font-size:28px">${head}</h2>
    <div class="stats">
      <div class="stat"><b>${right}/${ids.length}</b><span>right on the first try</span></div>
      <div class="stat"><b>${pct}%</b><span>first-try score</span></div>
      <div class="stat"><b>${missed.length}</b><span>words to review</span></div>
    </div>
    ${missed.length?`<div class="label">Words to review</div><div class="wordrows">${missed.map(id=>{const w=byId[id];return `<div class="wr"><button class="icon" data-say="${id}" aria-label="Hear ${esc(w.word)}">${SPK}</button><span class="w">${esc(w.word)}</span><span class="d">${esc(w.definition)}</span></div>`}).join('')}</div>`:''}
    <div class="row">
      ${missed.length?'<button class="btn primary" id="againMissed">Practice these again</button>':''}
      <button class="btn ${missed.length?'':'primary'}" id="newRound">New round</button>
    </div>`;
  $('summary').querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>speak(sayWord(byId[b.dataset.say])));
  if($('againMissed')) $('againMissed').onclick=()=>{ const ws=missed.map(id=>byId[id]); session=null; startSession(shuffle(ws)); };
  $('newRound').onclick=()=>{ session=null; show('practice'); };
  show('practice');
}

/* ---------- word list ---------- */
$('gSel').innerHTML='<option value="all">All 450 words</option>'+groups.map(g=>`<option value="${g.key}">Words ${g.from}–${g.to}</option>`).join('')+'<option value="trouble">Trouble words</option>';
$('q').oninput=renderList; $('gSel').onchange=renderList;
function renderList(){
  const q=norm($('q').value), g=$('gSel').value;
  let ws=WORDS.filter(w=> g==='all' || (g==='trouble'? status(w.id)==='trouble' : groupOf(w)===+g));
  if(q) ws=ws.filter(w=>norm(w.word+' '+w.alternates.join(' ')+' '+w.definition+' '+w.origin).includes(q));
  $('listCount').textContent=`${ws.length} word${ws.length===1?'':'s'}`;
  $('listBody').innerHTML = ws.length ? ws.map(w=>{const s=status(w.id); return `<div class="list-item">
    <span class="n">${w.id}</span>
    <div class="body"><span class="w">${esc(w.word)}${w.alternates.length?` <span class="muted" style="font-size:14px">or ${w.alternates.map(esc).join(', ')}</span>`:''}</span>
    <span class="meta"><i>${esc(w.partOfSpeech)}</i> · ${esc(w.origin)}</span>
    <span class="def">${esc(w.definition)}</span>
    <span class="meta">“${esc(w.sentence)}”</span></div>
    <div class="side"><button class="icon" data-say="${w.id}" aria-label="Hear ${esc(w.word)}">${SPK}</button><span class="pill ${s}">${statusLabel[s]}</span></div></div>`}).join('')
    : '<p class="muted">No words match that search.</p>';
}
$('listBody').onclick=e=>{ const b=e.target.closest('[data-say]'); if(b) speak(sayWord(byId[b.dataset.say])); };

/* ---------- progress ---------- */
let confirming=false;
function renderProgress(){
  const c={new:0,learning:0,mastered:0,trouble:0}; WORDS.forEach(w=>c[status(w.id)]++);
  const practiced=WORDS.length-c.new;
  const trouble=troubleWords().slice(0,12);
  const col={mastered:'var(--good)',learning:'var(--honey)',trouble:'var(--miss)',new:'transparent'};
  $('progress').innerHTML=`
    <h2 style="font-size:24px">Progress</h2>
    <div class="stats">
      <div class="stat"><b>${c.mastered}</b><span>mastered (3+ correct reviews in a row)</span></div>
      <div class="stat"><b>${practiced}</b><span>words practiced of ${WORDS.length}</span></div>
      <div class="stat"><b>${c.trouble}</b><span>trouble words</span></div>
    </div>
    <div class="legend"><span><i style="background:var(--good)"></i>Mastered</span><span><i style="background:var(--honey)"></i>Learning</span><span><i style="background:var(--miss)"></i>Trouble</span><span><i style="background:var(--sunk);border:1px solid var(--line)"></i>New</span></div>
    <div style="display:flex;flex-direction:column;gap:8px">${groups.map(g=>{
      const ws=WORDS.filter(w=>groupOf(w)===g.key); const k={new:0,learning:0,mastered:0,trouble:0}; ws.forEach(w=>k[status(w.id)]++);
      return `<div class="gbar"><span>${g.from}–${g.to}</span><div class="stack" role="img" aria-label="${k.mastered} mastered, ${k.learning} learning, ${k.trouble} trouble, ${k.new} new">${['mastered','learning','trouble'].map(s=>`<i style="width:${k[s]/ws.length*100}%;background:${col[s]}"></i>`).join('')}</div><span class="muted">${k.mastered}/${ws.length}</span></div>`;}).join('')}</div>
    <div class="label">Most-missed words</div>
    ${trouble.length?`<div class="wordrows">${trouble.map(w=>`<div class="wr"><button class="icon" data-say="${w.id}" aria-label="Hear ${esc(w.word)}">${SPK}</button><span class="w">${esc(w.word)}</span><span class="d">missed ${st(w.id).m}×</span></div>`).join('')}</div>`:'<p class="muted" style="margin:0">No missed words yet. Words she misses will show up here.</p>'}
    <div class="hint">Smart review brings each word back after 1, 2, 4, 8, then 16 days while she keeps getting it right. A miss sends it back to the start. Progress is saved in this browser on this device.</div>
    <div id="resetArea">${confirming?`<div class="confirm"><span>Erase all progress on this device?</span><button class="btn" id="resetYes" style="border-color:var(--miss);color:var(--miss)">Erase progress</button><button class="btn ghost" id="resetNo">Keep it</button></div>`:'<button class="btn ghost" id="resetBtn">Reset progress…</button>'}</div>`;
  $('progress').querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>speak(sayWord(byId[b.dataset.say])));
  if($('resetBtn')) $('resetBtn').onclick=()=>{confirming=true;renderProgress();};
  if($('resetNo')) $('resetNo').onclick=()=>{confirming=false;renderProgress();};
  if($('resetYes')) $('resetYes').onclick=()=>{store.stats={};save();confirming=false;renderProgress();};
}

show('practice');
}
