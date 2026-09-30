import base64,hashlib,os
def hash_password(password):
    salt=os.urandom(16);digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1)
    return 'scrypt$'+base64.urlsafe_b64encode(salt).decode()+'$'+base64.urlsafe_b64encode(digest).decode()
if __name__=='__main__':print(hash_password(input('Password: ')))
