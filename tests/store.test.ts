import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store, Conflict } from '../server/store.ts';
import { defaultSettings } from '../shared/model.ts';
function setup(t:{after:(fn:()=>void)=>void}) {
  const dir=mkdtempSync(join(tmpdir(),'tva-store-'));const store=new Store(dir,'real');
  t.after(()=>{if(store.db.isOpen)store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,store};
}
const csv={filename:'fictif.csv',account:'A',base64:Buffer.from('Date;Libellé;Montant\n01/01/2026;Honoraires;1200,00\n02/01/2026;Fournitures;-120,00').toString('base64')};
function load(store:Store) {const p=store.preview(csv);return store.import({...csv,selectedLines:p.rows.map(r=>r.line),acceptRejected:false,confirmDuplicates:false});}
function change(store:Store,id=1) {
  const o=store.list().find(o=>o.id===id)!;
  return {...o,status:'pending' as const,parts:o.parts.map(p=>({...p,nature:'revenue' as const,treatment:'taxable' as const}))};
}
test('Persistance réelle après redémarrage dans un nouveau processus',t=>{
  const {dir,store}=setup(t);load(store);store.update([change(store)] .map(({id,revision,parts,status})=>({id,revision,parts,status})));
  store.close();
  const script="import {Store} from './server/store.ts'; const s=new Store(process.argv[1],'real'); console.log(JSON.stringify(s.list()));s.close();";
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,dir],{encoding:'utf8',cwd:process.cwd()}));
  assert.equal(result.length,2);assert.equal(result[0].parts[0].nature,'revenue');assert.equal(result[0].revision,1);
});
test('Import identique refusé, doublons potentiels soumis à décision et comptes séparés',t=>{
  const {store}=setup(t);load(store);assert.equal(store.preview(csv).alreadyImported,true);
  assert.throws(()=>load(store),/déjà/);
  const duplicate={...csv,base64:Buffer.from('Date;Libellé;Montant\n01/01/2026;Honoraires;1200,00').toString('base64')};
  const p=store.preview(duplicate);assert.equal(p.duplicateCount,1);
  assert.throws(()=>store.import({...duplicate,selectedLines:[2],acceptRejected:false,confirmDuplicates:false}),/doublons/);
  store.import({...duplicate,selectedLines:[2],acceptRejected:false,confirmDuplicates:true});
  store.import({...csv,account:'Autre compte',selectedLines:[2,3],acceptRejected:false,confirmDuplicates:false});
  assert.equal(store.list().length,5);
});
test('Import incomplet : refus par défaut puis exclusion explicite des erreurs',t=>{
  const {store}=setup(t);
  const bad={...csv,base64:Buffer.from('Date;Libellé;Montant\n01/01/2026;Valide;10,00\n31/02/2026;Date invalide;20,00').toString('base64')};
  assert.throws(()=>store.import({...bad,selectedLines:[2],acceptRejected:false,confirmDuplicates:false}),/invalides/);
  assert.equal(store.list().length,0);
  assert.deepEqual(store.import({...bad,selectedLines:[2],acceptRejected:true,confirmDuplicates:false}),{count:1,skipped:1});
  assert.deepEqual(store.imports()[0].skippedLines,[3]);
});
test('Édition groupée atomique, ventilation refusée, conflit de version',t=>{
  const {store}=setup(t);load(store);
  const a=change(store),b=change(store,2);
  const edits=[a,b].map(({id,revision,parts,status})=>({id,revision,parts,status}));
  edits[1].parts[0].cents=1;
  assert.throws(()=>store.update(edits),/ventilation/);assert.equal(store.list()[0].revision,0);assert.equal(store.history().length,0);
  const edit={id:a.id,revision:a.revision,parts:a.parts,status:a.status};store.update([edit]);
  assert.throws(()=>store.update([edit]),Conflict);
});
test('Annuler plusieurs qualifications conserve les révisions et trace les annulations',t=>{
  const {store}=setup(t);load(store);
  for(const nature of ['revenue','expense'] as const) {
    const o=store.list()[0];store.update([{id:o.id,revision:o.revision,status:'pending',parts:o.parts.map(p=>({...p,nature,treatment:'taxable'}))}]);
  }
  store.undo();assert.equal(store.list()[0].parts[0].nature,'revenue');
  store.undo();assert.equal(store.list()[0].parts[0].nature,'review');assert.equal(store.list()[0].revision,4);
  assert.equal(store.history().filter(h=>h.kind==='undo').length,2);
});
test('Périodes verrouillées : édition, import, annulation et ajustements refusés',t=>{
  const {store}=setup(t);load(store);
  const a=change(store);store.update([{id:a.id,revision:a.revision,status:a.status,parts:a.parts}]);
  store.lock('2026-01',true);assert.throws(()=>store.undo(),/verrouillée/);
  const o=store.list()[0];assert.throws(()=>store.update([{id:o.id,revision:o.revision,status:'excluded',parts:o.parts}]),/verrouillée/);
  assert.throws(()=>store.import({...csv,account:'B',selectedLines:[2],acceptRejected:false,confirmDuplicates:false}),/verrouillée/);
  assert.throws(()=>store.setSettlement(JSON.stringify(['2026-01-01','2026-01-31','']),{adjustmentsCents:0,priorCreditCents:0,confirmed:true}),/verrouillés/);
  store.lock('2026-01',false);store.undo();assert.equal(store.list()[0].parts[0].nature,'review');
});
test('Sauvegarde complète, restauration et conservation de l’état précédent',t=>{
  const {dir,store}=setup(t);load(store);store.setSettings({...defaultSettings,regime:'receipts',regimeConfirmed:true});
  const a=change(store);store.update([{id:a.id,revision:a.revision,status:'confirmed',parts:a.parts.map(p=>({...p,periodConfirmed:true}))}]);
  const backup=store.backup();store.undo();store.restore(backup);
  assert.equal(store.list()[0].status,'confirmed');assert.equal(store.imports().length,1);assert.equal(store.history().length,1);
  assert.equal(readdirSync(join(dir,'backups')).length,1);
  assert.equal(store.backup().payload.imports[0].base64,csv.base64);
});
test('Sauvegarde altérée ou invalide : aucun remplacement et aucune perte',t=>{
  const {store}=setup(t);load(store);const original=store.backup();
  const bad=structuredClone(original);bad.payload.operations[0].cents=1;
  assert.throws(()=>store.restore(bad),/intégrité/);
  bad.checksum=createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex');
  assert.throws(()=>store.restore(bad),/ventilation/);assert.equal(store.list()[0].cents,120000);
  const demo=new Store(store.directory,'demo');t.after(()=>demo.close());
  assert.throws(()=>demo.restore(original),/même espace/);assert.equal(demo.list().length,0);
});
test('Échec en cours de restauration : rollback de la base complète',t=>{
  const {store}=setup(t);load(store);const backup=store.backup(),oldPut=store.put;
  store.put=()=>{throw new Error('Erreur disque simulée');};
  assert.throws(()=>store.restore(backup),/disque/);
  store.put=oldPut;assert.equal(store.list().length,2);assert.equal(store.imports().length,1);
});
test('Isolation démonstration/réel et migrations réexécutables',t=>{
  const {dir,store}=setup(t);load(store);const demo=new Store(dir,'demo');assert.equal(demo.list().length,0);demo.close();
  const reopened=new Store(dir,'real');assert.equal(reopened.list().length,2);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM migrations').get()?.n,2);reopened.close();
});
test('Rapprochement des soldes obligatoire si présent dans le relevé, import atomiquement refusé en cas d’écart',t=>{
  const {store}=setup(t);
  const source={...csv,base64:Buffer.from('Date;Libellé;Montant;Solde\n01/01/2026;Fictif;120,00;220,00').toString('base64')};
  const input={...source,selectedLines:[2],acceptRejected:false,confirmDuplicates:false};
  assert.throws(()=>store.import(input),/soldes/);
  assert.throws(()=>store.import({...input,openingBalanceCents:10000,closingBalanceCents:22001}),/soldes/);
  assert.equal(store.list().length,0);
  store.import({...input,openingBalanceCents:10000,closingBalanceCents:22000});
  assert.equal(store.imports()[0].closingBalanceCents,22000);
});
test('Corrections d’aperçu : nouvelle valeur retenue et fichier source intégral préservé',t=>{
  const {store}=setup(t);
  const source={...csv,base64:Buffer.from('Date;Libellé;Montant\n31/02/2026;À corriger;invalide').toString('base64')};
  const edits=[{line:2,date:'2026-02-28',label:'Corrigé explicitement',amount:'120,01'}];
  store.import({...source,edits,selectedLines:[2],acceptRejected:false,confirmDuplicates:false});
  assert.equal(store.list()[0].cents,12001);assert.equal(store.list()[0].raw[2],'invalide');
  assert.equal(store.imports()[0].base64,source.base64);
});
test('Restauration : les formulaires antérieurs deviennent périmés et l’historique reste restaurable après changement de régime',t=>{
  const {store}=setup(t);load(store);
  store.setSettings({...defaultSettings,regime:'receipts',regimeConfirmed:true});
  let o=store.list()[0];store.update([{id:o.id,revision:o.revision,status:'confirmed',parts:o.parts.map(p=>({...p,nature:'revenue',treatment:'taxable',periodConfirmed:true}))}]);
  o=store.list()[0];store.update([{id:o.id,revision:o.revision,status:'pending',parts:o.parts}]);
  store.setSettings({...defaultSettings});
  const backup=store.backup(),stale=store.list()[0];
  store.restore(backup);
  assert.throws(()=>store.update([{id:stale.id,revision:stale.revision,status:'excluded',parts:stale.parts}]),Conflict);
  assert.equal(store.list()[0].status,'pending');
});
