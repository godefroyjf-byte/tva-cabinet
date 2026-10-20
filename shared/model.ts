import { z } from 'zod';

export const MAX_CENTS = 1_000_000_000_000;
export const centsSchema = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date invalide');
export const natureLabels = { review: 'À vérifier', revenue: 'Recette / honoraires', expense: 'Dépense', transfer: 'Virement interne', personal: 'Apport / prélèvement personnel', loan: 'Prêt / emprunt', repayment: "Remboursement d’emprunt", other: 'Autre' } as const;
export const treatmentLabels = { review: 'À vérifier / cas particulier', taxable: 'Taxable', exempt: 'Exonéré', outside: 'Hors champ' } as const;
export const statusLabels = { pending: 'À vérifier', confirmed: 'Confirmé', excluded: 'Exclu' } as const;
export const partSchema = z.object({
  id: z.string().min(1).max(100),
  cents: centsSchema,
  nature: z.enum(['review','revenue','expense','transfer','personal','loan','repayment','other']),
  treatment: z.enum(['review','taxable','exempt','outside']),
  rateBps: z.number().int().min(1).max(10000),
  deductionBps: z.number().int().min(0).max(10000).nullable(),
  invoiceVatCents: centsSchema.nullable(),
  invoiceNetCents: centsSchema.nullable(),
  invoiceDate: dateSchema.or(z.literal('')),
  vatDate: dateSchema,
  invoiceConfirmed: z.boolean(),
  rightConfirmed: z.boolean(),
  periodConfirmed: z.boolean(),
  documentRef: z.string().max(500),
  note: z.string().max(2000)
}).strict();
export const operationSchema = z.object({
  id: z.number().int().positive(),
  importId: z.string().min(1).max(100),
  sourceLine: z.number().int().positive(),
  sourcePage: z.number().int().min(1).max(30).optional(),
  sourceMethod: z.enum(['text','ocr']).optional(),
  sourceRefs: z.array(z.object({page:z.number().int().min(1).max(30),line:z.number().int().positive()}).strict()).min(1).max(100).optional(),
  account: z.string().trim().min(1).max(100),
  date: dateSchema,
  label: z.string().trim().min(1).max(1000),
  cents: centsSchema,
  raw: z.array(z.string().max(10000)).max(100),
  status: z.enum(['pending','confirmed','excluded']),
  revision: z.number().int().nonnegative(),
  parts: z.array(partSchema).min(1).max(30)
}).strict();
export const settingsSchema = z.object({
  regime: z.enum(['review','receipts','invoices']),
  regimeConfirmed: z.boolean(),
  rates: z.array(z.number().int().min(1).max(10000)).min(1).max(20)
}).strict().refine(s=>!s.regimeConfirmed||s.regime!=='review','Choisissez le régime vérifié avant de le confirmer.');
export const settlementSchema = z.object({
  adjustmentsCents: centsSchema,
  priorCreditCents: centsSchema.refine(n => n >= 0, 'Le crédit antérieur doit être positif.'),
  confirmed: z.boolean()
}).strict();
export type Part = z.infer<typeof partSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type Filters = { from?: string; to?: string; account?: string; status?: string; q?: string };
export const defaultSettings: Settings = { regime: 'review', regimeConfirmed: false, rates: [2000,1000,550,210] };

export function newPart(cents: number, date: string, id = 'principal'): Part {
  return { id, cents, nature:'review', treatment:'review', rateBps:2000, deductionBps:null,
    invoiceVatCents:null, invoiceNetCents:null, invoiceDate:'', vatDate:date,
    invoiceConfirmed:false, rightConfirmed:false, periodConfirmed:false, documentRef:'', note:'' };
}
export function sumCents(values: number[]): number {
  const total = values.reduce((sum, n) => sum + BigInt(n), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Total trop élevé.');
  return Number(total);
}
export function parseMoney(text: string): number {
  let value = text.trim().replace(/\u2212/g,'-').replace(/[\s\u00a0\u202f€]/g,'');
  if (/^\(.*\)$/.test(value)) value = '-' + value.slice(1,-1);
  if (!/^[+-]?\d+(?:[,.]\d{1,2})?$/.test(value)) throw new Error('Montant invalide : utilisez 1234,56 sans séparateur de milliers autre qu’une espace.');
  const negative = value.startsWith('-');
  value = value.replace(/^[+-]/,'');
  const [whole, fraction = ''] = value.replace(',','.').split('.');
  const result = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'))) * (negative ? -1n : 1n);
  if (result > BigInt(MAX_CENTS) || result < -BigInt(MAX_CENTS)) throw new Error('Montant trop élevé.');
  return Number(result);
}
export function inputMoney(cents: number): string {
  const n = BigInt(cents);
  const a = n < 0n ? -n : n;
  return (n < 0n ? '-' : '') + String(a / 100n) + ',' + String(a % 100n).padStart(2,'0');
}
export function money(cents: number): string {
  const value = inputMoney(cents);
  const [whole, fraction] = value.split(',');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ',' + fraction + ' €';
}
export function roundRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new Error('Dénominateur invalide.');
  const sign = numerator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const rounded = sign * ((n + denominator / 2n) / denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Calcul trop élevé.');
  return Number(rounded);
}
export function amounts(part: Part) {
  const gross = part.nature === 'expense' ? -part.cents : part.cents;
  const vat = part.treatment !== 'taxable' ? 0 :
    part.invoiceVatCents ?? roundRatio(BigInt(gross) * BigInt(part.rateBps), BigInt(10000 + part.rateBps));
  const net = part.invoiceNetCents ?? gross - vat;
  const deductible = part.nature === 'expense' ? roundRatio(BigInt(vat) * BigInt(part.deductionBps ?? 0), 10000n) : 0;
  return { gross, vat, net, deductible, source: part.invoiceVatCents === null ? 'Calcul TTC' : 'Saisie sur justificatif' };
}
export function validateOperation(operation: Operation, settings: Settings) {
  if (sumCents(operation.parts.map(p => p.cents)) !== operation.cents) throw new Error('La ventilation doit conserver exactement le montant bancaire.');
  if (new Set(operation.parts.map(p=>p.id)).size !== operation.parts.length) throw new Error('Identifiants de ventilation dupliqués.');
  for (const p of operation.parts) {
    const a = amounts(p);
    if ((p.invoiceVatCents === null) !== (p.invoiceNetCents === null)) throw new Error('Saisissez ensemble le HT et la TVA du justificatif.');
    if (p.invoiceVatCents !== null && (a.net + a.vat !== a.gross || Math.sign(a.vat) !== Math.sign(a.gross) && a.vat !== 0 || Math.abs(a.vat) > Math.abs(a.gross))) throw new Error('HT + TVA doit correspondre au TTC, avec des signes cohérents.');
    if (p.treatment !== 'taxable' && p.invoiceVatCents !== null && p.invoiceVatCents !== 0) throw new Error('Une opération sans TVA ne peut pas avoir une TVA documentaire.');
  }
  if (operation.status !== 'confirmed') return;
  if (!settings.regimeConfirmed || settings.regime === 'review') throw new Error('Confirmez votre régime dans les paramètres avant toute validation.');
  for (const p of operation.parts) {
    if (p.nature === 'review' || p.treatment === 'review') throw new Error('Choisissez une nature et un traitement avant de confirmer.');
    if (!p.periodConfirmed) throw new Error('Confirmez la date retenue pour la TVA.');
    if (p.treatment === 'taxable' && !['revenue','expense'].includes(p.nature)) throw new Error('Cette nature ne peut pas alimenter automatiquement les totaux de TVA.');
    if (p.nature === 'expense' && p.treatment === 'taxable' && (p.deductionBps === null || !p.invoiceConfirmed || !p.rightConfirmed || p.invoiceVatCents === null)) throw new Error('Une dépense taxable exige la TVA et le HT facturés, ainsi que la confirmation de la facture et du droit à déduction.');
  }
}
export function matchesPart(part: Part, filters: Filters) {
  return (!filters.from || part.vatDate >= filters.from) && (!filters.to || part.vatDate <= filters.to);
}
export function filterOperations(operations: Operation[], filters: Filters) {
  return operations.filter(o => (!filters.account || o.account === filters.account) &&
    (!filters.status || o.status === filters.status) &&
    (!filters.q || o.label.toLocaleLowerCase('fr').includes(filters.q.toLocaleLowerCase('fr'))) &&
    o.parts.some(p=>matchesPart(p,filters)));
}
export function summary(operations: Operation[], filters: Filters, settlement: Settlement) {
  const collected: number[] = [], deductible: number[] = [], estimatedCollected: number[] = [], estimatedDeductible: number[] = [], unresolved: number[] = [], excluded: number[] = [];
  const byRate: Record<string, { net: number; vat: number }> = {};
  let pendingCount = 0;
  for (const o of filterOperations(operations, filters)) {
    if (o.status === 'pending') pendingCount++;
    for (const p of o.parts.filter(p=>matchesPart(p,filters))) {
      const a = amounts(p);
      if (o.status === 'excluded') { excluded.push(p.cents); continue; }
      if (o.status === 'pending') {
        unresolved.push(Math.abs(p.cents));
        if (p.treatment === 'taxable' && p.nature === 'revenue') estimatedCollected.push(a.vat);
        if (p.treatment === 'taxable' && p.nature === 'expense') estimatedDeductible.push(a.deductible);
        continue;
      }
      if (p.treatment !== 'taxable') continue;
      if (p.nature === 'revenue') {
        collected.push(a.vat);
        const key = String(p.rateBps);
        byRate[key] ??= { net:0, vat:0 };
        byRate[key].net = sumCents([byRate[key].net,a.net]);
        byRate[key].vat = sumCents([byRate[key].vat,a.vat]);
      }
      if (p.nature === 'expense') deductible.push(a.deductible);
    }
  }
  const c = sumCents(collected), d = sumCents(deductible);
  return { collected:c, deductible:d, balance:sumCents([c,-d,settlement.confirmed ? settlement.adjustmentsCents : 0,settlement.confirmed ? -settlement.priorCreditCents : 0]),
    estimatedCollected:sumCents(estimatedCollected),estimatedDeductible:sumCents(estimatedDeductible),
    pendingCount,unresolvedCents:sumCents(unresolved),excludedCents:sumCents(excluded),byRate };
}
