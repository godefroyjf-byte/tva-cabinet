import { readFileSync } from 'node:fs';
import { extractPdf } from '../server/pdf-extract.ts';
import { previewPdf } from '../server/pdf-preview.ts';
const result=await extractPdf(new Uint8Array(readFileSync('examples/releve-fictif-scan.pdf')));
const p=previewPdf(result.document,{jobId:'00000000-0000-4000-8000-000000000000',account:'Fictif'},[]);
console.log(JSON.stringify({methods:p.methods,rows:p.rows.map(row=>row.cents),errors:p.errorCount,balance:p.balanceDifference,warnings:p.warnings}));
