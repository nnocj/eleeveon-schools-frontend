#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=path.join(process.cwd(),'independent-native-dist');const manifest=JSON.parse(fs.readFileSync(path.join(dir,'preview-manifest.json'),'utf8'));
assert.equal(manifest.releaseReady,false,'Never mark diagnostic build release-ready');
for(const [name,hash] of Object.entries(manifest.files)){const p=path.join(dir,name);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hash, 'Asset integrity '+name);}
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/https?:\/\//i);console.log('PASS: offline preview assets verified; intentionally not school-ready.');
