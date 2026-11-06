import {loadState, saveState, downloadBackup, importBackup} from './storage.js';
import { $, $$, escapeHTML as e, shuffle, faNumber, dateLabel, todayKey, normalize, toast, shuffleOptions } from './utils.js';

const state = loadState();
let questions=[], lessons=[], videos=[];
let currentView='dashboard', activeExam=null, quizTimer=null, quizSeconds=0;
let examDomain='professional', examSubject='all';
let questionOffset=0, questionSearch='', questionDomain='all', questionSubject='all', questionDifficulty='all';
let wrongTab='wrong', selectedLesson=null, flashIndex=0, flashFlipped=false, focusTimer=null, focusRemaining=25*60;
const viewTitles={dashboard:'داشبورد',exam:'ساخت آزمون',quiz:'در حال آزمون',results:'نتیجه آزمون',questions:'بانک سؤالات',wrong:'اشتباهات و نشان‌شده‌ها',analytics:'کارنامه و تحلیل',tutor:'معلم هوشمند آفلاین',lessons:'درس‌نامه‌ها',flashcards:'فلش‌کارت‌ها',planner:'برنامه‌ریزی مطالعه',iq:'هوش ریاضی',videos:'ویدیوهای آموزشی',notes:'دفترچه یادداشت',settings:'پشتیبان و تنظیمات'};
const domains=[{id:'professional',label:'حیطه تخصصی و آموزشی'},{id:'elementary',label:'دروس ابتدایی'},{id:'iq',label:'هوش ریاضی'}];
const allQuestions=()=>questions;
const getQuestion=id=>questions.find(q=>q.id===id);
const getLessons=()=>lessons;
const allAttempts=()=>state.history||[];
const uniqueSubjects=domain=>[...new Set(questions.filter(q=>domain==='all'||q.domain===domain).map(q=>q.subject))].sort((a,b)=>a.localeCompare(b,'fa'));
const persist=()=>{const ok=saveState(state);if(!ok)toast('فضای ذخیره‌سازی مرورگر پر شده است؛ از پشتیبان خروجی بگیر.');};
const go=view=>{currentView=view;render();$('.sidebar')?.classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});};
const activeDaysCount=()=>new Set(state.activeDays||[]).size;
const markActiveDay=()=>{const k=todayKey();if(!state.activeDays.includes(k))state.activeDays.push(k);persist();};

async function boot(){
  try{
    const [p,el,iq,l,v]=await Promise.all([
      fetch('./data/professional.json').then(r=>{if(!r.ok)throw new Error('professional');return r.json()}),
      fetch('./data/elementary.json').then(r=>{if(!r.ok)throw new Error('elementary');return r.json()}),
      fetch('./data/iq-math.json').then(r=>{if(!r.ok)throw new Error('iq');return r.json()}),
      fetch('./data/lessons.json').then(r=>{if(!r.ok)throw new Error('lessons');return r.json()}),
      fetch('./data/videos.json').then(r=>{if(!r.ok)throw new Error('videos');return r.json()})
    ]);
    questions=[...p,...el,...iq]; lessons=l; videos=v;
    questions.sort((a,b)=>a.id.localeCompare(b.id));
    if(state.theme==='dark')document.body.classList.add('dark');
    $('#today-label').textContent=new Intl.DateTimeFormat('fa-IR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    $('#footer-bank-count').textContent=`${faNumber(questions.length)} سؤال در بانک تمرینی`;
    registerServiceWorker(); render();
  }catch(err){
    console.error(err);
    $('#view-container').innerHTML=`<div class="notice warn"><b>بارگذاری بانک سؤال ناموفق بود.</b><p>مطمئن شو تمام پوشه‌ها و فایل‌ها را با ساختار اصلی در GitHub بارگذاری کرده‌ای و سایت را از GitHub Pages باز می‌کنی؛ بازکردن index.html به شکل مستقیم از حافظه گوشی، بارگذاری JSON را مسدود می‌کند.</p></div>`;
  }
}
function registerServiceWorker(){if('serviceWorker' in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('SW:',err));}

function render(){
  $('#page-title').textContent=viewTitles[currentView]||'آموزگار هوشمند';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView || (currentView==='quiz'&&b.dataset.view==='exam') || (currentView==='results'&&b.dataset.view==='analytics')));
  const host=$('#view-container');
  const pages={dashboard:renderDashboard,exam:renderExamBuilder,quiz:renderQuiz,results:renderResults,questions:renderQuestions,wrong:renderWrong,analytics:renderAnalytics,tutor:renderTutor,lessons:renderLessons,flashcards:renderFlashcards,planner:renderPlanner,iq:renderIQ,videos:renderVideos,notes:renderNotes,settings:renderSettings};
  host.innerHTML=(pages[currentView]||renderDashboard)();
  if(currentView==='quiz')updateQuizClockUI();
  if(currentView==='flashcards')renderFlashcardFace();
  if(currentView==='tutor')scrollChatBottom();
}
function cardStat(icon,label,value,note,tone=''){return `<div class="stat-card"><div class="stat-icon ${tone}">${icon}</div><div><small>${label}</small><strong>${value}</strong><em>${note}</em></div></div>`;}
function totalAttempts(){return allAttempts().length;}
function overallAverage(){const h=allAttempts();return h.length?Math.round(h.reduce((s,a)=>s+a.percentage,0)/h.length):0;}
function lastAttempt(){return allAttempts()[0]||null;}
function recentSubjectStats(){const map={};allAttempts().forEach(a=>(a.subjectStats||[]).forEach(s=>{if(!map[s.subject])map[s.subject]={correct:0,total:0};map[s.subject].correct+=s.correct;map[s.subject].total+=s.total;}));return Object.entries(map).map(([subject,v])=>({subject,pct:v.total?Math.round(v.correct/v.total*100):0,...v})).sort((a,b)=>a.pct-b.pct);}
function renderDashboard(){
  const prof=questions.filter(q=>q.domain==='professional').length, elem=questions.filter(q=>q.domain==='elementary').length, iq=questions.filter(q=>q.domain==='iq').length;
  const wrong=state.wrongIds.length, book=state.bookmarks.length, plans=state.plans.filter(p=>!p.done).length;
  const weak=recentSubjectStats().slice(0,4);
  const goal=Number(state.dailyGoal)||30;
  return `<div class="hero"><div><span class="hero-kicker">مسیر حرفه‌ای آمادگی آزمون</span><h1>با تمرین هوشمند،<br>به معلمی آماده‌تر تبدیل شو.</h1><p>آزمون استخدامی، تحلیل نقاط ضعف، درس‌نامه‌های کاربردی و ۲۰۰ تمرین هوش ریاضی؛ همه در یک محیط فارسی و قابل نصب روی گوشی.</p><div class="hero-actions"><button class="btn btn-light" data-action="go-exam">شروع آزمون جدید ←</button><button class="btn btn-ghost" data-action="go-iq">تمرین هوش ریاضی</button></div></div><div class="hero-side"><div class="hero-ring" style="background:conic-gradient(#38d6bd 0deg ${overallAverage()*3.6}deg,#ffffff26 ${overallAverage()*3.6}deg 360deg)"><div class="hero-ring-inner"><strong>${faNumber(overallAverage())}٪</strong><small>میانگین آزمون‌ها</small></div></div></div></div>
  <div class="stats-grid">${cardStat('▤','تعداد آزمون‌ها',faNumber(totalAttempts()),'ثبت‌شده در این دستگاه')}${cardStat('∑','بانک سؤال‌ها',faNumber(questions.length),'۲۰۰۰ استخدامی + ۲۰۰ هوش','teal')}${cardStat('↺','سؤال‌های اشتباه',faNumber(wrong),'برای مرور دوباره','red')}${cardStat('▣','برنامه‌های باقی‌مانده',faNumber(plans),'کارهای مطالعه','orange')}</div>
  <div class="section-head"><div><h2>دسترسی سریع</h2><p>از اینجا مستقیم به بخش‌های پرکاربرد برو.</p></div></div>
  <div class="dashboard-grid"><div class="card"><h3>جعبه ابزار یادگیری</h3><p class="card-sub">تمرین، یادگیری و مرور هدفمند</p><div class="quick-grid">
    ${quick('▤','آزمون استخدامی','۱۰ تا ۵۰ سؤال','exam')}${quick('∑','هوش ریاضی','۲۰۰ تمرین با پاسخ','iq')}${quick('✧','معلم هوشمند','پرسش از درس‌نامه‌ها','tutor')}${quick('▥','تحلیل عملکرد','نقاط ضعف و پیشرفت','analytics')}${quick('☷','بانک سؤال','جست‌وجو و فیلتر','questions')}${quick('▶','فیلم آموزشی','جست‌وجوی ویدیوها','videos')}
  </div></div><div class="card"><h3>تمرکز امروز</h3><p class="card-sub">هدف روزانه مطالعه: ${faNumber(goal)} دقیقه</p><div class="timer-display" id="focus-display">۲۵:۰۰</div><div class="timer-controls"><button class="btn btn-primary btn-sm" data-action="timer-start">شروع ۲۵ دقیقه</button><button class="btn btn-ghost btn-sm" data-action="timer-reset">بازنشانی</button></div><div class="notice" style="margin-top:15px">⏱ پس از پایان هر نوبت تمرکز، یک استراحت کوتاه داشته باش. زمان‌سنج فقط در همین صفحه فعال می‌ماند.</div></div></div>
  <div class="section-head"><div><h2>درس‌هایی که نیاز به توجه دارند</h2><p>بر اساس پاسخ‌های آزمون‌های ثبت‌شده در همین مرورگر.</p></div><button class="text-link" data-view="analytics">مشاهده تحلیل کامل</button></div>
  <div class="card">${weak.length?`<div class="subject-list">${weak.map(s=>`<div class="subject-row"><span>${e(s.subject)}</span><div class="progress-track"><div class="progress-fill" style="width:${s.pct}%"></div></div><b>${faNumber(s.pct)}٪</b></div>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">▥</div>هنوز آزمونی ثبت نشده است. اولین آزمون را انجام بده تا تحلیل عملکردت ساخته شود.</div>`}</div>
  <div class="section-head"><div><h2>وضعیت بانک سؤال</h2><p>تقسیم‌بندی تمرین‌ها</p></div></div><div class="grid-3">${infoCard('حیطه تخصصی و آموزشی',prof,'۷ محور آموزشی','primary')}${infoCard('دروس ابتدایی',elem,'۵ درس اصلی','teal')}${infoCard('هوش ریاضی',iq,'۱۰ مهارت تمرینی','orange')}</div>`;
}
function quick(icon,title,sub,view){return `<button class="quick-action" data-view="${view}"><span class="quick-ico">${icon}</span><span><b>${title}</b><small>${sub}</small></span></button>`;}
function infoCard(title,num,desc,tone){return `<div class="card"><div class="question-meta"><span class="tag ${tone==='teal'?'teal':tone==='orange'?'orange':''}">${desc}</span></div><h3>${title}</h3><strong style="font-size:28px">${faNumber(num)}</strong><p class="card-sub">سؤال تمرینی چهارگزینه‌ای</p></div>`;}

function renderExamBuilder(iqOnly=false){
  const dom=iqOnly?'iq':examDomain;
  const subjects=uniqueSubjects(dom);
  const selected=examSubject;
  const count=dom==='iq'?200:dom==='professional'?1000:1000;
  return `<div class="section-head"><div><h2>${iqOnly?'آزمون هوش ریاضی':'ساخت آزمون استخدامی'}</h2><p>آزمون شخصی‌سازی‌شده بساز؛ نتیجه بلافاصله تصحیح می‌شود.</p></div><span class="tag">${faNumber(count)} سؤال در این بخش</span></div>
  <div class="grid-2"><div class="card"><h3>تنظیمات آزمون</h3><p class="card-sub">سطح و تعداد را انتخاب کن. گزینه‌ها هنگام شروع جابه‌جا می‌شوند.</p>
  <div class="form-grid"><div class="field-wrap"><label>حیطه</label><select class="select" id="exam-domain" ${iqOnly?'disabled':''}>${domains.map(d=>`<option value="${d.id}" ${d.id===dom?'selected':''}>${d.label}</option>`).join('')}</select></div>
  <div class="field-wrap"><label>درس</label><select class="select" id="exam-subject"><option value="all">همه درس‌ها</option>${subjects.map(s=>`<option value="${e(s)}" ${s===selected?'selected':''}>${e(s)}</option>`).join('')}</select></div>
  <div class="field-wrap"><label>تعداد سؤال</label><select class="select" id="exam-count">${[10,20,30,50].map(n=>`<option value="${n}">${faNumber(n)} سؤال</option>`).join('')}</select></div>
  <div class="field-wrap"><label>سطح دشواری</label><select class="select" id="exam-difficulty"><option value="all">ترکیبی از همه سطح‌ها</option><option>آسان</option><option>متوسط</option><option>دشوار</option></select></div>
  <div class="field-wrap"><label>ترتیب سؤال‌ها</label><select class="select" id="exam-order"><option value="random">تصادفی</option><option value="topic">بر اساس موضوع</option></select></div>
  <div class="field-wrap"><label>زمان آزمون</label><select class="select" id="exam-time"><option value="60">۶۰ ثانیه برای هر سؤال</option><option value="90">۹۰ ثانیه برای هر سؤال</option><option value="0">بدون محدودیت زمانی</option></select></div></div>
  <div class="notice" style="margin-top:14px">پاسخ درست تا زمان تحویل آزمون نمایش داده نمی‌شود. پس از ثبت، کارنامه و پاسخ تشریحی هر سؤال را می‌بینی.</div>
  <button class="btn btn-primary" style="width:100%;margin-top:15px" data-action="start-exam" ${iqOnly?'data-domain-override="iq"':''}>شروع آزمون ←</button></div>
  <div class="card"><h3>نکته‌های آزمون</h3><p class="card-sub">برای نتیجه قابل اعتمادتر</p><div class="list-card"><div class="stat-icon">✓</div><div class="list-body"><h4>بدون عجله پاسخ بده</h4><p>صورت سؤال را کامل بخوان و گزینه‌ها را با هم مقایسه کن.</p></div></div><div class="list-card"><div class="stat-icon teal">✎</div><div class="list-body"><h4>سؤال‌های دشوار را علامت بزن</h4><p>می‌توانی به سؤال قبلی برگردی و پاسخ را تغییر بدهی.</p></div></div><div class="list-card"><div class="stat-icon orange">↺</div><div class="list-body"><h4>بعد از آزمون اشتباهات را مرور کن</h4><p>سؤال‌های غلط برای مرور در بخش اشتباهات ذخیره می‌شوند.</p></div></div><div class="notice warn">این بانک برای تمرین و یادگیری تألیف شده و سؤال رسمی یا تضمین‌کننده پوشش کامل منابع آزمون استخدامی نیست. با منابع و دفترچه رسمی آزمون نیز تطبیق بده.</div></div></div>`;
}
function renderExam(){return renderExamBuilder(false);}
function renderIQ(){return `<div class="hero" style="margin-bottom:18px"><div><span class="hero-kicker">کارگاه مهارت‌های استدلالی</span><h1>هوش ریاضی را مرحله‌به‌مرحله تقویت کن.</h1><p>۲۰۰ تست چهارگزینه‌ای در دنباله‌ها، محاسبه، کسر، هندسه، زمان، منطق، سن و احتمال؛ همراه با پاسخ تشریحی و درس‌نامه حل تست.</p><div class="hero-actions"><button class="btn btn-light" data-action="go-iq-exam">شروع آزمون هوش</button><button class="btn btn-ghost" data-view="lessons" data-filter-lessons="هوش ریاضی">آموزش روش حل</button></div></div><div class="hero-side"><div class="hero-ring"><div class="hero-ring-inner"><strong>۲۰۰</strong><small>تمرین هوش ریاضی</small></div></div></div></div>
  <div class="section-head"><div><h2>حوزه‌های تمرین</h2><p>از پایه شروع کن و به سؤال‌های دشوار برس.</p></div></div><div class="grid-3">${['دنباله عددی','الگوی ضربی','ترتیب عملیات','تقسیم و تناسب','کسر و مقایسه','هندسه و مساحت','زمان و ساعت','استدلال منطقی','مسئله سن','احتمال ساده'].map((t,i)=>`<button class="lesson-card" data-action="iq-topic" data-topic="${t}"><span class="tag ${i%3===1?'teal':i%3===2?'orange':''}">مهارت ${faNumber(i+1)}</span><h3>${t}</h3><p>تمرین هدفمند و تحلیل پاسخ‌ها</p><b class="text-link">شروع تمرین ←</b></button>`).join('')}</div>
  <div class="section-head"><div><h2>آزمون هوش ریاضی</h2><p>تعداد تست و سطح را انتخاب کن.</p></div></div>${renderExamBuilder(true)}
  <div class="notice warn" style="margin-top:15px">ویدیوها با جست‌وجوی موضوعی YouTube باز می‌شوند؛ این پروژه فایل ویدیویی را میزبانی نمی‌کند و برای پخش ویدیو به اینترنت نیاز است.</div>`;}

function renderQuiz(){
  if(!activeExam)return `<div class="empty-state">آزمونی در حال اجرا نیست. <button class="btn btn-primary" data-view="exam">ساخت آزمون</button></div>`;
  const q=activeExam.items[activeExam.index], selected=activeExam.answers[q.id];
  const domainLabel=domains.find(d=>d.id===activeExam.domain)?.label||'تمرین';
  return `<div class="quiz-top"><div><span class="tag">${e(domainLabel)}</span><div class="quiz-progress-text">سؤال ${faNumber(activeExam.index+1)} از ${faNumber(activeExam.items.length)} · پاسخ داده‌شده ${faNumber(Object.keys(activeExam.answers).length)}</div></div><div class="quiz-timer" id="quiz-clock">${activeExam.timed?formatTime(quizSeconds):'بدون محدودیت'}</div></div>
  <div class="progress-track" style="margin-bottom:15px"><div class="progress-fill" style="width:${(activeExam.index+1)/activeExam.items.length*100}%"></div></div>
  <div class="question-card"><div class="question-meta"><span class="tag">${e(q.subject)}</span><span class="tag teal">${e(q.topic)}</span><span class="tag orange">${e(q.difficulty)}</span><button class="text-link" data-action="toggle-flag" style="margin-right:auto">${activeExam.flagged.includes(q.id)?'★ نشان‌دار شده':'☆ نشان‌کردن سؤال'}</button></div>
  <h2 class="question-title">${e(q.question)}</h2><div class="option-list">${q.options.map((o,i)=>`<button class="option-btn ${selected===i?'selected':''}" data-action="answer" data-opt="${i}"><span class="option-letter">${['الف','ب','ج','د'][i]}</span><span>${e(o)}</span></button>`).join('')}</div>
  <div class="quiz-nav"><button class="btn btn-ghost" data-action="quiz-prev" ${activeExam.index===0?'disabled':''}>→ قبلی</button><span class="quiz-progress-text">${activeExam.index+1} / ${activeExam.items.length}</span>${activeExam.index===activeExam.items.length-1?'<button class="btn btn-teal" data-action="submit-exam">ثبت و تصحیح آزمون</button>':'<button class="btn btn-primary" data-action="quiz-next">سؤال بعدی ←</button>'}</div></div>
  <div class="card" style="margin-top:13px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:11px">نقشه سؤال‌ها</b><small class="helper">برای رفتن مستقیم، شماره را انتخاب کن.</small></div><div class="check-row" style="margin-top:10px">${activeExam.items.map((item,i)=>`<button class="pill ${i===activeExam.index?'active':''}" data-action="jump-question" data-index="${i}" style="min-width:33px">${i+1}${activeExam.flagged.includes(item.id)?'★':''}${activeExam.answers[item.id]!==undefined?'•':''}</button>`).join('')}</div></div>
  <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-danger btn-sm" data-action="submit-exam">پایان و تصحیح آزمون</button></div>`;
}
function formatTime(sec){const m=Math.floor(sec/60),s=sec%60;return `${faNumber(String(m).padStart(2,'0'))}:${faNumber(String(s).padStart(2,'0'))}`;}
function updateQuizClockUI(){const el=$('#quiz-clock');if(el&&activeExam?.timed)el.textContent=formatTime(quizSeconds);}
function startExam({domain,subject='all',difficulty='all',count=10,order='random',time=60,topic='all'}={}){
  let pool=questions.filter(q=>q.domain===domain);
  if(topic!=='all')pool=pool.filter(q=>q.topic===topic);
  if(subject!=='all')pool=pool.filter(q=>q.subject===subject);
  if(difficulty!=='all')pool=pool.filter(q=>q.difficulty===difficulty);
  if(!pool.length){toast('برای این ترکیب سؤالی پیدا نشد. سطح یا درس را تغییر بده.');return;}
  if(pool.length<count){toast(`فقط ${faNumber(pool.length)} سؤال با این فیلتر موجود است؛ آزمون با همین تعداد ساخته می‌شود.`);count=pool.length;}
  let sample=shuffle(pool).slice(0,count).map(shuffleOptions);
  if(order==='topic')sample.sort((a,b)=>a.topic.localeCompare(b.topic,'fa'));
  activeExam={domain,items:sample,answers:{},index:0,flagged:[],subject,startedAt:new Date().toISOString(),timed:Number(time)>0,secondsPerQuestion:Number(time)||0};
  quizSeconds=activeExam.timed?sample.length*activeExam.secondsPerQuestion:0;
  clearInterval(quizTimer);
  if(activeExam.timed)quizTimer=setInterval(()=>{quizSeconds--;updateQuizClockUI();if(quizSeconds<=0){clearInterval(quizTimer);finishExam(true);}},1000);
  markActiveDay();go('quiz');
}
function finishExam(auto=false){
  if(!activeExam)return;
  clearInterval(quizTimer);quizTimer=null;
  const items=activeExam.items;
  let correct=0,wrong=0,blank=0;
  const subjectMap={};const resultItems=[];
  for(const q of items){
    const selected=activeExam.answers[q.id];
    const isCorrect=selected!==undefined&&selected===q.answer;
    if(selected===undefined)blank++;else if(isCorrect)correct++;else wrong++;
    if(!subjectMap[q.subject])subjectMap[q.subject]={subject:q.subject,total:0,correct:0,wrong:0,blank:0};
    const s=subjectMap[q.subject];s.total++;if(selected===undefined)s.blank++;else if(isCorrect)s.correct++;else s.wrong++;
    resultItems.push({id:q.id,selected,correctIndex:q.answer,isCorrect,blank:selected===undefined,options:[...q.options],question:q.question,explanation:q.explanation,subject:q.subject,topic:q.topic,difficulty:q.difficulty});
    if(selected!==undefined&&!isCorrect&&!state.wrongIds.includes(q.id))state.wrongIds.push(q.id);
    if(isCorrect)state.reviewedIds.push(q.id);
  }
  const pct=Math.round(correct/items.length*100);
  const attempt={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,date:new Date().toISOString(),domain:activeExam.domain,count:items.length,correct,wrong,blank,percentage:pct,subjectStats:Object.values(subjectMap),items:resultItems,auto};
  state.history.unshift(attempt);state.history=state.history.slice(0,100);persist();
  window.lastAttemptId=attempt.id;activeExam=null;go('results');
}
function getCurrentAttempt(){return state.history.find(a=>a.id===window.lastAttemptId)||state.history[0];}
function renderResults(){
  const a=getCurrentAttempt();if(!a)return `<div class="empty-state">هنوز نتیجه‌ای وجود ندارد.</div>`;
  const domainLabel=domains.find(d=>d.id===a.domain)?.label||a.domain;
  const attemptsItems=a.items.map(it=>({it,q:{...getQuestion(it.id),...it,options:it.options||getQuestion(it.id)?.options,answer:it.correctIndex??getQuestion(it.id)?.answer}})).filter(x=>x.q);
  return `<div class="section-head"><div><h2>کارنامه آزمون</h2><p>${e(domainLabel)} · ${dateLabel(a.date)} ${a.auto?'· پایان خودکار به علت اتمام زمان':''}</p></div><button class="btn btn-ghost btn-sm" data-view="exam">آزمون جدید</button></div>
  <div class="result-score"><div class="score-circle" style="--score:${a.percentage*3.6}deg"><span>${faNumber(a.percentage)}٪</span></div><div style="flex:1"><span class="tag teal">${a.percentage>=80?'عملکرد عالی':a.percentage>=60?'خوب؛ جای پیشرفت دارد':a.percentage>=40?'نیازمند مرور هدفمند':'نیازمند بازآموزی'}</span><h2 style="margin:5px 0;font-size:18px">${faNumber(a.correct)} پاسخ درست از ${faNumber(a.count)}</h2><p class="card-sub">درصد بر اساس تعداد پاسخ درست محاسبه شده است؛ نمره منفی در این نسخه اعمال نمی‌شود.</p><div class="result-breakdown">${miniStat('درست',a.correct,'teal')}${miniStat('غلط',a.wrong,'red')}${miniStat('بی‌پاسخ',a.blank,'orange')}</div></div></div>
  <div class="grid-2"><div class="card"><h3>عملکرد به تفکیک درس</h3><p class="card-sub">درصد پاسخ‌های صحیح در این آزمون</p><div class="chart-bars">${a.subjectStats.map(s=>`<div class="chart-row"><span>${e(s.subject)}</span><div class="bar-bg"><div class="bar-fill" style="width:${s.total?s.correct/s.total*100:0}%"></div></div><b>${faNumber(Math.round(s.correct/s.total*100))}٪</b></div>`).join('')}</div></div><div class="card"><h3>گام بعدی پیشنهادی</h3><p class="card-sub">براساس پاسخ‌های همین آزمون</p><p class="lesson-content">${a.wrong?`ابتدا ${faNumber(a.wrong)} سؤال نادرست را در بخش «اشتباهات» مرور کن. بعد از خواندن پاسخ تشریحی، یک آزمون دیگر از همان درس بساز.`:'بسیار خوب! برای تثبیت یادگیری، یک آزمون دیگر با سطح دشوارتر انجام بده.'}</p><button class="btn btn-primary btn-sm" data-view="wrong">مرور سؤال‌های اشتباه</button></div></div>
  <div class="section-head"><div><h2>بررسی پاسخ‌ها</h2><p>پاسخ درست و توضیح هر سؤال</p></div></div>
  ${attemptsItems.map(({it,q},i)=>`<div class="list-card" style="display:block"><div class="question-meta"><span class="tag ${it.isCorrect?'teal':'red'}">${it.blank?'بی‌پاسخ':it.isCorrect?'درست':'نادرست'}</span><span class="tag">${e(q.subject)}</span><span class="tag orange">${e(q.topic)}</span></div><h4>${faNumber(i+1)}. ${e(q.question)}</h4><p>پاسخ صحیح: <b>${e(q.options[q.answer])}</b>${it.selected!==undefined?` · پاسخ شما: <b>${e(q.options[it.selected])}</b>`:''}</p><div class="answer-explain ${it.isCorrect?'':'bad'}">${e(q.explanation)}</div></div>`).join('')}
  <div class="notice" style="margin-top:14px">نتایج روی همین مرورگر ذخیره می‌شوند. برای انتقال به گوشی دیگر از بخش پشتیبان، خروجی بگیر.</div>`;
}
function miniStat(label,value,tone){return `<div class="mini-stat"><b style="color:${tone==='teal'?'var(--teal)':tone==='red'?'var(--red)':'var(--orange)'}">${faNumber(value)}</b><small>${label}</small></div>`;}

function renderQuestions(){
  const pool=questions.filter(q=>(questionDomain==='all'||q.domain===questionDomain)&&(questionSubject==='all'||q.subject===questionSubject)&&(questionDifficulty==='all'||q.difficulty===questionDifficulty)&&(!questionSearch||normalize(`${q.question} ${q.subject} ${q.topic} ${q.explanation}`).includes(normalize(questionSearch))));
  const shown=pool.slice(0,questionOffset+25);
  return `<div class="section-head"><div><h2>بانک جامع سؤالات</h2><p>${faNumber(pool.length)} نتیجه از ${faNumber(questions.length)} سؤال</p></div><button class="btn btn-primary btn-sm" data-view="exam">ساخت آزمون</button></div>
  <div class="card"><div class="form-grid"><div class="field-wrap"><label>جست‌وجوی متن و موضوع</label><input class="field" id="question-search" value="${e(questionSearch)}" placeholder="مثلاً روایی، دنباله، ضرب، بازخورد…"></div><div class="field-wrap"><label>حیطه</label><select class="select" id="question-domain"><option value="all">همه</option>${domains.map(d=>`<option value="${d.id}" ${questionDomain===d.id?'selected':''}>${d.label}</option>`).join('')}</select></div><div class="field-wrap"><label>درس</label><select class="select" id="question-subject"><option value="all">همه درس‌ها</option>${uniqueSubjects(questionDomain).map(s=>`<option ${questionSubject===s?'selected':''}>${e(s)}</option>`).join('')}</select></div><div class="field-wrap"><label>سطح دشواری</label><select class="select" id="question-difficulty"><option value="all">همه سطح‌ها</option>${['آسان','متوسط','دشوار'].map(s=>`<option ${questionDifficulty===s?'selected':''}>${s}</option>`).join('')}</select></div></div></div>
  <div style="margin-top:15px">${shown.map(q=>renderLibraryQuestion(q)).join('')||'<div class="empty-state">سؤالی با این فیلتر پیدا نشد.</div>'}</div>
  ${shown.length<pool.length?`<div style="text-align:center;margin-top:12px"><button class="btn btn-ghost" data-action="load-more">نمایش سؤال‌های بیشتر (${faNumber(pool.length-shown.length)} باقی‌مانده)</button></div>`:''}`;
}
function renderLibraryQuestion(q){const marked=state.bookmarks.includes(q.id);return `<div class="list-card" style="display:block"><div class="question-meta"><span class="tag">${e(q.subject)}</span><span class="tag teal">${e(q.topic)}</span><span class="tag orange">${e(q.difficulty)}</span><button class="text-link" style="margin-right:auto" data-action="bookmark" data-id="${q.id}">${marked?'★ نشان‌شده':'☆ ذخیره'}</button></div><h4>${e(q.question)}</h4><p>${q.options.map((o,i)=>`${['الف','ب','ج','د'][i]}) ${e(o)}`).join('　')}</p><details style="margin-top:7px"><summary class="text-link">نمایش پاسخ تشریحی</summary><div class="answer-explain">پاسخ صحیح: <b>${e(q.options[q.answer])}</b><br>${e(q.explanation)}</div></details></div>`;}
function renderWrong(){
  const ids=wrongTab==='wrong'?state.wrongIds:state.bookmarks;
  const list=ids.map(getQuestion).filter(Boolean);
  return `<div class="section-head"><div><h2>مرور هدفمند</h2><p>اشتباهات و سؤال‌های نشان‌شده را دوباره تمرین کن.</p></div><span class="tag">${faNumber(list.length)} سؤال</span></div>
  <div class="check-row" style="margin-bottom:15px"><button class="pill ${wrongTab==='wrong'?'active':''}" data-action="wrong-tab" data-tab="wrong">اشتباهات (${faNumber(state.wrongIds.length)})</button><button class="pill ${wrongTab==='bookmarks'?'active':''}" data-action="wrong-tab" data-tab="bookmarks">نشان‌شده‌ها (${faNumber(state.bookmarks.length)})</button></div>
  ${list.length?list.map(q=>`<div class="list-card" style="display:block"><div class="question-meta"><span class="tag">${e(q.subject)}</span><span class="tag teal">${e(q.topic)}</span><span class="tag orange">${e(q.difficulty)}</span></div><h4>${e(q.question)}</h4><details><summary class="text-link">دیدن پاسخ و توضیح</summary><div class="answer-explain">پاسخ: <b>${e(q.options[q.answer])}</b><br>${e(q.explanation)}</div></details><div class="list-actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-action="mark-reviewed" data-id="${q.id}">علامت‌گذاری به‌عنوان مرور شد</button><button class="btn btn-ghost btn-sm" data-action="bookmark" data-id="${q.id}">${state.bookmarks.includes(q.id)?'حذف نشان':'نشان‌کردن'}</button><button class="btn btn-primary btn-sm" data-action="practice-one" data-id="${q.id}">تمرین همین سؤال</button></div></div>`).join(''):`<div class="empty-state"><div class="empty-icon">↺</div>${wrongTab==='wrong'?'هنوز سؤال اشتباهی ثبت نشده است. بعد از اولین آزمون، سؤال‌های غلط اینجا می‌آیند.':'هنوز سؤالی نشان نکرده‌ای.'}</div>`}`;
}
function renderAnalytics(){
  const hist=allAttempts();const sub=recentSubjectStats();const weak=sub.slice(0,5);
  return `<div class="section-head"><div><h2>کارنامه و تحلیل عملکرد</h2><p>تحلیل بر اساس آزمون‌های انجام‌شده در مرورگر فعلی</p></div><button class="btn btn-ghost btn-sm" data-action="export-csv">خروجی کارنامه CSV</button></div>
  <div class="stats-grid">${cardStat('▤','آزمون‌های ثبت‌شده',faNumber(hist.length),'کل تاریخچه')}${cardStat('٪','میانگین درصد',faNumber(overallAverage())+'٪','میانگین آزمون‌ها','teal')}${cardStat('↺','سؤال اشتباه',faNumber(state.wrongIds.length),'نیازمند مرور','red')}${cardStat('◷','روزهای مطالعه',faNumber(activeDaysCount()),'روزهای ثبت‌شده','orange')}</div>
  <div class="grid-2" style="margin-top:15px"><div class="card"><h3>درصد عملکرد به تفکیک درس</h3><p class="card-sub">میانگین تجمیعی پاسخ‌های درست هر درس</p>${sub.length?`<div class="chart-bars">${sub.map(s=>`<div class="chart-row"><span>${e(s.subject)}</span><div class="bar-bg"><div class="bar-fill" style="width:${s.pct}%"></div></div><b>${faNumber(s.pct)}٪</b></div>`).join('')}</div>`:'<div class="empty-state">برای ساخت نمودار، ابتدا آزمون انجام بده.</div>'}</div>
  <div class="card"><h3>نقاط ضعف پیشنهادی</h3><p class="card-sub">درس‌هایی که کمترین درصد را دارند</p>${weak.length?weak.map(s=>`<div class="list-card"><div class="list-body"><h4>${e(s.subject)}</h4><p>${faNumber(s.correct)} پاسخ درست از ${faNumber(s.total)}</p></div><span class="tag red">${faNumber(s.pct)}٪</span></div>`).join(''):'<div class="empty-state">هنوز داده‌ای برای شناسایی نقاط ضعف وجود ندارد.</div>'}</div></div>
  <div class="section-head"><div><h2>تاریخچه آزمون‌ها</h2><p>آخرین ۱۰۰ آزمون این دستگاه</p></div></div><div class="card">${hist.length?hist.map(a=>`<div class="planner-item"><div class="stat-icon ${a.percentage>=70?'teal':'orange'}">▤</div><div class="planner-text"><b>${e(domains.find(d=>d.id===a.domain)?.label||a.domain)}</b><small>${dateLabel(a.date)} · ${faNumber(a.count)} سؤال · ${faNumber(a.correct)} درست</small></div><b>${faNumber(a.percentage)}٪</b><button class="btn btn-ghost btn-sm" data-action="open-attempt" data-id="${a.id}">کارنامه</button></div>`).join(''):'<div class="empty-state">تاریخچه آزمون خالی است.</div>'}</div>
  <div class="notice" style="margin-top:14px">این گزارش فقط داده‌های ذخیره‌شده در همین مرورگر را می‌خواند. پاک کردن داده‌های مرورگر بدون تهیه پشتیبان می‌تواند تاریخچه را حذف کند.</div>`;
}
function renderTutor(){
  const msgs=window.tutorMessages||[{role:'bot',text:'سلام! من معلم هوشمند آفلاین آموزگار هستم. می‌توانم از درس‌نامه‌ها و بانک سؤال همین برنامه برایت توضیح پیدا کنم، سؤال‌های مشابه پیشنهاد بدهم و اشتباهاتت را تحلیل کنم.\n\nنمونه: «روایی و پایایی را توضیح بده»، «روش حل دنباله چیست؟»، «اشتباهاتم را تحلیل کن».'}];window.tutorMessages=msgs;
  return `<div class="section-head"><div><h2>معلم هوشمند آفلاین</h2><p>پاسخ‌گویی بر اساس درس‌نامه‌ها و بانک محتوای داخلی</p></div><span class="tag teal">بدون کلید API</span></div>
  <div class="notice warn" style="margin-bottom:13px"><b>شفافیت فنی:</b> چون این پروژه فقط روی GitHub Pages اجرا می‌شود و سرور یا مدل هوش مصنوعی بیرونی ندارد، این دستیار یک موتور راهنمای آفلاین و جست‌وجوی آموزشی است؛ چت آزاد با مدل زبانی واقعی ارائه نمی‌کند. کلید محرمانه API را نباید داخل کد عمومی GitHub گذاشت.</div>
  <div class="grid-2"><div class="chat-box"><div class="chat-messages" id="chat-messages">${msgs.map(m=>`<div class="chat-msg ${m.role==='user'?'user':'bot'}">${e(m.text)}</div>`).join('')}</div><form class="chat-compose" id="tutor-form"><input class="field" id="tutor-input" placeholder="سؤالت را درباره درس یا آزمون بنویس…" autocomplete="off"><button class="btn btn-primary">ارسال</button></form></div><div class="card"><h3>میان‌برهای آموزشی</h3><p class="card-sub">برای شروع، یکی را انتخاب کن.</p><div class="quick-grid" style="grid-template-columns:1fr">${['روایی و پایایی را توضیح بده','تفاوت ارزشیابی تشخیصی و تکوینی چیست؟','روش حل دنباله عددی را آموزش بده','اشتباهاتم را تحلیل کن','یک آزمون ۱۰ سؤالی بساز'].map(x=>`<button class="quick-action" data-action="tutor-prompt" data-prompt="${x}"><span class="quick-ico">✧</span><span><b>${x}</b><small>ارسال به معلم آفلاین</small></span></button>`).join('')}</div><div class="notice" style="margin-top:12px">برای دریافت توضیح، واژه کلیدی یا عنوان یک موضوع را دقیق بنویس. پاسخ‌ها از محتوای داخلی بازیابی می‌شوند.</div></div></div>`;
}
function scrollChatBottom(){const el=$('#chat-messages');if(el)el.scrollTop=el.scrollHeight;}
function tutorReply(prompt){
  const p=normalize(prompt);
  if(/آزمون|تست|سوال|سؤال/.test(p)){go('exam');return 'بخش ساخت آزمون باز شد. حیطه، تعداد و سطح را انتخاب کن تا آزمون تازه ساخته شود.';}
  if(/اشتباه|غلط|ضعف/.test(p)){const list=state.wrongIds.map(getQuestion).filter(Boolean);if(!list.length)return 'هنوز سؤال اشتباهی در تاریخچه وجود ندارد. ابتدا یک آزمون انجام بده.';const by={};list.forEach(q=>by[q.subject]=(by[q.subject]||0)+1);return `تعداد سؤال‌های اشتباه ذخیره‌شده: ${faNumber(list.length)}\n\nتمرکز اشتباه‌ها:\n${Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`• ${s}: ${faNumber(n)} سؤال`).join('\n')}\n\nپیشنهاد: ابتدا دو سؤال از پرتکرارترین درس را با پاسخ تشریحی مرور کن. بخش اشتباهات را باز کردم.`;}
  const terms=p.split(/[\s،؛,.؟?!]+/).filter(x=>x.length>2);
  const scored=lessons.map(l=>{const text=normalize(`${l.title} ${l.group} ${l.summary} ${l.content} ${l.key}`);return {l,score:terms.reduce((s,t)=>s+(text.includes(t)?1:0),0)};}).sort((a,b)=>b.score-a.score).filter(x=>x.score>0).slice(0,2);
  if(scored.length){return scored.map(({l})=>`📘 ${l.title}\n${l.summary}\n\n${l.content}\n\nنمونه: ${l.example}\n\nنکته کلیدی: ${l.key}`).join('\n\n──────────\n\n');}
  const qmatch=questions.map(q=>({q,score:terms.reduce((s,t)=>s+(normalize(`${q.subject} ${q.topic} ${q.question}`).includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).filter(x=>x.score>0).slice(0,3);
  if(qmatch.length)return `این سؤال‌ها به موضوعت نزدیک‌اند:\n\n${qmatch.map(({q})=>`• ${q.question}\nپاسخ: ${q.options[q.answer]}\nتوضیح: ${q.explanation}`).join('\n\n')}`;
  return 'در محتوای آفلاین پاسخ دقیقی برای این عبارت پیدا نکردم. موضوع را کوتاه‌تر و با واژه کلیدی بنویس؛ مثلاً «داربست آموزشی»، «پایایی»، «دنباله حسابی» یا «محیط مستطیل». این دستیار دانش عمومی نامحدود یک مدل هوش مصنوعی را ندارد.';
}
function appendTutor(role,text){window.tutorMessages=window.tutorMessages||[];window.tutorMessages.push({role,text});if(window.tutorMessages.length>40)window.tutorMessages=window.tutorMessages.slice(-40);render();}

function renderLessons(){
  if(selectedLesson){const l=lessons.find(x=>x.id===selectedLesson);if(l)return `<div class="section-head"><div><button class="text-link" data-action="lesson-back">← بازگشت به درس‌نامه‌ها</button><h2>${e(l.title)}</h2><p>${e(l.group)} · ${e(l.level)}</p></div></div><div class="card"><span class="tag">${e(l.group)}</span><p class="lesson-content">${e(l.summary)}</p><div class="lesson-content">${e(l.content)}</div><h4>نمونه کاربردی</h4><div class="example">${e(l.example)}</div><div class="notice success" style="margin-top:13px">نکته کلیدی: ${e(l.key)}</div><div class="list-actions" style="margin-top:15px"><button class="btn btn-primary btn-sm" data-action="lesson-flash" data-id="${l.id}">افزودن به مرور فلش‌کارت</button><button class="btn btn-ghost btn-sm" data-action="tutor-prompt" data-prompt="${e(l.title)} را توضیح بده">پرسش از معلم آفلاین</button></div></div>`;}
  const groups=[...new Set(lessons.map(l=>l.group))];
  return `<div class="section-head"><div><h2>درس‌نامه‌های فشرده و کاربردی</h2><p>${faNumber(lessons.length)} درس‌نامه برای مرور مفاهیم مهم</p></div><span class="tag">قابل مطالعه آفلاین پس از بارگذاری</span></div><div class="check-row" style="margin-bottom:15px"><button class="pill active" data-action="lesson-filter" data-group="all">همه موضوع‌ها</button>${groups.map(g=>`<button class="pill" data-action="lesson-filter" data-group="${e(g)}">${e(g)}</button>`).join('')}</div><div class="grid-3" id="lessons-grid">${lessons.map(l=>`<button class="lesson-card" data-action="open-lesson" data-id="${l.id}" data-group="${e(l.group)}"><span class="tag">${e(l.group)}</span><h3>${e(l.title)}</h3><p>${e(l.summary)}</p><b class="text-link">مطالعه درس ←</b></button>`).join('')}</div>`;
}
function renderFlashcards(){
  const deck=[...lessons.map(l=>({id:`lesson-${l.id}`,front:l.title,back:`${l.summary}\n\n${l.key}`})),...state.customCards.map(c=>({id:c.id,front:c.front,back:c.back})),...state.wrongIds.map(getQuestion).filter(Boolean).slice(0,40).map(q=>({id:`q-${q.id}`,front:q.question,back:`پاسخ: ${q.options[q.answer]}\n${q.explanation}`}))];
  window.flashDeck=deck;flashIndex=Math.max(0,Math.min(flashIndex,deck.length-1));
  return `<div class="section-head"><div><h2>فلش‌کارت و مرور فعال</h2><p>روی کارت بزن تا پاسخ را ببینی؛ یادگیری را با یادآوری فعال تثبیت کن.</p></div><span class="tag">${faNumber(deck.length)} کارت</span></div>
  <div class="grid-2"><div><div class="flashcard" id="flashcard" data-action="flip-card"><div class="fc-hint">${flashFlipped?'پاسخ':'روی کارت بزن تا پاسخ آشکار شود'}</div><div class="fc-main" id="flash-main"></div><div class="fc-sub" id="flash-sub"></div></div><div class="quiz-nav"><button class="btn btn-ghost" data-action="flash-prev">→ قبلی</button><span class="quiz-progress-text">${deck.length?faNumber(flashIndex+1)+' از '+faNumber(deck.length):'کارت خالی'}</span><button class="btn btn-primary" data-action="flash-next">بعدی ←</button></div><div class="check-row" style="justify-content:center;margin-top:13px"><button class="btn btn-teal btn-sm" data-action="flash-known">بلدم ✓</button><button class="btn btn-ghost btn-sm" data-action="flip-card">نیاز به مرور دارم ↺</button></div></div>
  <div class="card"><h3>ساخت فلش‌کارت شخصی</h3><p class="card-sub">تعریف و پاسخ دلخواهت را ذخیره کن.</p><form id="flash-form"><div class="field-wrap"><label>روی کارت (پرسش یا مفهوم)</label><input class="field" name="front" required maxlength="220"></div><div class="field-wrap" style="margin-top:10px"><label>پشت کارت (پاسخ یا توضیح)</label><textarea class="textarea" name="back" required maxlength="500"></textarea></div><button class="btn btn-primary" style="margin-top:10px">ذخیره فلش‌کارت</button></form><div class="notice" style="margin-top:15px">کارت‌های درس‌نامه و سؤال‌های اشتباه به‌صورت خودکار در اینجا قرار می‌گیرند. کارت‌های شخصی در مرورگر ذخیره می‌شوند.</div></div></div>`;
}
function renderFlashcardFace(){const deck=window.flashDeck||[];const item=deck[flashIndex];$('#flash-main').textContent=item?(flashFlipped?item.back:item.front):'هنوز کارتی نداریم';$('#flash-sub').textContent=item?(flashFlipped?'پاسخ کارت':'پرسش یا مفهوم'):'یک کارت شخصی بساز یا سؤال‌های اشتباه را مرور کن.';}

function renderPlanner(){
  const tasks=[...state.plans].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const done=tasks.filter(t=>t.done).length;
  return `<div class="section-head"><div><h2>برنامه‌ریزی مطالعه</h2><p>برنامه ساده و قابل پیگیری؛ اطلاعات در همین مرورگر می‌ماند.</p></div><span class="tag teal">${faNumber(done)} از ${faNumber(tasks.length)} انجام‌شده</span></div>
  <div class="grid-2"><div class="card"><h3>افزودن برنامه جدید</h3><p class="card-sub">هدف کوچک و مشخص تعیین کن.</p><form id="plan-form"><div class="field-wrap"><label>موضوع مطالعه</label><input class="field" name="title" placeholder="مثلاً مرور ارزشیابی تکوینی" required maxlength="100"></div><div class="form-grid" style="margin-top:10px"><div class="field-wrap"><label>تاریخ</label><input class="field" type="date" name="date" value="${todayKey()}" required></div><div class="field-wrap"><label>مدت (دقیقه)</label><input class="field" type="number" name="minutes" min="5" max="300" value="30" required></div></div><button class="btn btn-primary" style="margin-top:12px">افزودن به برنامه</button></form></div>
  <div class="card"><h3>هدف مطالعه روزانه</h3><p class="card-sub">دقایق تمرکز مورد انتظار برای هر روز</p><form id="goal-form" class="field-row"><input class="field" name="goal" type="number" min="5" max="600" value="${Number(state.dailyGoal)||30}"><button class="btn btn-teal">ذخیره هدف</button></form><div class="notice" style="margin-top:15px">پیشنهاد: به‌جای مطالعه طولانی و پراکنده، چند نوبت کوتاه با مرور فعال داشته باش.</div></div></div>
  <div class="section-head"><div><h2>فهرست مطالعه</h2><p>برای تکمیل برنامه، مربع کنار هر کار را علامت بزن.</p></div><button class="text-link" data-action="clear-done-plans">حذف کارهای انجام‌شده</button></div><div class="card">${tasks.length?tasks.map(t=>`<div class="planner-item ${t.done?'done':''}"><input type="checkbox" data-action="toggle-plan" data-id="${t.id}" ${t.done?'checked':''}><div class="planner-text"><b>${e(t.title)}</b><small>${dateLabel(t.date)} · ${faNumber(t.minutes)} دقیقه</small></div><button class="text-link" data-action="delete-plan" data-id="${t.id}">حذف</button></div>`).join(''):'<div class="empty-state">هنوز برنامه‌ای نساخته‌ای.</div>'}</div>`;
}
function renderVideos(){return `<div class="section-head"><div><h2>ویدیوهای آموزشی تست هوش ریاضی</h2><p>موضوع را انتخاب کن تا ویدیوهای مرتبط در YouTube جست‌وجو شوند.</p></div><span class="tag orange">نیازمند اینترنت</span></div><div class="notice warn" style="margin-bottom:14px">این بخش ویدیوها را روی GitHub میزبانی نمی‌کند. هر کارت، جست‌وجوی مستقیم موضوع در YouTube را باز می‌کند؛ کیفیت و اعتبار ویدیو را پیش از یادگیری بررسی کن.</div><div class="grid-3">${videos.map(v=>`<div class="video-card"><div class="video-thumb">▶</div><div class="question-meta"><span class="tag">${e(v.group)}</span><span class="tag teal">${e(v.level)}</span></div><h4>${e(v.title)}</h4><p>${e(v.duration)}</p><a class="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v.query)}">جست‌وجوی ویدیوها ↗</a></div>`).join('')}</div>`;}
function renderNotes(){return `<div class="section-head"><div><h2>دفترچه یادداشت شخصی</h2><p>خلاصه درس‌ها، نکته‌های مهم و برنامه مرور خودت را بنویس.</p></div><span class="tag teal">ذخیره خودکار</span></div><div class="card"><textarea class="textarea" id="notes-area" style="min-height:330px" placeholder="نکته‌های مهمت را اینجا بنویس…">${e(state.notes)}</textarea><div class="helper" style="margin-top:7px">یادداشت‌ها به‌صورت محلی در همین مرورگر ذخیره می‌شوند.</div></div>`;}
function renderSettings(){return `<div class="section-head"><div><h2>پشتیبان، نصب و تنظیمات</h2><p>داده‌ها را حفظ کن و برنامه را روی گوشی نصب‌پذیر کن.</p></div></div><div class="grid-2"><div class="card"><h3>پشتیبان‌گیری از اطلاعات</h3><p class="card-sub">شامل کارنامه‌ها، اشتباهات، برنامه، یادداشت‌ها و فلش‌کارت‌های شخصی</p><button class="btn btn-primary" data-action="backup">دانلود فایل پشتیبان JSON</button><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><label class="field-wrap"><span>بازیابی از فایل پشتیبان</span><input class="field" id="backup-file" type="file" accept="application/json"></label><button class="btn btn-ghost" style="margin-top:9px" data-action="restore">بازیابی اطلاعات</button></div>
  <div class="card"><h3>ظاهر برنامه</h3><p class="card-sub">حالت روشن یا تاریک</p><button class="btn btn-ghost" data-action="toggle-theme">${state.theme==='dark'?'فعال‌کردن حالت روشن':'فعال‌کردن حالت تاریک'}</button><div class="notice" style="margin-top:15px"><b>نصب روی اندروید:</b><br>سایت را در Chrome باز کن؛ از منوی سه‌نقطه، گزینه «Install app / نصب برنامه» یا «Add to Home screen / افزودن به صفحه اصلی» را انتخاب کن.</div><div class="notice success" style="margin-top:10px">برای اجرا و نصب، فقط GitHub Pages و مرورگر نیاز است. پروژه با HTML/CSS/JavaScript استاندارد ساخته شده و مرحله build ندارد.</div></div></div>
  <div class="card" style="margin-top:15px"><h3>درباره نسخه و محدودیت‌ها</h3><div class="lesson-content"><p>• بانک فعلی شامل ${faNumber(questions.length)} سؤال تمرینی است: ۱۰۰۰ تخصصی و آموزشی، ۱۰۰۰ دروس ابتدایی و ۲۰۰ هوش ریاضی.</p><p>• داده‌های کاربر در localStorage همین مرورگر ذخیره می‌شود؛ بین دستگاه‌ها خودکار همگام نمی‌شود.</p><p>• معلم هوشمند در این نسخه آفلاین و مبتنی بر جست‌وجوی محتوای داخلی است؛ مدل زبانی مولد ندارد.</p><p>• بخش ویدیو به اینترنت و سرویس YouTube وابسته است.</p><p>• بانک سؤال تألیفی و تمرینی است، نه بانک رسمی وزارت آموزش‌وپرورش و نه تضمین‌کننده پوشش کامل منابع آزمون.</p></div><button class="btn btn-danger btn-sm" data-action="reset-data">پاک کردن همه داده‌های ذخیره‌شده این دستگاه</button></div>`;}

// Delegated UI actions
$('#view-container').addEventListener('click', async ev=>{
  const viewBtn=ev.target.closest('[data-view]');if(viewBtn){const v=viewBtn.dataset.view;if(v==='analytics'||v==='questions'||v==='exam'||v==='iq'||v==='tutor'||v==='wrong'||v==='lessons'||v==='videos'||v==='planner'||v==='flashcards'||v==='notes'||v==='settings'||v==='dashboard')go(v);}
  const b=ev.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;
  if(action==='go-exam')go('exam');
  if(action==='go-iq')go('iq');
  if(action==='go-iq-exam')startExam({domain:'iq',count:10});
  if(action==='start-exam'){
    const domain=b.dataset.domainOverride||$('#exam-domain')?.value||'professional';
    startExam({domain,subject:$('#exam-subject')?.value||'all',difficulty:$('#exam-difficulty')?.value||'all',count:Number($('#exam-count')?.value||10),order:$('#exam-order')?.value||'random',time:Number($('#exam-time')?.value??60)});
  }
  if(action==='answer'&&activeExam){const q=activeExam.items[activeExam.index];activeExam.answers[q.id]=Number(b.dataset.opt);render();}
  if(action==='quiz-prev'&&activeExam){activeExam.index=Math.max(0,activeExam.index-1);render();}
  if(action==='quiz-next'&&activeExam){activeExam.index=Math.min(activeExam.items.length-1,activeExam.index+1);render();}
  if(action==='jump-question'&&activeExam){activeExam.index=Number(b.dataset.index);render();}
  if(action==='toggle-flag'&&activeExam){const id=activeExam.items[activeExam.index].id;activeExam.flagged=activeExam.flagged.includes(id)?activeExam.flagged.filter(x=>x!==id):[...activeExam.flagged,id];render();}
  if(action==='submit-exam'){if(activeExam){const unanswered=activeExam.items.length-Object.keys(activeExam.answers).length;if(unanswered&& !confirm(`${faNumber(unanswered)} سؤال بی‌پاسخ داری. آزمون ثبت شود؟`))return;finishExam(false);}}
  if(action==='load-more'){questionOffset+=25;render();}
  if(action==='bookmark'){const id=b.dataset.id;state.bookmarks=state.bookmarks.includes(id)?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];persist();render();}
  if(action==='wrong-tab'){wrongTab=b.dataset.tab;render();}
  if(action==='mark-reviewed'){const id=b.dataset.id;if(wrongTab==='wrong')state.wrongIds=state.wrongIds.filter(x=>x!==id);state.reviewedIds.push(id);persist();render();toast('سؤال از فهرست اشتباهات خارج شد.');}
  if(action==='practice-one'){const q=getQuestion(b.dataset.id);if(q){activeExam={domain:q.domain,items:[shuffleOptions(q)],answers:{},index:0,flagged:[],timed:false};quizSeconds=0;go('quiz');}}
  if(action==='open-attempt'){const a=state.history.find(x=>x.id===b.dataset.id);if(a){window.lastAttemptId=a.id;go('results');}}
  if(action==='tutor-prompt'){const p=b.dataset.prompt||'';if(!p)return;window.tutorMessages=window.tutorMessages||[];window.tutorMessages.push({role:'user',text:p});const response=tutorReply(p);window.tutorMessages.push({role:'bot',text:response});go('tutor');}
  if(action==='lesson-back'){selectedLesson=null;render();}
  if(action==='open-lesson'){selectedLesson=b.dataset.id;render();}
  if(action==='lesson-filter'){const group=b.dataset.group;$$('#lessons-grid .lesson-card').forEach(card=>card.style.display=group==='all'||card.dataset.group===group?'':'none');$$('[data-action="lesson-filter"]').forEach(x=>x.classList.toggle('active',x===b));}
  if(action==='lesson-flash'){const l=lessons.find(x=>x.id===b.dataset.id);if(l){state.customCards.push({id:`c-${Date.now()}`,front:l.title,back:`${l.summary}\n${l.key}`});persist();toast('درس به فلش‌کارت‌های شخصی افزوده شد.');}}
  if(action==='flip-card'){flashFlipped=!flashFlipped;renderFlashcardFace();}
  if(action==='flash-next'){flashIndex=Math.min((window.flashDeck||[]).length-1,flashIndex+1);flashFlipped=false;renderFlashcardsInPlace();}
  if(action==='flash-prev'){flashIndex=Math.max(0,flashIndex-1);flashFlipped=false;renderFlashcardsInPlace();}
  if(action==='flash-known'){const item=(window.flashDeck||[])[flashIndex];if(item&&!state.flashKnown.includes(item.id)){state.flashKnown.push(item.id);persist();}flashIndex=Math.min((window.flashDeck||[]).length-1,flashIndex+1);flashFlipped=false;renderFlashcardsInPlace();toast('پیشرفت مرور ثبت شد.');}
  if(action==='toggle-plan'){const task=state.plans.find(x=>x.id===b.dataset.id);if(task){task.done=b.checked;persist();render();}}
  if(action==='delete-plan'){state.plans=state.plans.filter(x=>x.id!==b.dataset.id);persist();render();}
  if(action==='clear-done-plans'){state.plans=state.plans.filter(x=>!x.done);persist();render();}
  if(action==='timer-start'){startFocusTimer();}
  if(action==='timer-reset'){clearInterval(focusTimer);focusRemaining=25*60;updateFocusDisplay();}
  if(action==='backup'){downloadBackup(state);toast('فایل پشتیبان آماده شد.');}
  if(action==='restore'){const file=$('#backup-file')?.files?.[0];if(!file){toast('ابتدا فایل پشتیبان را انتخاب کن.');return;}try{const next=await importBackup(file);Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,next);persist();toast('اطلاعات بازیابی شد.');render();}catch(err){toast(err.message||'بازیابی ناموفق بود.');}}
  if(action==='toggle-theme'){state.theme=state.theme==='dark'?'light':'dark';document.body.classList.toggle('dark',state.theme==='dark');persist();render();}
  if(action==='reset-data'){if(confirm('همه کارنامه‌ها، یادداشت‌ها، برنامه‌ها، اشتباهات و نشان‌ها از این مرورگر پاک شوند؟ بهتر است قبل از این کار پشتیبان بگیری.')){localStorage.removeItem('amoozegar-hooshmand-v1');location.reload();}}
  if(action==='export-csv'){exportCSV();}
  if(action==='iq-topic'){const topic=b.dataset.topic;const pool=questions.filter(q=>q.domain==='iq'&&q.topic===topic);if(pool.length)startExam({domain:'iq',subject:'هوش ریاضی',topic,count:Math.min(10,pool.length),difficulty:'all'});}
});
function renderFlashcardsInPlace(){render();}
function startFocusTimer(){if(focusTimer)return;focusTimer=setInterval(()=>{focusRemaining--;updateFocusDisplay();if(focusRemaining<=0){clearInterval(focusTimer);focusTimer=null;markActiveDay();toast('آفرین! یک نوبت تمرکز کامل شد. کمی استراحت کن.');}},1000);toast('زمان تمرکز ۲۵ دقیقه‌ای شروع شد.');}
function updateFocusDisplay(){const el=$('#focus-display');if(el){const m=Math.floor(focusRemaining/60),s=focusRemaining%60;el.textContent=`${faNumber(String(m).padStart(2,'0'))}:${faNumber(String(s).padStart(2,'0'))}`;}}
function exportCSV(){const rows=[['تاریخ','حیطه','تعداد سؤال','درست','غلط','بی‌پاسخ','درصد'],...state.history.map(a=>[a.date,domains.find(d=>d.id===a.domain)?.label||a.domain,a.count,a.correct,a.wrong,a.blank,a.percentage])];const csv='\uFEFF'+rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='amoozegar-report.csv';a.click();URL.revokeObjectURL(url);}

// Form and input bindings
$('#view-container').addEventListener('input',ev=>{
  if(ev.target.id==='question-search'){questionSearch=ev.target.value;questionOffset=0;const pos=ev.target.selectionStart;render();const input=$('#question-search');input?.focus();input?.setSelectionRange(pos,pos);}
  if(ev.target.id==='notes-area'){state.notes=ev.target.value;persist();}
});
$('#view-container').addEventListener('change',ev=>{
  if(ev.target.id==='exam-domain'){examDomain=ev.target.value;examSubject='all';const subject=$('#exam-subject');if(subject){subject.innerHTML='<option value="all">همه درس‌ها</option>'+uniqueSubjects(ev.target.value).map(s=>`<option>${e(s)}</option>`).join('');}}
  if(ev.target.id==='exam-subject'){examSubject=ev.target.value;}
  if(ev.target.id==='question-domain'){questionDomain=ev.target.value;questionSubject='all';questionOffset=0;render();}
  if(ev.target.id==='question-subject'){questionSubject=ev.target.value;questionOffset=0;render();}
  if(ev.target.id==='question-difficulty'){questionDifficulty=ev.target.value;questionOffset=0;render();}
});
$('#view-container').addEventListener('submit',ev=>{
  if(ev.target.id==='tutor-form'){ev.preventDefault();const input=$('#tutor-input');const p=input.value.trim();if(!p)return;window.tutorMessages=window.tutorMessages||[];window.tutorMessages.push({role:'user',text:p});const response=tutorReply(p);window.tutorMessages.push({role:'bot',text:response});render();}
  if(ev.target.id==='plan-form'){ev.preventDefault();const fd=new FormData(ev.target);state.plans.push({id:`p-${Date.now()}`,title:fd.get('title').trim(),date:fd.get('date'),minutes:Number(fd.get('minutes')),done:false});persist();render();toast('برنامه مطالعه اضافه شد.');}
  if(ev.target.id==='goal-form'){ev.preventDefault();const goal=Number(new FormData(ev.target).get('goal'));state.dailyGoal=Math.max(5,Math.min(600,goal));persist();render();toast('هدف روزانه ذخیره شد.');}
  if(ev.target.id==='flash-form'){ev.preventDefault();const fd=new FormData(ev.target);state.customCards.push({id:`c-${Date.now()}`,front:fd.get('front').trim(),back:fd.get('back').trim()});persist();flashIndex=0;render();toast('فلش‌کارت جدید ذخیره شد.');}
});

// Navigation and global search
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
$('#menu-toggle').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
$('#theme-toggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';document.body.classList.toggle('dark',state.theme==='dark');persist();toast(state.theme==='dark'?'حالت تاریک فعال شد.':'حالت روشن فعال شد.');});
$('#global-search-btn').addEventListener('click',()=>{$('#search-modal').showModal();$('#global-search-input').focus();});
$('#global-search-input').addEventListener('input',ev=>{
  const term=normalize(ev.target.value);const host=$('#global-search-results');if(!term){host.innerHTML='';return;}
  const matches=questions.filter(q=>normalize(`${q.subject} ${q.topic} ${q.question}`).includes(term)).slice(0,12);
  const lessonsFound=lessons.filter(l=>normalize(`${l.title} ${l.group} ${l.summary}`).includes(term)).slice(0,5);
  host.innerHTML=[...matches.map(q=>`<button class="search-result" data-action="search-question" data-id="${q.id}">${e(q.question)}<small>${e(q.subject)} · ${e(q.topic)}</small></button>`),...lessonsFound.map(l=>`<button class="search-result" data-action="search-lesson" data-id="${l.id}">درس‌نامه: ${e(l.title)}<small>${e(l.group)}</small></button>`)].join('')||'<div class="empty-state">نتیجه‌ای پیدا نشد.</div>';
});
$('#global-search-results').addEventListener('click',ev=>{const b=ev.target.closest('[data-action]');if(!b)return;$('#search-modal').close();if(b.dataset.action==='search-lesson'){selectedLesson=b.dataset.id;go('lessons');}else{questionSearch=getQuestion(b.dataset.id)?.topic||'';questionDomain='all';questionSubject='all';go('questions');}});
boot();
