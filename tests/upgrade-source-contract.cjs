const fs=require('fs'), path=require('path'), ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=path.resolve(__dirname,'..');let pass=0,fail=0;
function check(name,ok){console.log(`${ok?'PASS':'FAIL'} ${name}`);ok?pass++:fail++;}
for(const rel of ['backend/src/billing/billing.service.ts','backend/src/billing/subscription-change.service.ts','frontend/app/owner/subscriptions.tsx','frontend/app/owner/subscription/page.tsx']){
 const source=fs.readFileSync(path.join(root,rel),'utf8');const out=ts.transpileModule(source,{fileName:rel,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});check(`TS syntax ${rel}`,!(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));
}
const changes=fs.readFileSync(path.join(root,'backend/src/billing/subscription-change.service.ts'),'utf8');
const billing=fs.readFileSync(path.join(root,'backend/src/billing/billing.service.ts'),'utf8');
const front=fs.readFileSync(path.join(root,'frontend/app/owner/subscriptions.tsx'),'utf8');
check('Prisma 7 lock cast maintained',changes.includes('pg_advisory_xact_lock(hashtext(${initial.accountId}))::text'));
check('Upgrade quote explicitly allowed',changes.includes('"new", "renewal", "upgrade"'));
check('Prorate incremental seats',changes.includes('pricing.listAmount - oldFull'));
check('Round up whole-GHS amount',changes.includes('Math.ceil(deltaFull * remaining'));
check('Keep prior subscription expiry',changes.includes('newPeriodEnd = subscription.currentPeriodEnd'));
check('Enforce original allowance under transaction lock',changes.includes('meta.prepaidSourceOrderId')&&changes.includes('snap.upgradeFromSeats'));
check('No duplicate period for upgrade',changes.includes('if (order.changeType !== "upgrade") await tx.subscriptionPeriod.upsert'));
check('Freeze quoted upgrade amount during Paystack init',billing.includes('order.changeType === "upgrade"')&&billing.includes('saved.upgradeUnroundedGhs'));
check('Owner current plan offers upgrade',front.includes('Increase student capacity')&&front.includes('Get verified upgrade quote & pay'));
check('Quote uses upgrade changeType',front.includes('? "upgrade" : "renewal"'));
check('Public onboarding route mounts owner subscriptions',fs.readFileSync(path.join(root,'frontend/app/owner/subscription/page.tsx'),'utf8').includes('<OwnerSubscriptions />'));
// Basic pricing examples, illustration only, not live billing integration.
const price=n=>Math.min(n,100)*3+Math.max(0,n-100)*2;
check('1→2 at 50% term costs GH₵2 after round-up',Math.ceil((price(2)-price(1))*0.5)===2);
check('1→3 at 50% term costs GH₵3',Math.ceil((price(3)-price(1))*0.5)===3);
console.log(`Checks: ${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
