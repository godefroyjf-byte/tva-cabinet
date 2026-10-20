import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {quarterRange} from '../shared/periods.ts';
import {filterOperations,summary} from '../shared/model.ts';
import {extractPdf} from '../server/pdf-extract.ts';
import {Store} from '../server/store.ts';

test('Trimestres civils : bornes exactes T1 à T4, choix historique et entrées invalides refusées',()=>{
  assert.deepEqual(quarterRange(2026,1),{from:'2026-01-01',to:'2026-03-31'});
  assert.deepEqual(quarterRange(2026,2),{from:'2026-04-01',to:'2026-06-30'});
  assert.deepEqual(quarterRange(2026,3),{from:'2026-07-01',to:'2026-09-30'});
  assert.deepEqual(quarterRange(2025,4),{from:'2025-10-01',to:'2025-12-31'});
  for(const [year,quarter]of [[2026,0],[2026,5],[2026,1.5],[0,1],[2201,1],[2026.5,1],[NaN,1]])assert.throws(()=>quarterRange(year,quarter));
});

test('Un PDF dépassant T2 est importé intégralement, puis sa TVA est répartie aux bons trimestres sans perdre la source',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'tva-quarter-')),store=new Store(directory,'real');
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  const bytes=readFileSync('examples/releve-fictif-trimestres.pdf');
  const extracted=await extractPdf(new Uint8Array(bytes));
  const job={filename:'releve-fictif-trimestres.pdf',base64:bytes.toString('base64'),hash:createHash('sha256').update(bytes).digest('hex'),document:extracted.document};
  const options={jobId:'00000000-0000-4000-8000-000000000000',account:'Test trimestriel'};
  const preview=store.previewPdf(job,options);
  assert.equal(preview.options.periodStart,'2026-03-15');assert.equal(preview.options.periodEnd,'2026-07-15');
  assert.equal(preview.rows.length,4);assert.equal(preview.errorCount,0);assert.equal(preview.balanceDifference,0);
  store.importPdf(job,{...preview.options,selectedLines:preview.rows.map(row=>row.line),reviewed:true,acceptRejected:false,confirmDuplicates:false});
  store.setSettings({regime:'receipts',regimeConfirmed:true,rates:[2000]});
  store.update(store.list().map(o=>({id:o.id,revision:o.revision,status:'confirmed',parts:o.parts.map(p=>({...p,nature:'revenue',treatment:'taxable',periodConfirmed:true}))})));
  const settlement={adjustmentsCents:0,priorCreditCents:0,confirmed:false};
  assert.deepEqual(filterOperations(store.list(),quarterRange(2026,2)).map(o=>o.date),['2026-04-01','2026-06-30']);
  assert.equal(summary(store.list(),quarterRange(2026,1),settlement).collected,2000);
  assert.equal(summary(store.list(),quarterRange(2026,2),settlement).collected,10000);
  assert.equal(summary(store.list(),quarterRange(2026,3),settlement).collected,8000);
  assert.equal(summary(store.list(),{},settlement).collected,20000);
  assert.equal(store.backup().payload.operations.length,4);assert.equal(store.imports()[0].base64,job.base64);
});
