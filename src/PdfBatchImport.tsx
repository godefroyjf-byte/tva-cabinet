import React,{useRef,useState} from 'react';
import {PdfReview} from './PdfImport.tsx';
import {Modal,errorText,type Mode} from './ui.tsx';

type Item={id:string;file:File;status:'waiting'|'active'|'imported'|'skipped'|'error';error:string;invalid:boolean;count:number};
export function PdfImportDialog({mode,accounts,onClose,onImported,onDone}:{mode:Mode;accounts:string[];onClose:()=>void;onImported:()=>Promise<void>;onDone:(count:number)=>Promise<void>}) {
  const [items,setItems]=useState<Item[]>([]),[activeId,setActiveId]=useState(''),[autoRead,setAutoRead]=useState(false);
  const [account,setAccount]=useState(accounts[0]??'Société Générale'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
  const [saving,setSaving]=useState(false);
  const closing=useRef(false),mounted=useRef(true);
  React.useEffect(()=>()=>{mounted.current=false;},[]);
  const active=items.find(item=>item.id===activeId);
  const imported=items.filter(item=>item.status==='imported'),total=imported.reduce((sum,item)=>sum+item.count,0);
  const finished=items.length>0&&!active&&items.every(item=>item.status!=='waiting');
  function add(files:File[]) {
    if(!files.length)return;
    setError('');setDragging(false);
    if(items.length+files.length>20){setError('Sélectionnez au maximum 20 fichiers par lot. Aucun nouveau fichier n’a été ajouté.');return;}
    if(items.reduce((sum,item)=>sum+item.file.size,0)+files.reduce((sum,file)=>sum+file.size,0)>50_000_000){setError('Le lot dépasse 50 Mo. Ajoutez moins de fichiers à la fois. Aucun nouveau fichier n’a été ajouté.');return;}
    const added=files.map(file=>{
      const error=!file.name.toLowerCase().endsWith('.pdf')?'Choisissez un fichier PDF.':file.size>10_000_000?'Ce PDF dépasse 10 Mo.':file.size===0?'Ce fichier est vide.':'';
      return {id:crypto.randomUUID(),file,status:error?'error' as const:'waiting' as const,error,invalid:!!error,count:0};
    });
    const updated=[...items,...added];
    const next=!active?updated.find(item=>item.status==='waiting'):undefined;
    if(next){setActiveId(next.id);setAutoRead(false);}
    setItems(updated.map(item=>item.id===next?.id?{...item,status:'active'}:item));
  }
  function advance(updated:Item[],automatic:boolean) {
    const next=updated.find(item=>item.status==='waiting');
    if(next){setActiveId(next.id);setAutoRead(automatic);}else setActiveId('');
    setItems(updated.map(item=>item.id===next?.id?{...item,status:'active'}:item));setBusy(false);
  }
  async function saved(count:number) {
    const updated=items.map(item=>item.id===activeId?{...item,status:'imported' as const,count,error:''}:item);
    const sum=updated.reduce((total,item)=>total+item.count,0);
    if(updated.length===1){setItems(updated);setActiveId('');setBusy(false);await onDone(sum);return;}
    setItems(updated);
    try{await onImported();}catch(e){if(mounted.current)setError('Le fichier a été importé, mais le tableau doit être rechargé : '+errorText(e));}
    finally{if(mounted.current)advance(updated,true);}
  }
  function skip() {
    advance(items.map(item=>item.id===activeId?{...item,status:item.error?'error' as const:'skipped' as const}:item),true);
  }
  async function close() {
    if(saving)return;
    if(closing.current)return;
    closing.current=true;
    try{if(total>0)await onDone(total);else onClose();}catch(e){setError(errorText(e));closing.current=false;}
  }
  function retry(id:string) {
    setItems(items.map(item=>item.id===id?{...item,status:'active',error:''}:item));setActiveId(id);setAutoRead(true);setError('');
  }
  return <Modal title="Importer des relevés PDF" wide canClose={!saving} onClose={()=>void close()}>
    <p>Sélectionnez plusieurs relevés ou déposez-les ci-dessous. Ils sont lus et vérifiés l’un après l’autre. <strong>Aucun document n’est envoyé à un service externe.</strong></p>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <div className="pdf-batch-upload">
      <label>Compte bancaire<input aria-label="Compte bancaire PDF" list="pdf-accounts" disabled={busy} value={account} maxLength={100} onChange={event=>setAccount(event.target.value)}/><datalist id="pdf-accounts">{accounts.map(a=><option key={a}>{a}</option>)}</datalist></label>
      <div className={'pdf-dropzone '+(dragging?'dragging':'')} onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!busy)add(Array.from(event.dataTransfer.files));else setError('Une lecture ou un enregistrement est en cours. Attendez la fin de cette étape pour ajouter des fichiers.');}}>
        <label>Relevés PDF<input aria-label="Relevé PDF" type="file" multiple accept=".pdf,application/pdf" disabled={busy} onChange={event=>{add(Array.from(event.target.files??[]));event.target.value='';}}/></label>
        <p>Glissez-déposez vos PDF ici, ou sélectionnez plusieurs fichiers avec Ctrl ou Maj.</p><small>20 fichiers · 50 Mo par lot · 10 Mo et 30 pages par PDF</small>
      </div>
    </div>
    {items.length>0&&<section className="pdf-batch-list" aria-label="Fichiers du lot"><h3>{items.length} fichier(s) dans le lot</h3><ol>{items.map((item,index)=><li key={item.id} className={'batch-'+item.status} aria-current={item.id===activeId?'step':undefined}>
      <span className="batch-number">{index+1}</span><div><strong>{item.file.name}</strong><span>{item.status==='imported'?item.count+' mouvement(s) importé(s)':item.status==='active'?busy?'Lecture ou enregistrement en cours':'À vérifier':item.status==='error'?'Erreur : '+item.error:item.status==='skipped'?'Passé sans import':'En attente'}</span>{item.status==='active'&&item.error&&<small className="error-text">{item.error}</small>}</div>
      {(item.status==='waiting'||item.status==='error'&&!active)&&<button disabled={busy} onClick={()=>setItems(items.map(value=>value.id===item.id?{...value,status:'skipped'}:value))}>Retirer</button>}
      {!active&&item.status==='error'&&!item.invalid&&<button onClick={()=>retry(item.id)}>Réessayer</button>}
    </li>)}</ol></section>}
    {active&&<><div className="batch-current"><h3>Relevé {items.indexOf(active)+1} sur {items.length} · {active.file.name}</h3><button disabled={busy} onClick={skip}>Passer ce fichier</button></div>
      <PdfReview key={active.id} mode={mode} file={active.file} account={account} autoRead={autoRead} onBusyChange={setBusy} onSavingChange={setSaving} onFailure={message=>setItems(values=>values.map(item=>item.id===activeId?{...item,error:message}:item))} onClose={()=>void close()} onDone={saved}/>
    </>}
    {finished&&<div className="notice batch-result" role="status"><strong>Lot terminé : {imported.length} fichier(s) importé(s), {total} mouvement(s).</strong><span>{items.filter(item=>item.status==='error').length} fichier(s) en erreur · {items.filter(item=>item.status==='skipped').length} fichier(s) passé(s) sans import.</span><p>Les fichiers déjà importés sont conservés. Vous pouvez ajouter d’autres PDF ou terminer.</p><button className="primary" onClick={()=>void close()}>Terminer</button></div>}
    {!active&&!finished&&<p className="hint">Les PDF texte et les scans lisibles sont pris en charge. Chaque document garde ses soldes, son original et ses contrôles de doublons.</p>}
    {items.length>1&&<p className="hint">Chaque import est enregistré séparément après votre confirmation. Fermer cette fenêtre annule la lecture en cours ; les imports déjà enregistrés restent conservés.</p>}
  </Modal>;
}
