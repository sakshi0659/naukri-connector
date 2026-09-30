import {analyzeJobs,dashboard,forgotPassword,importJobs,login,profile,register,resetPassword,stats,updateProfile} from '../shared/api';
import {profileFields} from '../shared/profile';
import {clearSession,getNaukriProfileSummary,getNaukriProfileSync,getSession,getSettings,saveNaukriProfileContext,saveNaukriProfileSummary,saveNaukriProfileSync,saveSession} from '../shared/storage';
import {fillKnown} from './formFiller';
import {findApplicationForm,findQuestions} from './formDetector';
import {extractJobDetail} from './jobDetailExtractor';
import {extractJob} from './jobExtractor';
import {detailPanel,badge,errorBadge,skippedBadge} from './overlay';
import {detectPage,PageType} from './pageDetector';
import {findJobCards} from './selectors';
import {extractVisibleNaukriProfile} from './naukriProfile';

type ScanResult={pageType:PageType;detected:number;parsed:number;message:string};
let timer:number|undefined;
let seen=new WeakSet<Element>();
let detailProcessed=false;
let formProcessed=new WeakSet<Element>();
let activeScan:Promise<ScanResult>|undefined;
let pageResults:any[]=[];
const log=(enabled:boolean,...args:unknown[])=>enabled&&console.debug('[NaukriAI]',...args);

async function syncVisibleNaukriProfile():Promise<string|undefined>{
  const snapshot=extractVisibleNaukriProfile();
  if(!snapshot)return undefined;
  const fingerprint=JSON.stringify(snapshot);
  const bytes=new TextEncoder().encode(fingerprint);const digest=await crypto.subtle.digest('SHA-256',bytes);const contextKey=Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('');
  await Promise.all([saveNaukriProfileContext(contextKey),saveNaukriProfileSummary(snapshot)]);
  const saved=await getNaukriProfileSync();
  if(saved.naukriProfileSync===fingerprint)return 'Your visible Naukri profile is already synced.';
  try{
    const existing=await profile();
    const next={...existing,
      personal:{...(existing.personal||{}),...(snapshot.location?{location:snapshot.location}:{})},
      professional:{...(existing.professional||{}),...(snapshot.currentTitle?{current_title:snapshot.currentTitle}:{}),...(snapshot.experienceYears!==undefined?{total_experience_years:snapshot.experienceYears}:{})},
      ...(snapshot.skills.length?{skills:snapshot.skills}:{}),
    };
    await updateProfile(next);await saveNaukriProfileSync(fingerprint);
    return 'Visible Naukri profile synced. New job analysis will use these details.';
  }catch(error){log(false,'Naukri profile sync unavailable',error);return undefined}
}

async function scanPage():Promise<ScanResult>{
  const settings=await getSettings();
  const synced=await syncVisibleNaukriProfile();
  const pageType=detectPage();
  log(settings.debug,'Page type:',pageType);
  if(pageType==='JOB_DETAILS'){
    if(detailProcessed||!settings.autoAnalyze)return {pageType,detected:0,parsed:0,message:'Job detail already processed'};
    const job=extractJobDetail();
    if(!job)return {pageType,detected:0,parsed:0,message:'Could not extract this job detail'};
    detailProcessed=true;
    try{const item=(await importJobs([job]))[0];const result=item.analysis?{analysis:item.analysis}:(await analyzeJobs([item.id]))[0];if(result?.analysis)detailPanel(result.analysis);else errorBadge(document.body,'AI temporarily unavailable');return {pageType,detected:1,parsed:1,message:'Job detail analyzed'}}catch(error){log(settings.debug,'Backend unavailable',error);return {pageType,detected:1,parsed:1,message:'Backend unavailable'}}
  }
  if(pageType==='APPLICATION_FORM'){
    const form=findApplicationForm();
    if(!form||formProcessed.has(form)||!settings.autoFill)return {pageType,detected:0,parsed:0,message:'Application form already processed'};
    formProcessed.add(form);
    try{const questions=findQuestions();const filled=fillKnown(questions,profileFields(await profile()));log(settings.debug,'Application fields filled:',filled.length);if(filled.length)errorBadge(form,`AI filled ${filled.length} verified field(s); review before submitting`);return {pageType,detected:questions.length,parsed:filled.length,message:`Filled ${filled.length} verified fields`}}catch(error){log(settings.debug,'Application assistant unavailable',error);return {pageType,detected:0,parsed:0,message:'Application assistant unavailable'}}
  }
  if(pageType!=='SEARCH_RESULTS')return {pageType,detected:0,parsed:0,message:synced||'Open a Naukri search-results page'};
  const cards=findJobCards();
  const fresh:{job:NonNullable<ReturnType<typeof extractJob>>;card:Element}[]=[];
  let failed=0;
  for(const card of cards){if(seen.has(card))continue;seen.add(card);const job=extractJob(card);if(job)fresh.push({job,card});else failed++}
  log(settings.debug,'Job cards detected:',cards.length,'Parsed successfully:',fresh.length,'Failed:',failed);
  if(!fresh.length)return {pageType,detected:cards.length,parsed:0,message:cards.length?'Visible cards were already processed':'No supported job cards found'};
  if(!settings.autoAnalyze)return {pageType,detected:cards.length,parsed:fresh.length,message:'Auto Analyze is disabled'};
  try{
    const imported=await importJobs(fresh.map(entry=>entry.job));
    pageResults=imported.map((item,index)=>({...item,job_url:fresh[index].job.jobUrl,company:fresh[index].job.company}));
    imported.forEach((item,index)=>{if(item.analysis)badge(fresh[index].card,item.analysis);else if(item.status==='SKIPPED')skippedBadge(fresh[index].card,item.filter_reason||'rule filter',async()=>{const [result]=await analyzeJobs([item.id],true);if(result?.analysis)badge(fresh[index].card,result.analysis);else errorBadge(fresh[index].card,result?.error||'AI temporarily unavailable')})});
    const pending=imported.filter(item=>item.status==='ANALYSIS_PENDING').map(item=>item.id);
    log(settings.debug,'New jobs requiring analysis:',pending.length);
    const results=pending.length?await analyzeJobs(pending):[];
    for(const result of results){const index=imported.findIndex(item=>item.id===result.id);if(index<0)continue;if(result.analysis){pageResults[index].analysis=result.analysis;badge(fresh[index].card,result.analysis)}else if(result.error)errorBadge(fresh[index].card,'AI temporarily unavailable')}
    return {pageType,detected:cards.length,parsed:results.length,message:`Analyzed ${results.length} of ${pending.length} eligible jobs`};
  }catch(error){log(settings.debug,'Backend unavailable',error);return {pageType,detected:cards.length,parsed:fresh.length,message:'Backend unavailable'}}
}

async function scan():Promise<ScanResult>{
  if(activeScan)return activeScan;
  activeScan=scanPage();
  try{return await activeScan}finally{activeScan=undefined}
}

function createAssistantLauncher(){
  if(document.querySelector('[data-naukri-ai-launcher]'))return;
  const drawer=document.createElement('aside');
  drawer.dataset.naukriAi='true';drawer.dataset.naukriAiDrawer='true';drawer.hidden=true;
  drawer.style.cssText='position:fixed;top:0;right:0;z-index:2147483647;width:min(380px,100vw);height:100vh;overflow:auto;background:#f8fafc;color:#172033;border-left:1px solid #d0d5dd;box-shadow:-16px 0 46px #10182838;font:14px system-ui,sans-serif;';
  const header=document.createElement('header');header.style.cssText='padding:24px 22px;background:linear-gradient(135deg,#101828,#1d2939);color:#fff;';
  const mark=document.createElement('span');mark.textContent='AI';mark.style.cssText='display:inline-grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#19c37d;color:#062b20;font:900 13px system-ui;';
  const title=document.createElement('strong');title.textContent='Naukri AI Assistant';title.style.cssText='display:inline-block;margin-left:12px;vertical-align:top;padding-top:2px;font-size:17px;';
  const subtitle=document.createElement('span');subtitle.textContent='Private job intelligence';subtitle.style.cssText='display:block;margin:7px 0 0 52px;color:#c7d2e4;font-size:12px;';
  header.append(mark,title,subtitle);
  const body=document.createElement('div');body.style.cssText='padding:18px;';
  const statusCard=document.createElement('section');statusCard.style.cssText='padding:14px;border:1px solid #dfe6ee;border-radius:14px;background:#fff;';
  const statusLabel=document.createElement('span');statusLabel.textContent='CURRENT PAGE';statusLabel.style.cssText='color:#667085;font:800 10px system-ui;letter-spacing:.8px;';
  const status=document.createElement('p');status.textContent='Ready to review visible opportunities.';status.style.cssText='margin:7px 0 0;color:#344054;font:600 13px system-ui;line-height:1.4;';
  const profileLine=document.createElement('p');profileLine.style.cssText='margin:9px 0 0;padding-top:9px;border-top:1px solid #eef2f6;color:#667085;font:12px system-ui;line-height:1.4;';statusCard.append(statusLabel,status,profileLine);
  const renderProfileContext=async()=>{const {naukriProfileSummary:summary}=await getNaukriProfileSummary();profileLine.textContent=summary?.currentTitle?`Using Naukri profile: ${summary.currentTitle}${summary.location?` · ${summary.location}`:''}${summary.experienceYears!==undefined?` · ${summary.experienceYears} years`:''}`:'Profile not synced yet. Open your Naukri profile page once.'};
  const accountCard=document.createElement('section');accountCard.style.cssText='margin-top:14px;padding:14px;border:1px solid #dfe6ee;border-radius:14px;background:#fff;';
  const metrics=document.createElement('div');metrics.style.cssText='display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:14px;';
  const metric=(label:string)=>{const card=document.createElement('div');card.style.cssText='padding:12px;border:1px solid #dfe6ee;border-radius:12px;background:#fff;';const value=document.createElement('strong');value.textContent='—';value.style.cssText='display:block;font-size:20px;line-height:1;color:#101828;';const caption=document.createElement('span');caption.textContent=label;caption.style.cssText='display:block;margin-top:6px;color:#667085;font:700 10px system-ui;';card.append(value,caption);metrics.append(card);return value};
  const detected=metric('Jobs found');const analyzed=metric('Analysed');const strong=metric('Strong matches');const skipped=metric('Skipped');
  const scanButton=document.createElement('button');scanButton.type='button';scanButton.textContent='Analyze visible jobs';scanButton.style.cssText='width:100%;margin-top:14px;border:0;border-radius:10px;background:#16a36a;color:#fff;padding:13px;font:800 14px system-ui;cursor:pointer;box-shadow:0 6px 14px #16a36a33;';
  const note=document.createElement('p');note.textContent='Only visible jobs are reviewed. Applications always remain under your control.';note.style.cssText='margin:13px 2px;color:#667085;font:12px system-ui;line-height:1.5;';
  const insights=document.createElement('section');insights.style.cssText='margin-top:16px;padding-top:16px;border-top:1px solid #dfe6ee;';
  body.append(statusCard,accountCard,metrics,scanButton,note,insights);drawer.append(header,body);
  const launcher=document.createElement('button');
  launcher.type='button';launcher.dataset.naukriAi='true';launcher.dataset.naukriAiLauncher='true';launcher.textContent='Naukri AI';
  launcher.setAttribute('aria-label','Open Naukri AI Assistant');
  launcher.style.cssText='position:fixed;right:22px;bottom:22px;z-index:2147483647;border:1px solid #344054;border-radius:12px;background:#101828;color:#fff;padding:12px 16px;font:800 13px system-ui;letter-spacing:.1px;box-shadow:0 12px 28px #1018284d;cursor:pointer;transition:right .2s ease;';
  let panelOpen=false;
  const updateMetrics=async()=>{try{const [value,data]=await Promise.all([stats(),dashboard()]);detected.textContent=String(value.jobs);analyzed.textContent=String(value.analyzed);strong.textContent=String(value.strong_matches);skipped.textContent=String(value.skipped);insights.replaceChildren();const heading=document.createElement('strong');heading.textContent='TOP MATCHES';heading.style.cssText='display:block;font-size:12px;letter-spacing:.6px;';insights.append(heading);if(!data.top_matches.length){const empty=document.createElement('p');empty.textContent='No analyzed jobs yet. New eligible jobs will appear here after analysis.';empty.style.cssText='color:#667085;font-size:12px;line-height:1.4;';insights.append(empty)}else data.top_matches.slice(0,3).forEach(job=>{const row=document.createElement('button');row.type='button';row.style.cssText='display:block;width:100%;margin-top:9px;padding:10px;border:1px solid #dfe6ee;border-radius:10px;background:#fff;text-align:left;cursor:pointer;';const title=document.createElement('strong');title.textContent=`${job.match_score}% · ${job.title}`;title.style.cssText='display:block;font-size:12px;color:#172033;';const detail=document.createElement('span');detail.textContent=`${job.company} · ${(job.analysis.matched_skills||[]).slice(0,3).join(' · ')}`;detail.style.cssText='display:block;margin-top:4px;color:#667085;font-size:11px;';row.append(title,detail);row.addEventListener('click',()=>window.open(job.job_url,'_blank','noopener'));insights.append(row)});if(data.skill_gaps.length){const gaps=document.createElement('p');gaps.textContent=`Skill gaps: ${data.skill_gaps.slice(0,3).map(gap=>`${gap.skill} (${gap.count})`).join(' · ')}`;gaps.style.cssText='margin:12px 0 0;color:#9a6700;font:12px system-ui;line-height:1.4;';insights.append(gaps)}return value}catch(error){status.textContent=error instanceof Error&&/sign in|session/i.test(error.message)?'Sign in through the Naukri AI extension panel to analyse jobs.':'Backend is unavailable. Check the connection settings.';return undefined}};
  const refreshPageSummary=()=>{if(!pageResults.length)return;const analyzedRows=pageResults.filter(row=>row.analysis);detected.textContent=String(pageResults.length);analyzed.textContent=String(analyzedRows.length);strong.textContent=String(analyzedRows.filter(row=>row.analysis.recommendation==='STRONG_MATCH').length);skipped.textContent=String(pageResults.filter(row=>row.status==='SKIPPED').length);insights.replaceChildren();const heading=document.createElement('strong');heading.textContent='TOP MATCHES ON THIS PAGE';heading.style.cssText='display:block;font-size:12px;letter-spacing:.6px;';insights.append(heading);if(!analyzedRows.length){const empty=document.createElement('p');empty.textContent='No visible jobs have finished analysis yet.';empty.style.cssText='color:#667085;font-size:12px;line-height:1.4;';insights.append(empty);return}analyzedRows.sort((a,b)=>(b.analysis.match_score||0)-(a.analysis.match_score||0)).slice(0,3).forEach(job=>{const row=document.createElement('button');row.type='button';row.style.cssText='display:block;width:100%;margin-top:9px;padding:10px;border:1px solid #dfe6ee;border-radius:10px;background:#fff;text-align:left;cursor:pointer;';row.textContent=`${job.analysis.match_score}% · ${job.title} · ${(job.analysis.matched_skills||[]).slice(0,3).join(' · ')}`;row.addEventListener('click',()=>window.open(job.job_url,'_blank','noopener'));insights.append(row)})};
  const renderAccount=async()=>{const session=await getSession();accountCard.replaceChildren();const heading=document.createElement('strong');heading.textContent='YOUR NAUKRI AI ACCOUNT';heading.style.cssText='display:block;color:#667085;font:800 10px system-ui;letter-spacing:.8px;';accountCard.append(heading);if(session.account?.email){const text=document.createElement('p');text.textContent=`Signed in as ${session.account.email}`;text.style.cssText='margin:8px 0 0;color:#344054;font:600 13px system-ui;';accountCard.append(text);return}const text=document.createElement('p');text.textContent='Sign in once to keep your profile and matches private.';text.style.cssText='margin:8px 0;color:#667085;font:12px system-ui;line-height:1.4;';const email=document.createElement('input');email.type='email';email.placeholder='Email address';const password=document.createElement('input');password.type='password';password.placeholder='Password (8+ characters)';for(const input of [email,password])input.style.cssText='box-sizing:border-box;width:100%;margin-top:8px;padding:10px;border:1px solid #d0d5dd;border-radius:8px;font:13px system-ui;';const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:10px;';const signIn=document.createElement('button');signIn.textContent='Sign in';const create=document.createElement('button');create.textContent='Create account';for(const button of [signIn,create])button.style.cssText='border:0;border-radius:8px;padding:9px 10px;background:#16a36a;color:#fff;font:700 12px system-ui;cursor:pointer;';const authenticate=async(makeNew:boolean)=>{try{if(!email.value||!password.value)throw new Error('Enter your email and password');status.textContent=makeNew?'Creating your account…':'Signing in…';signIn.disabled=create.disabled=true;const result=makeNew?await register(email.value,password.value):await login(email.value,password.value);await saveSession(result.token,{email:result.user.email});status.textContent='Signed in. Your Naukri profile can now sync.';await renderAccount();await updateMetrics()}catch(error){status.textContent=error instanceof Error?error.message:'Unable to sign in'}finally{signIn.disabled=create.disabled=false}};signIn.addEventListener('click',()=>void authenticate(false));create.addEventListener('click',()=>void authenticate(true));actions.append(signIn,create);accountCard.append(text,email,password,actions)};
  const enhanceAccountCard=async()=>{const session=await getSession();if(session.account?.email){if(accountCard.querySelector('[data-naukri-ai-signout]'))return;const signOut=document.createElement('button');signOut.dataset.naukriAiSignout='true';signOut.textContent='Sign out';signOut.style.cssText='margin-top:8px;border:1px solid #d0d5dd;border-radius:8px;padding:8px 10px;background:#fff;color:#344054;font:700 12px system-ui;cursor:pointer;';signOut.addEventListener('click',async()=>{await clearSession();status.textContent='Signed out. Sign in to analyse jobs.';await renderAccount()});accountCard.append(signOut);return}const password=accountCard.querySelector<HTMLInputElement>('input[type="password"],input[type="text"][placeholder^="Password"]');if(!password||accountCard.querySelector('[data-naukri-ai-password-toggle]'))return;password.style.paddingRight='42px';const eye=document.createElement('button');eye.type='button';eye.dataset.naukriAiPasswordToggle='true';eye.textContent='👁';eye.title='Show password';eye.setAttribute('aria-label','Show password');eye.style.cssText='position:relative;float:right;margin:-35px 8px 0 0;border:0;background:transparent;padding:6px;cursor:pointer;font-size:16px;z-index:1;';eye.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';eye.title=show?'Hide password':'Show password';eye.setAttribute('aria-label',eye.title)});password.insertAdjacentElement('afterend',eye)};
  const addPasswordReset=async()=>{const session=await getSession();if(session.account?.email||accountCard.querySelector('[data-naukri-ai-forgot]'))return;const forgot=document.createElement('button');forgot.type='button';forgot.dataset.naukriAiForgot='true';forgot.textContent='Forgot password?';forgot.style.cssText='display:block;margin:10px 0 0;border:0;background:transparent;color:#087f5b;padding:0;font:700 12px system-ui;cursor:pointer;';forgot.addEventListener('click',async()=>{const email=accountCard.querySelector<HTMLInputElement>('input[type="email"]');if(!email?.value){status.textContent='Enter your email address first.';email?.focus();return}try{forgot.disabled=true;status.textContent='Sending reset code…';const response=await forgotPassword(email.value);status.textContent=response.message;const code=document.createElement('input');code.placeholder='Reset code from email';const password=document.createElement('input');password.type='password';password.placeholder='New password (8+ characters)';for(const input of [code,password])input.style.cssText='box-sizing:border-box;width:100%;margin-top:8px;padding:10px;border:1px solid #d0d5dd;border-radius:8px;font:13px system-ui;';const reset=document.createElement('button');reset.textContent='Set new password';reset.style.cssText='margin-top:8px;border:0;border-radius:8px;padding:9px 10px;background:#16a36a;color:#fff;font:700 12px system-ui;cursor:pointer;';reset.addEventListener('click',async()=>{try{const result=await resetPassword(code.value,password.value);status.textContent=result.message;await renderAccount()}catch(error){status.textContent=error instanceof Error?error.message:'Unable to reset password'}});forgot.replaceWith(code,password,reset)}catch(error){status.textContent=error instanceof Error?error.message:'Unable to send reset code';forgot.disabled=false}});accountCard.append(forgot)};
  new MutationObserver(()=>{void enhanceAccountCard();void addPasswordReset()}).observe(accountCard,{childList:true});
  let dockScanning=false;
  void renderAccount();
  void addPasswordReset();
  void renderProfileContext();
  void syncVisibleNaukriProfile().then(message=>{if(message){status.textContent=message;void renderProfileContext()}});
  scanButton.addEventListener('click',async()=>{if(dockScanning)return;dockScanning=true;seen=new WeakSet<Element>();const started=Date.now();scanButton.textContent='Analyzing…';status.textContent='Scanning rendered jobs and applying your preferences…';try{const result=await scan();const totals=await updateMetrics();const remaining=1000-(Date.now()-started);if(remaining>0)await new Promise<void>(resolve=>window.setTimeout(resolve,remaining));if(totals)status.textContent=result.parsed?`Processed ${result.parsed} visible job${result.parsed===1?'':'s'}. ${totals.analyzed} total job${totals.analyzed===1?'':'s'} analysed.`:`No new cards to analyse. ${totals.analyzed} job${totals.analyzed===1?'':'s'} already analysed; ${totals.skipped} filtered by your preferences.`;else status.textContent=result.message}finally{dockScanning=false;scanButton.textContent='Analyze visible jobs'}});
  launcher.addEventListener('click',()=>{panelOpen=!panelOpen;drawer.hidden=!panelOpen;launcher.textContent=panelOpen?'Close Naukri AI':'Naukri AI';launcher.style.right=panelOpen?'402px':'22px';launcher.setAttribute('aria-pressed',String(panelOpen));if(panelOpen){void updateMetrics();refreshPageSummary()}});
  window.setInterval(()=>{if(panelOpen){void updateMetrics();refreshPageSummary()}},5000);
  document.body.append(drawer,launcher);
}

function schedule(){window.clearTimeout(timer);timer=window.setTimeout(()=>{void scan()},700)}

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message.type!=='SCAN_NOW')return;
  seen=new WeakSet<Element>();detailProcessed=false;formProcessed=new WeakSet<Element>();
  void scan().then(sendResponse).catch(error=>sendResponse({pageType:'OTHER',detected:0,parsed:0,message:String(error)}));
  return true;
});

const observer=new MutationObserver(mutations=>{if(mutations.some(mutation=>Array.from(mutation.addedNodes).some(node=>node instanceof Element&&!node.closest('[data-naukri-ai="true"]'))))schedule()});
observer.observe(document.documentElement,{subtree:true,childList:true});
createAssistantLauncher();
void scan();
window.addEventListener('scroll',schedule,{passive:true});
