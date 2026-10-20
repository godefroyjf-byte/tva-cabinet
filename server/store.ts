import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { MAX_CENTS, centsSchema, dateSchema, operationSchema, settingsSchema, settlementSchema, defaultSettings, newPart, validateOperation, type Operation, type Settings, type Settlement } from '../shared/model.ts';
import { previewCsv, csvRequestSchema, type CsvRequest } from './csv.ts';

const importSchema = z.object({
  id:z.string().uuid(),account:z.string().min(1).max(100),filename:z.string().max(255),
  base64:z.string().max(7_000_000),hash:z.string().regex(/^[a-f0-9]{64}$/),at:z.string().datetime(),
  encoding:z.string().max(50),delimiter:z.string().max(1),mapping:z.record(z.string(),z.string()),
  skippedLines:z.array(z.number().int().positive()).max(10000),
  openingBalanceCents:centsSchema.nullable(),closingBalanceCents:centsSchema.nullable()
}).strict();
const historySchema = z.object({
  id:z.string().uuid(),at:z.string().datetime(),label:z.string().max(200),kind:z.enum(['edit','undo']),undone:z.boolean(),
  before:z.array(operationSchema).max(1000),after:z.array(operationSchema).max(1000)
}).strict();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const backupPayloadSchema = z.object({
  format:z.literal(1),mode:z.enum(['real','demo']),createdAt:z.string().datetime(),settings:settingsSchema,
  operations:z.array(operationSchema).max(10000),imports:z.array(importSchema).max(1000),history:z.array(historySchema).max(20000),
  locks:z.array(monthSchema).max(1200),settlements:z.record(z.string().max(300),settlementSchema)
}).strict();
export const backupSchema = z.object({checksum:z.string().regex(/^[a-f0-9]{64}$/),payload:backupPayloadSchema}).strict();
type History = z.infer<typeof historySchema>;
export type Backup = z.infer<typeof backupSchema>;
export class Conflict extends Error {}
export class Store {
  db: DatabaseSync;
  mode: 'real'|'demo';
  directory: string;
  constructor(directory: string, mode: 'real'|'demo') {
    this.directory = directory; this.mode = mode;
    mkdirSync(directory,{recursive:true,mode:0o700});
    this.db = new DatabaseSync(join(directory,mode+'.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);');
    const migrated = this.db.prepare('SELECT version FROM migrations WHERE version=1').get();
    if (!migrated) this.transaction(()=>{
      this.db.exec('CREATE TABLE operations (id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE imports (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE history (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE metadata (key TEXT PRIMARY KEY, payload TEXT NOT NULL);');
      this.db.prepare('INSERT INTO migrations(version) VALUES (1)').run();
    });
  }
  close() { this.db.close(); }
  transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); this.db.exec('COMMIT'); return result; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  metadata<T>(key:string, fallback:T):T {
    const row=this.db.prepare('SELECT payload FROM metadata WHERE key=?').get(key);
    return row ? JSON.parse(row.payload as string) as T : fallback;
  }
  setMetadata(key:string, value:unknown) {
    this.db.prepare('INSERT INTO metadata(key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(key,JSON.stringify(value));
  }
  list():Operation[] { return this.db.prepare('SELECT payload FROM operations ORDER BY id').all().map(row=>JSON.parse(row.payload as string)); }
  imports() { return this.db.prepare('SELECT payload FROM imports ORDER BY rowid').all().map(row=>importSchema.parse(JSON.parse(row.payload as string))); }
  history():History[] { return this.db.prepare('SELECT payload FROM history ORDER BY rowid').all().map(row=>historySchema.parse(JSON.parse(row.payload as string))); }
  settings():Settings { return this.metadata('settings',defaultSettings); }
  locks():string[] { return this.metadata('locks',[]); }
  settlements():Record<string,Settlement> { return this.metadata('settlements',{}); }
  state() { return {operations:this.list(),settings:this.settings(),locks:this.locks(),settlements:this.settlements(),mode:this.mode,history:this.history().map(({before,after,...h})=>({...h,count:after.length})).reverse()}; }
  assertUnlocked(operations:Operation[]) {
    const locks=new Set(this.locks());
    if (operations.some(o=>o.parts.some(p=>locks.has(p.vatDate.slice(0,7))))) throw new Error('Cette période est verrouillée. Rouvrez-la explicitement avant de modifier ses données.');
  }
  setSettings(input:unknown) {
    const settings=settingsSchema.parse(input);
    if (this.list().some(o=>o.status==='confirmed') && (this.settings().regime!==settings.regime || !settings.regimeConfirmed)) throw new Error('Repassez les opérations confirmées en « à vérifier » avant de changer le régime.');
    this.setMetadata('settings',settings);
  }
  put(operation:Operation) { this.db.prepare('INSERT INTO operations(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(operation.id,JSON.stringify(operation)); }
  log(history:History) { this.db.prepare('INSERT INTO history(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(history.id,JSON.stringify(history)); }
  update(input:unknown) {
    const changes=z.array(z.object({id:z.number().int().positive(),revision:z.number().int().nonnegative(),parts:operationSchema.shape.parts,status:operationSchema.shape.status}).strict()).min(1).max(1000).parse(input);
    if (new Set(changes.map(c=>c.id)).size!==changes.length) throw new Error('Une opération ne peut être modifiée deux fois dans une même action.');
    return this.transaction(()=>{
      const all=new Map(this.list().map(o=>[o.id,o]));
      const before:Operation[]=[], after:Operation[]=[];
      for (const change of changes) {
        const old=all.get(change.id);
        if (!old || old.revision!==change.revision) throw new Conflict('Les données ont changé dans une autre fenêtre. Rechargez les opérations avant de réessayer.');
        const updated=operationSchema.parse({...old,parts:change.parts,status:change.status,revision:old.revision+1});
        this.assertUnlocked([old,updated]);
        validateOperation(updated,this.settings());
        before.push(old); after.push(updated);
      }
      after.forEach(o=>this.put(o));
      this.log({id:randomUUID(),at:new Date().toISOString(),label:after.length===1 ? 'Qualification d’une opération' : 'Qualification de '+after.length+' opérations',kind:'edit',undone:false,before,after});
      this.assertStorageSize();
      return after;
    });
  }
  undo() {
    return this.transaction(()=>{
      const history=this.history().reverse().find(h=>h.kind==='edit'&&!h.undone);
      if (!history) throw new Error('Aucune qualification à annuler.');
      const current=new Map(this.list().map(o=>[o.id,o]));
      const before:Operation[]=[],after:Operation[]=[];
      const logical=(o:Operation)=>JSON.stringify({...o,revision:0});
      for(let i=0;i<history.after.length;i++) {
        const actual=current.get(history.after[i].id);
        if(!actual || logical(actual)!==logical(history.after[i])) throw new Conflict('Une modification plus récente empêche cette annulation.');
        const restored={...history.before[i],revision:actual.revision+1};
        this.assertUnlocked([actual,restored]);
        validateOperation(restored,this.settings());
        before.push(actual);after.push(restored);
      }
      after.forEach(o=>this.put(o));
      this.log({...history,undone:true});
      this.log({id:randomUUID(),at:new Date().toISOString(),label:'Annulation : '+history.label,kind:'undo',undone:false,before,after});
      this.assertStorageSize();
    });
  }
  preview(input:CsvRequest) {
    const preview=previewCsv(input,this.list());
    return {...preview,alreadyImported:this.imports().some(i=>i.hash===preview.hash&&i.account===input.account)};
  }
  import(input:unknown) {
    const schema=csvRequestSchema.extend({selectedLines:z.array(z.number().int().positive()).min(1).max(10000),acceptRejected:z.boolean(),confirmDuplicates:z.boolean()}).strict();
    const request=schema.parse(input);
    const {selectedLines,acceptRejected,confirmDuplicates,...csv}=request;
    return this.transaction(()=>{
      const preview=this.preview(csv);
      if (preview.alreadyImported) throw new Error('Ce fichier a déjà été importé pour ce compte.');
      if((csv.openingBalanceCents===null)!==(csv.closingBalanceCents===null)) throw new Error('Saisissez les deux soldes ou laissez les deux vides.');
      if(preview.balanceColumns.length&&preview.balanceDifference===null) throw new Error('Une colonne de solde est présente. Saisissez les soldes de début et de fin pour vérifier la cohérence du relevé.');
      if(preview.balanceDifference!==null&&(preview.balanceDifference!==0||preview.errorCount)) throw new Error('Les soldes ne se recoupent pas avec toutes les lignes du relevé. Corrigez le fichier ou son aperçu avant l’import.');
      if (preview.errorCount&&!acceptRejected) throw new Error('Des lignes sont invalides. Corrigez-les ou confirmez explicitement leur exclusion.');
      const chosen=new Set(selectedLines);
      if(chosen.size!==selectedLines.length) throw new Error('Sélection de lignes dupliquée.');
      const rows=preview.rows.filter(r=>chosen.has(r.line));
      if(rows.length!==chosen.size||rows.some(r=>r.error)) throw new Error('La sélection contient une ligne absente ou invalide.');
      if(rows.some(r=>r.duplicate)&&!confirmDuplicates) throw new Error('Confirmez le maintien des doublons potentiels sélectionnés.');
      const id=randomUUID();
      let next=Math.max(0,...this.list().map(o=>o.id))+1;
      const operations=rows.map(row=>operationSchema.parse({id:next++,importId:id,sourceLine:row.line,account:csv.account,date:row.date,label:row.label,cents:row.cents,raw:row.raw,status:'pending',revision:0,parts:[newPart(row.cents,row.date)]}));
      if(this.list().length+operations.length>10000) throw new Error('Cette version est limitée à 10 000 opérations par espace.');
      this.assertUnlocked(operations);
      const record=importSchema.parse({id,account:csv.account,filename:csv.filename,base64:csv.base64,hash:preview.hash,at:new Date().toISOString(),encoding:preview.encoding,delimiter:preview.delimiter,mapping:preview.mapping,skippedLines:preview.rows.filter(r=>!chosen.has(r.line)).map(r=>r.line),openingBalanceCents:csv.openingBalanceCents,closingBalanceCents:csv.closingBalanceCents});
      this.db.prepare('INSERT INTO imports(id,payload) VALUES (?,?)').run(id,JSON.stringify(record));
      operations.forEach(o=>this.put(o));
      this.assertStorageSize();
      return {count:operations.length,skipped:record.skippedLines.length};
    });
  }
  lock(month:string, locked:boolean) {
    monthSchema.parse(month);
    this.setMetadata('locks',locked ? [...new Set([...this.locks(),month])] : this.locks().filter(m=>m!==month));
  }
  setSettlement(key:string,input:unknown) {
    const [from,to]=z.tuple([dateSchema,dateSchema,z.string().max(100)]).parse(JSON.parse(key));
    if(from>to) throw new Error('Période invalide.');
    const value=settlementSchema.parse(input);
    if (this.locks().length) {
      if(this.locks().some(m=>m+'-01'<=(to||'9999-12-31')&&m+'-31'>=(from||'0000-01-01'))) throw new Error('Les ajustements de cette période sont verrouillés.');
    }
    this.setMetadata('settlements',{...this.settlements(),[key]:value});
  }
  backup():Backup {
    const payload={format:1 as const,mode:this.mode,createdAt:new Date().toISOString(),settings:this.settings(),operations:this.list(),imports:this.imports(),history:this.history(),locks:this.locks(),settlements:this.settlements()};
    return {payload,checksum:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
  }
  assertStorageSize() {
    this.assertAggregate(this.list());
    if(this.history().length>20000||Buffer.byteLength(JSON.stringify(this.backup()))>40_000_000) throw new Error('Limite locale atteinte (40 Mo de sauvegarde ou 20 000 actions). L’action a été annulée sans perte de données.');
  }
  assertAggregate(operations:Operation[]) {
    const absolute=operations.flatMap(o=>o.parts).reduce((sum,p)=>sum+BigInt(Math.abs(p.cents)),0n);
    if(absolute>BigInt(Number.MAX_SAFE_INTEGER)-2n*BigInt(MAX_CENTS)) throw new Error('Le total dépasse la plage monétaire exacte autorisée.');
  }
  restore(input:unknown) {
    // Vérifier l'intégrité de l'objet brut avant de normaliser ses champs.
    const envelope=z.object({checksum:z.string(),payload:z.unknown()}).strict().parse(input);
    const checksum=createHash('sha256').update(JSON.stringify(envelope.payload)).digest('hex');
    if(checksum!==envelope.checksum) throw new Error('La sauvegarde est altérée : contrôle d’intégrité incorrect.');
    const backup=backupSchema.parse(input);
    const p=backup.payload;
    if(p.mode!==this.mode) throw new Error('Restaurez cette sauvegarde dans le même espace (démonstration ou réel).');
    if(new Set(p.operations.map(o=>o.id)).size!==p.operations.length||new Set(p.imports.map(i=>i.id)).size!==p.imports.length||new Set(p.history.map(h=>h.id)).size!==p.history.length) throw new Error('Identifiants dupliqués dans la sauvegarde.');
    const imports=new Map(p.imports.map(i=>[i.id,i]));
    for(const i of p.imports) if(createHash('sha256').update(Buffer.from(i.base64,'base64')).digest('hex')!==i.hash) throw new Error('Un fichier source est altéré.');
    for(const o of p.operations) {
      validateOperation(o,p.settings);
      if(imports.get(o.importId)?.account!==o.account) throw new Error('Référence de fichier source incohérente.');
    }
    for(const h of p.history) {
      if(h.before.length!==h.after.length||new Set(h.after.map(o=>o.id)).size!==h.after.length) throw new Error('Historique incohérent.');
      for(const o of [...h.before,...h.after]) {
        validateOperation(o,{...p.settings,regime:'receipts',regimeConfirmed:true});
        if(imports.get(o.importId)?.account!==o.account) throw new Error('Provenance de l’historique incohérente.');
      }
    }
    for(const key of Object.keys(p.settlements)) {
      const [from,to]=z.tuple([dateSchema,dateSchema,z.string().max(100)]).parse(JSON.parse(key));
      if(from>to) throw new Error('Période d’ajustement incohérente.');
    }
    if(Buffer.byteLength(JSON.stringify(input))>40_000_000) throw new Error('Cette sauvegarde dépasse la limite locale de 40 Mo.');
    this.assertAggregate(p.operations);
    const dir=join(this.directory,'backups');mkdirSync(dir,{recursive:true,mode:0o700});
    const previous=join(dir,this.mode+'-'+Date.now()+'-'+randomUUID()+'.json');
    writeFileSync(previous,JSON.stringify(this.backup()),{encoding:'utf8',mode:0o600,flag:'wx'});
    const restoredRevision=Math.max(0,...this.list().map(o=>o.revision),...p.operations.map(o=>o.revision))+1;
    if(!Number.isSafeInteger(restoredRevision)) throw new Error('Compteur de version trop élevé.');
    this.transaction(()=>{
      this.db.exec('DELETE FROM operations; DELETE FROM imports; DELETE FROM history; DELETE FROM metadata;');
      for(const i of p.imports) this.db.prepare('INSERT INTO imports(id,payload) VALUES (?,?)').run(i.id,JSON.stringify(i));
      p.operations.forEach(o=>this.put({...o,revision:restoredRevision}));p.history.forEach(h=>this.log(h));
      this.setMetadata('settings',p.settings);this.setMetadata('locks',p.locks);this.setMetadata('settlements',p.settlements);
    });
    return {previousSaved:true};
  }
}
