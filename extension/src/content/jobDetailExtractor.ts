import type {ExtractedJob} from '../shared/types';
import {first,selectors} from './selectors';

const clean=(value:string|undefined)=>value?.replace(/\s+/g,' ').trim().slice(0,12000)||undefined;
export function extractJobDetail():ExtractedJob|null{
  const title=clean(first(document,['h1','[data-testid="job-title"]','.jd-header-title'])?.textContent||first(document,selectors.title)?.textContent);
  if(!title)return null;
  const link=first(document,selectors.title) as HTMLAnchorElement|null;
  const description=clean(first(document,['.jd-desc','.job-desc','.job-description','[class*="description" i]'])?.textContent||document.querySelector('main')?.textContent);
  const id=new URL(location.href).searchParams.get('jobId')||location.pathname.match(/(\d{5,})/)?.[1];
  return {externalId:id||undefined,title,company:clean(first(document,['.jd-header-comp-name','.comp-name','[class*="company" i]'])?.textContent)||'Unknown company',location:clean(first(document,['.locWdth','.location','[class*="location" i]'])?.textContent),experienceText:clean(first(document,['.expwdth','.experience','[class*="experience" i]'])?.textContent),skills:Array.from(document.querySelectorAll('[class*="skill" i],.tags-gt')).flatMap(e=>(e.textContent||'').split(/•|,/)).map(x=>x.trim()).filter(Boolean).slice(0,20),description,jobUrl:link?.href||location.href};
}
