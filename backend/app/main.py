from contextlib import asynccontextmanager
from collections import Counter
from datetime import datetime,timezone,timedelta
import hashlib,re,secrets
from typing import Any

from fastapi import Depends,FastAPI,HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .auth import EMPTY_PREFERENCES,EMPTY_PROFILE,current_user,issue_token,password_hash,password_matches
from .config import get_settings
from .db import Base,SessionLocal,engine,migrate_schema
from .jobs import hard_filter,identity
from .llm import analyze,answer_descriptive_question
from .email import send_reset_code
from .models import Analysis,Application,Job,PasswordResetToken,ProfileContext,User
from .schemas import AnalyzeRequest,AnswerRequest,Credentials,ImportRequest,PasswordResetConfirm,PasswordResetRequest,QuestionRequest

s=get_settings()
@asynccontextmanager
async def lifespan(_):
    Base.metadata.create_all(engine);migrate_schema();yield
app=FastAPI(title='Naukri AI Assistant',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in s.cors_origins.split(',') if x.strip()],allow_methods=['*'],allow_headers=['*'])

def context_for(db,user:User,request:Request)->ProfileContext:
    key=request.headers.get('x-naukri-profile-key','default')
    if not re.fullmatch(r'[a-f0-9]{16,64}|default',key):key='default'
    row=db.scalar(select(ProfileContext).where(ProfileContext.user_id==user.id,ProfileContext.context_key==key))
    if not row:row=ProfileContext(user_id=user.id,context_key=key,profile=user.profile or EMPTY_PROFILE,preferences=user.preferences or EMPTY_PREFERENCES);db.add(row);db.flush()
    return row
def scoped_identity(user:User,context:ProfileContext,item)->str:return hashlib.sha256(f'{user.id}:{context.context_key}:{identity(item)}'.encode()).hexdigest()
def user_job(db,user:User,context:ProfileContext,job_id:int)->Job:
    row=db.scalar(select(Job).where(Job.id==job_id,Job.user_id==user.id,Job.naukri_context==context.context_key))
    if not row:raise HTTPException(404,'Job not found')
    return row
def user_data(user:User):return {'id':user.id,'email':user.email}

@app.get('/api/health')
def health():return {'ok':True,'groq_configured':bool(s.groq_api_key),'authentication_required':True}
@app.post('/api/auth/register')
def register(body:Credentials):
    email=body.email.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email==email)):raise HTTPException(409,'An account already exists for this email')
        user=User(email=email,password_hash=password_hash(body.password),profile=EMPTY_PROFILE,preferences=EMPTY_PREFERENCES);db.add(user);db.commit();db.refresh(user)
    return {'token':issue_token(user.id),'user':user_data(user)}
@app.post('/api/auth/login')
def login(body:Credentials):
    with SessionLocal() as db:
        user=db.scalar(select(User).where(User.email==body.email.strip().lower()))
        if not user or not password_matches(body.password,user.password_hash):raise HTTPException(401,'Invalid email or password')
        db.expunge(user)
    return {'token':issue_token(user.id),'user':user_data(user)}
@app.post('/api/auth/forgot-password')
def forgot_password(body:PasswordResetRequest):
    email=body.email.strip().lower();code=secrets.token_urlsafe(24);token_hash=hashlib.sha256(code.encode()).hexdigest()
    with SessionLocal() as db:
        user=db.scalar(select(User).where(User.email==email))
        if user:
            db.add(PasswordResetToken(user_id=user.id,token_hash=token_hash,expires_at=datetime.now(timezone.utc)+timedelta(minutes=15)));db.commit()
    if user:
        try:send_reset_code(email,code)
        except RuntimeError as exc:raise HTTPException(503,str(exc)) from exc
    return {'ok':True,'message':'If that email is registered, a reset code has been sent.'}
@app.post('/api/auth/reset-password')
def reset_password(body:PasswordResetConfirm):
    token_hash=hashlib.sha256(body.token.encode()).hexdigest();now=datetime.now(timezone.utc)
    with SessionLocal() as db:
        reset=db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash==token_hash,PasswordResetToken.used_at.is_(None)))
        if not reset or reset.expires_at<now:raise HTTPException(422,'That reset code is invalid or expired')
        user=db.get(User,reset.user_id);user.password_hash=password_hash(body.password);reset.used_at=now;db.commit()
    return {'ok':True,'message':'Password reset. You can now sign in.'}
@app.get('/api/auth/me')
def me(user:User=Depends(current_user)):return {'user':user_data(user)}

@app.post('/api/jobs/import')
def import_jobs(body:ImportRequest,request:Request,user:User=Depends(current_user)):
    saved=[]
    with SessionLocal() as db:
        context=context_for(db,user,request);preferences=context.preferences or EMPTY_PREFERENCES
        for item in body.jobs:
            key=scoped_identity(user,context,item);existing=db.scalar(select(Job).where(Job.identity==key,Job.user_id==user.id,Job.naukri_context==context.context_key))
            if existing:existing.last_seen_at=datetime.now(timezone.utc);saved.append(existing);continue
            ok,reason=hard_filter(item,maximum=(preferences.get('experience') or {}).get('maximum',2),prefs=preferences)
            row=Job(**item.model_dump(),user_id=user.id,naukri_context=context.context_key,identity=key,status='ANALYSIS_PENDING' if ok else 'SKIPPED',analysis={'filter_reason':reason} if reason else {});db.add(row);db.flush();saved.append(row)
        db.commit()
        return [{'id':j.id,'status':j.status,'title':j.title,'analysis':j.analysis if j.match_score is not None else None,'match_score':j.match_score,'filter_reason':(j.analysis or {}).get('filter_reason')} for j in saved]
@app.get('/api/jobs')
def list_jobs(request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context=context_for(db,user,request);db.commit();return db.scalars(select(Job).where(Job.user_id==user.id,Job.naukri_context==context.context_key).order_by(Job.last_seen_at.desc())).all()
@app.get('/api/jobs/{job_id}')
def get_job(job_id:int,request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:return user_job(db,user,context_for(db,user,request),job_id)
@app.post('/api/jobs/analyze-batch')
async def analyze_batch(body:AnalyzeRequest,request:Request,user:User=Depends(current_user)):
    results=[]
    with SessionLocal() as db:context=context_for(db,user,request);db.commit();jobs=[user_job(db,user,context,i) for i in body.job_ids[:5]]
    for job in [j for j in jobs if j.status=='ANALYSIS_PENDING' or body.force]:
        try:result=await analyze({'title':job.title,'company':job.company,'location':job.location,'experience':job.experience_text,'skills':job.skills,'description':job.description},context.profile or EMPTY_PROFILE)
        except Exception as exc:results.append({'id':job.id,'title':job.title,'error':str(exc)});continue
        with SessionLocal() as db:
            row=user_job(db,user,context,job.id);row.match_score=result.match_score;row.recommendation=result.recommendation;row.status='STRONG_MATCH' if result.recommendation=='STRONG_MATCH' else 'ANALYZED';row.analysis=result.model_dump();db.add(Analysis(user_id=user.id,job_id=row.id,model=s.groq_model,analysis_json=result.model_dump()));db.commit()
        results.append({'id':job.id,'title':job.title,'analysis':result.model_dump()})
    return results
@app.post('/api/jobs/analyze')
async def analyze_one(body:AnalyzeRequest,request:Request,user:User=Depends(current_user)):body.job_ids=body.job_ids[:1];return await analyze_batch(body,request,user)

@app.get('/api/profile')
def get_profile(request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context=context_for(db,user,request);db.commit();return context.profile or EMPTY_PROFILE
@app.put('/api/profile')
def update_profile(body:dict[str,Any],request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context_for(db,user,request).profile=body;db.commit()
    return body
@app.get('/api/settings')
def get_settings_endpoint(request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context=context_for(db,user,request);db.commit();return context.preferences or EMPTY_PREFERENCES
@app.put('/api/settings')
def update_settings(body:dict[str,Any],request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context_for(db,user,request).preferences=body;db.commit()
    return body

@app.post('/api/screening/classify')
def classify_question(body:QuestionRequest,user:User=Depends(current_user)):
    q=body.question.lower()
    if re.search(r'password|otp|one[- ]time|captcha|mfa|government id|aadhaar|pan|bank|credit card',q):kind='SENSITIVE'
    elif re.search(r'how many years|years of|current ctc|expected ctc|notice period|email|phone|location|company|title',q):kind='FACT'
    elif re.search(r'willing|relocate|remote|work from|authorization|sponsorship|shift',q):kind='PREFERENCE'
    elif len(body.question)>45 or body.question.endswith('?'):kind='DESCRIPTIVE'
    else:kind='UNKNOWN'
    return {'kind':kind,'requires_manual':kind in {'SENSITIVE','UNKNOWN'}}
@app.post('/api/screening/answer')
async def answer_question(body:AnswerRequest,request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:context=context_for(db,user,request);db.commit();profile=context.profile or EMPTY_PROFILE
    classified=classify_question(QuestionRequest(question=body.question,job_description=body.job_description),user);text=body.question.lower()
    if classified['kind'] in {'SENSITIVE','UNKNOWN'}:raise HTTPException(422,'This question requires a manual answer')
    if classified['kind']=='DESCRIPTIVE':
        try:return {'answer':await answer_descriptive_question(body.question,body.job_description,profile),'source':'groq'}
        except Exception as exc:raise HTTPException(422,str(exc)) from exc
    personal=profile.get('personal',{}) or {};professional=profile.get('professional',{}) or {};preferences=profile.get('preferences',{}) or {}
    facts=[(r'email',personal.get('email')),(r'phone',personal.get('phone')),(r'location',personal.get('location')),(r'current ctc',professional.get('current_ctc')),(r'expected ctc',professional.get('expected_ctc')),(r'notice period',professional.get('notice_period_days')),(r'years',professional.get('total_experience_years'))]
    for pattern,value in facts:
        if re.search(pattern,text) and value not in (None,''):return {'answer':str(value),'source':'profile'}
    if re.search(r'remote|relocate|work from',text) and 'remote_allowed' in preferences:return {'answer':'Yes' if preferences['remote_allowed'] else 'No','source':'profile'}
    raise HTTPException(422,'No matching profile fact; answer manually')

@app.post('/api/applications/{job_id}/prepared')
def prepared(job_id:int,request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:
        user_job(db,user,context_for(db,user,request),job_id)
        if not db.scalar(select(Application).where(Application.job_id==job_id,Application.user_id==user.id)):db.add(Application(user_id=user.id,job_id=job_id,status='PREPARED'));db.commit()
    return {'status':'PREPARED'}
@app.post('/api/applications/{job_id}/applied')
def mark_applied(job_id:int,request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:
        user_job(db,user,context_for(db,user,request),job_id);row=db.scalar(select(Application).where(Application.job_id==job_id,Application.user_id==user.id))
        if not row:row=Application(user_id=user.id,job_id=job_id)
        row.status='APPLIED';row.applied_at=datetime.now(timezone.utc);db.add(row);db.commit()
    return {'status':'APPLIED'}
@app.get('/api/applications')
def list_applications(user:User=Depends(current_user)):
    with SessionLocal() as db:return db.scalars(select(Application).where(Application.user_id==user.id).order_by(Application.prepared_at.desc())).all()

@app.get('/api/stats')
def stats(request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:
        context=context_for(db,user,request);db.commit();jobs=db.query(Job).filter(Job.user_id==user.id,Job.naukri_context==context.context_key);apps=db.query(Application).filter(Application.user_id==user.id)
        return {'jobs':jobs.count(),'analyzed':jobs.filter(Job.match_score.is_not(None)).count(),'strong_matches':jobs.filter(Job.recommendation=='STRONG_MATCH').count(),'review':jobs.filter(Job.recommendation=='REVIEW').count(),'skipped':jobs.filter(Job.status=='SKIPPED').count(),'prepared':apps.filter(Application.status=='PREPARED').count(),'applied':apps.filter(Application.status=='APPLIED').count()}
@app.get('/api/dashboard')
def dashboard(request:Request,user:User=Depends(current_user)):
    with SessionLocal() as db:
        context=context_for(db,user,request);db.commit();jobs=list(db.scalars(select(Job).where(Job.user_id==user.id,Job.naukri_context==context.context_key).order_by(Job.last_seen_at.desc())).all());analyzed=[j for j in jobs if j.match_score is not None];gaps=Counter(skill for j in analyzed for skill in (j.analysis or {}).get('missing_skills',[]) if skill);top=sorted(analyzed,key=lambda j:j.match_score or 0,reverse=True)[:8]
        return {'summary':{'found':len(jobs),'strong':sum(j.recommendation=='STRONG_MATCH' for j in analyzed),'review':sum(j.recommendation=='REVIEW' for j in analyzed),'low':sum(j.recommendation=='SKIP' for j in analyzed),'skipped':sum(j.status=='SKIPPED' for j in jobs),'pending':sum(j.status=='ANALYSIS_PENDING' for j in jobs)},'top_matches':[{'id':j.id,'title':j.title,'company':j.company,'job_url':j.job_url,'match_score':j.match_score,'recommendation':j.recommendation,'analysis':j.analysis or {}} for j in top],'skill_gaps':[{'skill':skill,'count':count} for skill,count in gaps.most_common(8)]}
