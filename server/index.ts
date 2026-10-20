import express from 'express';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { Store, Conflict } from './store.ts';
import { csvRequestSchema, csvLine } from './csv.ts';
import { amounts, dateSchema, filterOperations, matchesPart, natureLabels, statusLabels, treatmentLabels, summary, type Filters } from '../shared/model.ts';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export function createApp(dataDirectory:string,port:number,production=true) {
  const app=express();
  app.disable('x-powered-by');
  const stores={real:new Store(dataDirectory,'real'),demo:new Store(dataDirectory,'demo')};
  app.use((req,res,next)=>{
    const localPort=port===0?req.socket.localPort:port;
    const allowed=new Set(['127.0.0.1:'+localPort,'localhost:'+localPort]);
    if(!allowed.has(req.headers.host??'')) {res.status(403).json({error:'Hôte non autorisé.'});return;}
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    if(production) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(req.path.startsWith('/api')) {
      res.setHeader('Cache-Control','no-store');
      const origin=req.headers.origin;
      if(origin && ![...allowed].some(h=>origin==='http://'+h)) {res.status(403).json({error:'Origine non autorisée.'});return;}
      if(!['GET','HEAD'].includes(req.method) && (!origin||req.headers['x-tva-client']!=='1')) {res.status(403).json({error:'La modification doit provenir de l’application locale.'});return;}
    }
    next();
  });
  app.use(express.json({limit:'50mb'}));
  const storeFor=(req:express.Request)=> {
    const mode=req.headers['x-tva-mode']??req.query.mode??'real';
    if(mode!=='real'&&mode!=='demo') throw new Error('Espace invalide.');
    return stores[mode];
  };
  const filtersFor=(req:express.Request):Filters=>{
    const f=z.object({from:dateSchema.optional(),to:dateSchema.optional(),account:z.string().max(100).optional(),q:z.string().max(1000).optional(),status:z.enum(['pending','confirmed','excluded']).optional()}).parse(req.query);
    if(f.from&&f.to&&f.from>f.to) throw new Error('La date de début doit précéder la date de fin.');
    return f;
  };
  app.get('/api/state',(req,res)=>res.json(storeFor(req).state()));
  app.post('/api/preview',(req,res)=>res.json(storeFor(req).preview(csvRequestSchema.parse(req.body))));
  app.post('/api/import',(req,res)=>res.json(storeFor(req).import(req.body)));
  app.post('/api/operations',(req,res)=>res.json(storeFor(req).update(req.body)));
  app.post('/api/undo',(req,res)=>{storeFor(req).undo();res.json({ok:true});});
  app.post('/api/settings',(req,res)=>{storeFor(req).setSettings(req.body);res.json({ok:true});});
  app.post('/api/lock',(req,res)=>{
    const body=z.object({month:z.string(),locked:z.boolean()}).strict().parse(req.body);
    storeFor(req).lock(body.month,body.locked);res.json({ok:true});
  });
  app.post('/api/settlement',(req,res)=>{
    const body=z.object({key:z.string(),value:z.unknown()}).strict().parse(req.body);
    storeFor(req).setSettlement(body.key,body.value);res.json({ok:true});
  });
  app.get('/api/backup',(req,res)=>{
    const store=storeFor(req);
    res.attachment('tva-cabinet-'+store.mode+'-'+new Date().toISOString().slice(0,10)+'.json').json(store.backup());
  });
  app.post('/api/restore',(req,res)=>{
    const body=z.object({confirmation:z.literal('RESTAURER'),backup:z.unknown()}).strict().parse(req.body);
    res.json(storeFor(req).restore(body.backup));
  });
  app.get('/api/source/:id',(req,res)=>{
    const record=storeFor(req).imports().find(i=>i.id===req.params.id);
    if(!record) {res.status(404).json({error:'Fichier introuvable.'});return;}
    res.type('text/csv').attachment('source-'+record.id+'.csv').send(Buffer.from(record.base64,'base64'));
  });
  app.get('/api/export',(req,res)=>{
    const store=storeFor(req);
    const filters=filtersFor(req);
    const settlementKey=JSON.stringify([filters.from??'',filters.to??'',filters.account??'']);
    const settlement=(!filters.q&&!filters.status?store.settlements()[settlementKey]:undefined)??{adjustmentsCents:0,priorCreditCents:0,confirmed:false};
    const selected=filterOperations(store.list(),filters);
    const lines=[csvLine(['Date bancaire','Compte','Libellé','TTC bancaire centimes','Nature','Traitement','Taux centièmes de %','HT centimes','TVA centimes','TVA déductible centimes','État','Date TVA','Date facture','Justificatif / référence','Provenance','Note','Import','Ligne source','Opération','Ventilation','Coefficient centièmes de %','Facture confirmée','Droit confirmé','Date TVA confirmée'])];
    for(const o of selected) for(const p of o.parts.filter(p=>matchesPart(p,filters))) {
      const a=amounts(p);
      lines.push(csvLine([o.date,o.account,o.label,String(p.cents),natureLabels[p.nature],treatmentLabels[p.treatment],String(p.rateBps),String(a.net),String(a.vat),String(a.deductible),statusLabels[o.status],p.vatDate,p.invoiceDate,p.documentRef,a.source,p.note,o.importId,String(o.sourceLine),String(o.id),p.id,p.deductionBps===null?'À vérifier':String(p.deductionBps),p.invoiceConfirmed?'Oui':'Non',p.rightConfirmed?'Oui':'Non',p.periodConfirmed?'Oui':'Non']));
    }
    const s=summary(store.list(),filters,settlement);
    lines.push('',csvLine(['SYNTHÈSE','Montant en centimes']),csvLine(['TVA collectée confirmée',String(s.collected)]),csvLine(['TVA déductible confirmée',String(s.deductible)]),csvLine(['Régularisations confirmées',String(settlement.confirmed?settlement.adjustmentsCents:0)]),csvLine(['Crédit antérieur confirmé',String(settlement.confirmed?settlement.priorCreditCents:0)]),csvLine(['Solde de préparation',String(s.balance)]),csvLine(['Estimation collectée',String(s.estimatedCollected)]),csvLine(['Estimation déductible',String(s.estimatedDeductible)]),csvLine(['Opérations à vérifier',String(s.pendingCount)]),csvLine(['Montant absolu à vérifier',String(s.unresolvedCents)]));
    for(const [rate,a] of Object.entries(s.byRate)) lines.push(csvLine(['Base confirmée au taux '+rate+' centièmes de %',String(a.net)]));
    res.attachment('tva-cabinet-export.csv').type('text/csv; charset=utf-8').send('\uFEFF'+lines.join('\r\n'));
  });
  app.post('/api/demo',(req,res)=>{
    const store=storeFor(req);
    if(store.mode!=='demo') throw new Error('Ces données ne peuvent être ajoutées que dans la démonstration.');
    if(!store.list().length) {
      const base64=readFileSync(join(root,'examples/releve-fictif.csv')).toString('base64');
      const csv={filename:'releve-fictif.csv',base64,account:'Compte de démonstration'};
      const p=store.preview(csv);
      store.import({...csv,selectedLines:p.rows.filter(r=>!r.error).map(r=>r.line),acceptRejected:false,confirmDuplicates:true});
    }
    res.json(store.state());
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Fonction indisponible.'}));
  if(production) {
    app.use(express.static(join(root,'dist')));
    app.get('/',(_req,res)=>{
      if(!existsSync(join(root,'dist/index.html'))) {res.status(503).send('Exécutez npm run build puis relancez.');return;}
      res.sendFile(join(root,'dist/index.html'));
    });
  }
  // Ne jamais journaliser un corps de requête, un fichier ou un libellé bancaire.
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const e=error as Error & {type?:string};
    const status=e instanceof Conflict?409:e.type==='entity.too.large'?413:400;
    res.status(status).json({error:e instanceof z.ZodError?'Entrée invalide : '+e.issues.map(i=>i.path.join('.')+' — '+i.message).join(' ; '):e.type==='entity.too.large'?'Fichier trop volumineux.':e.message||'Erreur locale.'});
  });
  return {app,stores};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT??3210);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT doit être un entier entre 1024 et 65535.');
  const production=process.argv.includes('--production');
  const {app,stores}=createApp(resolve(process.env.TVA_DATA_DIR??join(root,'data')),port,production);
  if(!production) {
    const {createServer}=await import('vite');
    const vite=await createServer({root,server:{middlewareMode:true,hmr:false},appType:'spa'});
    app.use(vite.middlewares);
  }
  const server=app.listen(port,'127.0.0.1',()=>console.log('TVA Cabinet — http://127.0.0.1:'+port+' — données locales uniquement'));
  server.on('error',(e:NodeJS.ErrnoException)=>{
    console.error(e.code==='EADDRINUSE'?'Le port est déjà utilisé. Fermez l’autre instance ou choisissez un autre PORT.':'Le serveur local n’a pas pu démarrer.');
    Object.values(stores).forEach(s=>s.close());process.exitCode=1;
  });
  const stop=()=>server.close(()=>{Object.values(stores).forEach(s=>s.close());process.exit(0);});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
