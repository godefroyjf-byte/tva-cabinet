import { spawn } from 'node:child_process';
const port=Number(process.env.PORT??3210);
const url='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server/index.ts','--production'],{stdio:'inherit',env:process.env});
let exited=false;
const closed=new Promise(resolve=>child.once('exit',code=>{exited=true;process.exitCode=code??0;resolve();}));
child.on('error',()=>{console.error('Impossible de lancer Node.js.');process.exitCode=1;exited=true;});
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>child.kill('SIGTERM'));
for(let attempt=0;attempt<50&&!exited;attempt++) {
  try {
    const result=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1000)});
    await result.body?.cancel();
    if(result.ok) {
      if(process.platform==='win32') {
        const browser=spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore'});
        browser.on('error',()=>console.log('Ouvrez votre navigateur : '+url));
      } else console.log('Ouvrez votre navigateur : '+url);
      console.log('Gardez cette fenêtre ouverte. Ctrl+C arrête le logiciel. Les données restent sur disque.');
      break;
    }
  } catch {}
  if(attempt===49) {console.error('Le serveur local ne répond pas.');child.kill('SIGTERM');process.exitCode=1;}
  await new Promise(resolve=>setTimeout(resolve,200));
}
await closed;
