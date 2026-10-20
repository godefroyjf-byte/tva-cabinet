import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { centsSchema, dateSchema, inputMoney, parseMoney, sumCents, type Operation } from '../shared/model.ts';

export const csvRequestSchema = z.object({
  filename: z.string().min(1).max(255).refine(n=>n.toLowerCase().endsWith('.csv'), 'Seuls les fichiers CSV sont disponibles.'),
  base64: z.string().max(7_000_000),
  account: z.string().trim().min(1).max(100),
  delimiter: z.enum(['auto',';',',','\t']).default('auto'),
  openingBalanceCents: centsSchema.nullable().default(null),
  closingBalanceCents: centsSchema.nullable().default(null),
  mapping: z.object({ date:z.string(),label:z.string(),amount:z.string(),debit:z.string(),credit:z.string() }).strict().optional(),
  edits: z.array(z.object({ line:z.number().int().positive(),date:z.string().max(30),label:z.string().max(1000),amount:z.string().max(50) }).strict()).max(10000).default([])
}).strict();
export type CsvRequest = z.input<typeof csvRequestSchema>;
export function fingerprint(account: string, date: string, label: string, cents: number) {
  return JSON.stringify([account, date, label.normalize('NFC').trim().toLocaleLowerCase('fr'), cents]);
}
export function parseDate(value: string) {
  const text = value.trim();
  const match = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(text);
  return dateSchema.parse(match ? match[3] + '-' + match[2] + '-' + match[1] : text);
}
export function previewCsv(input: CsvRequest, existing: Operation[]) {
  const request = csvRequestSchema.parse(input);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.base64)) throw new Error('Encodage du fichier invalide.');
  const bytes = Buffer.from(request.base64,'base64');
  if (bytes.length > 5_000_000 || bytes.length === 0) throw new Error('Le fichier doit contenir entre 1 octet et 5 Mo.');
  let text: string, encoding: string;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); encoding = 'UTF-8'; }
  catch { text = new TextDecoder('windows-1252').decode(bytes); encoding = 'Windows-1252'; }
  if (text.includes('\0')) throw new Error('Ce fichier est binaire ; choisissez un CSV texte.');
  const parseWith = (delimiter: string) => parse(text, { delimiter,bom:true,skip_empty_lines:true,relax_column_count:true,info:true,max_record_size:100_000 }) as unknown as {record:string[];info:{lines:number}}[];
  let delimiter: string = request.delimiter;
  if (delimiter === 'auto') {
    const scores = [';',',','\t'].map(d => {
      try { const rows = parseWith(d); return {d,score:rows[0]?.record.length ?? 0}; } catch { return {d,score:0}; }
    }).sort((a,b)=>b.score-a.score);
    delimiter = scores[0].d;
  }
  const records = parseWith(delimiter);
  if (records.length < 2 || records.length > 10001) throw new Error('Le CSV doit avoir un en-tête et 1 à 10 000 lignes.');
  const headers = records[0].record.map(h=>h.trim());
  if (headers.length > 100 || headers.some(h=>!h) || new Set(headers).size !== headers.length) throw new Error('Les en-têtes doivent être non vides et uniques (100 colonnes maximum).');
  const find = (pattern: RegExp) => headers.find(h=>pattern.test(h.normalize('NFD').replace(/[\u0300-\u036f]/g,''))) ?? '';
  const mapping = request.mapping ?? { date:find(/^date$|operation.*date|date.*operation/i),label:find(/libelle|description|label/i),amount:find(/^montant$|amount|montant signe/i),debit:find(/debit/i),credit:find(/credit/i) };
  for (const h of Object.values(mapping)) if (h && !headers.includes(h)) throw new Error('Une colonne sélectionnée n’existe pas.');
  const mappingReady = !!mapping.date && !!mapping.label && (!!mapping.amount || !!mapping.debit && !!mapping.credit);
  const seen = new Set(existing.map(o=>fingerprint(o.account,o.date,o.label,o.cents)));
  const edits = new Map(request.edits.map(e=>[e.line,e]));
  const rows = records.slice(1).map(({record,info}) => {
    const get = (name: string) => record[headers.indexOf(name)]?.trim() ?? '';
    const edit = edits.get(info.lines);
    let date = edit?.date ?? get(mapping.date), label = (edit?.label ?? get(mapping.label)).trim();
    let amountText=edit?.amount ?? (mapping.amount ? get(mapping.amount) : '');
    let cents = 0, error: string | null = null, duplicate = false;
    try {
      if (!mappingReady) throw new Error('Choisissez les colonnes date, libellé et montant (ou débit + crédit).');
      if (record.length !== headers.length) throw new Error('Nombre de colonnes incohérent.');
      if (edit) cents = parseMoney(edit.amount);
      else if (mapping.amount) cents = parseMoney(get(mapping.amount));
      else {
        const d = get(mapping.debit) ? parseMoney(get(mapping.debit)) : 0;
        const c = get(mapping.credit) ? parseMoney(get(mapping.credit)) : 0;
        if (d < 0 || c < 0 || d && c) throw new Error('Débit/crédit : une seule colonne positive par ligne.');
        cents = c-d;
      }
      amountText=inputMoney(cents);
      if (!label || label.length > 1000) throw new Error('Libellé vide ou trop long.');
      date = parseDate(date);
      const key = fingerprint(request.account,date,label,cents);
      duplicate = seen.has(key);
      seen.add(key);
    } catch (e) { error = e instanceof z.ZodError ? 'Date invalide (JJ/MM/AAAA ou AAAA-MM-JJ).' : (e as Error).message; }
    return { line:info.lines,raw:record,date,label,cents,amountText,error,duplicate };
  });
  const totalCents=sumCents(rows.filter(r=>!r.error).map(r=>r.cents));
  const balanceColumns=headers.filter(h=>/solde|balance/i.test(h));
  const balanceDifference=request.openingBalanceCents!==null&&request.closingBalanceCents!==null?sumCents([request.closingBalanceCents,-request.openingBalanceCents,-totalCents]):null;
  return {headers,mapping,mappingReady,delimiter,encoding,rows,totalCents,balanceColumns,balanceDifference,openingBalanceCents:request.openingBalanceCents,closingBalanceCents:request.closingBalanceCents,
    errorCount:rows.filter(r=>r.error).length,duplicateCount:rows.filter(r=>r.duplicate).length,
    hash:createHash('sha256').update(bytes).digest('hex')};
}
export type Preview = ReturnType<typeof previewCsv>;
export function safeCell(value: string) { return /^[\s]*[=+\-@\t\r\n]/.test(value) ? "'" + value : value; }
export function csvLine(cells: string[]) { return cells.map(v=>'"'+safeCell(v).replace(/"/g,'""')+'"').join(';'); }
