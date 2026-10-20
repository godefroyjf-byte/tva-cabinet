import { createCanvas } from '@napi-rs/canvas';
import { createWorker,PSM,type Worker as OcrWorker } from 'tesseract.js';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument,OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfDocument,PdfLine,PdfProgress,PdfWord } from '../shared/pdf.ts';

const pdfDirectory=dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const languageDirectory=dirname(fileURLToPath(import.meta.resolve('@tesseract.js-data/fra/package.json')));
export function pdfResourcePaths(directory:string) {
  // PDF.js exige des chemins locaux terminés par « / », même sous Windows.
  const root=directory.replaceAll('\\','/').replace(/\/+$/,'');
  return {standardFontDataUrl:root+'/standard_fonts/',cMapUrl:root+'/cmaps/',wasmUrl:root+'/wasm/'};
}
function groupWords(words:PdfWord[],page:number,method:'text'|'ocr'):PdfLine[] {
  const groups:PdfWord[][]=[];
  for(const word of words.sort((a,b)=>a.top-b.top||a.left-b.left)) {
    if(!word.text.trim())continue;
    const previous=groups.at(-1);
    if(previous&&Math.abs(previous[0].top-word.top)<=Math.max(.22,Math.min(previous[0].height,word.height)*.55))previous.push(word);
    else groups.push([word]);
  }
  return groups.map((group,index)=>{
    group.sort((a,b)=>a.left-b.left);
    return {id:0,page,line:index+1,text:group.map(w=>w.text).join(' '),top:Math.min(...group.map(w=>w.top)),
      height:Math.max(...group.map(w=>w.height)),method,confidence:Math.min(...group.map(w=>w.confidence)),words:group};
  });
}
export async function extractPdf(bytes:Uint8Array,forceOcr=false,onProgress:(progress:PdfProgress)=>void=()=>{}) {
  const task=getDocument({data:bytes,enableXfa:false,useWorkerFetch:false,disableFontFace:true,useSystemFonts:false,
    verbosity:0,stopAtErrors:true,maxImageSize:16_000_000,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,
    ...pdfResourcePaths(pdfDirectory),cMapPacked:true});
  let document:Awaited<typeof task.promise>|undefined,ocr:OcrWorker|undefined;
  const result:PdfDocument={pages:[],warnings:[]},images:Record<number,Uint8Array>={};
  let imageBytes=0,nextId=1;
  try {
    document=await task.promise;
    if(document.numPages>30)throw new Error('Le PDF dépasse 30 pages. Séparez le relevé en documents plus courts.');
    for(let n=1;n<=document.numPages;n++) {
      onProgress({page:n,total:document.numPages,stage:'Lecture de la page '+n+' sur '+document.numPages});
      const page=await document.getPage(n),viewport=page.getViewport({scale:1});
      const content=await page.getTextContent();
      const words:PdfWord[]=[];
      for(const item of content.items) {
        if(!('str' in item)||!item.str.trim())continue;
        const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const height=Math.max(1,Math.abs(item.height)),width=Math.max(1,item.width);
        for(const match of item.str.matchAll(/\S+/g)) {
          const start=(match.index??0)/item.str.length,end=((match.index??0)+match[0].length)/item.str.length;
          words.push({text:match[0],left:100*(x+start*width)/viewport.width,right:100*(x+end*width)/viewport.width,
            top:100*(y-height)/viewport.height,height:100*height/viewport.height,confidence:100});
        }
      }
      const nativeLines=groupWords(words,n,'text');
      const hasTransactions=nativeLines.some(line=>/^\s*\d{1,2}[/.]\d{1,2}/.test(line.text)&&/\d[,.]\d{2}\s*(?:D|C|CR|DR)?\s*$/.test(line.text));
      const operators=await page.getOperatorList();
      const hasImages=operators.fnArray.some(op=>op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject||op===OPS.paintImageMaskXObject);
      const scanned=forceOcr||words.map(w=>w.text).join('').length<20||hasImages&&!hasTransactions;
      const scale=Math.min(2.5,Math.sqrt(12_000_000/(viewport.width*viewport.height)),4500/Math.max(viewport.width,viewport.height));
      const renderViewport=page.getViewport({scale});
      const canvas=createCanvas(Math.ceil(renderViewport.width),Math.ceil(renderViewport.height));
      await page.render({canvas:canvas as unknown as HTMLCanvasElement,canvasContext:canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
        viewport:renderViewport,annotationMode:0}).promise;
      const png=canvas.toBuffer('image/png');
      imageBytes+=png.byteLength;
      if(imageBytes>25_000_000)throw new Error('Les aperçus de ce PDF sont trop volumineux. Séparez le relevé en documents plus courts.');
      images[n]=png;
      let lines:PdfLine[],method:'text'|'ocr'='text';
      if(scanned) {
        method='ocr';
        onProgress({page:n,total:document.numPages,stage:'Reconnaissance locale de la page scannée '+n+' sur '+document.numPages});
        if(!ocr) {
          // Chemin de modèle local explicite ; Node lit le fichier fourni par npm, sans CDN.
          ocr=await createWorker('fra',1,{cacheMethod:'none',langPath:join(languageDirectory,'4.0.0_best_int'),gzip:true,errorHandler:()=>{}});
          await ocr.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:'180'});
        }
        const recognized=await ocr.recognize(png,{}, {text:true,blocks:true});
        const ocrWords:PdfWord[]=[];
        for(const block of recognized.data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines)for(const word of line.words) {
          ocrWords.push({text:word.text,left:100*word.bbox.x0/canvas.width,right:100*word.bbox.x1/canvas.width,
            top:100*word.bbox.y0/canvas.height,height:100*(word.bbox.y1-word.bbox.y0)/canvas.height,confidence:Number.isFinite(word.confidence)?Math.max(0,Math.min(100,word.confidence)):0});
        }
        lines=groupWords(ocrWords,n,'ocr');
        result.warnings.push('Page '+n+' lue par OCR local : comparez les montants et les dates au document.');
      } else lines=nativeLines;
      for(const line of lines) {
        if(line.text.length>10000)throw new Error('Une ligne du PDF dépasse la taille autorisée.');
        line.id=nextId++;
      }
      if(nextId>20001)throw new Error('Le PDF contient trop de lignes de texte.');
      if(!lines.length)result.warnings.push('Aucun texte reconnu à la page '+n+'. Ne confirmez pas un import incomplet.');
      result.pages.push({number:n,width:viewport.width,height:viewport.height,method,lines});
      canvas.width=1;canvas.height=1;
      page.cleanup();
    }
    return {document:result,images};
  } catch(e) {
    if((e as Error).name==='PasswordException')throw new Error('Ce PDF est protégé par un mot de passe. Déverrouillez-le sur votre ordinateur avant de l’importer.');
    if((e as Error).name==='InvalidPDFException')throw new Error('Ce fichier n’est pas un PDF valide ou il est endommagé.');
    throw e;
  } finally {
    if(ocr)await ocr.terminate();
    await task.destroy();
  }
}
