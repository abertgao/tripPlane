import Database from 'better-sqlite3'
import {mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
export function openDb(path) {
  mkdirSync(dirname(path),{recursive:true,mode:0o700})
  const db=new Database(path)
  db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000')
  db.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','user')),active INTEGER NOT NULL DEFAULT 1,recovery TEXT,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,role TEXT NOT NULL DEFAULT 'user',expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,uid TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS journeys(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS journey_owner ON journeys(owner);
  CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,journey TEXT NOT NULL REFERENCES journeys(id),name TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_usage(day TEXT NOT NULL,actor TEXT NOT NULL,attempts INTEGER NOT NULL CHECK(attempts>=0),PRIMARY KEY(day,actor));
  CREATE TABLE IF NOT EXISTS receipts(uid TEXT NOT NULL,op TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(uid,op));
  CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,owner TEXT NOT NULL,journey TEXT NOT NULL,revision INTEGER NOT NULL,epoch TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0);`)
  if(!db.pragma('table_info(users)').some(c=>c.name==='recovery_expires')) db.exec('ALTER TABLE users ADD COLUMN recovery_expires INTEGER')
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('epoch',randomUUID())
  return db
}
