import { spawn } from 'node:child_process';
const port=Number(process.env.PORT??3210);
const url='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server/index.ts','--production'],{stdio:['inherit','inherit','inherit','ipc'],env:process.env});
let failed=false;
const timer=setTimeout(()=>{failed=true;console.error('Le serveur local ne répond pas.');child.kill('SIGTERM');},15000);
const closed=new Promise(resolve=>child.once('close',code=>{clearTimeout(timer);process.exitCode=failed?1:code??0;resolve();}));
child.on('error',()=>{failed=true;console.error('Impossible de lancer Node.js.');});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill('SIGTERM'));
child.once('message',async message=>{
  if(!message||typeof message!=='object'||message.type!=='ready')return;
  clearTimeout(timer);
  try {
    const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(3000)});
    await response.body?.cancel();
    if(!response.ok)throw new Error();
    if(process.platform==='win32') {
      const browser=spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore'});
      browser.on('error',()=>console.log('Ouvrez votre navigateur : '+url));
    } else console.log('Ouvrez votre navigateur : '+url);
    console.log('Gardez cette fenêtre ouverte. Ctrl+C arrête le logiciel. Les données restent sur disque.');
  } catch {failed=true;console.error('Le serveur local a démarré mais ne répond pas correctement.');child.kill('SIGTERM');}
});
await closed;
