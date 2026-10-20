
'use strict';
const crypto=require('node:crypto');
const {AppError}=require('./database.cjs');
const POLICY=Object.freeze({maxFailures:3,lockMs:15*60*1000,idleMs:30*60*1000,absoluteMs:8*60*60*1000});
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const passwordHash=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
function createAuthentication(store,{now=Date.now,secureCookie=false}={}){
 const db=store.db;
 const tokenFrom=req=>/(?:^|;\s*)safety_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
 function cookie(res,token,age){
  res.setHeader('Set-Cookie','safety_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secureCookie?'; Secure':''));
 }
 function session(req,res){
  const token=tokenFrom(req);if(!token)return null;
  const row=db.prepare('SELECT u.id,u.email,s.expires_at,s.last_activity FROM sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=?').get(digest(token));
  const time=now();
  if(!row||row.expires_at<=time||row.last_activity<=0||time-row.last_activity>=POLICY.idleMs){
   if(row)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
   cookie(res,'',0);return null;
  }
  return {user:{id:row.id,email:row.email}};
 }
 function loginCookie(req,res,user){
  const old=tokenFrom(req);if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));
  const token=crypto.randomBytes(32).toString('hex'),time=now();
  db.prepare('DELETE FROM sessions WHERE expires_at<=? OR last_activity<=?').run(time,time-POLICY.idleMs);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,last_activity) VALUES(?,?,?,?)').run(digest(token),user.id,time+POLICY.absoluteMs,time);
  cookie(res,token,POLICY.idleMs/1000);return {user:{id:user.id,email:user.email}};
 }
 function logout(req,res){
  const token=tokenFrom(req);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
  cookie(res,'',0);
 }
 function activity(req,res){
  const current=session(req,res);if(!current)throw new AppError('Login required',401,'AUTH_REQUIRED');
  const token=tokenFrom(req),time=now();
  db.prepare('UPDATE sessions SET last_activity=? WHERE token_hash=?').run(time,digest(token));
  const row=db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(digest(token));
  cookie(res,token,Math.max(1,Math.ceil(Math.min(POLICY.idleMs,row.expires_at-time)/1000)));
  return {session:current};
 }
 function locked(){return new AppError('Too many failed logins. Try again in 15 minutes.',429,'ACCOUNT_LOCKED')}
 function login(req,res,payload){
  const email=String(payload.email||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Email or password is incorrect',401,'INVALID_CREDENTIALS');
  const key=digest(email),time=now();
  // Persist account counters so changing IP or restarting cannot bypass a lock.
  const attempt=db.prepare('SELECT * FROM auth_login_failures WHERE account_key=?').get(key);
  if(attempt?.locked_until>time)throw locked();
  const user=db.prepare('SELECT * FROM admin_users WHERE email=?').get(email);
  const validInput=typeof payload.password==='string'&&payload.password.length<=128;
  const actual=passwordHash(validInput?payload.password:'',user?.salt||'dummy-salt');
  const expected=user?.password_hash||'0'.repeat(128);
  const valid=validInput&&crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))&&Boolean(user);
  if(!valid){
   const failures=attempt&&attempt.locked_until===0?attempt.failed_count+1:1;
   const until=failures>=POLICY.maxFailures?time+POLICY.lockMs:0;
   db.prepare('INSERT INTO auth_login_failures(account_key,failed_count,last_failed_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(account_key) DO UPDATE SET failed_count=excluded.failed_count,last_failed_at=excluded.last_failed_at,locked_until=excluded.locked_until').run(key,failures,time,until);
   db.prepare('DELETE FROM auth_login_failures WHERE failed_count>=3 AND last_failed_at<? AND locked_until<=?').run(time-24*60*60*1000,time);
   if(until)throw locked();
   throw new AppError('Email or password is incorrect',401,'INVALID_CREDENTIALS');
  }
  db.prepare('DELETE FROM auth_login_failures WHERE account_key=?').run(key);
  return {session:loginCookie(req,res,user)};
 }
 return {session,loginCookie,logout,activity,login,passwordHash};
}
module.exports={createAuthentication,POLICY};
