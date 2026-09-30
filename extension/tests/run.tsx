import React from 'react';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {Window} from 'happy-dom';
import App,{decorateNaukriPage,scanNaukriPage} from '../src/popup/App';
import {extractJob} from '../src/content/jobExtractor';
import {badge} from '../src/content/overlay';
import {detectPage} from '../src/content/pageDetector';
import {findJobCards} from '../src/content/selectors';
import {findQuestions} from '../src/content/formDetector';
import {fillKnown} from '../src/content/formFiller';
import {profileFields} from '../src/shared/profile';

const browser=new Window({url:'https://www.naukri.com/ai-engineer-job-listings'});
const runtime=globalThis as Record<string,unknown>;
Object.assign(runtime,{window:browser,document:browser.document,location:browser.location,history:browser.history,Element:browser.Element,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLTextAreaElement:browser.HTMLTextAreaElement,HTMLSelectElement:browser.HTMLSelectElement,Event:browser.Event});

const popupHtml=renderToStaticMarkup(<App/>);
assert.match(popupHtml,/Naukri AI Assistant/);
assert.match(popupHtml,/Backend offline/);
const popupEntry=readFileSync(resolve('src/popup/main.tsx'),'utf8');
assert.match(popupEntry,/createRoot\(root\)\.render\(<App\/>\)/);

browser.document.body.innerHTML=`<form><input aria-label="Search jobs"></form><div>My applications</div><article class="jobTuple" data-job-id="123"><a class="title" href="https://www.naukri.com/job-listings-example?jobId=123">Generative AI Engineer</a><a class="comp-name">Example Labs</a><span class="locWdth">Noida</span><span class="expwdth">1-2 Yrs</span><ul class="tags-gt">Python • RAG • LLM</ul><span class="job-post-day">Today</span></article>`;
assert.equal(detectPage(),'SEARCH_RESULTS');
const cards=findJobCards();
assert.equal(cards.length,1);
const job=extractJob(cards[0]);
assert.deepEqual(job&&{externalId:job.externalId,title:job.title,company:job.company,location:job.location,skills:job.skills},{externalId:'123',title:'Generative AI Engineer',company:'Example Labs',location:'Noida',skills:['Python','RAG','LLM']});
badge(cards[0],{eligible:true,match_score:91,role_relevance:92,skill_match:90,experience_match:91,matched_skills:['Python','RAG'],missing_skills:['LangGraph'],strengths:[],concerns:[],recommendation:'STRONG_MATCH',reasoning:'Strong fit'});
assert.match(cards[0].querySelector('[data-naukri-ai="true"]')?.textContent||'',/91%/);
assert.equal(findJobCards().length,1);

browser.document.body.innerHTML=`<form><input aria-label="Search jobs"></form><div>Applications</div><section><div class="layout-v9"><h2><a href="https://www.naukri.com/job-listings-first-111111">AI Engineer</a></h2><span class="company-name">First Labs</span><span class="location-name">Delhi</span></div><div class="layout-v9"><h2><a href="https://www.naukri.com/job-listings-second-222222">LLM Engineer</a></h2><span class="company-name">Second Labs</span><span class="location-name">Noida</span></div></section>`;
assert.equal(detectPage(),'SEARCH_RESULTS');
assert.equal(findJobCards().length,2);
assert.deepEqual(findJobCards().map(card=>extractJob(card)?.title),['AI Engineer','LLM Engineer']);
const directScan=scanNaukriPage();
assert.equal(directScan.jobs.length,2);
assert.equal(decorateNaukriPage([{jobUrl:directScan.jobs[0].jobUrl,status:'ANALYZED',analysis:{eligible:true,match_score:88,role_relevance:90,skill_match:85,experience_match:89,matched_skills:['Python'],missing_skills:[],strengths:[],concerns:[],recommendation:'STRONG_MATCH',reasoning:'Strong fit'}}]),1);
assert.match(browser.document.body.textContent||'',/88% STRONG MATCH/);

browser.document.body.innerHTML='<form><label for="ctc">Current CTC</label><input id="ctc" name="current_ctc"><label for="secret">Government ID</label><input id="secret"></form>';
const questions=findQuestions();
const fields=profileFields({professional:{current_ctc:'8 LPA'}});
assert.deepEqual(fillKnown(questions,fields),['Current CTC']);
assert.equal((browser.document.querySelector('#ctc') as HTMLInputElement).value,'8 LPA');
assert.equal((browser.document.querySelector('#secret') as HTMLInputElement).value,'');

const contentSource=readFileSync(resolve('src/content/index.ts'),'utf8');
assert.doesNotMatch(contentSource,/finally\(schedule\)/);
console.log('Extension checks passed: popup rendering/mount, page detection, extraction, badge, dedupe, and safe autofill.');
