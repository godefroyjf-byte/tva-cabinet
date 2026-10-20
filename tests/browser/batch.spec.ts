import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('Lot de cinq PDF : corrections, lecture successive, fichier protégé, OCR, doublons et bilan fidèle',async({page})=>{
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:3217')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.goto('/');
  const logo=page.getByRole('img',{name:'Logo JG Avocat',exact:true});
  await expect(logo).toBeVisible();await expect(logo).toHaveJSProperty('naturalWidth',1024);
  await page.getByRole('button',{name:'Importer des relevés PDF',exact:false}).click();
  await page.getByLabel('Compte bancaire PDF',{exact:true}).fill('Lot navigateur');
  await page.getByLabel('Relevé PDF',{exact:true}).setInputFiles(['examples/releve-fictif-sg.pdf','examples/releve-fictif-trimestres.pdf','tests/fixtures/protege.pdf','examples/releve-fictif-scan.pdf','examples/releve-fictif-sg.pdf']);
  await expect(page.getByRole('region',{name:'Fichiers du lot'}).locator('li')).toHaveCount(5);
  await page.getByRole('button',{name:'Lire le PDF',exact:true}).click();
  await expect(page.getByText('9 mouvements possibles',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:/^Libellé mouvement PDF /}).first().fill('Honoraires lot corrigés');
  await page.getByRole('button',{name:'Actualiser l’aperçu PDF et les corrections',exact:true}).click();
  await page.getByLabel('J’ai comparé les lignes sélectionnées',{exact:false}).check();
  let release!:()=>void,importAttempts=0;
  const released=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/pdf/import',async route=>{
    const attempt=++importAttempts;
    if(attempt===2){await route.fulfill({status:400,json:{error:'Échec fictif avant enregistrement du deuxième fichier.'}});return;}
    if(attempt!==1){await route.continue();return;}
    const response=await route.fetch();await released;await route.fulfill({response});
  });
  await page.getByRole('button',{name:'Importer 8 mouvements PDF',exact:true}).click();
  try {
    await expect(page.getByRole('button',{name:'Fermer la fenêtre',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();
  }finally{release();}
  await expect(page.getByText('4 mouvements possibles',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Compte bancaire PDF',{exact:true})).toHaveValue('Lot navigateur');
  await expect(page.getByRole('button',{name:'Importer 4 mouvements PDF',exact:true})).toBeDisabled();
  await page.getByLabel('J’ai comparé les lignes sélectionnées',{exact:false}).check();
  await page.getByRole('button',{name:'Importer 4 mouvements PDF',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Échec fictif avant enregistrement'})).toBeVisible();
  const intermediate=await (await page.request.get('/api/state')).json();
  expect(intermediate.operations.filter((item:{account:string})=>item.account==='Lot navigateur')).toHaveLength(8);
  await page.getByRole('button',{name:'Importer 4 mouvements PDF',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'mot de passe'})).toBeVisible();
  await page.getByRole('button',{name:'Passer ce fichier',exact:true}).click();
  await expect(page.getByText('3 mouvements possibles',{exact:true})).toBeVisible();
  await expect(page.getByText('OCR local utilisé',{exact:true})).toBeVisible();
  await expect(page.getByText('2 doublon(s) potentiel(s)',{exact:true})).toBeVisible();
  await page.getByLabel('J’ai comparé les lignes sélectionnées',{exact:false}).check();
  await page.getByRole('button',{name:'Importer 1 mouvements PDF',exact:true}).click();
  await expect(page.getByText('Ce PDF a déjà été importé pour ce compte.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Passer ce fichier',exact:true}).click();
  await expect(page.getByText('Lot terminé : 3 fichier(s) importé(s), 13 mouvement(s).',{exact:true})).toBeVisible();
  await expect(page.getByText('1 fichier(s) en erreur · 1 fichier(s) passé(s) sans import.',{exact:true})).toBeVisible();
  await page.getByRole('dialog').screenshot({path:'test-results/lot-pdf-bilan.png'});
  await page.getByRole('button',{name:'Terminer',exact:true}).click();
  await expect(page.getByText('13 mouvements PDF importés, en attente de qualification.',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Compte',exact:true}).selectOption('Lot navigateur');
  await expect(page.getByRole('button',{name:'Honoraires lot corrigés',exact:true})).toBeVisible();
  const backup=await (await page.request.get('/api/backup')).json();
  const imports=backup.payload.imports.filter((item:{account:string})=>item.account==='Lot navigateur');
  expect(imports).toHaveLength(3);
  expect(imports[0].base64).toBe((await readFile('examples/releve-fictif-sg.pdf')).toString('base64'));
  expect(backup.payload.operations.filter((item:{account:string})=>item.account==='Lot navigateur')).toHaveLength(13);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('Dépôt de fichiers : limite du lot, fichier invalide visible et conservation après fermeture du bilan',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Importer des relevés PDF',exact:false}).click();
  await page.getByLabel('Compte bancaire PDF',{exact:true}).fill('Dépôt navigateur');
  await page.getByLabel('Relevé PDF',{exact:true}).setInputFiles(Array.from({length:21},(_,index)=>({name:'fictif-'+index+'.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 fictif')})));
  await expect(page.getByRole('alert')).toContainText('20 fichiers');
  await expect(page.getByRole('region',{name:'Fichiers du lot'})).toHaveCount(0);
  const encoded=(await readFile('examples/releve-fictif-trimestres.pdf')).toString('base64');
  await page.evaluate(base64=>{
    const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],'releve-depose.pdf',{type:'application/pdf'}));
    transfer.items.add(new File(['Exemple fictif'],'invalide.txt',{type:'text/plain'}));
    document.querySelector('.pdf-dropzone')!.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
  },encoded);
  await expect(page.getByRole('region',{name:'Fichiers du lot'}).locator('li')).toHaveCount(2);
  await expect(page.getByText('Erreur : Choisissez un fichier PDF.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lire le PDF',exact:true}).click();
  await expect(page.getByText('4 mouvements possibles',{exact:true})).toBeVisible();
  await page.getByLabel('J’ai comparé les lignes sélectionnées',{exact:false}).check();
  await page.getByRole('button',{name:'Importer 4 mouvements PDF',exact:true}).click();
  await expect(page.getByText('Lot terminé : 1 fichier(s) importé(s), 4 mouvement(s).',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();
  await expect(page.getByText('4 mouvements PDF importés, en attente de qualification.',{exact:true})).toBeVisible();
  const state=await (await page.request.get('/api/state')).json();
  expect(state.operations.filter((item:{account:string})=>item.account==='Dépôt navigateur')).toHaveLength(4);
});
