import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { PGlite } from '../.validation-tools/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite(); const results = [];
async function check(name, work) { try { await work(); results.push({ name, passed: true }); } catch(e) { results.push({ name, passed: false, error: e.message }); } }
const scalar = async (sql, args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await check('SQL original installé et rejoué sans erreur', async()=> { const sql=readFileSync('docs/security-rpc.sql','utf8'); await db.exec(sql); await db.exec(sql); });
await check('Quota SQL borne exacte et séparation de comptes', async()=> {
  for(let i=0;i<12;i++) assert.equal(await scalar('select cible_take_quota($1,12)',['account-a:/api/ai']),true);
  assert.equal(await scalar('select cible_take_quota($1,12)',['account-a:/api/ai']),false);
  assert.equal(await scalar('select cible_take_quota($1,12)',['account-b:/api/ai']),true);
});
await check('Bail SQL exclusif, token étranger, expiration, nouvelle acquisition', async()=>{
  assert.equal(await scalar("select cible_take_sync_lease('a','first')"),true);
  assert.equal(await scalar("select cible_take_sync_lease('a','second')"),false);
  await db.exec("select cible_release_sync_lease('a','foreign');");
  assert.equal(await scalar("select cible_take_sync_lease('a','second')"),false);
  await db.exec("update cible_sync_lease set expires_at=now()-interval '1 second' where owner='a';");
  assert.equal(await scalar("select cible_take_sync_lease('a','second')"),true);
  await db.exec("select cible_release_sync_lease('a','first');");
  assert.equal(await scalar("select cible_take_sync_lease('a','third')"),false);
});
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const dossier={originalCv:{name:'CV maître',text:'Original privé test'},cvs:[{id:'adapté',file:'cv.pdf'}],applications:[{id:'sent',cvText:'CV envoyé',letterText:'Lettre envoyée'}],dossiers:{job:{cvText:'Adapté',letterText:'Lettre'}},profile:{email:'test@example.test'},offers:[],letters:[]};
await check('Sauvegarde/restauration réelle SQL, historique CV/candidatures, conflit',async()=>{
  assert.equal(await scalar('select cible_save_user_data($1,0,$2)',[a,dossier]),1);
  assert.deepEqual(await scalar('select data from cible_user_data where user_id=$1',[a]),dossier);
  const updated={...dossier,applications:[...dossier.applications,{id:'next',cvText:'Nouveau CV'}]};
  assert.equal(await scalar('select cible_save_user_data($1,1,$2)',[a,updated]),2);
  assert.equal(await scalar('select cible_save_user_data($1,1,$2)',[a,{...updated,originalCv:null}]),null);
  assert.deepEqual(await scalar('select data from cible_user_data_history where user_id=$1 and version=1',[a]),dossier);
  assert.deepEqual(await scalar('select data from cible_user_data where user_id=$1',[a]),updated);
  assert.equal(await scalar('select cible_save_user_data($1,2,$2)',[a,dossier]),3);
  assert.deepEqual(await scalar('select data from cible_user_data where user_id=$1',[a]),dossier);
  assert.equal(await scalar('select count(*) from cible_user_data where user_id=$1',[b]),0);
});
await check('Deux écritures simultanées avec même version : une seule acceptée (moteur sérialisé)',async()=>{
 const r=await Promise.all([scalar('select cible_save_user_data($1,3,$2)',[a,dossier]),scalar('select cible_save_user_data($1,3,$2)',[a,{...dossier,note:'other'}])]);
 assert.deepEqual(r.sort((x,y)=>Number(x)-Number(y)),[null,4]);
});
for(const role of ['anon','authenticated']) await check(`Droits SQL ${role} : tables/RPC interdits`,async()=>{
 await db.exec(`set role ${role}`);
 try { await assert.rejects(db.query('select * from cible_user_data'),/permission denied/); await assert.rejects(db.query("select cible_take_sync_lease('x','y')"),/permission denied/); await assert.rejects(db.query('select cible_save_user_data($1,0,$2)',[b,dossier]),/permission denied/); }
 finally { await db.exec('reset role'); }
});
await check('Service role autorisé et données inchangées après refus',async()=>{
 await db.exec('set role service_role');
 try { assert.equal(await scalar('select count(*) from cible_user_data'),1); assert.equal(await scalar("select cible_take_quota('service',12)"),true); }
 finally { await db.exec('reset role'); }
 assert.deepEqual(await scalar('select data from cible_user_data where user_id=$1',[a]),dossier);
});
await db.close();
const report={engine:'PGlite PostgreSQL WASM local (single connection, not Supabase/PostgREST or multi-process contention)',results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length};
writeFileSync('validation-sql.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
