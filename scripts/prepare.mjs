import { createHash } from 'node:crypto';
import { existsSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(Number(process.versions.node.split('.')[0])!==24){console.error('Node.js 24 LTS est requis.');process.exit(1);}
const hash=(text)=>createHash('sha256').update(text).digest('hex');
const read=(path)=>existsSync(path)?readFileSync(path,'utf8'):'';
function npm(args) {
  const command=process.platform==='win32'?'cmd.exe':'npm';
  const parameters=process.platform==='win32'?['/d','/c','npm '+args.join(' ')]:args;
  const result=spawnSync(command,parameters,{cwd:root,stdio:'inherit',env:process.env});
  if(result.error||result.status!==0){console.error('La préparation a échoué. Corrigez le message ci-dessus puis relancez DEMARRER.');process.exit(result.status??1);}
}
const installStamp=join(root,'node_modules','.tva-install-lock');
const lockHash=hash(readFileSync(join(root,'package-lock.json')));
if(read(installStamp)!==lockHash) {
  console.log('Installation ou mise à jour des dépendances locales…');
  npm(['ci']);writeFileSync(installStamp,lockHash);
}
const files=[];
function scan(directory) {
  for(const entry of readdirSync(join(root,directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const relative=join(directory,entry.name);
    if(entry.isDirectory())scan(relative);else if(entry.isFile())files.push(relative);
  }
}
scan('src');scan('shared');scan('server');
files.push('index.html','vite.config.ts','tsconfig.json','package.json','package-lock.json');
const buildHash=createHash('sha256');
for(const file of files)buildHash.update(file).update(readFileSync(join(root,file)));
const expected=buildHash.digest('hex'),buildStamp=join(root,'dist','.tva-build-hash');
if(!existsSync(join(root,'dist','index.html'))||read(buildStamp)!==expected) {
  console.log('Préparation de la nouvelle interface…');npm(['run','build']);writeFileSync(buildStamp,expected);
}
console.log('TVA Cabinet est prêt. Vos données locales sont conservées.');
