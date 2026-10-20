import React,{useEffect,useRef,useState,type MouseEvent} from 'react';
import { inputMoney,money,sumCents } from '../shared/model.ts';
import { defaultPdfLayout,type PdfLayout,type PdfRequest,type PdfProgress } from '../shared/pdf.ts';
import type { PdfPreview } from '../server/pdf-preview.ts';
import {Modal,MoneyInput,errorText,request,type Mode} from './ui.tsx';

type Preview=PdfPreview&{alreadyImported:boolean};
type JobStatus={jobId:string;status:'reading'|'ready'|'error';error?:string;progress:PdfProgress;pages?:{number:number;width:number;height:number;method:'text'|'ocr'}[]};
type Zone='date'|'label'|'debit'|'credit'|'amount';
const zoneLabels:Record<Zone,string>={date:'Date d’opération',label:'Libellé',debit:'Débit',credit:'Crédit',amount:'Montant signé'};
export function PdfImportDialog({mode,accounts,onClose,onDone}:{mode:Mode;accounts:string[];onClose:()=>void;onDone:(count:number)=>Promise<void>}) {
  const [source,setSource]=useState<{filename:string;base64:string}|null>(null);
  const [account,setAccount]=useState(accounts[0]??'Société Générale');
  const [forceOcr,setForceOcr]=useState(false),[jobId,setJobId]=useState('');
  const jobRef=useRef(''),alive=useRef(true),imageBox=useRef<HTMLDivElement>(null);
  const [status,setStatus]=useState<JobStatus|null>(null),[preview,setPreview]=useState<Preview|null>(null);
  const [options,setOptions]=useState<PdfRequest|null>(null),[analysed,setAnalysed]=useState('');
  const [selected,setSelected]=useState<number[]>([]),[reviewed,setReviewed]=useState(false),[acceptRejected,setAcceptRejected]=useState(false),[duplicates,setDuplicates]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[pdfPage,setPdfPage]=useState(1),[tablePage,setTablePage]=useState(0);
  const [zoom,setZoom]=useState('fit');
  const [zone,setZone]=useState<Zone>('date'),[drawing,setDrawing]=useState(false),[anchor,setAnchor]=useState<number|null>(null);
  const [highlight,setHighlight]=useState<{page:number;top:number}|null>(null);
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;const id=jobRef.current;if(id)void request('/pdf/jobs/'+id+'/cancel',mode,{}).catch(()=>{});};
  },[mode]);
  const signature=(value:PdfRequest)=>JSON.stringify(value);
  async function rebuild(value:PdfRequest) {
    setBusy(true);setError('');setReviewed(false);
    try {
      const p=await request<Preview>('/pdf/preview',mode,value);
      if(!alive.current)return;
      setPreview(p);setOptions(p.options);setAnalysed(signature(p.options));
      setSelected(p.rows.filter(row=>!row.error&&!row.duplicate).map(row=>row.line));setTablePage(0);
    } catch(e) {if(alive.current)setError(errorText(e));}
    finally {if(alive.current)setBusy(false);}
  }
  useEffect(()=>{
    if(!jobId)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next=await request<JobStatus>('/pdf/jobs/'+jobId,mode);
        if(cancelled)return;
        setStatus(next);
        if(next.status==='error'){setError(next.error??'Ce PDF ne peut pas être lu.');setBusy(false);return;}
        if(next.status==='ready'){await rebuild({jobId,account});return;}
        timer=setTimeout(()=>void poll(),450);
      } catch(e) {if(!cancelled){setError(errorText(e));setBusy(false);}}
    }
    void poll();
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[jobId,mode]);
  useEffect(()=>{
    if(!jobId||status?.status!=='ready')return;
    const timer=setInterval(()=>{
      void request<JobStatus>('/pdf/jobs/'+jobId,mode).catch(e=>{
        if(alive.current)setError(errorText(e));
      });
    },60_000);
    return ()=>clearInterval(timer);
  },[jobId,mode,status?.status]);
  async function pick(file?:File) {
    if(!file)return;
    setError('');
    if(file.size>10_000_000){setError('Choisissez un PDF de 10 Mo maximum.');return;}
    if(!file.name.toLowerCase().endsWith('.pdf')){setError('Choisissez un fichier PDF.');return;}
    if(jobRef.current){await request('/pdf/jobs/'+jobRef.current+'/cancel',mode,{}).catch(()=>{});jobRef.current='';setJobId('');}
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    setSource({filename:file.name,base64:btoa(binary)});setPreview(null);setOptions(null);setStatus(null);setReviewed(false);
  }
  async function start() {
    if(!source||!account.trim())return;
    if(preview&&!window.confirm('Relire le document et remplacer les corrections de cet aperçu ?'))return;
    setBusy(true);setError('');setPreview(null);setOptions(null);setReviewed(false);setPdfPage(1);
    try {
      if(jobRef.current)await request('/pdf/jobs/'+jobRef.current+'/cancel',mode,{}).catch(()=>{});
      const response=await request<{jobId:string}>('/pdf/jobs',mode,{...source,forceOcr});
      if(!alive.current){void request('/pdf/jobs/'+response.jobId+'/cancel',mode,{}).catch(()=>{});return;}
      jobRef.current=response.jobId;setJobId(response.jobId);
      setStatus({jobId:response.jobId,status:'reading',progress:{page:0,total:0,stage:'Ouverture du PDF…'}});
    } catch(e) {setError(errorText(e));setBusy(false);}
  }
  function change(patch:Partial<PdfRequest>) {if(options){setOptions({...options,...patch});setReviewed(false);}}
  function edit(row:Preview['rows'][number],field:'date'|'label'|'amount',text:string) {
    if(!options)return;
    const edits=options.edits??[];
    const previous=edits.find(edit=>edit.line===row.line)??{line:row.line,date:row.date,label:row.label,amount:row.amountText};
    change({edits:[...edits.filter(edit=>edit.line!==row.line),{...previous,[field]:text}]});
  }
  function range(kind:Zone,edge:0|1,value:number) {
    if(!options)return;
    const current=options.layout??defaultPdfLayout;
    const next:[number,number]=[...current[kind]];next[edge]=Math.max(0,Math.min(100,value));
    change({layout:{...current,[kind]:next,detected:false}});
  }
  function draw(event:MouseEvent<SVGSVGElement>) {
    if(!drawing||!options)return;
    const box=event.currentTarget.getBoundingClientRect();
    const value=Math.min(100,Math.max(0,100*(event.clientX-box.left)/box.width));
    if(anchor===null){setAnchor(value);return;}
    const left=Math.min(anchor,value),right=Math.max(anchor,value);
    if(right-left<.5){setError('La zone doit avoir une largeur visible. Cliquez sur ses deux bords.');return;}
    const layout=options.layout??defaultPdfLayout;
    change({layout:{...layout,[zone]:[left,right],detected:false}});setAnchor(null);setDrawing(false);
  }
  function locate(row:{page:number;top:number}) {
    setPdfPage(row.page);setHighlight({page:row.page,top:row.top});
    requestAnimationFrame(()=>{const element=imageBox.current;if(element)element.scrollTo({top:element.scrollHeight*row.top/100-element.clientHeight/3,behavior:'smooth'});});
  }
  async function commit() {
    if(!options)return;
    setBusy(true);setError('');
    try {
      const result=await request<{count:number}>('/pdf/import',mode,{...options,selectedLines:selected,acceptRejected,confirmDuplicates:duplicates,reviewed});
      await onDone(result.count);
    } catch(e) {setError(errorText(e));setBusy(false);}
  }
  const dirty=!!options&&signature(options)!==analysed;
  const rows=preview?.rows.slice(tablePage*30,(tablePage+1)*30)??[];
  const layout=options?.layout??defaultPdfLayout;
  const zones:Zone[]=layout.mode==='signed'?['date','label','amount']:['date','label','debit','credit'];
  const selectedDuplicates=preview?.rows.some(row=>row.duplicate&&selected.includes(row.line));
  const balanceBlocked=!!preview&&(preview.balanceDifference!==null&&preview.balanceDifference!==0||preview.balanceDetected&&preview.balanceDifference===null);
  return <Modal title="Importer un relevé PDF" wide onClose={onClose}>
    <p>Lecture locale des relevés bancaires, avec détection des colonnes de type Société Générale. Les pages scannées sont reconnues sur votre ordinateur. <strong>Aucun document n’est envoyé à un service externe.</strong></p>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <div className="form-grid pdf-upload">
      <label>Compte bancaire<input aria-label="Compte bancaire PDF" list="pdf-accounts" disabled={busy} value={account} maxLength={100} onChange={event=>{setAccount(event.target.value);change({account:event.target.value});}}/><datalist id="pdf-accounts">{accounts.map(a=><option key={a}>{a}</option>)}</datalist></label>
      <label>Relevé PDF<input aria-label="Relevé PDF" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={event=>void pick(event.target.files?.[0]).catch(e=>setError(errorText(e)))}/></label>
      <div className="pdf-read"><button className="primary" onClick={start} disabled={busy||!source||!account.trim()}>{preview?'Relire le PDF':'Lire le PDF'}</button><small>10 Mo · 30 pages maximum</small></div>
    </div>
    <label className="check"><input type="checkbox" checked={forceOcr} disabled={busy} onChange={event=>setForceOcr(event.target.checked)}/>Forcer l’OCR si le texte du PDF est illisible (plus lent).</label>
    {!preview&&!busy&&<p className="hint">Vous pouvez d’abord essayer <a download href="/api/example-pdf">notre relevé PDF fictif</a>. Les documents protégés doivent être déverrouillés sur votre ordinateur.</p>}
    {status?.status==='reading'&&<div className="notice pdf-progress" role="status"><strong>{status.progress.stage}</strong><span>Votre document reste local. Vous pouvez fermer cette fenêtre pour annuler.</span></div>}
    {preview&&options&&<>
      <div className="preview-stats"><strong>{preview.pageCount} page(s) lue(s)</strong><span>{preview.rows.length} mouvements possibles</span><span>Total reconnu : {money(preview.totalCents)}</span><span>{preview.errorCount} erreur(s)</span><span>{preview.duplicateCount} doublon(s) potentiel(s)</span><span>{preview.methods.includes('ocr')?'OCR local utilisé':'Texte PDF'}</span></div>
      {preview.alreadyImported&&<p className="notice error">Ce PDF a déjà été importé pour ce compte.</p>}
      {preview.warnings.length>0&&<div className="notice warning"><ul>{preview.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></div>}
      <div className="pdf-workspace">
        <section className="pdf-document" aria-label="Document original">
          <div className="section-head"><h3>Comparer au document</h3><label>Zoom<select aria-label="Zoom du PDF" value={zoom} onChange={event=>setZoom(event.target.value)}><option value="fit">Largeur</option><option value="150">150 %</option><option value="200">200 %</option></select></label><label>Page<select aria-label="Page du PDF" value={pdfPage} onChange={event=>{setPdfPage(Number(event.target.value));imageBox.current?.scrollTo({top:0});}}>{Array.from({length:preview.pageCount},(_,i)=><option value={i+1} key={i+1}>{i+1}</option>)}</select></label></div>
          <div className={'pdf-image-scroll zoom-'+zoom} ref={imageBox}>
            <div className={'pdf-image '+(drawing?'drawing':'')}>
              <img src={'/api/pdf/jobs/'+jobId+'/page/'+pdfPage+'?mode='+mode} alt={'Page '+pdfPage+' du relevé bancaire original'}/>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Zones des colonnes du relevé" onClick={draw}>
                {zones.map(kind=><rect key={kind} x={layout[kind][0]} y="0" width={Math.max(0,layout[kind][1]-layout[kind][0])} height="100" className={'pdf-zone zone-'+kind}><title>{zoneLabels[kind]}</title></rect>)}
                {highlight?.page===pdfPage&&<rect x="0" y={highlight.top-.3} width="100" height="2" className="pdf-line-highlight"/>}
                {anchor!==null&&<line x1={anchor} y1="0" x2={anchor} y2="100" className="pdf-anchor"/>}
              </svg>
            </div>
          </div>
          <details className="pdf-columns" open={!layout.detected}>
            <summary>Ajuster les colonnes si nécessaire</summary>
            <p className="hint">Les zones colorées délimitent les colonnes. La date de valeur reste distincte de la date d’opération.</p>
            <label>Présentation des montants<select aria-label="Présentation des montants PDF" value={layout.mode} onChange={event=>change({layout:{...layout,mode:event.target.value as PdfLayout['mode'],detected:false}})}><option value="debitCredit">Débit et crédit séparés</option><option value="signed">Une colonne avec montants signés</option></select></label>
            <div className="pdf-zone-picker"><select aria-label="Colonne à tracer" value={zone} onChange={event=>setZone(event.target.value as Zone)}>{zones.map(kind=><option key={kind} value={kind}>{zoneLabels[kind]}</option>)}</select><button onClick={()=>{setDrawing(!drawing);setAnchor(null);}}>{drawing?'Annuler le tracé':'Tracer cette colonne'}</button></div>
            {drawing&&<p role="status">Cliquez sur le bord gauche de la colonne, puis sur son bord droit dans l’image.</p>}
            {zones.map(kind=><div className={'pdf-zone-fields zone-label-'+kind} key={kind}><span>{zoneLabels[kind]}</span><label>De (%)<input aria-label={'Début zone '+kind} type="number" min="0" max="100" step=".1" value={Math.round(layout[kind][0]*10)/10} onChange={event=>range(kind,0,Number(event.target.value))}/></label><label>À (%)<input aria-label={'Fin zone '+kind} type="number" min="0" max="100" step=".1" value={Math.round(layout[kind][1]*10)/10} onChange={event=>range(kind,1,Number(event.target.value))}/></label></div>)}
          </details>
        </section>
        <section className="pdf-review" aria-label="Mouvements reconnus">
          <h3>Vérifier les mouvements reconnus</h3>
          <div className="form-grid pdf-dates">
            <label>Année du relevé<input aria-label="Année du relevé PDF" type="number" min="1900" max="2200" value={options.year??''} placeholder="AAAA" onChange={event=>change({year:event.target.value===''?null:Number(event.target.value)})}/></label>
            <label>Début du relevé<input aria-label="Début du relevé PDF" type="date" value={options.periodStart??''} onChange={event=>change({periodStart:event.target.value})}/></label>
            <label>Fin du relevé<input aria-label="Fin du relevé PDF" type="date" value={options.periodEnd??''} onChange={event=>change({periodEnd:event.target.value})}/></label>
          </div>
          <div className="form-grid pdf-balances"><label>Solde de début<MoneyInput label="Solde de début PDF" value={options.openingBalanceCents??null} nullable onChange={n=>change({openingBalanceCents:n})}/></label><label>Solde de fin<MoneyInput label="Solde de fin PDF" value={options.closingBalanceCents??null} nullable onChange={n=>change({closingBalanceCents:n})}/></label></div>
          {preview.balanceDifference===null?<p className="hint">{preview.balanceDetected?'Soldes repérés : complétez les deux valeurs pour contrôler le relevé.':'Renseignez les soldes si votre relevé en comporte.'}</p>:<p className={preview.balanceDifference===0?'notice success':'notice error'}>Écart entre les soldes et les mouvements : <strong>{money(preview.balanceDifference)}</strong></p>}
          <button disabled={busy} onClick={()=>rebuild(options)}>Actualiser l’aperçu PDF et les corrections</button>
          {dirty&&<p className="warning-text" role="status">Vos modifications doivent être réanalysées avant l’import.</p>}
          <p className="hint">Montant négatif = débit bancaire ; positif = crédit. Cliquez sur une référence de page pour retrouver la ligne dans le PDF.</p>
          <div className="table-scroll pdf-rows"><table><thead><tr><th>Inclure</th><th>Source</th><th>Date</th><th>Libellé</th><th>Montant signé</th><th>Contrôle</th></tr></thead><tbody>{rows.map(row=>{
            const rowEdit=options.edits?.find(edit=>edit.line===row.line);
            return <tr key={row.line}><td><input aria-label={'Importer mouvement PDF '+row.line} type="checkbox" disabled={!!row.error||busy||dirty} checked={selected.includes(row.line)} onChange={event=>{setSelected(event.target.checked?[...selected,row.line]:selected.filter(id=>id!==row.line));setReviewed(false);}}/></td>
              <td><button className="pdf-source" onClick={()=>locate(row)}>p. {row.page}<small>ligne {row.pageLine}</small></button>{row.method==='ocr'&&<small>OCR</small>}<button className="pdf-ignore" disabled={busy} onClick={()=>rebuild({...options,excludedLines:[...(options.excludedLines??[]),row.line],extraLines:options.extraLines?.filter(id=>id!==row.line)})}>Ignorer</button></td>
              <td><input aria-label={'Date mouvement PDF '+row.line} value={rowEdit?.date??row.date} onChange={event=>editRow('date',event.target.value)}/></td>
              <td><input aria-label={'Libellé mouvement PDF '+row.line} value={rowEdit?.label??row.label} onChange={event=>editRow('label',event.target.value)}/></td>
              <td><input aria-label={'Montant mouvement PDF '+row.line} value={rowEdit?.amount??row.amountText} onChange={event=>editRow('amount',event.target.value)}/></td>
              <td><span className={row.error?'error-text':row.duplicate||row.warnings.length?'warning-text':'pdf-ready'}>{row.error??(row.duplicate?'Doublon à décider':row.warnings.length?'À comparer au PDF':'Lu')}</span>{row.warnings.map((warning,index)=><small key={index}>{warning}</small>)}</td></tr>;
            function editRow(field:'date'|'label'|'amount',value:string){edit(row,field,value);}
          })}</tbody></table></div>
          {preview.rows.length>30&&<div className="pagination"><button disabled={tablePage===0} onClick={()=>setTablePage(tablePage-1)}>Précédent</button><span>{tablePage+1} / {Math.ceil(preview.rows.length/30)}</span><button disabled={(tablePage+1)*30>=preview.rows.length} onClick={()=>setTablePage(tablePage+1)}>Suivant</button></div>}
        </section>
      </div>
      <details className="pdf-ignored"><summary>Voir les {preview.ignored.length} lignes non importées automatiquement (en-têtes, soldes et autres textes)</summary><p>Contrôlez qu’aucun mouvement n’a été oublié. Vous pouvez transformer une ligne en mouvement puis corriger ses champs.</p><ul>{preview.ignored.map(line=><li key={line.id}><span><strong>p. {line.page} · l. {line.line} · {line.kind}</strong><br/>{line.text}</span><button disabled={busy} onClick={()=>rebuild({...options,extraLines:[...new Set([...(options.extraLines??[]),line.id])],excludedLines:options.excludedLines?.filter(id=>id!==line.id)})}>Ajouter comme mouvement</button></li>)}</ul></details>
      {preview.errorCount>0&&<label className="check"><input type="checkbox" checked={acceptRejected} onChange={event=>setAcceptRejected(event.target.checked)}/>J’accepte l’exclusion des {preview.errorCount} lignes invalides signalées.</label>}
      {selectedDuplicates&&<label className="check"><input type="checkbox" checked={duplicates} onChange={event=>setDuplicates(event.target.checked)}/>Je confirme que les doublons sélectionnés correspondent à des mouvements distincts.</label>}
      <label className="check pdf-confirm"><input type="checkbox" checked={reviewed} disabled={dirty||busy} onChange={event=>setReviewed(event.target.checked)}/>J’ai comparé les lignes sélectionnées, les lignes ignorées, les dates, les signes et les totaux avec le PDF d’origine.</label>
      <div className="modal-actions"><span>{selected.length} mouvement(s) sélectionné(s) · total sélectionné {money(sumCents(preview.rows.filter(row=>selected.includes(row.line)).map(row=>row.cents)))}</span><button onClick={onClose}>Fermer</button><button className="primary" onClick={commit} disabled={busy||dirty||!reviewed||!selected.length||preview.alreadyImported||balanceBlocked||preview.errorCount>0&&!acceptRejected||!!selectedDuplicates&&!duplicates}>Importer {selected.length} mouvements PDF</button></div>
      <p className="hint">Les mouvements importés resteront « à vérifier » pour la qualification fiscale. La lecture du relevé ne confirme pas la TVA.</p>
    </>}
  </Modal>;
}
