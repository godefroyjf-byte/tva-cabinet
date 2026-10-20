import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { amounts, defaultSettings, inputMoney, money, newPart, parseMoney, roundRatio, summary, validateOperation, type Operation, type Settings } from '../shared/model.ts';
import { previewCsv, safeCell } from '../server/csv.ts';
const settings:Settings={...defaultSettings,regime:'receipts',regimeConfirmed:true};
function operation(cents:number,nature:'revenue'|'expense'='revenue',status:Operation['status']='confirmed'):Operation {
  return {id:1,importId:randomUUID(),sourceLine:2,account:'A',date:'2026-01-03',label:'Fictif',cents,raw:[],status,revision:0,
    parts:[{...newPart(cents,'2026-01-03'),nature,treatment:'taxable',periodConfirmed:true,deductionBps:10000}]};
}
test('Montants français exacts, négatifs et refus des flottants ambigus',()=>{
  assert.equal(parseMoney('1 234,56 €'),123456);
  assert.equal(parseMoney('(12,01)'),-1201);
  assert.equal(parseMoney('−0,01'),-1);
  for(const value of ['1e3','1.234,56','12,345','','NaN']) assert.throws(()=>parseMoney(value));
  assert.equal(inputMoney(-1),'-0,01');assert.equal(money(123456),'1\u202f234,56 €');
});
test('Arrondi à la moitié en s’éloignant de zéro, y compris les valeurs négatives',()=>{
  assert.equal(roundRatio(1n,2n),1);assert.equal(roundRatio(-1n,2n),-1);
  assert.equal(roundRatio(5n,2n),3);assert.equal(roundRatio(-5n,2n),-3);
  assert.equal(roundRatio(1n,3n),0);
});
test('TVA TTC aux quatre taux proposés et conservation HT + TVA',()=>{
  for(const rate of [2000,1000,550,210]) for(const cents of [1,11,12345,120000,-12345,-1]) {
    const p={...newPart(cents,'2026-01-01'),nature:'revenue' as const,treatment:'taxable' as const,rateBps:rate};
    const a=amounts(p);assert.equal(a.net+a.vat,cents);assert.equal(a.vat+amounts({...p,cents:-cents}).vat,0);
  }
  assert.equal(amounts(operation(120000).parts[0]).vat,20000);
});
test('Dépense et remboursement de dépense : signes fiscaux opposés au signe bancaire',()=>{
  const expense=operation(-12000,'expense').parts[0],refund=operation(6000,'expense').parts[0];
  assert.deepEqual([amounts(expense).vat,amounts(refund).vat],[2000,-1000]);
  assert.equal(amounts({...expense,deductionBps:3333}).deductible,667);
});
test('Une entrée bancaire reste non confirmée sans choix et sans régime vérifié',()=>{
  const o=operation(12000);o.parts[0].nature='review';
  assert.throws(()=>validateOperation(o,settings),/nature/);
  o.parts[0].nature='revenue';assert.throws(()=>validateOperation(o,defaultSettings),/régime/);
  o.parts[0].periodConfirmed=false;assert.throws(()=>validateOperation(o,settings),/date/);
});
test('La TVA déductible confirmée impose la saisie documentaire et trois confirmations',()=>{
  const o=operation(-12000,'expense');
  assert.throws(()=>validateOperation(o,settings),/dépense/);
  Object.assign(o.parts[0],{invoiceNetCents:10000,invoiceVatCents:2000,invoiceConfirmed:true,rightConfirmed:true});
  assert.doesNotThrow(()=>validateOperation(o,settings));
  o.parts[0].invoiceNetCents=9999;assert.throws(()=>validateOperation(o,settings),/HT \+ TVA/);
});
test('Ventilation exacte, exclusions et cas particuliers',()=>{
  const o=operation(-18000,'expense','pending');
  o.parts=[{...o.parts[0],cents:-12000},{...newPart(-6000,o.date,'second'),nature:'personal',treatment:'outside'}];
  assert.doesNotThrow(()=>validateOperation(o,settings));
  o.parts[1].cents=-5999;assert.throws(()=>validateOperation(o,settings),/ventilation/);
  const transfer=operation(12000);transfer.parts[0].nature='transfer';assert.throws(()=>validateOperation(transfer,settings),/nature/);
});
test('Synthèse : confirmé, estimé, exclu, régularisation et crédit antérieur séparés',()=>{
  const revenue=operation(120000),expense=operation(-12000,'expense'),refund=operation(6000,'expense');
  const estimate=operation(60000,'revenue','pending'),excluded=operation(12000,'revenue','excluded');
  const s=summary([revenue,expense,refund,estimate,excluded],{},{adjustmentsCents:500,priorCreditCents:1000,confirmed:true});
  assert.equal(s.collected,20000);assert.equal(s.deductible,1000);assert.equal(s.balance,18500);
  assert.equal(s.estimatedCollected,10000);assert.equal(s.pendingCount,1);assert.equal(s.excludedCents,12000);
  assert.deepEqual(s.byRate['2000'],{net:100000,vat:20000});
});
test('La date TVA de chaque ventilation et le compte gouvernent la synthèse',()=>{
  const o=operation(24000);o.parts=[{...o.parts[0],cents:12000},{...o.parts[0],id:'second',cents:12000,vatDate:'2026-02-01'}];
  const s=summary([o],{from:'2026-01-01',to:'2026-01-31',account:'A'},{adjustmentsCents:0,priorCreditCents:0,confirmed:false});
  assert.equal(s.collected,2000);
  assert.equal(summary([o],{account:'B'},{adjustmentsCents:0,priorCreditCents:0,confirmed:false}).collected,0);
});
test('CSV : accents, guillemets, cellules multilignes, erreurs et doublons',()=>{
  const text='Date;Libellé;Débit;Crédit\n02/01/2026;"Conseil; été\nsuite";;120,00\n02/01/2026;"Conseil; été\nsuite";;120,00\n31/02/2026;Invalide;10,00;\n03/01/2026;Ambigu;10,00;10,00\n';
  const p=previewCsv({filename:'test.csv',account:'A',base64:Buffer.from(text).toString('base64')},[]);
  assert.equal(p.rows.length,4);assert.equal(p.duplicateCount,1);assert.equal(p.errorCount,2);assert.equal(p.totalCents,24000);
  assert.equal(p.rows[0].label,'Conseil; été\nsuite');
});
test('CSV Windows-1252 et contrôle des colonnes et des signes',()=>{
  const bytes=Buffer.from('Date;Libell\xe9;Montant\n01/01/2026;Caf\xe9;-12,01','latin1');
  const p=previewCsv({filename:'test.csv',account:'A',base64:bytes.toString('base64')},[]);
  assert.equal(p.encoding,'Windows-1252');assert.equal(p.rows[0].label,'Café');assert.equal(p.rows[0].cents,-1201);
  assert.throws(()=>previewCsv({filename:'test.csv',account:'A',base64:Buffer.from('Date;Date\nx;y').toString('base64')},[]),/en-têtes/);
});
test('Exports CSV : protection des formules, y compris après une espace',()=>{
  for(const s of ['=CMD()','+SUM(1)','-CMD()','@SUM(1)','  =1','\tX'])assert.equal(safeCell(s),"'"+s);
  assert.equal(safeCell('Honoraires'),'Honoraires');
});
