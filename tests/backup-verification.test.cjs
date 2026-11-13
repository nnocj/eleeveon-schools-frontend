const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
globalThis.crypto = webcrypto;
const {encryptSchoolArchive} = require('../.independent-backup-test-build/archive.js');
const {inspectEncryptedBackup,validateSnapshot} = require('../.independent-backup-test-build/backupVerification.js');
const passphrase = 'a very strong test passphrase';
const school = {format:'eleeveon-independent-snapshot',version:1,createdAt:'2026-11-13T00:00:00.000Z',database:'EleeveonDB',indexedDBVersion:39,tables:[{name:'students',keyPath:'id',autoIncrement:false,rows:[{key:'abc',value:{id:'abc',name:'Test'}}]}],notes:[]};
test('encrypted backup round trip and counts',async()=>{
 const envelope=await encryptSchoolArchive(school,passphrase);
 const checked=await inspectEncryptedBackup(JSON.stringify(envelope),passphrase,'EleeveonDB');
 assert.equal(checked.records,1); assert.equal(checked.tables,1);
});
test('wrong passphrase rejected',async()=>{
 const envelope=await encryptSchoolArchive(school,passphrase);
 await assert.rejects(inspectEncryptedBackup(JSON.stringify(envelope),'the wrong passphrase','EleeveonDB'));
});
test('different database rejected',async()=>{
 const envelope=await encryptSchoolArchive(school,passphrase);
 await assert.rejects(inspectEncryptedBackup(JSON.stringify(envelope),passphrase,'OtherDB'),/different database/);
});
test('tampering rejected by authenticated encryption',async()=>{
 const envelope=await encryptSchoolArchive(school,passphrase);
 const p=envelope.payload;envelope.payload=(p[0]==='A'?'B':'A')+p.slice(1);
 await assert.rejects(inspectEncryptedBackup(JSON.stringify(envelope),passphrase,'EleeveonDB'));
});
test('duplicate tables and malformed records rejected',()=>{
 assert.throws(()=>validateSnapshot({...school,tables:[school.tables[0],school.tables[0]]},'EleeveonDB'),/Duplicate/);
 assert.throws(()=>validateSnapshot({...school,tables:[{...school.tables[0],rows:[{}]}]},'EleeveonDB'),/Malformed/);
});
