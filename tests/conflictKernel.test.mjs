import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVectors,mergeChanges,resolveConflict,incrementVector,combineVectors} from '../FRONTEND/app/lib/independent/conflictKernel.ts';
const mutation=(clock,changeId,value,deleted=false,extra={})=>({accountId:'school1',table:'students',recordId:'student1',changeId,deviceId:changeId[0],clock,deleted,value,...extra});
test('causal vector order and merged increments',()=>{
  assert.equal(compareVectors({A:1},{A:2}),'before');
  assert.equal(compareVectors({A:2},{A:1}),'after');
  assert.equal(compareVectors({A:1,B:0},{A:1}),'equal');
  assert.equal(compareVectors({A:2},{A:1,B:1}),'concurrent');
  assert.deepEqual({...combineVectors({A:2},{A:1,B:3})},{A:2,B:3});
  assert.equal(incrementVector({A:2},'A').A,3);
});
test('causally newer edit wins and older edit ignored',()=>{
  const old=mutation({A:1},'A1',{name:'Original'});
  const newer=mutation({A:2},'A2',{name:'New'});
  assert.equal(mergeChanges(old,newer).status,'applied');
  assert.equal(mergeChanges(newer,old).status,'ignored');
});
test('same change is idempotent, equal clocks with different content are conflicts',()=>{
  const a=mutation({A:1},'A1',{name:'Original'});
  assert.equal(mergeChanges(a,{...a}).status,'ignored');
  assert.equal(mergeChanges(a,{...a,value:{name:'Tampered'}}).status,'conflict');
});
test('concurrent modifications and deletion are not silently applied',()=>{
  const a=mutation({A:1},'A1',{name:'New school'});
  const b=mutation({B:1},'B1',null,true);
  assert.equal(mergeChanges(a,b).status,'conflict');
  const resolved=resolveConflict(a,b,{deviceId:'A',changeId:'A2',deleted:false,value:{name:'Resolved'}});
  assert.deepEqual({...resolved.clock},{A:2,B:1});
  assert.equal(mergeChanges(a,resolved).status,'applied');
  assert.equal(mergeChanges(b,resolved).status,'applied');
});
test('cross-account and cross-record changes must not be compared',()=>{
  const a=mutation({A:1},'A1',{name:'a'});
  assert.throws(()=>mergeChanges(a,{...a,accountId:'other'}),/Cross-account/);
  assert.throws(()=>mergeChanges(a,{...a,recordId:'other'}),/cross-record/i);
});
test('malformed vectors and tombstones rejected',()=>{
  assert.throws(()=>compareVectors({A:-1},{A:1}),/clock counter/);
  assert.throws(()=>incrementVector({A:1},'__proto__'),/Invalid device/);
  const a=mutation({A:1},'A1',{name:'a'});
  assert.throws(()=>mergeChanges(a,{...a,deleted:true,value:{name:'a'}}),/tombstone/);
  assert.throws(()=>resolveConflict(a,a,{deviceId:'A',changeId:'A2',deleted:true,value:null}),/No conflict/);
});
