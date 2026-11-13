'use strict';
/** Dependency inventory only; does not alter repositories or data. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.cwd(),'app');
if(!fs.existsSync(root)) { console.error('Run from the frontend repository root (app/ not found).'); process.exit(2); }
const exclusions=new Set(['node_modules','.next','dist','out','old-files']);
const rules=[
 ['Remote request',/\b(?:apiRequest|fetch|axios\.(?:get|post|put|patch|delete))\s*(?:<[^>\n]+>)?\s*\(/g],
 ['Cloud API identifier',/\b(?:API_BASE_URL|NEXT_PUBLIC_API_URL|platformApi)\b/g],
 ['Cloud login or refresh',/\b(?:\/auth\/me|\/auth\/login|refreshAuthToken)\b/g],
 ['Realtime transport',/\b(?:io\(|new WebSocket\(|socket\.emit\(|socket\.on\()/g],
 ['Sync bootstrap',/\b(?:SyncBootstrap|SubscriptionBootstrap|RealtimeProvider)\b/g]
];
const matches=[];
function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(exclusions.has(ent.name))continue;const file=path.join(dir,ent.name);if(ent.isDirectory())scan(file);else if(/\.(tsx?|jsx?)$/.test(ent.name)){
 const content=fs.readFileSync(file,'utf8');const lines=content.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){const line=lines[i];if(line.trim().startsWith('//')||line.trim().startsWith('*'))continue;for(const [category,re] of rules){re.lastIndex=0;if(re.test(line))matches.push({file:path.relative(process.cwd(),file).replace(/\\/g,'/'),line:i+1,category,snippet:line.trim().slice(0,170)});}}
}}}
scan(root);const counts={};for(const m of matches)counts[m.category]=(counts[m.category]||0)+1;
const summary={generatedAt:new Date().toISOString(),sourceRoot:'app',purpose:'Locate network and startup dependencies before Independent release',warning:'Text matches are review candidates, not proof that a request executes at runtime. No files changed.',counts,matches};
const output=path.resolve('independent-runtime-audit.json');fs.writeFileSync(output,JSON.stringify(summary,null,2));
console.log('Independent runtime audit:',matches.length,'review candidates across',new Set(matches.map(x=>x.file)).size,'files.');console.log('Report:',output);
for(const [k,n] of Object.entries(counts))console.log(' ',k,n);
console.log('This does NOT certify offline compatibility.');
