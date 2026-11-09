#!/usr/bin/env node
/** Stage 7 / Step 1 Package B. Read-only by design: never POST, PATCH or DELETE. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/owner/subscriptions.tsx'), 'utf8');
const contracts = [
  ['student checkout defaults disabled', /NEXT_PUBLIC_STUDENT_PRICED_CHECKOUT_MODE\s*\|\|\s*["']off["']/],
  ['quotations created server-side', /quoteRequest\(["']\/billing\/subscription-quotes["']/],
  ['student count not supplied in checkout payload', /toPlanId:studentCheckoutPlan\.id,billingCycle:cycle/],
  ['recovery uses GET route', /quoteRequest\(`\/billing\/subscription-quotes\/\$\{encodeURIComponent\(quoteId\)\}\/recover`\)/],
  ['pending payment recovery visible without dialog', /Check pending payment/],
  ['pending order ID persists through refresh', /sessionStorage\.getItem\(PENDING_QUOTE_KEY\)/],
  ['payments verified through backend', /\/billing\/payments\/verify\//],
  ['checkout URL restricted to Paystack', /hostname\.endsWith\(["']\.paystack\.com["']\)/],
  ['payment status is not equated to active entitlement', /paid access is confirmed only when your subscription and entitlement are active/],
];
let passed=0;
for (const [label, re] of contracts) {
  if (re.test(source)) { console.log(`PASS: ${label}`); passed++; }
  else { console.error(`FAIL: ${label}`); process.exitCode=1; }
}
console.log(`Static frontend checks: ${passed}/${contracts.length}`);

async function main() {
  const base = process.env.STAGE7_TEST_API_BASE;
  const token = process.env.STAGE7_TEST_TOKEN;
  if (!base || !token) {
    console.log('SKIP: live API checks. Set STAGE7_TEST_API_BASE and STAGE7_TEST_TOKEN for a disposable test account.');
    console.log('NO POST/PUT/PATCH/DELETE REQUESTS ARE MADE BY THIS SCRIPT.');
    return;
  }
  const target = new URL(base);
  if (target.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(target.hostname)) throw Error('Use HTTPS or localhost.');
  // Protect production by requiring an explicit opt-in, even though checks are GET-only.
  if (process.env.STAGE7_I_UNDERSTAND_READONLY !== 'yes') throw Error('Set STAGE7_I_UNDERSTAND_READONLY=yes to enable GET-only checks.');
  const headers = {Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`};
  async function read(endpoint) {
    const url = new URL(endpoint, target.href.endsWith('/') ? target.href : target.href + '/');
    const r = await fetch(url,{method:'GET',headers,redirect:'error'});
    const txt = await r.text();
    let payload;try{payload=JSON.parse(txt)}catch{payload=null}
    return {status:r.status,payload};
  }
  const subscription = await read('billing/my-subscription');
  assert.ok([200,404].includes(subscription.status),`my-subscription returned HTTP ${subscription.status}`);
  console.log(`PASS: authenticated subscription read (${subscription.status})`);
  const id = process.env.STAGE7_TEST_QUOTE_ID;
  if (id) {
    assert.match(id,/^[0-9a-f-]{20,}$/i,'Quote ID must look like an identifier');
    const q=await read(`billing/subscription-quotes/${encodeURIComponent(id)}`);
    assert.equal(q.status,200,`test quotation GET returned ${q.status}`);
    assert.equal(q.payload?.id,id,'quote identifier mismatch');
    console.log('PASS: account-scoped quotation read');
  }
  const foreign = process.env.STAGE7_FOREIGN_QUOTE_ID;
  if (foreign) {
    assert.match(foreign,/^[0-9a-f-]{20,}$/i);
    const q=await read(`billing/subscription-quotes/${encodeURIComponent(foreign)}`);
    assert.ok([403,404].includes(q.status),`Foreign quote visible: HTTP ${q.status}`);
    console.log('PASS: foreign quotation is not accessible');
  }
  console.log('PASS: read-only API checks completed');
}
main().catch(err=>{console.error(`FAIL: ${err.message}`); process.exitCode=1});
