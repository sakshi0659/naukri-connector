import json
from tenacity import retry,stop_after_attempt,wait_exponential
from .config import get_settings
from .schemas import JobAnalysis
@retry(stop=stop_after_attempt(3),wait=wait_exponential(min=1,max=8),reraise=True)
async def analyze(job:dict,profile:dict)->JobAnalysis:
    cfg=get_settings()
    if not cfg.groq_api_key:raise RuntimeError('GROQ_API_KEY is not configured')
    from groq import AsyncGroq
    response=await AsyncGroq(api_key=cfg.groq_api_key).chat.completions.create(model=cfg.groq_model,messages=[{'role':'system','content':'You are a conservative technical recruiter. Use only supplied candidate facts. Never fabricate experience. Return JSON matching the requested schema.'},{'role':'user','content':f'Return fields eligible, match_score, role_relevance, skill_match, experience_match, matched_skills, missing_skills, strengths, concerns, recommendation (STRONG_MATCH/REVIEW/SKIP), reasoning. Candidate: {json.dumps(profile)} Job: {json.dumps(job)}'}],response_format={'type':'json_object'},temperature=0.1)
    return JobAnalysis.model_validate_json(response.choices[0].message.content or '{}')

@retry(stop=stop_after_attempt(3),wait=wait_exponential(min=1,max=8),reraise=True)
async def answer_descriptive_question(question: str, job_description: str, profile: dict) -> str:
    cfg=get_settings()
    if not cfg.groq_api_key: raise RuntimeError('GROQ_API_KEY is not configured')
    from groq import AsyncGroq
    response=await AsyncGroq(api_key=cfg.groq_api_key).chat.completions.create(
        model=cfg.groq_model,
        messages=[
            {'role':'system','content':'Answer a job application question using only the supplied candidate facts. Never invent facts. If the facts are insufficient, return exactly MANUAL_REQUIRED.'},
            {'role':'user','content':f'Question: {question}\nJob description: {job_description}\nCandidate facts: {json.dumps(profile)}'},
        ], temperature=0.1)
    answer=(response.choices[0].message.content or '').strip()
    if not answer or answer == 'MANUAL_REQUIRED': raise ValueError('The profile does not contain enough facts; manual answer required')
    return answer
