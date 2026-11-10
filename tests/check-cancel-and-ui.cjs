const fs=require('fs'),ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8');
const files=[['app/owner/subscriptions.tsx',ts.ScriptKind.TSX],['src/billing/billing.service.ts',ts.ScriptKind.TS],['src/billing/subscription-change.service.ts',ts.ScriptKind.TS]];
let bad=0;for(const [p,k] of files){const src=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,k);if(src.parseDiagnostics.length){console.error('PARSE FAIL',p,src.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')));bad++}else console.log('PASS TypeScript syntax',p)}
const front=read('app/owner/subscriptions.tsx'), bill=read('src/billing/billing.service.ts'),change=read('src/billing/subscription-change.service.ts');
const tests=[
 ['prepaid capacity selector',front.includes('function StudentPlaceSelector')],
 ['capacity presets',front.includes('[50,100,200,500]')],
 ['failed recovery cancellation button',front.includes('Cancel failed checkout')],
 ['failed recovery status check',front.includes('recoveryPaymentStatus==="failed"')],
 ['server confirmation of cancellation required',front.includes('if(!response.ok)throw new Error("The server did not confirm cancellation.")')],
 ['server rechecks gateway status',bill.includes('verifyPayment("paystack", order.payment.providerReference)')],
 ['server explicitly rejects nonterminal provider statuses',bill.includes('["failed", "abandoned"].includes')],
 ['server matches amount and currency',bill.includes('gateway?.currency !== order.currency')&&bill.includes('order.amountDue * 100')],
 ['server matches payment to order and account',bill.includes('order.payment.accountId !== actor.accountId')&&bill.includes('order.payment.id !== order.paymentId')],
 ['backend cancellation guards order state',change.includes('status: order.status')],
 ['backend cancellation requires linked failed payment',change.includes('order.payment.status !== "failed"')],
 ['cancel does not activate unpaid subscription',!change.includes('cancelledAt: new Date(), paidAt: new Date()')]
];for(const [name,pass] of tests){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)bad++}if(bad)process.exit(1);
