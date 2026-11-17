'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const mode = process.env.ELEEVEON_MOBILE_MODE;
if (!['development','offline','diagnostic'].includes(mode)) throw Error('Set ELEEVEON_MOBILE_MODE=development or offline');
const dest = path.join(root, 'mobile', 'web');
fs.mkdirSync(dest, {recursive:true});
if (mode === 'development') {
  if (!/^https:\/\//i.test(process.env.ELEEVEON_MOBILE_DEV_URL || '')) throw Error('HTTPS ELEEVEON_MOBILE_DEV_URL required');
  fs.writeFileSync(path.join(dest,'index.html'), '<!doctype html><html><meta charset="utf-8"><title>Eleeveon Schools - Development</title><body>Development bridge only</body></html>');
  console.log('Development bridge prepared (NOT an offline APK)');
  process.exit(0);
}
if (mode === 'diagnostic') {
  if (process.env.ELEEVEON_MOBILE_DEV_URL) throw Error('Diagnostic mode cannot use a remote URL');
  fs.rmSync(dest,{recursive:true,force:true});
  fs.mkdirSync(dest,{recursive:true});
  fs.copyFileSync(path.join(root,'mobile','diagnostic','index.html'),path.join(dest,'index.html'));
  console.log('LOCAL DIAGNOSTIC ONLY — not a school application or release APK');
  process.exit(0);
}
// Offline packaging only accepts a separately verified real application bundle.
// Do not copy a diagnostic preview or a placeholder into a release APK.
const sourceEnv = process.env.ELEEVEON_MOBILE_BUNDLE_DIR;
if (!sourceEnv) throw Error('Offline build blocked: ELEEVEON_MOBILE_BUNDLE_DIR is required.');
const source = path.resolve(root,sourceEnv);
const manifestFile = path.join(source,'eleeveon-mobile-manifest.json');
if (!fs.existsSync(manifestFile)) throw Error('Offline build blocked: missing verified bundle manifest.');
const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
if (manifest.kind !== 'eleeveon-independent-mobile' || manifest.releaseReady !== true || !manifest.files || typeof manifest.files !== 'object') throw Error('Offline build blocked: bundle has not passed release verification.');
if (!fs.existsSync(path.join(source,'index.html'))) throw Error('Offline build blocked: missing index.html');
if (path.resolve(source) === path.resolve(dest)) throw Error('Bundle source must differ from mobile/web');
for (const [name, hash] of Object.entries(manifest.files)) {
  if (!/^[a-f0-9]{64}$/i.test(hash) || name.startsWith('/') || name.includes('..') || name.includes('\\')) throw Error('Invalid bundle manifest entry: '+name);
  const file = path.join(source,name);
  if (!fs.statSync(file).isFile()) throw Error('Manifest entry is not a file: '+name);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual.toLowerCase() !== hash.toLowerCase()) throw Error('Bundle hash mismatch: '+name);
}
// Require every packaged file to be present in the manifest, preventing unverified extras.
function walk(dir, rel='') { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const next=path.posix.join(rel,e.name); return e.isDirectory()?walk(path.join(dir,e.name),next):[next];
}); }
const expected = new Set([...Object.keys(manifest.files),'eleeveon-mobile-manifest.json']);
for (const file of walk(source)) if (!expected.has(file)) throw Error('Unverified bundle file: '+file);
fs.rmSync(dest,{recursive:true,force:true});
fs.cpSync(source,dest,{recursive:true});
console.log('Verified offline bundle staged. Native licensing/storage and portal acceptance tests are still required.');
