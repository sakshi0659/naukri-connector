import smtplib
import ssl
import json
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen
from email.message import EmailMessage
from .config import get_settings

def send_reset_code(recipient:str,code:str)->None:
    settings=get_settings()
    subject='Reset your Naukri AI password'
    body=f'Your Naukri AI password reset code is:\n\n{code}\n\nThis code expires in 15 minutes. If you did not request it, ignore this email.'
    if settings.resend_api_key and settings.email_from:
        request=Request('https://api.resend.com/emails',data=json.dumps({'from':settings.email_from,'to':[recipient],'subject':subject,'text':body}).encode(),headers={'Authorization':f'Bearer {settings.resend_api_key}','Content-Type':'application/json'},method='POST')
        try:
            with urlopen(request,timeout=15) as response:
                if response.status not in {200,201,202}:raise RuntimeError('Email provider rejected the reset email')
            return
        except (HTTPError,URLError) as exc:raise RuntimeError('Unable to send reset email') from exc
    if not settings.gmail_sender or not settings.gmail_app_password:
        raise RuntimeError('Email sender is not configured')
    message=EmailMessage();message['Subject']='Reset your Naukri AI password';message['From']=settings.gmail_sender;message['To']=recipient
    message.set_content(body)
    with smtplib.SMTP_SSL('smtp.gmail.com',465,context=ssl.create_default_context()) as smtp:
        smtp.login(settings.gmail_sender,settings.gmail_app_password)
        smtp.send_message(message)
