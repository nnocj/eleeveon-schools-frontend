'use strict';
/** Run after ELEEVEON_INDEPENDENT_DESKTOP_BUILD=1 npm run build.
 * Copies Next's standalone output and public/static resources into a
 * desktop-local folder. Does not alter the Cloud deployment.
 */
const fs=require('node:fs');const path=require('node:path');
const edition=process.env.NEXT_PUBLIC_ELEEVEON_RUNTIME;
if(!['independent_essentials','independent_multi_device'].includes(edition))throw Error('Set NEXT_PUBLIC_ELEEVEON_RUNTIME to a supported Independent edition for staging. Never stage a Cloud build.');
const root=path.resolve(__dirname,'..');
const dest=path.resolve(process.argv[2]||path.join(root,'independent-desktop-web'));
const source=path.join(root,'.next','standalone');
if(!fs.existsSync(path.join(source,'server.js')))throw Error('Missing .next/standalone/server.js. Run a standalone Independent build first.');
if(!fs.existsSync(path.join(root,'.next','static')))throw Error('Missing .next/static. Run a production build first.');
if(dest===root || dest===source || dest.startsWith(source+path.sep))throw Error('Unsafe output directory');
if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
fs.cpSync(source,dest,{recursive:true});
fs.mkdirSync(path.join(dest,'.next'),{recursive:true});
fs.cpSync(path.join(root,'.next','static'),path.join(dest,'.next','static'),{recursive:true});
if(fs.existsSync(path.join(root,'public')))fs.cpSync(path.join(root,'public'),path.join(dest,'public'),{recursive:true});
fs.writeFileSync(path.join(dest,'eleeveon-independent-build.json'),JSON.stringify({edition,kind:'next-standalone',format:1},null,2));
console.log('Independent Next.js standalone bundle staged:',dest);
console.log('Place this folder at desktop/independent-web for local development, or ship as extraResources/independent-web in the installer.');
