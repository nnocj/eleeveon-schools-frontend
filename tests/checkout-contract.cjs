const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
const checks = [
 ['No legacy subscription route for student quote', () => /props\.purpose === "subscription_quote"[\s\S]*?subscription-quotes\/\$\{encodeURIComponent\(props\.quoteId\)\}\/pay/.test(read('app/components/payments/PaymentCheckout.tsx'))],
 ['Quotation route guarded by server flag on Owner page', () => read('app/owner/subscriptions.tsx').includes('NEXT_PUBLIC_STUDENT_PRICED_CHECKOUT_MODE')],
 ['Quote payment refuses manual payment', () => read('app/components/payments/PaymentCheckout.tsx').includes('This subscription must be paid through Paystack')],
 ['Paystack checkout URL hostname verified', () => read('app/components/payments/PaymentCheckout.tsx').includes('host.endsWith(".paystack.com")')],
 ['New subscription supported for trial or pending', () => read('app/owner/subscriptions.tsx').includes('? "renewal" : "new"')],
 ['Server sets student count', () => !/studentCount\s*:\s*count\b/.test(read('app/owner/subscriptions.tsx'))],
 ['Trial plan uses sp002 code', () => read('src/auth/auth.service.ts').includes('"sp002"')],
 ['Entitlement rebuilt after new signup', () => read('src/auth/auth.service.ts').includes('entitlementResolver.rebuild(result.account.id)')],
 ['Cloud price resolver accepts connected plan', () => read('src/billing/pricing-resolution.service.ts').includes('"connected"')],
 ['Payment amount not taken from browser for quote checkout', () => !/subscription-quotes\/\$\{encodeURIComponent\(props\.quoteId\)\}\/pay[\s\S]{0,400}amount\s*[,}:]/.test(read('app/components/payments/PaymentCheckout.tsx'))],
];
for(const [label, check] of checks){try {const ok=!!check(); console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failed++;}catch(e){failed++;console.error('FAIL:',label,e.message)}}
console.log(`Source contract checks: ${checks.length-failed}/${checks.length}`);
console.log('NOTE: These are source checks, not payment, build, DB or webhook integration tests.');
if(failed)process.exitCode=1;
