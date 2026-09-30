from app.jobs import hard_filter
from app.main import classify_question
from app.schemas import JobIn, QuestionRequest


def job(**overrides):
    data={'title':'Generative AI Engineer','company':'Example','location':'Noida','experience_text':'1-2 years','job_url':'https://www.naukri.com/job/1','skills':['Python']}
    data.update(overrides)
    return JobIn(**data)


def test_hard_filter_rejects_senior_roles():
    accepted, reason=hard_filter(job(title='Senior Generative AI Engineer'))
    assert not accepted
    assert reason


def test_hard_filter_accepts_matching_role():
    accepted, reason=hard_filter(job())
    assert accepted and reason is None


def test_screening_classifier_blocks_sensitive_questions():
    result=classify_question(QuestionRequest(question='Please enter your OTP'))
    assert result == {'kind':'SENSITIVE','requires_manual':True}


def test_screening_classifier_identifies_profile_fact():
    result=classify_question(QuestionRequest(question='How many years of Python experience do you have?'))
    assert result['kind']=='FACT'
