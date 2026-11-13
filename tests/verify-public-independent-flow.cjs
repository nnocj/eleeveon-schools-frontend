'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');const path=require('node:path');
const root=path.resolve(__dirname,'../FRONTEND/app');
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
const website=get('page.tsx'), selection=get('independent/start/page.tsx'),login=get('login/page.tsx'),register=get('register/page.tsx');
assert.match(website,/specialPurchase\s*\?\s*`Explore/);
assert.match(website,/\/independent\/start\?planId=/);
assert.match(selection,/sp003/);assert.match(selection,/sp004/);
assert.match(selection,/\/login\?\$\{query\}/);assert.match(selection,/\/register\?\$\{query\}/);
assert.match(selection,/Purchasing is not yet enabled/);
assert.match(login,/independentPlanId/);assert.match(login,/createFallbackMembership/);
assert.match(register,/independentPlanId/);
// TypeScript syntax validation (global TypeScript when available).
let ts;try{ts=require('typescript')}catch{try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}catch{}}
if(ts){for(const file of ['page.tsx','independent/start/page.tsx','login/page.tsx','register/page.tsx']){
 const src=get(file);const output=ts.transpileModule(src,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}});
 const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); assert.equal(errors.length,0,file+': '+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
}}
console.log('PASS: Independent selection, sign-in/registration handoff, checkout safety, and TS/TSX syntax checks.');
