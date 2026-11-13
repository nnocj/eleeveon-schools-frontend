'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const base=path.resolve(__dirname,'../FRONTEND/app');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
test('original portal components mounted for matching local roles',()=>{
  const host=read('components/independent/IndependentOriginalPortalHost.tsx');
  for(const target of ['../../owner/page','../../branch-admin/page','../../teacher/page'])assert.ok(host.includes(target));
  assert.match(host,/session\.role==='owner'/);
  assert.match(host,/NEXT_PUBLIC_ELEEVEON_PORTAL_COMPAT_PREVIEW/);
});
test('independent shell preserves signed license and local password checks',()=>{
 const shell=read('components/independent/IndependentRuntimeShell.tsx');
 assert.match(shell,/verifyOfflineLicense\(/);assert.match(shell,/IndependentLocalSignIn/);
 assert.match(shell,/IndependentOriginalPortalHost/);
});
test('independent account cannot depend on a cloud bearer token',()=>{
 const code=read('context/account-context.tsx');
 const bridge=code.slice(code.indexOf('export function IndependentAccountProvider'));
 assert.doesNotMatch(bridge,/getAuthToken|apiClient|fetch\(/);
 assert.match(bridge,/independentCurrentSession\(\)/);
});
test('independent realtime context is offline and does not connect',()=>{
 const code=read('context/realtime-context.tsx');
 const bridge=code.slice(code.indexOf('export function IndependentRealtimeProvider'));
 assert.match(bridge,/status: 'offline'/);assert.doesNotMatch(bridge,/connectRealtime\(/);
});
test('membership cannot be changed to another role or account',()=>{
 const code=read('context/active-membership-context.tsx');
 const bridge=code.slice(code.indexOf('export function IndependentActiveMembershipProvider'));
 assert.match(bridge,/requested\.accountId !== session\.accountId/);
 assert.match(bridge,/requested\.role !== membership\.role/);
 assert.match(bridge,/staff member is restricted to the assigned branch/);
});
test('original shell skips backend bootstrap and redirects for Independent',()=>{
 const code=read('components/role-portals/shell/RolePortalShellContent.tsx');
 assert.match(code,/if \(IS_INDEPENDENT_RUNTIME\) return;/);
 assert.match(code,/if \(IS_INDEPENDENT_RUNTIME\) \{[\s\S]*?db\.schools\.get/);
 assert.match(code,/IS_INDEPENDENT_RUNTIME \|\|[\s\S]*?!appearanceMatchesRole/);
 assert.match(code,/const merged = IS_INDEPENDENT_RUNTIME \?/);
});
