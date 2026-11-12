const assert=require('node:assert/strict');
const {generateKeyPairSync,sign,verify}=require('node:crypto');
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const claims={v:1,licenseId:'license-A',accountId:'account-A',installationId:'installation-A',edition:'independent_essentials',issuedAt:100,notBefore:100,expiresAt:null,entitledMajorVersion:1,limits:{schools:1,branches:1,users:100,students:100,teachers:100,devices:1}};
const payload=JSON.stringify(claims);
const signed=sign('sha256',Buffer.from(payload),{key:privateKey,dsaEncoding:'ieee-p1363'});
assert.equal(signed.length,64);
assert.equal(verify('sha256',Buffer.from(payload),{key:publicKey,dsaEncoding:'ieee-p1363'},signed),true);
assert.equal(verify('sha256',Buffer.from(payload.replace('installation-A','installation-B')),{key:publicKey,dsaEncoding:'ieee-p1363'},signed),false);
(async()=>{
 const wc=require('node:crypto').webcrypto;
 const spki=publicKey.export({format:'der',type:'spki'});
 const key=await wc.subtle.importKey('spki',spki,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.equal(await wc.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signed,new TextEncoder().encode(payload)),true);
 console.log('PASS: ES256 signing, tamper rejection, browser-compatible verification');
})().catch(e=>{console.error(e);process.exitCode=1;});
