import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

test('Lanceur : attend sa propre instance, refuse un port occupé et arrête proprement le serveur',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'tva-launch-test-'));
  const probe=createServer();probe.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>probe.once('listening',resolve));
  const address=probe.address();assert.ok(address&&typeof address!=='string');
  const port=address.port;
  await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const children:{child:ReturnType<typeof spawn>;output:string;closed:Promise<number|null>}[]=[];
  function start(name:string) {
    const processChild=spawn(process.execPath,['scripts/launch.mjs'],{env:{...process.env,PORT:String(port),TVA_DATA_DIR:join(directory,name)},stdio:['ignore','pipe','pipe']});
    const result={child:processChild,output:'',closed:new Promise<number|null>(resolve=>processChild.once('close',resolve))};
    processChild.stdout.on('data',chunk=>result.output+=chunk.toString());
    processChild.stderr.on('data',chunk=>result.output+=chunk.toString());
    children.push(result);return result;
  }
  const timeout=setTimeout(()=>children.forEach(c=>c.child.kill('SIGTERM')),12000);
  try {
    const running=start('first');
    for(let n=0;n<150&&!running.output.includes('Gardez cette fenêtre');n++)await new Promise(resolve=>setTimeout(resolve,30));
    assert.match(running.output,/Gardez cette fenêtre/);
    const response=await fetch('http://127.0.0.1:'+port+'/api/state');assert.equal(response.status,200);
    const state=await response.json();assert.equal(state.version,'0.2.0');assert.equal(state.operations.length,0);
    const page=await fetch('http://127.0.0.1:'+port+'/');assert.equal(page.status,200);assert.match(await page.text(),/TVA Cabinet/);
    const conflict=start('second');
    assert.equal(await conflict.closed,1,conflict.output);
    assert.match(conflict.output,/port est déjà utilisé/);
    assert.doesNotMatch(conflict.output,/Ouvrez votre navigateur|Gardez cette fenêtre|données locales uniquement/);
    assert.equal((await fetch('http://127.0.0.1:'+port+'/api/state')).status,200);
    running.child.kill('SIGTERM');assert.equal(await running.closed,0,running.output);
  } finally {
    clearTimeout(timeout);children.forEach(c=>c.child.kill('SIGTERM'));
    await Promise.all(children.map(c=>c.closed));rmSync(directory,{recursive:true,force:true});
  }
});
