const fs=require('node:fs'); const path=require('node:path');const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../FRONTEND/app/lib/independent/localStaffAuth.ts'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../FRONTEND/app/components/independent/IndependentLocalSignIn.tsx'),'utf8');
for(const name of ['provisionFirstLocalOwner','signInLocal','listLocalStaff','requireLocalSession','lockLocalSession','currentLocalSession'])assert.match(source,new RegExp('export (async )?function '+name+'\\('));
assert.match(source,/PBKDF2/);assert.match(source,/310_000/);assert.match(source,/lockedUntil/);assert.match(source,/licenseVerified/);
assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|NEXT_PUBLIC_API_URL|onrender\.com/);
assert.match(ui,/type="password"/);assert.match(ui,/onAuthenticated/);assert.doesNotMatch(ui,/fetch\(/);
console.log('PASS: 13 local-auth source safety contracts (NOT a production security assessment)');
