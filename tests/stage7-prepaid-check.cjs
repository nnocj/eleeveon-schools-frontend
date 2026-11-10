const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const checks = [
 ['DTO accepts prepaid quantity', 'src/billing/dto/subscription-quote.dto.ts', 'requestedStudentCount?: number'],
 ['Quote uses selected quantity', 'src/billing/pricing-resolution.service.ts', 'studentCount = requested ?? Math.max(currentlyEnrolled, previousAllowance)'],
 ['Existing enrollment minimum', 'src/billing/pricing-resolution.service.ts', 'requested < currentlyEnrolled'],
 ['Order calculation persists prepaid cap', 'src/billing/subscription-change.service.ts', 'prepaidStudentLimit: pricing.studentPricingMode'],
 ['Checkout rechecks the same prepaid quantity', 'src/billing/billing.service.ts', 'requestedStudentCount: Number(saved.prepaidStudentLimit ?? saved.studentCount)'],
 ['Payment activates prepaid cap', 'src/billing/subscription-change.service.ts', 'metadata: subscriptionMetadata'],
 ['Entitlements enforce purchased cap', 'src/entitlements/entitlement-resolver.service.ts', 'limits.students = limits.students == null ? seats'],
 ['Owner sends selected cap', 'app/owner/subscriptions.tsx', 'requestedStudentCount:count'],
 ['Owner offers quantity input', 'app/owner/subscriptions.tsx', 'Student places to purchase'],
];
for (const [name, file, needle] of checks) {
  assert.ok(read(file).includes(needle), name);
  console.log('PASS:', name);
}
// Mock the pricing resolver's dependencies to execute its actual TypeScript logic.
const ts = require('typescript');
const source = read('src/billing/pricing-resolution.service.ts');
const js = ts.transpileModule(source, {fileName:'pricing-resolution.service.ts', compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, experimentalDecorators:true}}).outputText;
class BadRequestException extends Error {}
class NotFoundException extends Error {}
const moduleExports = {};
const customRequire = id => {
 if(id === '@nestjs/common') return {Injectable:()=>target=>target, BadRequestException, NotFoundException};
 if(id === './student-pricing') return {parseStudentPricing:()=>({mode:'tiered', billingPeriod:'termly', tiers:[{upTo:100,unitPrice:3},{upTo:null,unitPrice:2}]}), calculateStudentQuote:(_p,n)=>Math.min(100,n)*3 + Math.max(0,n-100)*2};
 return {};
};
vm.runInNewContext(js, {exports:moduleExports, require:customRequire, console, Date, Set, Number, String, Object, Array, Promise, Error});
const {PricingResolutionService} = moduleExports;
const plan={id:'standard',active:true,licenseModel:'subscription',deploymentMode:'connected',metadata:{},maxStudents:null,currency:'GHS'};
function factory(currentIds=[],previousLimit=undefined) {
  const prisma={
    subscriptionPlan:{findUnique:async()=>plan},
    privateOfferAssignment:{findFirst:async()=>null},
    accountPricingOverride:{findFirst:async()=>null},
    syncRecord:{findMany:async()=>currentIds.map(id=>({localId:id,payload:{id}}))},
    accountSubscription:{findUnique:async()=> previousLimit ? {planId:'standard',metadata:{prepaidStudentLimit:previousLimit}} : null},
  };
  return new PricingResolutionService(prisma,{priceForCycle:()=>0,applyDiscount:()=>0});
}
(async()=>{
  const args={accountId:'disposable',planId:'standard',billingCycle:'termly'};
  const zero=await factory([]).resolve({...args,requestedStudentCount:200});
  assert.equal(zero.studentCount,200);assert.equal(zero.listAmount,500);
  console.log('PASS: 0 enrolled, prepay 200 places = GHS 500');
  const existing=await factory(['a','b','c']).resolve({...args,requestedStudentCount:200});
  assert.equal(existing.studentCount,200);
  console.log('PASS: selected prepaid cap exceeds existing enrollment');
  await assert.rejects(()=>factory(['a','b','c']).resolve({...args,requestedStudentCount:2}),/already have 3 synchronized/);
  console.log('PASS: prevents purchase below current student count');
  const renewal=await factory([],200).resolve(args);
  assert.equal(renewal.studentCount,200);
  console.log('PASS: renewal reuses prior capacity');
  await assert.rejects(()=>factory([]).resolve(args),/Choose the number/);
  console.log('PASS: missing initial quantity fails safely');
  console.log('PASS: 9 source checks + 5 mocked pricing scenarios');
})().catch(err=>{console.error(err);process.exitCode=1});
