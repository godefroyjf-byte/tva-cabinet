import { Worker } from 'node:worker_threads';
import { createHash,randomUUID } from 'node:crypto';
import { pdfUploadSchema,type PdfDocument,type PdfProgress } from '../shared/pdf.ts';
import { suggestPdfOptions } from './pdf-preview.ts';

export type PdfJob={
  id:string;mode:'real'|'demo';filename:string;base64:string;hash:string;
  status:'reading'|'ready'|'error';progress:PdfProgress;error?:string;
  document?:PdfDocument;images:Record<number,Uint8Array>;worker?:Worker;timer?:ReturnType<typeof setTimeout>;expires:number;
};
export class PdfJobs {
  jobs=new Map<string,PdfJob>();
  start(input:unknown,mode:'real'|'demo') {
    this.prune();
    if([...this.jobs.values()].some(j=>j.status==='reading'))throw new Error('Une lecture PDF est déjà en cours. Attendez sa fin ou annulez-la.');
    const request=pdfUploadSchema.parse(input);
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.base64))throw new Error('Encodage du fichier invalide.');
    const bytes=Buffer.from(request.base64,'base64');
    if(bytes.length>10_000_000||bytes.length<8)throw new Error('Choisissez un PDF de 10 Mo maximum.');
    if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('Ce fichier ne contient pas de document PDF valide.');
    while(this.jobs.size>=3)this.remove(this.jobs.keys().next().value!);
    const id=randomUUID();
    const job:PdfJob={id,mode,filename:request.filename,base64:request.base64,hash:createHash('sha256').update(bytes).digest('hex'),
      status:'reading',progress:{page:0,total:0,stage:'Ouverture du PDF…'},images:{},expires:Date.now()+15*60_000};
    const worker=new Worker(new URL('./pdf-worker.ts',import.meta.url),{workerData:request,resourceLimits:{maxOldGenerationSizeMb:512}});
    job.worker=worker;this.jobs.set(id,job);
    const fail=(message:string)=>{
      if(job.status!=='reading')return;
      job.status='error';job.error=message;
      if(job.timer)clearTimeout(job.timer);
      void worker.terminate();
      job.worker=undefined;
    };
    job.timer=setTimeout(()=>fail('La lecture a dépassé trois minutes. Séparez le PDF en relevés plus courts.'),180_000);
    job.timer.unref();
    worker.on('message',(message:{type:string;progress?:PdfProgress;document?:PdfDocument;images?:Record<number,Uint8Array>;error?:string})=>{
      if(job.status!=='reading')return;
      if(message.type==='progress'&&message.progress)job.progress=message.progress;
      if(message.type==='error')fail(message.error??'Ce PDF ne peut pas être lu.');
      if(message.type==='result'&&message.document&&message.images) {
        job.document=message.document;job.images=message.images;job.status='ready';
        if(job.timer)clearTimeout(job.timer);
        job.worker=undefined;
      }
    });
    worker.on('error',()=>fail('La lecture de ce PDF a échoué. Le document peut être endommagé ou trop complexe.'));
    worker.on('exit',code=>{if(code!==0)fail('La lecture du PDF a été interrompue.');});
    return {jobId:id};
  }
  get(id:string,mode:'real'|'demo') {
    this.prune();
    const job=this.jobs.get(id);
    if(!job||job.mode!==mode)throw new Error('Cet aperçu PDF a expiré. Sélectionnez à nouveau le fichier.');
    job.expires=Date.now()+15*60_000;
    return job;
  }
  ready(id:string,mode:'real'|'demo') {
    const job=this.get(id,mode);
    if(job.status==='error')throw new Error(job.error);
    if(job.status!=='ready'||!job.document)throw new Error('La lecture du PDF est encore en cours.');
    return job as PdfJob & {document:PdfDocument};
  }
  status(id:string,mode:'real'|'demo') {
    const job=this.get(id,mode);
    return {jobId:id,status:job.status,progress:job.progress,error:job.error,
      pages:job.document?.pages.map(({number,width,height,method})=>({number,width,height,method})),
      suggested:job.document?suggestPdfOptions(job.document):undefined};
  }
  remove(id:string) {
    const job=this.jobs.get(id);if(!job)return;
    if(job.timer)clearTimeout(job.timer);
    if(job.worker)void job.worker.terminate();
    this.jobs.delete(id);
  }
  prune() {for(const job of this.jobs.values())if(job.expires<Date.now())this.remove(job.id);}
  close() {for(const id of [...this.jobs.keys()])this.remove(id);}
}
