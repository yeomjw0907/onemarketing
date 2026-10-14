import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { kinds, type Kind, type RecordData, type DatabaseView } from './types';
export const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || '.data');
mkdirSync(dataDir,{recursive:true});
export const db = new Database(path.join(dataDir,'marketing.sqlite'));
db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY,kind TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY,count INTEGER NOT NULL,until_time INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS commands (key TEXT PRIMARY KEY,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leases (key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
const decode=(row:unknown):RecordData|undefined=>row?JSON.parse((row as {data:string}).data):undefined;
export const get=(id:string)=>decode(db.prepare('SELECT data FROM records WHERE id=?').get(id));
export const list=(kind:Kind):RecordData[]=>db.prepare('SELECT data FROM records WHERE kind=? ORDER BY created_at DESC').all(kind).map(r=>decode(r)!);
export const view=():DatabaseView=>Object.fromEntries(kinds.map(k=>[k,list(k)])) as DatabaseView;
export function create(kind:Kind,data:Record<string,unknown>):RecordData {
 const now=new Date().toISOString(); const row={...data,id:randomUUID(),kind,version:1,createdAt:now,updatedAt:now};
 db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?)').run(row.id,kind,1,JSON.stringify(row),now,now); return row;
}
export function update(id:string,patch:Record<string,unknown>,version?:number):RecordData {
 const old=get(id);if(!old)throw new Error('항목을 찾을 수 없습니다.');
 if(version!==undefined&&old.version!==version)throw new Error('다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.');
 const row={...old,...patch,id:old.id,kind:old.kind,createdAt:old.createdAt,updatedAt:new Date().toISOString(),version:old.version+1};
 const result=db.prepare('UPDATE records SET data=?,version=?,updated_at=? WHERE id=? AND version=?').run(JSON.stringify(row),row.version,row.updatedAt,id,old.version);
 if(!result.changes)throw new Error('변경 충돌이 발생했습니다.');return row;
}
export function audit(actor:string,action:string,targetId:string,detail:unknown={}){return create('events',{actor,action,targetId,detail});}
export function once<T>(key:string,fn:()=>T):T {return db.transaction(()=>{const old=db.prepare('SELECT result FROM commands WHERE key=?').get(key) as {result:string}|undefined;if(old)return JSON.parse(old.result) as T;const result=fn();db.prepare('INSERT INTO commands VALUES (?,?)').run(key,JSON.stringify(result));return result;})();}

