import type {ExtractedJob} from '../shared/types';
import {first,selectors} from './selectors';

const text=(element:Element|null)=>element?.textContent?.replace(/\s+/g,' ').trim()||undefined;

export function extractJob(card:Element):ExtractedJob|null{
  const link=first(card,selectors.title) as HTMLAnchorElement|null;
  const title=text(link||first(card,selectors.title));
  if(!title)return null;
  const url=link?.href||'';
  const id=card.getAttribute('data-job-id')||new URL(url||location.href).searchParams.get('jobId')||undefined;
  return {
    externalId:id,
    title,
    company:text(first(card,selectors.company))||'Unknown company',
    location:text(first(card,selectors.location)),
    experienceText:text(first(card,selectors.experience)),
    salary:text(first(card,selectors.salary)),
    skills:(text(first(card,selectors.skills))||'').split(/•|,|\s{2,}/).map(value=>value.trim()).filter(Boolean).slice(0,15),
    postedText:text(first(card,selectors.posted)),
    description:text(first(card,selectors.description)),
    jobUrl:url||location.href,
  };
}
