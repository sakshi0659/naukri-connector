"""Minimal password and bearer-token authentication for the hosted API."""
import hashlib
import hmac
import secrets

from fastapi import HTTPException,Request
from sqlalchemy import select

from .db import SessionLocal
from .models import AccessToken,User

EMPTY_PROFILE={
    'personal':{'name':'','email':'','phone':'','location':''},
    'professional':{'current_title':'','current_company':'','total_experience_years':None,'current_ctc':'','expected_ctc':'','notice_period_days':None},
    'skills':[],'employment':[],'projects':[],'education':[],'certifications':[],
    'preferences':{'preferred_locations':[],'remote_allowed':True},
}
EMPTY_PREFERENCES={'roles':[],'experience':{'minimum':0,'maximum':2},'minimum_analysis_score':60,'strong_match_score':80,'auto_fill_score':80}

def password_hash(password:str,salt:str|None=None)->str:
    salt=salt or secrets.token_hex(16)
    digest=hashlib.pbkdf2_hmac('sha256',password.encode(),salt.encode(),310_000).hex()
    return f'{salt}${digest}'

def password_matches(password:str,stored:str)->bool:
    try:
        salt,digest=stored.split('$',1)
        return hmac.compare_digest(password_hash(password,salt),stored)
    except ValueError:
        return False

def issue_token(user_id:int)->str:
    token=secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(AccessToken(user_id=user_id,token_hash=hashlib.sha256(token.encode()).hexdigest()))
        db.commit()
    return token

def current_user(request:Request)->User:
    header=request.headers.get('authorization','')
    if not header.startswith('Bearer '):
        raise HTTPException(401,'Sign in to Naukri AI first')
    token=header[7:].strip()
    if not token:
        raise HTTPException(401,'Sign in to Naukri AI first')
    token_hash=hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as db:
        row=db.scalar(select(AccessToken).where(AccessToken.token_hash==token_hash))
        user=db.get(User,row.user_id) if row else None
        if not user:
            raise HTTPException(401,'Your Naukri AI session has expired')
        db.expunge(user)
        return user
