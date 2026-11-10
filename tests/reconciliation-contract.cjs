const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const svc=read('src/billing/billing.service.ts'),ctrl=read('src/billing/billing.controller.ts'),owner=read('app/owner/subscriptions.tsx'),page=read('app/payment/confirmation/page.tsx');
for(const [label,pass] of [
['protected reconciliation route',ctrl.includes('@Post("subscription-quotes/:id/reconcile")')],
['reconciliation calls existing Paystack verification',svc.includes('await this.verifyPayment(actor, payment.providerReference, "paystack")')],
['order owned by account',svc.includes('getForAccount(actor.accountId, id)')],
['payment cross-checks',svc.includes('payment.invoiceId !== order.invoiceId')],
['idempotent existing activation',svc.includes('return this.activateSubscriptionFromPayment(paymentId)')],
['Owner paid action',owner.includes('Reconcile paid payment & activate subscription')],
['new callback page exists',page.includes('Payment Confirmation')],
['callback uses reference',page.includes('get("reference")')],
['no auto-charge on callback',!page.includes('/pay`')],
]) { assert(pass,label); console.log('PASS',label) }
