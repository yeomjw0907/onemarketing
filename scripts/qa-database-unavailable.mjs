import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const review=readFileSync('.git/qa-review-path.txt','utf8').trim();
const origin='http://127.0.0.1:3122';
const server=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--port','3122','--hostname','127.0.0.1'],{cwd:review,env:{...process.env,DATABASE_URL:'postgresql://test:test@127.0.0.1:1/test',DB_SCHEMA:'public',APP_URL:origin,COOKIE_SECURE:'false'},stdio:'ignore',windowsHide:true});
try{
 for(let i=0;i<60;i++){try{await fetch(origin+'/api/viewer');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const results=[];
 for(const endpoint of ['/api/viewer','/api/commerce','/api/advertiser-products','/api/advertiser-auth','/api/intake']){
 const r=await fetch(origin+endpoint,{headers:{Cookie:'om_advertiser='+'a'.repeat(64)+'; om_intake='+'b'.repeat(64)},signal:AbortSignal.timeout(20000)});
 const body=await r.json();assert.equal(r.status,503,endpoint+JSON.stringify(body));assert.match(body.error,/서버 연결/);results.push({endpoint,status:r.status});
 }
 assert.equal((await fetch(origin+'/api/commerce')).status,401);
 console.log(JSON.stringify({connectionFailures:results,unauthenticated:401}));
}finally{server.kill();}
