// Run from the frontend root: node scripts/test-independent-backup.cjs
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=process.cwd();
const out=path.join(root,'.independent-backup-test-build');
const tsc=require.resolve('typescript/bin/tsc');
const source=['archive.ts','backupVerification.ts','folderBackup.ts','databaseSnapshot.ts'].map(f=>`app/lib/independent/${f}`);
fs.rmSync(out,{recursive:true,force:true});
const args=[tsc,'--outDir',out,'--rootDir','app/lib/independent','--target','ES2022','--lib','es2022,dom','--moduleResolution','node','--module','commonjs','--strict',...source];
try {
 let result=spawnSync(process.execPath,args,{stdio:'inherit',cwd:root});
 if(result.status!==0)process.exit(result.status||1);
 result=spawnSync(process.execPath,['--test','tests/backup-verification.test.cjs'],{stdio:'inherit',cwd:root});
 process.exitCode=result.status||0;
} finally {fs.rmSync(out,{recursive:true,force:true});}
