import { fingerprint,parseDate } from './csv.ts';
import { dateSchema,inputMoney,parseMoney,sumCents,type Operation } from '../shared/model.ts';
import { defaultPdfLayout,pdfLayoutSchema,pdfRequestSchema,type PdfDocument,type PdfLayout,type PdfLine,type PdfRequest } from '../shared/pdf.ts';

const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const datePattern=/^\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?$/;
const moneyPattern=/(?<![\d/.,])[+\-−]?(?:\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d+)[,.]\d{2}(?:\s*(?:CR|DR|D|C))?(?![\d/.,])/gi;
export function parsePdfMoney(text:string):number {
  let value=text.trim().replace(/€/g,'').replace(/\bEUR\b/gi,'').trim();
  const marker=/(?:\s*)(CR|DR|D|C)$/i.exec(value)?.[1].toUpperCase();
  if(marker)value=value.replace(/(?:\s*)(?:CR|DR|D|C)$/i,'').trim();
  if(/-$/.test(value))value='-'+value.slice(0,-1);
  if(/^[+-]?\d{1,3}(?:\.\d{3})+,\d{2}$/.test(value))value=value.replace(/\./g,'');
  let cents=parseMoney(value);
  if(marker==='D'||marker==='DR')cents=-Math.abs(cents);
  if(marker==='C'||marker==='CR')cents=Math.abs(cents);
  return cents;
}
function textIn(line:PdfLine,range:[number,number]) {
  return line.words.filter(w=>(w.left+w.right)/2>=range[0]&&(w.left+w.right)/2<range[1])
    .sort((a,b)=>a.left-b.left).map(w=>w.text).join(' ').trim();
}
function balanceKind(text:string):'opening'|'closing'|null {
  const n=normalize(text).replace(/^\s*\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\s*/,'').trim();
  if(/^(?:solde (?:precedent|initial|anterieur|debut)|ancien solde|report du solde)/.test(n))return 'opening';
  if(/^(?:nouveau solde|solde (?:final|fin|au|crediteur|debiteur))/.test(n))return 'closing';
  return null;
}
function isHeader(line:PdfLine) {
  const n=normalize(line.text);
  return /(?:date|nature|libelle)/.test(n)&&(/debit/.test(n)&&/credit/.test(n)||/\bmontant\b/.test(n));
}
function isFooter(line:PdfLine) {
  return /^(?:page\s+\d|suite\s+(?:au|de)|total\s+(?:des|debit|credit)|totaux|sous[- ]total)/i.test(normalize(line.text).trim());
}
export function suggestPdfOptions(document:PdfDocument) {
  const lines=document.pages.flatMap(p=>p.lines);
  const header=lines.find(isHeader);
  let layout=structuredClone(defaultPdfLayout);
  if(header) {
    const words=lines.filter(line=>line.page===header.page&&Math.abs(line.top-header.top)<Math.max(header.height*1.8,2.4)).flatMap(line=>line.words).sort((a,b)=>a.left-b.left);
    const find=(re:RegExp)=>words.find(w=>re.test(normalize(w.text)));
    const date=find(/^date/),valueDate=find(/^valeur$/),label=find(/^(?:nature|libelle|description)$/)??words.find(word=>/^operations?$/.test(normalize(word.text))&&word.left>(date?.left??0)+12),debit=find(/^debit/),credit=find(/^credit/),amount=find(/^montant/),balance=find(/^solde/);
    const start=(x:number)=>Math.max(0,x-1.5);
    if(date&&label&&(debit&&credit||amount)) {
      const firstMoney=Math.min(debit?.left??100,credit?.left??100,amount?.left??100);
      const proposed={...layout,detected:true,mode:debit&&credit?'debitCredit':'signed',
        date:[start(date.left),Math.min(label.left-1,valueDate?start(valueDate.left):100,date.left+13)],
        label:[start(label.left),start(firstMoney)],
        debit:debit?[start(debit.left),start(credit?.left??balance?.left??99.5)]:layout.debit,
        credit:credit?[start(credit.left),start(balance?.left??99.5)]:layout.credit,
        amount:amount?[start(amount.left),start(balance?.left??99.5)]:layout.amount};
      const checked=pdfLayoutSchema.safeParse(proposed);if(checked.success)layout=checked.data;
    }
  }
  const fullText=lines.map(l=>l.text).join('\n');
  const period=/(?:du|periode\s*:?|période\s*:?)\s*(\d{2}[/.]\d{2}[/.]\d{4})\s*(?:au|a|à|-)\s*(\d{2}[/.]\d{2}[/.]\d{4})/i.exec(fullText);
  let periodStart='',periodEnd='';
  if(period)try{periodStart=parseDate(period[1]);periodEnd=parseDate(period[2]);}catch{}
  const balances:{opening:number|null;closing:number|null}={opening:null,closing:null};
  const balanceProblems:string[]=[];
  const firstMovement=lines.findIndex(line=>/^\s*\d{1,2}[/.]\d{1,2}/.test(line.text));
  for(const [index,line] of lines.entries()) {
    let kind=balanceKind(line.text);if(!kind)continue;
    if(kind==='closing'&&firstMovement>=0&&index<firstMovement&&!/nouveau|final|\bfin\b/.test(normalize(line.text)))kind='opening';
    const candidates=[...line.text.matchAll(moneyPattern)];
    if(candidates.length!==1){balanceProblems.push('Solde ambigu à la page '+line.page+', ligne '+line.line+'.');continue;}
    try {
      let value=parsePdfMoney(candidates[0][0]);
      if(/\bdebiteur\b/i.test(normalize(line.text)))value=-Math.abs(value);
      if(balances[kind]!==null&&balances[kind]!==value) {
        balanceProblems.push('Plusieurs soldes '+(kind==='opening'?'de début':'de fin')+' différents : vérifiez les valeurs.');
        balances[kind]=null;
      } else balances[kind]=value;
    } catch {balanceProblems.push('Solde illisible à la page '+line.page+'.');}
  }
  return {layout,year:periodEnd?Number(periodEnd.slice(0,4)):null,periodStart,periodEnd,openingBalanceCents:balances.opening,closingBalanceCents:balances.closing,balanceDetected:lines.some(l=>balanceKind(l.text)),balanceProblems};
}
function pdfDate(text:string,year:number|null,start:string,end:string) {
  const compact=text.trim().replace(/\s*([/.])\s*/g,'$1');
  const short=/^(\d{1,2})[/.](\d{1,2})$/.exec(compact);
  if(short) {
    if(year===null)throw new Error('L’année manque : renseignez l’année du relevé.');
    const make=(y:number)=>String(y)+'-'+short[2].padStart(2,'0')+'-'+short[1].padStart(2,'0');
    const candidates=[year-1,year,year+1].map(make).filter(v=>dateSchema.safeParse(v).success&&(!start||v>=start)&&(!end||v<=end));
    if(start&&end&&candidates.length===1)return candidates[0];
    return dateSchema.parse(make(year));
  }
  const two=/^(\d{2})[/.](\d{2})[/.](\d{2})$/.exec(compact);
  return parseDate(two?two[1]+'/'+two[2]+'/20'+two[3]:compact);
}
export function previewPdf(document:PdfDocument,input:PdfRequest,existing:Operation[]) {
  const parsed=pdfRequestSchema.parse(input),suggested=suggestPdfOptions(document);
  const {balanceDetected:_balanceDetected,balanceProblems:_balanceProblems,...defaults}=suggested;
  const options={...defaults,...parsed,layout:parsed.layout??suggested.layout,year:parsed.year===undefined?suggested.year:parsed.year,
    periodStart:parsed.periodStart??suggested.periodStart,periodEnd:parsed.periodEnd??suggested.periodEnd,
    openingBalanceCents:parsed.openingBalanceCents===undefined?suggested.openingBalanceCents:parsed.openingBalanceCents,
    closingBalanceCents:parsed.closingBalanceCents===undefined?suggested.closingBalanceCents:parsed.closingBalanceCents};
  if(options.periodStart&&options.periodEnd&&options.periodStart>options.periodEnd)throw new Error('La période du relevé est inversée.');
  const edits=new Map(options.edits.map(e=>[e.line,e])),extra=new Set(options.extraLines);
  const excluded=new Set(options.excludedLines);
  const all=document.pages.flatMap(p=>p.lines);
  const seen=new Set(existing.map(o=>fingerprint(o.account,o.date,o.label,o.cents)));
  const consumed=new Set<number>();
  const rows:{line:number;page:number;pageLine:number;top:number;raw:string[];sourceRefs:{page:number;line:number}[];date:string;label:string;cents:number;amountText:string;error:string|null;duplicate:boolean;method:'text'|'ocr';warnings:string[]}[]=[];
  for(let index=0;index<all.length;index++) {
    const line=all[index];
    if(consumed.has(line.id))continue;
    if(excluded.has(line.id))continue;
    if(!extra.has(line.id)&&(isHeader(line)||balanceKind(line.text)||isFooter(line)))continue;
    const read=(l:PdfLine)=>({date:textIn(l,options.layout.date),label:textIn(l,options.layout.label),debit:textIn(l,options.layout.debit),credit:textIn(l,options.layout.credit),amount:textIn(l,options.layout.amount)});
    const cells=read(line);
    const dateLike=datePattern.test(cells.date.replace(/\s*([/.])\s*/g,'$1'));
    const beginsDate=/^\s*\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?(?:\s|$)/.test(line.text);
    if(!extra.has(line.id)&&!dateLike&&!beginsDate)continue;
    const source=[line],warnings:string[]=[];
    let label=cells.label;
    let debit=cells.debit,credit=cells.credit,amount=cells.amount;
    // Les suites proches prolongent le libellé ; un montant sur la ligne suivante est conservé.
    let last=line;
    for(let offset=1;offset<=4&&index+offset<all.length;offset++) {
      const next=all[index+offset];
      if(excluded.has(next.id))break;
      if(next.page!==line.page||next.top-last.top>Math.max(last.height*2.6,2.8)||isHeader(next)||balanceKind(next.text)||isFooter(next))break;
      const c=read(next);
      if(c.date||/^\s*\d{1,2}[/.]\d{1,2}/.test(next.text)||!c.label)break;
      const hasMoney=options.layout.mode==='signed'?!!c.amount:!!c.debit||!!c.credit;
      const alreadyMoney=options.layout.mode==='signed'?!!amount:!!debit||!!credit;
      if(hasMoney&&alreadyMoney)break;
      label+=' '+c.label;source.push(next);consumed.add(next.id);last=next;
      if(hasMoney){debit=c.debit;credit=c.credit;amount=c.amount;}
    }
    const edit=edits.get(line.id);
    let date=edit?.date??cells.date;
    label=(edit?.label??label).trim();
    let cents=0,amountText=edit?.amount??(options.layout.mode==='signed'?amount:debit&&credit?'Débit '+debit+' / Crédit '+credit:debit?'-'+debit:credit),error:string|null=null;
    try {
      if(edit)cents=parsePdfMoney(edit.amount);
      else if(options.layout.mode==='signed') {
        if(!amount)throw new Error('Montant absent : vérifiez les colonnes ou corrigez cette ligne.');
        cents=parsePdfMoney(amount);
      } else {
        if(!debit&&!credit)throw new Error('Montant absent : vérifiez les colonnes ou corrigez cette ligne.');
        const d=debit?parsePdfMoney(debit):0,c=credit?parsePdfMoney(credit):0;
        if(d<0||c<0||debit&&credit)throw new Error('Débit/crédit ambigu : corrigez le montant bancaire signé.');
        cents=c-d;
      }
      amountText=inputMoney(cents);
      if(!label||label.length>1000)throw new Error('Libellé vide ou trop long : vérifiez la zone du libellé.');
      date=pdfDate(date,options.year,options.periodStart,options.periodEnd);
    } catch(e) {
      error=e instanceof Error&&e.name==='ZodError'?'Date invalide : corrigez la date ou l’année du relevé.':(e as Error).message;
    }
    if(!options.layout.detected)warnings.push('Colonnes ajustées manuellement : vérifier le sens bancaire.');
    if(source.some(s=>s.method==='ocr'))warnings.push('Lecture OCR : comparer le montant et les dates au document.');
    if(source.some(s=>s.confidence<85))warnings.push('Reconnaissance incertaine.');
    if(date&&options.periodStart&&date<options.periodStart||date&&options.periodEnd&&date>options.periodEnd)warnings.push('Date hors de la période indiquée.');
    let duplicate=false;
    if(!error){const key=fingerprint(options.account,date,label,cents);duplicate=seen.has(key);seen.add(key);}
    rows.push({line:line.id,page:line.page,pageLine:line.line,top:line.top,raw:source.map(s=>s.text),sourceRefs:source.map(s=>({page:s.page,line:s.line})),date,label,cents,amountText,error,duplicate,method:source.some(s=>s.method==='ocr')?'ocr':'text',warnings});
    consumed.add(line.id);
  }
  if(rows.length>10000)throw new Error('Le PDF contient plus de 10 000 mouvements possibles.');
  const totalCents=sumCents(rows.filter(r=>!r.error).map(r=>r.cents));
  const balanceDifference=options.openingBalanceCents!==null&&options.closingBalanceCents!==null?sumCents([options.closingBalanceCents,-options.openingBalanceCents,-totalCents]):null;
  const ignored=all.filter(l=>!consumed.has(l.id)).map(l=>({id:l.id,page:l.page,line:l.line,text:l.text,kind:excluded.has(l.id)?'Ignorée par vous':balanceKind(l.text)?'Solde':isHeader(l)?'En-tête':isFooter(l)?'Total / pied de page':'Non interprétée'}));
  return {options,rows,ignored,pageCount:document.pages.length,methods:[...new Set(document.pages.map(p=>p.method))],
    totalCents,balanceDifference,balanceDetected:suggested.balanceDetected,errorCount:rows.filter(r=>r.error).length,
    duplicateCount:rows.filter(r=>r.duplicate).length,warnings:[...document.warnings,...suggested.balanceProblems,...(!rows.length?['Aucun mouvement identifié. Ajustez les colonnes ou ajoutez une ligne depuis le texte reconnu.']:[])]};
}
export type PdfPreview=ReturnType<typeof previewPdf>;
