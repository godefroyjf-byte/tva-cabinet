import PDFDocument from 'pdfkit';
import { mkdirSync,writeFileSync } from 'node:fs';
import { extractPdf } from '../server/pdf-extract.ts';

function collect(doc,draw) {
  return new Promise((resolve,reject)=>{
    const chunks=[];doc.on('data',data=>chunks.push(data));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    draw(doc);doc.end();
  });
}
const rows=[
  ['02/01','03/01','Honoraires dossier ALPHA','','1 200,00'],
  ['03/01','03/01','Fournitures bureau','120,00',''],
  ['04/01','04/01','Virement entre comptes','500,00',''],
  ['05/01','05/01','Remboursement client ALPHA','240,00',''],
  ['06/01','06/01','Remboursement fournisseur','','60,00'],
  ['07/01','07/01','Dépense mixte à ventiler','180,00',''],
  ['08/01','08/01','Paiement à qualifier','','350,00'],
  ['08/01','08/01','Paiement à qualifier','','350,00'],
  ['09/01','09/01','Prélèvement TVA','200,00','']
];
function header(doc,page) {
  doc.font('Helvetica-Bold').fontSize(15).text('RELEVÉ FICTIF — DÉMONSTRATION',35,35);
  doc.font('Helvetica').fontSize(10).text('Colonnes de type Société Générale. Aucune donnée bancaire réelle.',35,63);
  doc.text('RELEVÉ DU 01/01/2026 AU 31/01/2026',35,83);
  doc.text('Compte de démonstration — page '+page,35,102);
  doc.font('Helvetica-Bold').fontSize(10);
  for(const [label,x,width]of [['Date',35,60],['Valeur',105,50],['Nature de l’opération',170,180],['Débit',365,70],['Crédit',455,75]])doc.text(label,x,160,{width,lineBreak:false});
  doc.moveTo(35,178).lineTo(535,178).stroke();
}
function row(doc,r,y) {
  doc.font('Helvetica').fontSize(10);
  doc.text(r[0],35,y,{width:60,lineBreak:false});doc.text(r[1],105,y,{width:50,lineBreak:false});doc.text(r[2],170,y,{width:180,lineBreak:false});
  if(r[3])doc.text(r[3],365,y,{width:70,align:'right',lineBreak:false});
  if(r[4])doc.text(r[4],455,y,{width:75,align:'right',lineBreak:false});
}
mkdirSync('examples',{recursive:true});mkdirSync('tests/fixtures',{recursive:true});
const text=await collect(new PDFDocument({size:'A4',margin:35,info:{Title:'Relevé fictif multi-pages'}}),doc=>{
  header(doc,1);doc.font('Helvetica').fontSize(10).text('SOLDE PRÉCÉDENT AU 31/12/2025',35,125);doc.text('1 000,00',455,125,{width:75,align:'right'});
  rows.slice(0,5).forEach((r,i)=>{row(doc,r,200+i*38);if(i===0)doc.fontSize(9).text('Référence fictive ALPHA',170,212,{width:180,lineBreak:false});});
  doc.fontSize(9).text('Page 1 / 2',35,780);doc.addPage();header(doc,2);
  rows.slice(5).forEach((r,i)=>row(doc,r,200+i*38));
  doc.font('Helvetica-Bold').fontSize(10).text('NOUVEAU SOLDE AU 31/01/2026',35,395);doc.text('1 720,00',455,395,{width:75,align:'right'});doc.font('Helvetica').fontSize(9).text('Page 2 / 2',35,780);
});
writeFileSync('examples/releve-fictif-sg.pdf',text);
const scanBase=await collect(new PDFDocument({size:'A4',margin:35}),doc=>{
  header(doc,1);doc.font('Helvetica').fontSize(10).text('SOLDE PRÉCÉDENT AU 31/12/2025',35,125);doc.text('1 000,00',455,125,{width:75,align:'right'});
  [rows[0],rows[1],rows[4]].forEach((r,i)=>row(doc,r,210+i*45));
  doc.font('Helvetica-Bold').fontSize(10).text('NOUVEAU SOLDE AU 31/01/2026',35,400);doc.text('2 140,00',455,400,{width:75,align:'right'});
});
const rendered=await extractPdf(new Uint8Array(scanBase));
const scanned=await collect(new PDFDocument({size:'A4',margin:0}),doc=>doc.image(Buffer.from(rendered.images[1]),0,0,{width:595.28,height:841.89}));
writeFileSync('examples/releve-fictif-scan.pdf',scanned);
const encrypted=await collect(new PDFDocument({size:'A4',userPassword:'fictif-test',ownerPassword:'fictif-owner'}),doc=>doc.text('Exemple fictif protégé pour les tests.'));
writeFileSync('tests/fixtures/protege.pdf',encrypted);
console.log('Exemples PDF fictifs texte, multi-pages, scan et protégé générés.');
