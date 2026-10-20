import PDFDocument from 'pdfkit';
import {writeFileSync} from 'node:fs';

const doc=new PDFDocument({size:'A4',margin:35,info:{Title:'Relevé fictif couvrant trois trimestres'}});
const chunks=[];doc.on('data',chunk=>chunks.push(chunk));
const complete=new Promise(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))));
doc.font('Helvetica-Bold').fontSize(16).text('RELEVÉ FICTIF — DÉMONSTRATION',35,35);
doc.font('Helvetica').fontSize(10).text('Exemple pédagogique sans données bancaires réelles.',35,65);
doc.text('RELEVÉ DU 15/03/2026 AU 15/07/2026',35,85);
doc.text('SOLDE PRÉCÉDENT AU 14/03/2026',35,125);
doc.text('1 000,00',455,125,{width:75,align:'right'});
doc.font('Helvetica-Bold');
for(const [label,x,width]of [['Date',35,60],['Valeur',105,50],['Nature de l’opération',170,180],['Débit',365,70],['Crédit',455,75]])doc.text(label,x,160,{width,lineBreak:false});
const rows=[['31/03/2026','Hors trimestre avant','120,00'],['01/04/2026','Honoraires avril','240,00'],['30/06/2026','Honoraires juin','360,00'],['01/07/2026','Hors trimestre après','480,00']];
doc.font('Helvetica');
rows.forEach(([date,label,credit],index)=>{
  const y=205+index*40;
  doc.text(date,35,y,{width:60,lineBreak:false});doc.text(date,105,y,{width:60,lineBreak:false});
  doc.text(label,170,y,{width:180,lineBreak:false});doc.text(credit,455,y,{width:75,align:'right',lineBreak:false});
});
doc.font('Helvetica-Bold').text('NOUVEAU SOLDE AU 15/07/2026',35,405);
doc.text('2 200,00',455,405,{width:75,align:'right'});
doc.font('Helvetica').fontSize(9).text('Le relevé couvre T1, T2 et T3. Les quatre mouvements sont conservés.',35,455);
doc.text('Pour T2, seules les dates TVA du 01/04 au 30/06 inclus sont retenues.',35,475);
doc.end();writeFileSync('examples/releve-fictif-trimestres.pdf',await complete);
console.log('Relevé fictif avec limites de trimestre généré.');
