import { parentPort,workerData } from 'node:worker_threads';
import { extractPdf } from './pdf-extract.ts';
try {
  const {base64,forceOcr}=workerData as {base64:string;forceOcr:boolean};
  const result=await extractPdf(new Uint8Array(Buffer.from(base64,'base64')),forceOcr,progress=>parentPort?.postMessage({type:'progress',progress}));
  parentPort?.postMessage({type:'result',...result});
} catch(error) {
  const message=error instanceof Error?error.message:'Lecture du PDF impossible.';
  parentPort?.postMessage({type:'error',error:message.slice(0,350)});
} finally {parentPort?.close();}
