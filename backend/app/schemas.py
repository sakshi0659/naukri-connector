from typing import Literal
from pydantic import BaseModel,Field
class JobIn(BaseModel): external_id:str|None=None;title:str=Field(min_length=1);company:str=Field(min_length=1);location:str|None=None;experience_text:str|None=None;salary:str|None=None;skills:list[str]=[];posted_text:str|None=None;job_url:str;description:str|None=None
class JobAnalysis(BaseModel): eligible:bool;match_score:int=Field(ge=0,le=100);role_relevance:int=Field(ge=0,le=100);skill_match:int=Field(ge=0,le=100);experience_match:int=Field(ge=0,le=100);matched_skills:list[str]=[];missing_skills:list[str]=[];strengths:list[str]=[];concerns:list[str]=[];recommendation:Literal['STRONG_MATCH','REVIEW','SKIP'];reasoning:str
class ImportRequest(BaseModel): jobs:list[JobIn]
class AnalyzeRequest(BaseModel): job_ids:list[int]=[];force:bool=False
class QuestionRequest(BaseModel): question:str;job_description:str=''
class AnswerRequest(BaseModel): question:str;job_description:str=''
class Credentials(BaseModel):
    email:str=Field(min_length=3,max_length=320)
    password:str=Field(min_length=8,max_length=128)
class PasswordResetRequest(BaseModel): email:str=Field(min_length=3,max_length=320)
class PasswordResetConfirm(BaseModel): token:str=Field(min_length=20,max_length=200);password:str=Field(min_length=8,max_length=128)
