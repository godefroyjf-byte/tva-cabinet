import { z } from 'zod';
import { centsSchema, dateSchema } from './model.ts';

const rangeSchema=z.tuple([z.number().min(0).max(100),z.number().min(0).max(100)])
  .refine(([left,right])=>left<right,'La limite gauche doit précéder la limite droite.');
export const pdfLayoutSchema=z.object({
  mode:z.enum(['debitCredit','signed']),
  date:rangeSchema,label:rangeSchema,debit:rangeSchema,credit:rangeSchema,amount:rangeSchema,
  detected:z.boolean()
}).strict();
export type PdfLayout=z.infer<typeof pdfLayoutSchema>;
export const defaultPdfLayout:PdfLayout={mode:'debitCredit',date:[3,16],label:[27,64],debit:[64,80],credit:[80,98],amount:[64,98],detected:false};
export type PdfWord={text:string;left:number;right:number;top:number;height:number;confidence:number};
export type PdfLine={id:number;page:number;line:number;text:string;top:number;height:number;method:'text'|'ocr';confidence:number;words:PdfWord[]};
export type PdfPage={number:number;width:number;height:number;method:'text'|'ocr';lines:PdfLine[]};
export type PdfDocument={pages:PdfPage[];warnings:string[]};
export type PdfProgress={page:number;total:number;stage:string};
export const pdfUploadSchema=z.object({
  filename:z.string().min(1).max(255).refine(n=>n.toLowerCase().endsWith('.pdf'),'Choisissez un fichier PDF.'),
  base64:z.string().min(1).max(14_000_000),
  forceOcr:z.boolean().default(false)
}).strict();
export const pdfRequestSchema=z.object({
  jobId:z.string().uuid(),
  account:z.string().trim().min(1).max(100),
  layout:pdfLayoutSchema.optional(),
  year:z.number().int().min(1900).max(2200).nullable().optional(),
  periodStart:dateSchema.or(z.literal('')).optional(),
  periodEnd:dateSchema.or(z.literal('')).optional(),
  openingBalanceCents:centsSchema.nullable().optional(),
  closingBalanceCents:centsSchema.nullable().optional(),
  edits:z.array(z.object({line:z.number().int().positive(),date:z.string().max(30),label:z.string().max(1000),amount:z.string().max(50)}).strict()).max(10000).default([]),
  extraLines:z.array(z.number().int().positive()).max(10000).default([]),
  excludedLines:z.array(z.number().int().positive()).max(20000).default([])
}).strict();
export const pdfImportRequestSchema=pdfRequestSchema.extend({
  selectedLines:z.array(z.number().int().positive()).min(1).max(10000),
  acceptRejected:z.boolean(),
  confirmDuplicates:z.boolean(),
  reviewed:z.literal(true)
}).strict();
export type PdfRequest=z.input<typeof pdfRequestSchema>;
export const pdfMetadataSchema=z.object({
  pageCount:z.number().int().min(1).max(30),
  methods:z.array(z.enum(['text','ocr'])).min(1).max(2),
  layout:pdfLayoutSchema,
  year:z.number().int().min(1900).max(2200).nullable(),
  periodStart:dateSchema.or(z.literal('')),periodEnd:dateSchema.or(z.literal('')),
  reviewed:z.literal(true),
  excludedLines:z.array(z.number().int().positive()).max(20000),
  sourceLines:z.array(z.object({id:z.number().int().positive(),page:z.number().int().min(1).max(30),line:z.number().int().positive(),text:z.string().max(10000),method:z.enum(['text','ocr']),confidence:z.number().min(0).max(100)}).strict()).max(20000)
}).strict();
export type PdfMetadata=z.infer<typeof pdfMetadataSchema>;
