/** Run once after reviewing the diff; modifies only a tightly matched handoff block.
 * Creates a .pre-public-handoff.bak.tsx backup, refuses to apply to unexpected code.
 * Does not alter billing calculation/settlement or any active subscription.
 */
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(process.cwd(), 'app/owner/subscriptions.tsx');
const source = fs.readFileSync(file, 'utf8');
const oldBlock = `        if(selected && mode(selected)==="subscription" && pricing(selected).mode==="fixed" && fixedPrice(selected,(c==="monthly"||c==="termly"||c==="yearly")?c:"termly")>0) setSelectedPlan(selected);\n        else setNotice("Your package is available for review. Activation or checkout is not yet available here for this package type.");`;
const newBlock = `        const quantity = Number(params.get("students"));
        if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000000) setCount(quantity);
        if (selected && mode(selected) === "subscription" && pricing(selected).mode !== "fixed" && STUDENT_CHECKOUT_ENABLED) {
          // Prepaid capacity is only a client preference. The backend generates the authoritative quotation.
          setStudentCheckoutPlan(selected);
          setServerQuote(null);
          setCheckoutError("");
        } else if(selected && mode(selected)==="subscription" && pricing(selected).mode==="fixed" && fixedPrice(selected,(c==="monthly"||c==="termly"||c==="yearly")?c:"termly")>0) setSelectedPlan(selected);
        else setNotice("Your package is available for review. Activation or checkout is not yet available here for this package type.");`;
if (source.includes('const quantity = Number(params.get("students"))')) {
  console.log('Public handoff already installed.'); process.exit(0);
}
if (!source.includes(oldBlock)) {
  console.error('STOP: Your Owner file differs from the source this patch supports. No changes made.');
  process.exit(2);
}
const cleanOld = '["planId","checkout","billingCycle","source"]';
if (!source.includes(cleanOld)) {console.error('STOP: Owner URL cleanup shape changed.');process.exit(2);}
let revised = source.replace(oldBlock, newBlock).replace(cleanOld, '["planId","checkout","billingCycle","students","source"]');
fs.copyFileSync(file, file.replace(/\.tsx$/, '.pre-public-handoff.bak.tsx'));
fs.writeFileSync(file, revised);
console.log('Updated Owner public-pricing handoff, and saved a backup. Review the git diff before committing.');
