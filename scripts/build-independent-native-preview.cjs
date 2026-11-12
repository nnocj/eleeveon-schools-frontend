#!/usr/bin/env node
"use strict";
const fs = require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const root=process.cwd();const source=path.join(root,'independent-native-preview');const target=path.join(root,'independent-native-dist');
const files=['index.html','app.css','app.js'];
for(const file of files) if(!fs.existsSync(path.join(source,file))) throw Error('Missing independent native asset: '+file);
const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
if(!html.includes("connect-src 'none'"))throw Error('Preview must block network connections');
fs.mkdirSync(target,{recursive:true});const manifest={kind:'eleeveon-independent-native-preview',releaseReady:false,generatedAt:new Date().toISOString(),files:{}};
for(const file of files){const content=fs.readFileSync(path.join(source,file));fs.writeFileSync(path.join(target,file),content);manifest.files[file]=crypto.createHash('sha256').update(content).digest('hex');}
fs.writeFileSync(path.join(target,'preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Offline native preview created:',path.relative(root,target));console.log('Contents:',files.join(', '));console.log('Release ready: NO — native packaging diagnostic only');
