const fs=require('node:fs');const path=require('node:path');
const p=process.cwd();
function has(x){return fs.existsSync(path.join(p,x));}
let blockers=[];
const pkg=has('package.json')?require(path.join(p,'package.json')):{};
const deps={...pkg.dependencies,...pkg.devDependencies};
for(const key of ['@capacitor/core','@capacitor/cli','@capacitor/android','next','dexie'])if(!deps[key])blockers.push(`Missing package: ${key}`);
if(!has('capacitor.config.ts'))blockers.push('Missing capacitor.config.ts');
if(!has('android'))console.log('[INFO] No android/ yet; generate with `npx cap add android` when Android SDK is ready.');
if(!has('out/index.html'))blockers.push('No verified export out/index.html; cannot build a standalone Android app yet.');
if(!has('app/lib/independent/nativeBridge.ts'))blockers.push('Independent frontend modules not installed yet.');
if(!has('app/components/independent/IndependentRuntimeShell.tsx'))blockers.push('Independent runtime shell not installed yet.');
console.log('Eleeveon Independent native prerequisites');
console.log('Current state:',blockers.length?'NOT READY':'FOUND FILE PREREQUISITES ONLY');
blockers.forEach(x=>console.log('BLOCKED:',x));
console.log('Even when files exist, native licensing, local auth-to-portal mapping, REST replacement, secure storage, and full offline QA remain required.');
if(blockers.length)process.exitCode=1;
