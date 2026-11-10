const fs = require('fs');
const p='app/owner/subscriptions.tsx';
const text=fs.readFileSync(p,'utf8');
const checks = [
['status feedback visible in banner',/recovery-feedback \$\{recoveryFeedback\.kind\}/],
['resumes existing verified quote',/function resumeExistingQuote\(/],
['cancellation uses server route',/subscription-quotes\/\$\{encodeURIComponent\(quoteId\)\}\/cancel/],
['only cancel quoted quotation',/recoveryStatus!=="quoted"/],
['recovery stays GET only',/quoteRequest\(`\/billing\/subscription-quotes\/\$\{encodeURIComponent\(quoteId\)\}\/recover`\)/],
['resumable Paystack session link',/Continue existing Paystack session/],
['manual review warning',/No resumable Paystack link is available/],
['applied order clears local recovery state',/result\.status==="applied" && recovery\.applied/],
];
for(const [name,re] of checks){const ok=re.test(text); console.log(`${ok?'PASS':'FAIL'}: ${name}`); if(!ok)process.exitCode=1;}
