export type NaukriProfileSnapshot={currentTitle?:string;location?:string;experienceYears?:number;skills:string[]};

const clean=(value:string|undefined)=>value?.replace(/\s+/g,' ').trim()||'';
const visible=(element:Element)=>{const style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'};

function labeledValue(labels:string[]):string{
  const elements=Array.from(document.querySelectorAll<HTMLElement>('label,dt,h2,h3,h4,strong,span,p,div')).filter(element=>visible(element));
  for(const element of elements){
    const text=clean(element.textContent).toLowerCase();
    if(!labels.some(label=>text===label||text.startsWith(`${label}:`)))continue;
    const own=clean(element.textContent);
    const withoutLabel=clean(own.replace(new RegExp(`^(${labels.join('|')})\\s*:?\\s*`,'i'),''));
    if(withoutLabel&&withoutLabel.toLowerCase()!==text)return withoutLabel;
    const sibling=element.nextElementSibling;
    if(sibling&&visible(sibling)){const value=clean(sibling.textContent);if(value&&value.length<180)return value}
    const parent=element.parentElement;
    if(parent){const value=clean(parent.textContent).replace(new RegExp(`^${own.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*:?\\s*`,'i'),'');if(value&&value.length<180)return value}
  }
  return '';
}

function profileSkills():string[]{
  const label=Array.from(document.querySelectorAll<HTMLElement>('h2,h3,h4,strong,span,p,div')).find(element=>visible(element)&&/^(key )?skills$/i.test(clean(element.textContent)));
  const container=label?.parentElement?.parentElement||label?.parentElement;
  if(!container)return [];
  const values=Array.from(container.querySelectorAll<HTMLElement>('a,li,span')).filter(visible).map(element=>clean(element.textContent)).filter(value=>value&&value.length<70&&!/^(add|edit|skills?)$/i.test(value));
  return [...new Set(values)].slice(0,40);
}

export function extractVisibleNaukriProfile():NaukriProfileSnapshot|null{
  const path=location.pathname.toLowerCase();
  const rawText=document.body.innerText||'';
  const lines=rawText.split(/\r?\n/).map(clean).filter(Boolean);
  const pageText=clean(rawText).toLowerCase();
  const profilePage=/profile|mnjuser|resume/.test(path)||/profile summary|key skills|current designation/.test(pageText)||(/quick links/.test(pageText)&&/resume headline|key skills|employment/.test(pageText));
  if(!profilePage)return null;
  const heading=clean(document.querySelector('h1')?.textContent);
  const headingIndex=heading?lines.findIndex(line=>line===heading):-1;
  const summaryTitle=headingIndex>=0?lines.slice(headingIndex+1,headingIndex+4).find(line=>!/^(at |\d+(?:\.\d+)?\s*(years?|months?)\b|[\w.+-]+@[\w.-]+$|\+?\d[\d -]{7,})/i.test(line)):'';
  const currentTitle=labeledValue(['current designation','current title','designation','profile title'])||summaryTitle;
  const profileLocation=labeledValue(['current location','location','preferred location'])||lines.find(line=>/\b(india|remote)\b/i.test(line)&&!/@/.test(line))||'';
  const experienceText=labeledValue(['total experience','experience'])||lines.find(line=>/^\d+(?:\.\d+)?\s*(years?|months?)\b/i.test(line))||'';
  const experienceMatch=experienceText.match(/\d+(?:\.\d+)?/);
  const skills=profileSkills();
  if(!currentTitle&&!profileLocation&&!experienceMatch&&!skills.length)return null;
  return {currentTitle:currentTitle||undefined,location:profileLocation||undefined,experienceYears:experienceMatch?Number(experienceMatch[0]):undefined,skills};
}
