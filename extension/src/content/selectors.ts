export const selectors={
  cards:['article.jobTuple','div.srp-jobtuple-wrapper','.srp-jobtuple-wrapper','.jobTuple','[class*="jobTuple"]','[class*="job-tuple"]','article[data-job-id]'],
  jobLinks:['a[href*="/job-listings-"]','a[href*="job-listings"]','a[href*="jobId="]','a[data-job-id]'],
  title:['a.title','.title a','[data-testid="job-title"]','h2 a[href*="job"]','h3 a[href*="job"]','a[href*="/job-listings-"]','a[href*="jobId="]'],
  company:['a.comp-name','.comp-name','.companyInfo a','[class*="comp-name"]','[class*="company-name"]'],
  location:['.locWdth','.loc-wrap','.location','[class*="location"]'],
  experience:['.expwdth','.exp-wrap','.experience','[class*="experience"]'],
  salary:['.sal-wrap','.salary','[class*="salary"]'],
  skills:['ul.tags-gt','.tags-gt','.skill-tags','[class*="skill"]'],
  posted:['.job-post-day','.job-post','.freshness','[class*="posted"]'],
  description:['.job-desc','.job-description','[class*="job-description"]'],
};

export function first(root:ParentNode,items:string[]){for(const selector of items){const element=root.querySelector(selector);if(element)return element}return null}

export function findJobLinks(){return Array.from(document.querySelectorAll<HTMLAnchorElement>(selectors.jobLinks.join(','))).filter(link=>Boolean(link.textContent?.trim()))}

function inferCard(link:HTMLAnchorElement):Element{
  let node=link.parentElement;
  let candidate:Element=link;
  for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
    const links=node.querySelectorAll(selectors.jobLinks.join(',')).length;
    const length=(node.textContent||'').trim().length;
    if(links>1)break;
    if(length>(link.textContent||'').trim().length+8&&length<3500)candidate=node;
  }
  return candidate;
}

export function findJobCards(){
  const explicit=selectors.cards.flatMap(selector=>Array.from(document.querySelectorAll(selector)));
  const inferred=findJobLinks().map(inferCard);
  const urls=new Set<string>();
  return [...explicit,...inferred].filter((element,index,all)=>{
    if(all.indexOf(element)!==index||element.closest('[data-naukri-ai="true"]'))return false;
    const link=first(element,selectors.title) as HTMLAnchorElement|null;
    if(!link)return false;
    const key=link.href||link.textContent?.trim()||String(index);
    if(urls.has(key))return false;
    urls.add(key);
    return true;
  });
}
