import test from 'node:test';
import assert from 'node:assert/strict';
import { canWriteLocalEntity,requiredText,withinLicenseLimit,correctScope } from '../app/lib/independent/localSchoolRules.ts';
test('teacher cannot mutate any audited local school entity',()=>{for(const e of ['schools','branches','classes','students','teachers'])assert.equal(canWriteLocalEntity('teacher',e),false);});
test('branch administrator cannot create schools or branches',()=>{for(const e of ['schools','branches'])assert.equal(canWriteLocalEntity('branch_admin',e),false);});
test('owner can create school and branch',()=>{assert.equal(canWriteLocalEntity('owner','schools'),true);assert.equal(canWriteLocalEntity('owner','branches'),true);});
test('text fields reject blank input and long strings',()=>{assert.throws(()=>requiredText('  ','name'));assert.throws(()=>requiredText('x'.repeat(181),'name'));assert.equal(requiredText('  Kofi ','name'),'Kofi');});
test('capacity enforced at boundary; unlimited permitted',()=>{assert.equal(withinLicenseLimit(29,30),true);assert.equal(withinLicenseLimit(30,30),false);assert.equal(withinLicenseLimit(100,null),true);assert.equal(withinLicenseLimit(-1,null),false);});
test('foreign account or branch cannot match authorized scope',()=>{const r={accountId:'A',schoolId:'S',branchId:'B',isDeleted:false};assert.equal(correctScope(r,{accountId:'A',schoolId:'S',branchId:'B'}),true);assert.equal(correctScope(r,{accountId:'C',schoolId:'S',branchId:'B'}),false);assert.equal(correctScope(r,{accountId:'A',schoolId:'S',branchId:'X'}),false);assert.equal(correctScope({...r,isDeleted:true},{accountId:'A'}),false);});
