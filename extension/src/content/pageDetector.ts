import {findJobLinks,selectors} from './selectors';

export type PageType='SEARCH_RESULTS'|'JOB_DETAILS'|'APPLICATION_FORM'|'OTHER';

export function detectPage():PageType{
  const path=location.pathname.toLowerCase();
  const pageText=(document.body.textContent||'').toLowerCase();
  const title=document.title.toLowerCase();
  const jobLinks=findJobLinks();
  const explicitCards=document.querySelector(selectors.cards.join(','));
  const searchSignals=jobLinks.length>1||Boolean(explicitCards)||/(?:^|-)jobs(?:-|\/|$)|jobs-in|job-list/.test(path)||(/jobs/.test(title)&&jobLinks.length>0);
  if(searchSignals)return 'SEARCH_RESULTS';

  const applicationForm=document.querySelector('form[action*="apply" i],[class*="apply" i] form,[class*="application" i] form,[role="dialog"] form');
  const applicationSignals=/current ctc|expected ctc|notice period|screening question|submit application|years of experience/.test(applicationForm?.textContent?.toLowerCase()||pageText);
  if(/\/apply(?:\/|$)|\/application(?:\/|$)/.test(path)||(applicationForm&&applicationSignals))return 'APPLICATION_FORM';

  const detailSignals=document.querySelector('.jd-desc,.job-desc,.job-description,[class*="job-description" i]');
  if(/job-detail|\/job-listings-/.test(path)||detailSignals||jobLinks.length===1)return 'JOB_DETAILS';
  return 'OTHER';
}
