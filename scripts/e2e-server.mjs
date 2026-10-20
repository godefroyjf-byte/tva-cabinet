import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'tva-browser-'));
const child=spawn(process.execPath,['server/index.ts','--production'],{stdio:'inherit',env:{...process.env,PORT:'3217',TVA_DATA_DIR:directory}});
child.on('exit',code=>{rmSync(directory,{recursive:true,force:true});process.exit(code??0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill('SIGTERM'));
