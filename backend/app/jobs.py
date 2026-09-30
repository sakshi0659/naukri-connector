import hashlib,re
from .schemas import JobIn
SENIOR=re.compile(r'\b(senior|sr\.?|lead|principal|staff|manager|architect|head)\b',re.I)
def identity(job:JobIn)->str:
    raw='|'.join([job.external_id or '',job.company.lower(),job.title.lower(),job.location or '',job.job_url.split('?')[0]])
    return hashlib.sha256(raw.encode()).hexdigest()
def hard_filter(job:JobIn,maximum:float|None=2,prefs:dict|None=None)->tuple[bool,str|None]:
    if SENIOR.search(job.title):return False,'seniority mismatch: senior, lead, manager, or equivalent title detected'
    if maximum is not None:
        m=re.search(r'(\d+(?:\.\d+)?)\s*[-–]\s*(\d+)',job.experience_text or '')
        if m and float(m.group(1))>maximum:return False,'experience mismatch'
    return True,None
