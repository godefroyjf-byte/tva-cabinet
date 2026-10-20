import React, { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { amounts, defaultSettings, filterOperations, inputMoney, money, natureLabels, newPart, parseMoney, statusLabels, sumCents, summary, treatmentLabels, type Filters, type Operation, type Part, type Settings, type Settlement } from '../shared/model.ts';
import type { Preview, CsvRequest } from '../server/csv.ts';
import {Modal,MoneyInput,request,errorText,type Mode} from './ui.tsx';
import {PdfImportDialog} from './PdfBatchImport.tsx';
import {quarterRange} from '../shared/periods.ts';
import './style.css';
import './brand.css';

type State={version?:string;operations:Operation[];settings:Settings;locks:string[];settlements:Record<string,Settlement>;mode:Mode;history:{id:string;at:string;label:string;kind:string;undone:boolean;count:number}[]};
type FullPreview=Preview & {alreadyImported:boolean};
const emptySettlement:Settlement={adjustmentsCents:0,priorCreditCents:0,confirmed:false};
function App() {
  const [mode,setMode]=useState<Mode>(localStorage.getItem('tva-mode')==='demo'?'demo':'real');
  const [loadedData,setData]=useState<State|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const data=loadedData?.mode===mode?loadedData:null;
  const [busy,setBusy]=useState(false),[modal,setModal]=useState<'import'|'pdf'|'backup'|'settings'|null>(null),[editing,setEditing]=useState<Operation|null>(null);
  const [filters,setFilters]=useState<Filters>({}),[selected,setSelected]=useState<number[]>([]);
  const [period,setPeriod]=useState('all'),[periodYear,setPeriodYear]=useState(String(new Date().getFullYear())),[periodQuarter,setPeriodQuarter]=useState(Math.floor(new Date().getMonth()/3)+1);
  const [sort,setSort]=useState<'date'|'label'|'cents'>('date'),[direction,setDirection]=useState(1),[page,setPage]=useState(0);
  async function reload() {setData(await request<State>('/state',mode));}
  useEffect(()=>{
    let active=true;setData(null);setSelected([]);setFilters({});setPeriod('all');setPage(0);setError('');setMessage('');localStorage.setItem('tva-mode',mode);
    request<State>('/state',mode).then(s=>{if(active)setData(s);}).catch(e=>{if(active)setError(errorText(e));});
    return ()=>{active=false;};
  },[mode]);
  useEffect(()=>{setPage(0);setSelected([]);},[filters]);
  async function perform(fn:()=>Promise<void>) {
    setBusy(true);setError('');setMessage('');
    try{await fn();}catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  async function demo() {await perform(async()=>{await request('/demo','demo',{});if(mode==='demo')await reload();else setMode('demo');});}
  async function quick(kind:'revenue'|'expense'|'transfer'|'exclude') {
    await perform(async()=>{
      const chosen=data!.operations.filter(o=>selected.includes(o.id));
      if(!chosen.length)throw new Error('Sélectionnez une ou plusieurs opérations.');
      if(kind!=='exclude'&&chosen.some(o=>o.parts.length!==1))throw new Error('Pour une opération ventilée, ouvrez son détail afin de préserver sa ventilation.');
      await request('/operations',mode,chosen.map(o=>({id:o.id,revision:o.revision,status:kind==='exclude'?'excluded':'pending',
        parts:kind==='exclude'?o.parts:o.parts.map(p=>({...p,nature:kind,treatment:kind==='transfer'?'outside':'taxable',rateBps:2000,deductionBps:kind==='expense'?10000:null,invoiceVatCents:null,invoiceNetCents:null,invoiceConfirmed:false,rightConfirmed:false,periodConfirmed:false}))})));
      await reload();setMessage('Qualification enregistrée. Une confirmation explicite reste nécessaire.');setSelected([]);
    });
  }
  const visible=data?filterOperations(data.operations,filters).sort((a,b)=>direction*(sort==='cents'?a.cents-b.cents:String(a[sort]).localeCompare(String(b[sort])))): [];
  const pages=Math.max(1,Math.ceil(visible.length/50));
  const shown=visible.slice(page*50,(page+1)*50);
  const key=JSON.stringify([filters.from??'',filters.to??'',filters.account??'']);
  const settlement=data?.settlements[key]??emptySettlement;
  const partial=!!filters.q||!!filters.status;
  const totals=data?summary(data.operations,filters,partial?emptySettlement:settlement):null;
  const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v)).toString();
  const download=(path:string)=>'/api/'+path+(path.includes('?')?'&':'?')+'mode='+mode;
  function filter(name:keyof Filters,value:string) {if(name==='from'||name==='to')setPeriod('custom');setFilters({...filters,[name]:value||undefined});}
  function chooseQuarter(year:string,quarter:number) {
    setPeriodYear(year);setPeriodQuarter(quarter);
    if(/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=2200)setFilters({...filters,...quarterRange(Number(year),quarter)});
  }
  function preset(value:string) {
    setPeriod(value);
    if(value==='all'){setFilters({...filters,from:undefined,to:undefined});return;}
    if(value==='custom')return;
    if(value==='quarter'){chooseQuarter(periodYear,periodQuarter);return;}
    const now=new Date(),y=now.getFullYear(),m=now.getMonth();
    const start=value==='year'?new Date(y,0,1):new Date(y,m,1);
    const end=value==='year'?new Date(y,11,31):new Date(y,m+1,0);
    const iso=(d:Date)=>String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    setFilters({...filters,from:iso(start),to:iso(end)});
  }
  return <div className="app">
    <header className="topbar">
      <a className="brand" href="/"><img className="cabinet-logo" src="/brand/logo-jg-avocat.png" alt="Logo JG Avocat"/><span className="brand-name">Jean-François GODEFROY<small>Avocat · TVA Cabinet</small></span></a>
      <div className="top-actions"><span className="local"><i/>Données locales</span>
        <button onClick={()=>setModal('settings')}>Paramètres</button>
        <button onClick={()=>setModal('backup')}>Sauvegarder / restaurer</button>
      </div>
    </header>
    <main>
      {mode==='demo'?<div className="banner demo"><span><strong>Démonstration</strong> · Données fictives, séparées de votre espace réel.</span><button onClick={()=>setMode('real')} disabled={busy}>Revenir à mon espace</button></div>:
      <div className="banner"><span>Aucun relevé n’est transmis à un service externe.</span><button onClick={demo} disabled={busy}>Essayer la démonstration</button></div>}
      <div className="page-title"><div><p className="eyebrow">ESPACE DE TRAVAIL {mode==='demo'?'· DÉMONSTRATION':''}</p><h1>Préparer ma TVA</h1><p>Importez vos mouvements, vérifiez leur traitement et gardez la maîtrise des totaux.</p></div>
      <div className="import-actions"><button className="primary" onClick={()=>setModal('pdf')} disabled={!data||busy}>＋ Importer des relevés PDF</button><button onClick={()=>setModal('import')} disabled={!data||busy}>Importer un relevé CSV</button></div></div>
      {error&&<div role="alert" className="notice error">{error}<button onClick={()=>setError('')} aria-label="Masquer l’erreur">×</button></div>}
      {message&&<div role="status" className="notice success">{message}</div>}
      {!data?<div className="panel empty"><h2>Connexion au serveur local…</h2>{error&&<button onClick={()=>perform(reload)}>Réessayer</button>}</div>:<>
      {!data.settings.regimeConfirmed&&<div className="notice warning"><span><strong>Avant de confirmer vos opérations</strong> · Vérifiez votre régime fiscal et vos dates de TVA. Aucun régime n’est présumé.</span><button onClick={()=>setModal('settings')}>Vérifier mes paramètres</button></div>}
      <section className="panel filters" aria-label="Filtres des opérations">
        <label>Période TVA<select aria-label="Raccourci de période" value={period} onChange={e=>preset(e.target.value)}><option value="all">Toutes les dates</option><option value="quarter">Trimestre</option><option value="month">Mois en cours</option><option value="year">Année en cours</option><option value="custom">Dates personnalisées</option></select></label>
        {period==='quarter'&&<><label>Trimestre<select aria-label="Trimestre TVA" value={periodQuarter} onChange={e=>chooseQuarter(periodYear,Number(e.target.value))}><option value="1">T1 · janvier à mars</option><option value="2">T2 · avril à juin</option><option value="3">T3 · juillet à septembre</option><option value="4">T4 · octobre à décembre</option></select></label><label>Année<select aria-label="Année du trimestre TVA" value={periodYear} onChange={e=>chooseQuarter(e.target.value,periodQuarter)}>{Array.from({length:301},(_,index)=>1900+index).map(year=><option key={year} value={year}>{year}</option>)}</select></label></>}
        <label>Du<input type="date" aria-label="Date TVA de début" value={filters.from??''} onChange={e=>filter('from',e.target.value)}/></label>
        <label>Au<input type="date" aria-label="Date TVA de fin" min={filters.from} value={filters.to??''} onChange={e=>filter('to',e.target.value)}/></label>
        <label>Compte<select value={filters.account??''} onChange={e=>filter('account',e.target.value)}><option value="">Tous les comptes</option>{[...new Set(data.operations.map(o=>o.account))].map(a=><option key={a}>{a}</option>)}</select></label>
        <label>État<select value={filters.status??''} onChange={e=>filter('status',e.target.value)}><option value="">Tous les états</option>{Object.entries(statusLabels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
        <label className="search">Rechercher<input placeholder="Un libellé…" value={filters.q??''} onChange={e=>filter('q',e.target.value)}/></label>
      </section>
      <div className="period-explanation"><p><strong>{period==='quarter'&&filters.from&&filters.to?'TVA du T'+periodQuarter+' '+filters.from.slice(0,4)+' · du '+filters.from.split('-').reverse().join('/')+' au '+filters.to.split('-').reverse().join('/'):'Période TVA indépendante des relevés bancaires.'}</strong> Importez vos relevés en entier, même s’ils débordent du trimestre. La synthèse et l’export retiennent uniquement les dates TVA choisies dans cette période ; les autres mouvements restent conservés.</p>{(filters.from||filters.to)&&<span>{visible.length} mouvement(s) dans cette vue sur {data.operations.length} conservé(s) au total.</span>}</div>
      {filters.from&&filters.to&&filters.from>filters.to&&<p role="alert" className="error-text">La date de début doit précéder la date de fin.</p>}
      <section className="cards" aria-label="Totaux confirmés">
        <article className="metric"><span>TVA collectée confirmée</span><strong>{money(totals!.collected)}</strong><small>Sur les recettes qualifiées</small></article>
        <article className="metric"><span>TVA déductible confirmée</span><strong>{money(totals!.deductible)}</strong><small>Facture et droit à déduction confirmés</small></article>
        <article className="metric balance"><span>{totals!.balance<0?'Crédit de TVA calculé':'Solde de préparation'}</span><strong>{money(totals!.balance)}</strong><small>{!filters.to||filters.to>=new Date().toISOString().slice(0,10)?'Calcul provisoire · période non achevée':'Récapitulatif de préparation'}</small></article>
      </section>
      <div className="pending-strip"><span className="dot"/><strong>{totals!.pendingCount} opération{totals!.pendingCount>1?'s':''} à vérifier</strong><span>{money(totals!.unresolvedCents)} en valeur absolue</span><span className="estimated">Estimations séparées : collectée {money(totals!.estimatedCollected)} · déductible {money(totals!.estimatedDeductible)}</span></div>
      <section className="panel operations">
        <div className="section-head"><div><h2>Mouvements bancaires <span className="count">{visible.length}</span></h2><p>Un clic sur un libellé ouvre sa qualification.</p></div><a className="button" download href={download('export?'+query)}>Exporter la vue en CSV</a></div>
        {selected.length>0&&<div className="selection-bar"><strong>{selected.length} sélectionnée(s)</strong><button disabled={busy} onClick={()=>quick('revenue')}>Recette 20 % · estimation</button><button disabled={busy} onClick={()=>quick('expense')}>Dépense 20 % · estimation</button><button disabled={busy} onClick={()=>quick('transfer')}>Virement hors champ</button><button disabled={busy} onClick={()=>quick('exclude')}>Exclure des totaux</button></div>}
        {!visible.length?<div className="empty"><span className="empty-icon">↧</span><h3>{data.operations.length?'Aucun résultat pour ces filtres':'Votre tableau commence avec un relevé'}</h3><p>{data.operations.length?'Modifiez la période, le compte ou votre recherche.':'Importez un relevé PDF ou essayez le parcours avec nos données fictives.'}</p>{!data.operations.length&&<button className="primary" disabled={busy} onClick={demo}>Découvrir avec le relevé fictif</button>}</div>:
        <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Sélectionner les lignes de cette page" checked={shown.length>0&&shown.every(o=>selected.includes(o.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...shown.map(o=>o.id)])]:selected.filter(id=>!shown.some(o=>o.id===id)))}/></th>
        <th><button className="sort" onClick={()=>{setSort('date');setDirection(sort==='date'?-direction:1);}}>Date bancaire ↕</button></th>
        <th><button className="sort" onClick={()=>{setSort('label');setDirection(sort==='label'?-direction:1);}}>Libellé / compte ↕</button></th>
        <th className="number"><button className="sort" onClick={()=>{setSort('cents');setDirection(sort==='cents'?-direction:1);}}>TTC signé ↕</button></th><th>Qualification</th><th className="number">HT traité</th><th className="number">TVA calculée</th><th className="number">Déductible</th><th>État</th><th>Justificatif</th><th>Note</th></tr></thead>
        <tbody>{shown.map(o=><tr key={o.id} className={selected.includes(o.id)?'selected':''}><td><input type="checkbox" aria-label={'Sélectionner '+o.label+' ligne '+o.sourceLine} checked={selected.includes(o.id)} onChange={e=>setSelected(e.target.checked?[...selected,o.id]:selected.filter(id=>id!==o.id))}/></td>
          <td className="nowrap">{o.date.split('-').reverse().join('/')}{o.parts.some(p=>data.locks.includes(p.vatDate.slice(0,7)))&&<small>Verrouillé</small>}</td>
          <td><button className="row-label" onClick={()=>setEditing(o)}>{o.label}</button><small>{o.account}{o.sourcePage?' · PDF p. '+o.sourcePage:''}{o.parts.length>1?' · '+o.parts.length+' ventilations':''}</small></td><td className={'number amount '+(o.cents<0?'':'positive')}>{money(o.cents)}</td>
          <td>{o.parts.length>1?'Ventilation multiple':natureLabels[o.parts[0].nature]}<small>{o.parts.length===1?(o.parts[0].treatment==='taxable'?inputMoney(o.parts[0].rateBps)+' %':treatmentLabels[o.parts[0].treatment]):'Ouvrir pour vérifier'}</small></td>
          <td className="number">{money(sumCents(o.parts.map(p=>amounts(p).net)))}</td>
          <td className="number">{money(sumCents(o.parts.map(p=>amounts(p).vat)))}<small>{o.status==='pending'?'Estimation':o.status==='excluded'?'Non comptabilisée':'Confirmée'}</small></td>
          <td className="number">{o.parts.some(p=>p.nature==='expense')?money(sumCents(o.parts.map(p=>amounts(p).deductible))):'—'}<small>{o.parts.some(p=>p.nature==='expense'&&p.deductionBps===null)?'Droit à vérifier':''}</small></td>
          <td><span className={'badge '+o.status}>{statusLabels[o.status]}</span></td><td><span className={o.parts.every(p=>p.documentRef)?'':'muted'}>{o.parts.every(p=>p.documentRef)?'Référencé':'Absent / externe'}</span></td><td className="row-note" title={o.parts.map(p=>p.note).filter(Boolean).join(' · ')}>{o.parts.map(p=>p.note).filter(Boolean).join(' · ').slice(0,80)||'—'}</td>
        </tr>)}</tbody></table></div>}
        <div className="table-footer"><span>Les estimations ne sont pas ajoutées aux totaux confirmés.</span><div><button disabled={page===0} onClick={()=>setPage(page-1)}>Précédent</button><span> {Math.min(page+1,pages)} / {pages} </span><button disabled={page>=pages-1} onClick={()=>setPage(page+1)}>Suivant</button></div></div>
      </section>
      <div className="bottom-grid"><section className="panel summary"><h2>Détail de la synthèse</h2><p>Collectée − déductible + régularisations − crédit antérieur.</p>
        {Object.keys(totals!.byRate).length>0?<table><thead><tr><th>Taux choisi</th><th className="number">Base HT confirmée</th><th className="number">TVA collectée</th></tr></thead><tbody>{Object.entries(totals!.byRate).map(([rate,a])=><tr key={rate}><td>{inputMoney(Number(rate))} %</td><td className="number">{money(a.net)}</td><td className="number">{money(a.vat)}</td></tr>)}</tbody></table>:<p className="muted">Aucune recette taxable confirmée dans cette vue.</p>}
        <p>Opérations exclues : {money(totals!.excludedCents)} (signé).</p>
        <details><summary>Régularisation et crédit antérieur</summary><p>Valeurs propres à la période exacte et au compte sélectionnés. Aucun report automatique.</p>
          {partial?<p>Retirez le filtre d’état et la recherche pour appliquer les ajustements de période.</p>:!filters.from||!filters.to?<p>Choisissez une date de début et une date de fin.</p>:<SettlementForm key={key+JSON.stringify(settlement)} value={settlement} onSave={value=>perform(async()=>{await request('/settlement',mode,{key,value});await reload();setMessage('Ajustements de période enregistrés.');})}/>}
        </details>
      </section>
      <section className="panel history"><div className="section-head"><h2>Historique</h2><button disabled={busy||!data.history.some(h=>h.kind==='edit'&&!h.undone)} onClick={()=>perform(async()=>{await request('/undo',mode,{});await reload();setMessage('Dernière qualification annulée et annulation tracée.');})}>Annuler la dernière qualification</button></div>
      {data.history.length?<ul>{data.history.slice(0,12).map(h=><li key={h.id}><span>{h.label}{h.undone?' · annulée':''}</span><small>{new Date(h.at).toLocaleString('fr-FR')}</small></li>)}</ul>:<p className="muted">Vos qualifications et leurs annulations apparaîtront ici.</p>}</section></div>
      <footer className="footnote">TVA Cabinet{data.version?' '+data.version:''} · Préparation locale mono-utilisateur. Les taux sont des choix manuels, sans validation de leur éligibilité. Aucune télédéclaration ni paiement.</footer>
      </>}
    </main>
    {modal==='import'&&data&&<ImportDialog mode={mode} accounts={[...new Set(data.operations.map(o=>o.account))]} onClose={()=>setModal(null)} onDone={async count=>{await reload();setModal(null);setMessage(count+' opérations importées, en attente de qualification.');}}/>}
    {modal==='pdf'&&data&&<PdfImportDialog mode={mode} accounts={[...new Set(data.operations.map(o=>o.account))]} onClose={()=>setModal(null)} onImported={reload} onDone={async count=>{await reload();setModal(null);setMessage(count+' mouvements PDF importés, en attente de qualification.');}}/>}
    {modal==='settings'&&data&&<SettingsDialog data={data} mode={mode} onClose={()=>setModal(null)} onDone={async()=>{await reload();setMessage('Paramètres enregistrés.');}}/>}
    {modal==='backup'&&<BackupDialog mode={mode} onClose={()=>setModal(null)} onDone={async()=>{await reload();setModal(null);setMessage('Sauvegarde restaurée. L’état précédent a été conservé sur disque.');}}/>}
    {editing&&data&&<Editor key={editing.id} operation={editing} mode={mode} rates={data.settings.rates} locked={editing.parts.some(p=>data.locks.includes(p.vatDate.slice(0,7)))} onClose={()=>setEditing(null)} onSaved={async next=>{await reload();const index=visible.findIndex(o=>o.id===editing.id);setEditing(next?visible[index+1]??null:null);setMessage('Qualification enregistrée.');}}/>}
  </div>;
}
function SettlementForm({value,onSave}:{value:Settlement;onSave:(s:Settlement)=>void}) {
  const [s,set]=useState(value);
  return <form onSubmit={e=>{e.preventDefault();onSave(s);}} className="form-stack"><label>Régularisations signées (une valeur positive augmente le solde)<MoneyInput value={s.adjustmentsCents} label="Régularisations" onChange={n=>set({...s,adjustmentsCents:n??0})}/></label>
  <label>Crédit antérieur positif<MoneyInput value={s.priorCreditCents} label="Crédit antérieur" onChange={n=>set({...s,priorCreditCents:n??0})}/></label><label className="check"><input type="checkbox" checked={s.confirmed} onChange={e=>set({...s,confirmed:e.target.checked})}/>Je confirme ces deux montants pour cette période exacte.</label><button type="submit">Enregistrer les ajustements</button></form>;
}
function Editor({operation,mode,rates,locked,onClose,onSaved}:{operation:Operation;mode:Mode;rates:number[];locked:boolean;onClose:()=>void;onSaved:(next:boolean)=>Promise<void>}) {
  const [o,set]=useState(()=>structuredClone(operation)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  function part(index:number,patch:Partial<Part>) {set({...o,status:'pending',parts:o.parts.map((p,i)=>i===index?{...p,...patch}:p)});}
  const close=()=>{if(JSON.stringify(o)!==JSON.stringify(operation)&&!window.confirm('Fermer sans enregistrer vos modifications ?'))return;onClose();};
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    setBusy(true);setError('');
    try{await request('/operations',mode,[{id:o.id,revision:o.revision,parts:o.parts,status:submitter?.value==='confirmed'?'confirmed':submitter?.value==='excluded'?'excluded':'pending'}]);await onSaved(submitter?.value==='next');}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <Modal title="Qualifier le mouvement" wide onClose={close}><form onSubmit={submit}>
    <div className="editor-intro"><div><h3>{o.label}</h3><p>{o.date.split('-').reverse().join('/')} · {o.account} · {o.sourcePage?'Page '+o.sourcePage+' · ligne '+(o.sourceRefs?.[0].line??o.sourceLine):'Ligne source '+o.sourceLine}{o.sourceMethod==='ocr'?' · Lecture OCR':''}</p></div><strong className="large-amount">{money(o.cents)}</strong></div>
    {error&&<p role="alert" className="notice error">{error}</p>}
    {locked&&<p className="notice warning">Période verrouillée. Rouvrez-la dans les paramètres pour modifier cette opération.</p>}
    <p className="hint">Le TTC bancaire garde son signe. Pour une dépense, les montants de facture sont positifs ; pour son remboursement, ils sont négatifs. Une suggestion ne confirme rien.</p>
    <fieldset disabled={busy||locked} className="plain">
    {o.parts.map((p,i)=>{const a=amounts(p);return <section className="part" key={p.id}><div className="section-head"><h3>{o.parts.length>1?'Ventilation '+(i+1):'Traitement du mouvement'}</h3>{o.parts.length>1&&<button type="button" onClick={()=>set({...o,status:'pending',parts:o.parts.filter((_,j)=>j!==i)})}>Retirer cette ventilation</button>}</div>
      <div className="form-grid"><label>TTC bancaire signé<MoneyInput label={'TTC ventilation '+(i+1)} value={p.cents} onChange={n=>part(i,{cents:n??0})}/></label>
      <label>Nature<select aria-label="Nature" value={p.nature} onChange={e=>part(i,{nature:e.target.value as Part['nature']})}>{Object.entries(natureLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Traitement TVA<select aria-label="Traitement TVA" value={p.treatment} onChange={e=>part(i,{treatment:e.target.value as Part['treatment']})}>{Object.entries(treatmentLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {p.treatment==='taxable'&&<label>Taux choisi<select value={p.rateBps} onChange={e=>part(i,{rateBps:Number(e.target.value)})}>{[...new Set([...rates,p.rateBps])].map(r=><option key={r} value={r}>{inputMoney(r)} %</option>)}</select></label>}
      <label>Date de facture<input type="date" value={p.invoiceDate} onChange={e=>part(i,{invoiceDate:e.target.value})}/></label>
      <label>Date TVA retenue<input required type="date" value={p.vatDate} onChange={e=>part(i,{vatDate:e.target.value})}/></label>
      {p.nature==='expense'&&p.treatment==='taxable'&&<label>Déduction<select aria-label="Déduction" value={p.deductionBps===null?'':String(p.deductionBps)} onChange={e=>part(i,{deductionBps:e.target.value===''?null:Number(e.target.value)})}><option value="">À vérifier</option><option value="10000">Intégrale (100 %)</option><option value="0">Non déductible (0 %)</option><option value="5000">Partielle (50 %)</option>{p.deductionBps!==null&&![0,5000,10000].includes(p.deductionBps)&&<option value={p.deductionBps}>{inputMoney(p.deductionBps)} %</option>}</select></label>}
      {p.nature==='expense'&&p.treatment==='taxable'&&<label>Coefficient de déduction en %<MoneyInput label={'Coefficient '+(i+1)} value={p.deductionBps} min={0} max={10000} nullable onChange={n=>part(i,{deductionBps:n})}/></label>}
      </div>
      <div className="calculation"><span>TTC traité <strong>{money(a.gross)}</strong></span><span>HT <strong>{money(a.net)}</strong></span><span>TVA <strong>{money(a.vat)}</strong></span>{p.nature==='expense'&&<span>Déductible <strong>{money(a.deductible)}</strong></span>}<small>{a.source}</small></div>
      <details open={p.nature==='expense'&&p.treatment==='taxable'}><summary>Montants réellement facturés et justificatif</summary><p className="hint">Le HT et la TVA saisis remplacent l’estimation et doivent totaliser le TTC traité. La pièce peut rester dans vos dossiers : indiquez sa référence.</p>
      <div className="form-grid"><label>HT facturé (vide = estimation)<MoneyInput label={'HT facturé '+(i+1)} value={p.invoiceNetCents} nullable onChange={n=>part(i,{invoiceNetCents:n})}/></label><label>TVA facturée (vide = estimation)<MoneyInput label={'TVA facturée '+(i+1)} value={p.invoiceVatCents} nullable onChange={n=>part(i,{invoiceVatCents:n})}/></label>
      <label className="span2">Référence ou emplacement du justificatif<input maxLength={500} value={p.documentRef} onChange={e=>part(i,{documentRef:e.target.value})} placeholder="Ex. facture fournisseur n° F-123, dossier local…"/></label></div>
      {!p.documentRef&&<p className="warning-text">Justificatif absent de l’application ou conservé ailleurs. Téléversement de pièces non disponible dans cette version.</p>}
      <label className="check"><input type="checkbox" checked={p.invoiceConfirmed} onChange={e=>part(i,{invoiceConfirmed:e.target.checked})}/>J’ai vérifié le HT et la TVA effectivement facturés.</label>
      {p.nature==='expense'&&<label className="check"><input type="checkbox" checked={p.rightConfirmed} onChange={e=>part(i,{rightConfirmed:e.target.checked})}/>Je confirme le droit à déduction et le coefficient choisi.</label>}</details>
      <label className="check"><input type="checkbox" checked={p.periodConfirmed} onChange={e=>part(i,{periodConfirmed:e.target.checked})}/>Je confirme la date retenue pour la TVA.</label>
      <label>Note<textarea value={p.note} maxLength={2000} rows={2} onChange={e=>part(i,{note:e.target.value})}/></label>
    </section>;})}
    <div className="split-tools"><button type="button" onClick={()=>set({...o,status:'pending',parts:[...o.parts,newPart(0,o.date,crypto.randomUUID())]})}>＋ Ajouter une ventilation</button><span className={sumCents(o.parts.map(p=>p.cents))===o.cents?'':'error-text'}>Ventilé : {money(sumCents(o.parts.map(p=>p.cents)))} / {money(o.cents)}</span></div>
    </fieldset>
    <details className="raw"><summary>Provenance bancaire et données d’origine</summary><p>{o.sourcePage?'PDF · page '+o.sourcePage+' · ligne '+(o.sourceRefs?.[0].line??o.sourceLine):'CSV · ligne '+o.sourceLine} · <a href={'/api/source/'+o.importId+'?mode='+mode} download>Télécharger le document original</a></p><pre>{JSON.stringify(o.raw,null,2)}</pre></details>
    <div className="modal-actions"><button type="button" onClick={close}>Fermer</button><button disabled={busy||locked} type="submit" value="pending">Enregistrer à vérifier</button><button disabled={busy||locked} type="submit" value="next">Enregistrer et suivant</button><button disabled={busy||locked} type="submit" value="confirmed" className="primary">Confirmer l’opération</button><button disabled={busy||locked} type="submit" value="excluded">Exclure</button></div>
  </form></Modal>;
}
function ImportDialog({mode,accounts,onClose,onDone}:{mode:Mode;accounts:string[];onClose:()=>void;onDone:(n:number)=>Promise<void>}) {
  const [csv,setCsv]=useState<CsvRequest>({filename:'',base64:'',account:accounts[0]??'Compte principal',delimiter:'auto',edits:[],openingBalanceCents:null,closingBalanceCents:null});
  const [preview,setPreview]=useState<FullPreview|null>(null),[selected,setSelected]=useState<number[]>([]),[edits,setEdits]=useState<Record<number,{line:number;date:string;label:string;amount:string}>>({});
  const [analysed,setAnalysed]=useState('');
  const signature=(c:CsvRequest,e:typeof edits)=>JSON.stringify({mapping:c.mapping,opening:c.openingBalanceCents,closing:c.closingBalanceCents,edits:Object.values(e)});
  const [accept,setAccept]=useState(false),[duplicates,setDuplicates]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(0);
  async function analyse(e?:FormEvent) {
    e?.preventDefault();setBusy(true);setError('');
    try{const p=await request<FullPreview>('/preview',mode,{...csv,edits:Object.values(edits)});const nextCsv={...csv,mapping:p.mapping};const nextEdits=Object.fromEntries(p.rows.filter(r=>edits[r.line]).map(r=>[r.line,r.error?edits[r.line]:{line:r.line,date:r.date,label:r.label,amount:inputMoney(r.cents)}]));setPreview(p);setCsv(nextCsv);setEdits(nextEdits);setAnalysed(signature(nextCsv,nextEdits));setSelected(p.rows.filter(r=>!r.error&&!r.duplicate).map(r=>r.line));setPage(0);}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  async function file(file?:File) {
    setPreview(null);setEdits({});setError('');
    if(!file)return;
    if(file.size>5_000_000){setError('Le fichier dépasse 5 Mo.');return;}
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    setCsv({...csv,filename:file.name,base64:btoa(binary),mapping:undefined,edits:[],openingBalanceCents:null,closingBalanceCents:null});
  }
  async function commit() {
    setBusy(true);setError('');
    try{const result=await request<{count:number}>('/import',mode,{...csv,edits:Object.values(edits),selectedLines:selected,acceptRejected:accept,confirmDuplicates:duplicates});await onDone(result.count);}
    catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function edit(row:Preview['rows'][number],name:'date'|'label'|'amount',value:string) {
    setEdits({...edits,[row.line]:{...(edits[row.line]??{line:row.line,date:row.date,label:row.label,amount:row.amountText}),[name]:value}});
  }
  const dirty=!!preview&&signature(csv,edits)!==analysed;
  return <Modal title="Importer un relevé CSV" wide onClose={onClose}>
    <p className="hint">CSV UTF-8 ou Windows-1252, jusqu’à 5 Mo et 10 000 lignes. Pour un PDF, utilisez le bouton « Importer des relevés PDF » de l’écran principal. Excel n’est pas disponible. Votre fichier reste local.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <form onSubmit={analyse} className="import-form"><div className="form-grid">
      <label>Compte bancaire<input required list="accounts" value={csv.account} maxLength={100} onChange={e=>{setCsv({...csv,account:e.target.value});setPreview(null);}}/><datalist id="accounts">{accounts.map(a=><option key={a} value={a}/>)}</datalist></label>
      <label>Relevé CSV<input aria-label="Relevé CSV" required type="file" accept=".csv,text/csv" onChange={e=>file(e.target.files?.[0]).catch(e=>setError(errorText(e)))}/></label>
      <label>Séparateur<select value={csv.delimiter} onChange={e=>{setCsv({...csv,delimiter:e.target.value as CsvRequest['delimiter']});setPreview(null);}}><option value="auto">Détection automatique</option><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={'\t'}>Tabulation</option></select></label></div>
      {preview&&<div className="mapping">{Object.entries({date:'Date',label:'Libellé',amount:'Montant signé',debit:'Débit',credit:'Crédit'}).map(([name,label])=><label key={name}>{label}<select aria-label={'Colonne '+label} value={csv.mapping?.[name as keyof NonNullable<CsvRequest['mapping']>]??''} onChange={e=>setCsv({...csv,mapping:{...preview.mapping,...csv.mapping,[name]:e.target.value}})}><option value="">Non utilisée</option>{preview.headers.map(h=><option key={h}>{h}</option>)}</select></label>)}</div>}
      <details open={!!preview?.balanceColumns.length}><summary>Vérifier les soldes du relevé</summary><p>Solde de fin − solde de début = somme de toutes les lignes valides du fichier, avant votre sélection. Obligatoire si le CSV comporte une colonne de solde.</p><div className="form-grid"><label>Solde de début<MoneyInput label="Solde de début" value={csv.openingBalanceCents??null} nullable onChange={n=>setCsv({...csv,openingBalanceCents:n})}/></label><label>Solde de fin<MoneyInput label="Solde de fin" value={csv.closingBalanceCents??null} nullable onChange={n=>setCsv({...csv,closingBalanceCents:n})}/></label></div></details>
      <button type="submit" disabled={busy||!csv.base64}>{busy?'Analyse…':preview?'Actualiser l’aperçu et les corrections':'Analyser le CSV'}</button>
    </form>
    {preview&&<>
      <div className="preview-stats"><strong>{preview.rows.length} lignes</strong><span>Total valide : {money(preview.totalCents)}</span><span>{preview.errorCount} erreur(s)</span><span>{preview.duplicateCount} doublon(s) potentiel(s)</span><span>{preview.encoding}</span></div>
      {preview.alreadyImported&&<p className="notice error">Ce fichier a déjà été importé dans ce compte. Aucun nouvel import autorisé.</p>}
      {preview.balanceColumns.length>0&&preview.balanceDifference===null&&<p className="notice warning">Colonne de solde détectée : saisissez les soldes du relevé, puis actualisez l’aperçu.</p>}
      {preview.balanceDifference!==null&&<p className={preview.balanceDifference===0?'notice success':'notice error'}>Écart de rapprochement des soldes : {money(preview.balanceDifference)}{preview.balanceDifference===0?' · cohérent':''}</p>}
      <p className="hint">Corrigez les cellules puis actualisez l’aperçu. Les lignes décochées seront explicitement exclues ; les doublons sont décochés par défaut.</p>
      <div className="table-scroll preview"><table><thead><tr><th>Inclure</th><th>Ligne</th><th>Date</th><th>Libellé</th><th>Montant signé</th><th>Contrôle</th></tr></thead><tbody>{preview.rows.slice(page*50,(page+1)*50).map(r=><tr key={r.line}><td><input aria-label={'Importer ligne '+r.line} type="checkbox" disabled={!!r.error} checked={selected.includes(r.line)} onChange={e=>setSelected(e.target.checked?[...selected,r.line]:selected.filter(n=>n!==r.line))}/></td><td>{r.line}</td><td><input aria-label={'Date ligne '+r.line} value={edits[r.line]?.date??r.date} onChange={e=>edit(r,'date',e.target.value)}/></td><td><input aria-label={'Libellé ligne '+r.line} value={edits[r.line]?.label??r.label} onChange={e=>edit(r,'label',e.target.value)}/></td><td><input aria-label={'Montant ligne '+r.line} value={edits[r.line]?.amount??r.amountText} onChange={e=>edit(r,'amount',e.target.value)}/></td><td className={r.error?'error-text':r.duplicate?'warning-text':''}>{r.error??(r.duplicate?'Doublon à décider':'Prêt')}</td></tr>)}</tbody></table></div>
      {preview.rows.length>50&&<div className="pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>Précédent</button><span>{page+1} / {Math.ceil(preview.rows.length/50)}</span><button disabled={(page+1)*50>=preview.rows.length} onClick={()=>setPage(page+1)}>Suivant</button></div>}
      {preview.errorCount>0&&<label className="check"><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/>J’accepte l’exclusion des {preview.errorCount} lignes invalides signalées ci-dessus.</label>}
      {preview.rows.some(r=>r.duplicate&&selected.includes(r.line))&&<label className="check"><input type="checkbox" checked={duplicates} onChange={e=>setDuplicates(e.target.checked)}/>Je confirme que les doublons sélectionnés sont des mouvements distincts à conserver.</label>}
      <div className="modal-actions"><span>{selected.length} sélectionnée(s) · {preview.rows.length-selected.length} exclue(s) · {money(sumCents(preview.rows.filter(r=>selected.includes(r.line)).map(r=>r.cents)))}</span><button onClick={onClose}>Fermer</button><button className="primary" disabled={busy||!selected.length||preview.alreadyImported||!!dirty||preview.errorCount>0&&!accept||preview.rows.some(r=>r.duplicate&&selected.includes(r.line))&&!duplicates} onClick={commit}>Importer {selected.length} opérations</button></div>
    </>}
  </Modal>;
}
function SettingsDialog({data,mode,onClose,onDone}:{data:State;mode:Mode;onClose:()=>void;onDone:()=>Promise<void>}) {
  const [s,set]=useState<Settings>(data.settings??defaultSettings),[rates,setRates]=useState(s.rates.map(inputMoney).join(' ; '));
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function run(fn:()=>Promise<void>) {setBusy(true);setError('');try{await fn();await onDone();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  return <Modal title="Paramètres et périodes" onClose={onClose}>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <form className="form-stack" onSubmit={e=>{e.preventDefault();run(async()=>{const parsed=rates.split(';').map(r=>parseMoney(r.trim()));await request('/settings',mode,{...s,rates:[...new Set(parsed)]});});}}>
      <p>Ces paramètres sont des informations confirmées par vous. L’application ne détermine pas votre régime et ne calcule pas automatiquement l’exigibilité de la TVA.</p>
      <label>Régime vérifié<select value={s.regime} onChange={e=>set({...s,regime:e.target.value as Settings['regime'],regimeConfirmed:false})}><option value="review">À vérifier</option><option value="receipts">TVA sur les encaissements</option><option value="invoices">TVA sur les débits</option></select></label>
      <label className="check"><input type="checkbox" checked={s.regimeConfirmed} onChange={e=>set({...s,regimeConfirmed:e.target.checked})}/>J’ai vérifié ce régime et je choisirai explicitement les dates de TVA.</label>
      <label>Taux proposés en %, séparés par des points-virgules<input value={rates} onChange={e=>setRates(e.target.value)} placeholder="20 ; 10 ; 5,5 ; 2,1"/></label>
      <button disabled={busy} className="primary" type="submit">Enregistrer les paramètres</button>
    </form>
    <hr/><h3>Verrouillage volontaire d’une période</h3><p>Une période verrouillée refuse les changements et les imports qui la concernent.</p>
    <div className="lock-controls"><label>Mois<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button disabled={busy||!month} onClick={()=>run(async()=>{await request('/lock',mode,{month,locked:!data.locks.includes(month)});})}>{data.locks.includes(month)?'Rouvrir explicitement':'Verrouiller ce mois'}</button></div>
    <p>Mois verrouillés : {data.locks.length?data.locks.join(', '):'aucun'}</p>
    <p className="hint">Les relevés PDF texte et scannés sont lus localement avec un aperçu à vérifier. Règles automatiques, ajout de justificatifs de factures et Excel : indisponibles.</p>
  </Modal>;
}
function BackupDialog({mode,onClose,onDone}:{mode:Mode;onClose:()=>void;onDone:()=>Promise<void>}) {
  const [backup,setBackup]=useState<unknown>(null),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <Modal title="Sauvegarde et restauration" onClose={onClose}>
    <p>La sauvegarde contient les opérations, qualifications, documents PDF et CSV originaux, paramètres, périodes verrouillées et historique de l’espace <strong>{mode==='demo'?'démonstration':'réel'}</strong>.</p>
    <a className="button primary" download href={'/api/backup?mode='+mode}>Télécharger la sauvegarde complète</a>
    <hr/><h3>Restaurer une sauvegarde</h3><p>L’intégrité et le format sont contrôlés avant tout remplacement. L’état précédent sera conservé dans le dossier local <code>data/backups</code>.</p>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await request('/restore',mode,{confirmation,backup});await onDone();}catch(e){setError(errorText(e));}finally{setBusy(false);}}}>
      <label>Fichier de sauvegarde<input required type="file" accept=".json,application/json" onChange={async e=>{setError('');setBackup(null);try{const f=e.target.files?.[0];if(!f)return;if(f.size>45_000_000)throw new Error('La sauvegarde dépasse 45 Mo.');setBackup(JSON.parse(await f.text()));}catch(e){setError(errorText(e));}}}/></label>
      <label>Pour remplacer l’espace actuel, saisissez RESTAURER<input required pattern="RESTAURER" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
      <button className="danger" disabled={busy||!backup||confirmation!=='RESTAURER'} type="submit">{busy?'Restauration…':'Restaurer et remplacer cet espace'}</button>
    </form>
  </Modal>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
