import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { extractPdf } from '../server/pdf-extract.ts';
import { previewPdf,parsePdfMoney } from '../server/pdf-preview.ts';
import { Store } from '../server/store.ts';
import { createApp } from '../server/index.ts';
const base64=readFileSync('examples/releve-fictif-sg.pdf').toString('base64');
const extracted=await extractPdf(new Uint8Array(Buffer.from(base64,'base64')));
const job={filename:'releve-fictif-sg.pdf',base64,hash:createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex'),document:extracted.document};
const options={jobId:'00000000-0000-4000-8000-000000000000',account:'Société Générale'};
function setup(t:{after:(fn:()=>void)=>void}) {
  const directory=mkdtempSync(join(tmpdir(),'tva-pdf-')),store=new Store(directory,'real');
  t.after(()=>{if(store.db.isOpen)store.close();rmSync(directory,{recursive:true,force:true});});
  return {directory,store};
}
function importRequest() {
  const p=previewPdf(job.document,options,[]);
  return {...p.options,selectedLines:p.rows.filter(r=>!r.duplicate&&!r.error).map(r=>r.line),acceptRejected:false,confirmDuplicates:false,reviewed:true};
}
test('PDF texte multi-pages de type SG : neuf mouvements, dates d’opération, signes et libellé sur deux lignes',()=>{
  const p=previewPdf(job.document,options,[]);
  assert.equal(p.pageCount,2);assert.equal(p.rows.length,9);assert.equal(p.errorCount,0);assert.equal(p.duplicateCount,1);
  assert.equal(p.rows[0].date,'2026-01-02');assert.equal(p.rows[0].cents,120000);
  assert.equal(p.rows[1].cents,-12000);assert.equal(p.rows[0].sourceRefs.length,2);
  assert.match(p.rows[0].label,/Référence fictive ALPHA/);assert.equal(p.rows[5].page,2);
  assert.equal(p.totalCents,72000);assert.equal(p.balanceDifference,0);
  assert.equal(p.options.openingBalanceCents,100000);assert.equal(p.options.closingBalanceCents,172000);
  assert.equal(p.options.layout.detected,true);assert.ok(p.ignored.some(l=>l.kind==='Solde'));
});
test('PDF : les nombres financiers restent exacts et une erreur OCR ne devient pas zéro',()=>{
  assert.equal(parsePdfMoney('1.234,56'),123456);
  assert.equal(parsePdfMoney('1 234,56 D'),-123456);
  assert.equal(parsePdfMoney('120,01-'),-12001);
  assert.equal(parsePdfMoney('120.01 CR'),12001);
  assert.throws(()=>parsePdfMoney('12O,00'));
  const p=previewPdf(job.document,{...options,edits:[{line:previewPdf(job.document,options,[]).rows[0].line,date:'2026-01-02',label:'Fictif',amount:'12O,00'}]},[]);
  assert.match(p.rows[0].error??'',/Montant invalide/);assert.equal(p.rows[0].amountText,'12O,00');
  const document=structuredClone(job.document);
  const credit=document.pages[0].lines.find(line=>line.id===p.rows[0].line)!.words.at(-1)!;
  credit.text='12O,00';
  const misread=previewPdf(document,options,[]).rows[0];
  assert.ok(misread.error);assert.equal(misread.amountText,'1 12O,00');
});
test('PDF : année explicite obligatoire pour les dates courtes, et relevé à cheval sur deux années',()=>{
  const p=previewPdf(job.document,{...options,year:null,periodStart:'',periodEnd:''},[]);
  assert.equal(p.errorCount,9);assert.match(p.rows[0].error??'',/année/);
  const document=structuredClone(job.document);
  const line=document.pages[0].lines.find(line=>line.id===p.rows[0].line)!;
  line.words[0].text='31/12';line.text=line.text.replace('02/01','31/12');
  const across=previewPdf(document,{...options,year:2026,periodStart:'2025-12-01',periodEnd:'2026-01-31'},[]);
  assert.equal(across.rows[0].date,'2025-12-31');
});
test('PDF : doublons entre formats et comptes distincts',t=>{
  const {store}=setup(t);
  const csv={filename:'fictif.csv',account:options.account,base64:Buffer.from('Date;Libellé;Montant\n03/01/2026;Fournitures bureau;-120,00').toString('base64')};
  store.import({...csv,selectedLines:[2],acceptRejected:false,confirmDuplicates:false});
  assert.equal(store.previewPdf(job,options).duplicateCount,2);
  assert.equal(store.previewPdf(job,{...options,account:'Autre compte'}).duplicateCount,1);
});
test('PDF : lignes non interprétées visibles, ajout manuel et exclusion explicite',()=>{
  const p=previewPdf(job.document,options,[]),line=p.ignored.find(line=>line.kind==='Non interprétée')!;
  const corrected=previewPdf(job.document,{...options,extraLines:[line.id],edits:[{line:line.id,date:'2026-01-10',label:'Ajout fictif contrôlé',amount:'10,00'}]},[]);
  assert.ok(corrected.rows.some(r=>r.line===line.id&&r.cents===1000&&!r.error));
  const excluded=previewPdf(job.document,{...options,excludedLines:[p.rows[0].line]},[]);
  assert.equal(excluded.rows.length,8);assert.ok(excluded.ignored.some(l=>l.id===p.rows[0].line&&l.kind==='Ignorée par vous'));
  assert.notEqual(excluded.balanceDifference,0);
});
test('PDF scanné : OCR réellement exécuté avec tout accès HTTP désactivé, y compris dans les workers',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,['--import','./tests/deny-network.mjs','tests/ocr-offline.mjs'],{cwd:process.cwd(),timeout:60000,maxBuffer:100000});
  const result=JSON.parse(stdout);
  assert.deepEqual(result.methods,['ocr']);assert.deepEqual(result.rows,[120000,-12000,6000]);
  assert.equal(result.errors,0);assert.equal(result.balance,0);assert.ok(result.warnings.some((w:string)=>w.includes('OCR')));
});
test('PDF chiffré et PDF endommagé : erreurs explicites',async()=>{
  await assert.rejects(()=>extractPdf(new Uint8Array(readFileSync('tests/fixtures/protege.pdf'))),/mot de passe/);
  await assert.rejects(()=>extractPdf(new Uint8Array(Buffer.from('%PDF-1.7\nfichier fictif endommagé'))),/PDF valide|endommagé/);
});
test('PDF : revue explicite et soldes cohérents exigés, sans import partiel sur échec',t=>{
  const {store}=setup(t),request=importRequest();
  assert.throws(()=>store.importPdf(job,{...request,reviewed:false}));
  assert.throws(()=>store.importPdf(job,{...request,closingBalanceCents:1}),/soldes/);
  assert.equal(store.list().length,0);assert.equal(store.imports().length,0);
  store.importPdf(job,request);
  assert.equal(store.list().length,8);assert.ok(store.list().every(o=>o.status==='pending'&&o.parts[0].nature==='review'));
  assert.throws(()=>store.importPdf(job,request),/déjà/);
});
test('PDF : original, pages, OCR/texte et corrections conservés après redémarrage et restauration',t=>{
  const {store,directory}=setup(t);store.importPdf(job,importRequest());
  const backup=store.backup();assert.equal(backup.payload.format,2);assert.equal(backup.payload.imports[0].format,'pdf');
  assert.equal(backup.payload.imports[0].base64,base64);assert.ok(backup.payload.imports[0].pdf!.sourceLines.length>9);
  store.close();const reopened=new Store(directory,'real');t.after(()=>reopened.close());
  assert.equal(reopened.list().length,8);assert.equal(reopened.list()[0].sourcePage,1);assert.equal(reopened.list()[0].sourceRefs!.length,2);
  reopened.restore(backup);assert.equal(reopened.imports()[0].base64,base64);
  const bad=structuredClone(backup);bad.payload.operations[0].sourcePage=30;
  bad.checksum=createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex');
  assert.throws(()=>reopened.restore(bad),/Provenance PDF/);assert.equal(reopened.list().length,8);
});
test('Migration et anciennes sauvegardes CSV version 1 : conservation des données',t=>{
  const {store,directory}=setup(t);
  store.import({filename:'fictif.csv',account:'A',base64:Buffer.from('Date;Libellé;Montant\n01/01/2026;Fictif;12,01').toString('base64'),selectedLines:[2],acceptRejected:false,confirmDuplicates:false});
  const legacy=JSON.parse(JSON.stringify(store.backup()));
  legacy.payload.format=1;
  for(const record of legacy.payload.imports)delete record.format;
  legacy.checksum=createHash('sha256').update(JSON.stringify(legacy.payload)).digest('hex');
  store.db.prepare('DELETE FROM migrations WHERE version=2').run();store.close();
  const updated=new Store(directory,'real');t.after(()=>updated.close());
  assert.equal(updated.list()[0].cents,1201);updated.restore(legacy);
  assert.equal(updated.list()[0].cents,1201);assert.equal(updated.imports()[0].format,'csv');
  assert.equal(updated.db.prepare('SELECT COUNT(*) AS n FROM migrations').get()?.n,2);
});
test('API PDF : lecture asynchrone, aperçu image, contrôle, import, original et annulation',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'tva-api-pdf-'));
  const {app,stores,pdfJobs}=createApp(directory,0);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  t.after(async()=>{pdfJobs.close();await new Promise<void>(resolve=>server.close(()=>resolve()));Object.values(stores).forEach(s=>s.close());rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+address.port;
  const headers={Origin:base,'X-TVA-Client':'1','Content-Type':'application/json'};
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('/api/pdf/jobs',{filename:'faux.pdf',base64:Buffer.from('pas un pdf').toString('base64')})).status,400);
  const start=await post('/api/pdf/jobs',{filename:job.filename,base64});assert.equal(start.status,200);
  const {jobId}=await start.json();assert.equal((await fetch(base+'/api/state')).status,200);
  let status;
  for(let attempt=0;attempt<200;attempt++){
    status=await (await fetch(base+'/api/pdf/jobs/'+jobId)).json();
    if(status.status!=='reading')break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(status.status,'ready',status.error);
  assert.equal((await fetch(base+'/api/pdf/jobs/'+jobId+'?mode=demo')).status,400);
  const image=await fetch(base+'/api/pdf/jobs/'+jobId+'/page/1');assert.equal(image.status,200);assert.match(image.headers.get('content-type')??'',/image\/png/);
  const response=await post('/api/pdf/preview',{jobId,account:'SG'});const p=await response.json();assert.equal(p.rows.length,9);
  const body={...p.options,selectedLines:p.rows.filter((r:{error:string|null;duplicate:boolean})=>!r.error&&!r.duplicate).map((r:{line:number})=>r.line),acceptRejected:false,confirmDuplicates:false};
  assert.equal((await post('/api/pdf/import',{...body,reviewed:false})).status,400);
  assert.equal((await post('/api/pdf/import',{...body,reviewed:true})).status,200);
  const state=await (await fetch(base+'/api/state')).json();assert.equal(state.operations.length,8);
  const source=await fetch(base+'/api/source/'+state.operations[0].importId);assert.match(source.headers.get('content-type')??'',/application\/pdf/);
  assert.equal(Buffer.from(await source.arrayBuffer()).toString('base64'),base64);
  const csv=await (await fetch(base+'/api/export')).text();
  assert.match(csv,/"Page PDF";"Lecture PDF";"Références PDF"/);
  assert.match(csv,/;"1";"text";"p1:l/);
  assert.equal((await post('/api/pdf/jobs/'+jobId+'/cancel',{})).status,200);
  assert.equal((await fetch(base+'/api/pdf/jobs/'+jobId)).status,400);
  assert.equal((await fetch(base+'/api/source/'+state.operations[0].importId)).status,200);
});
