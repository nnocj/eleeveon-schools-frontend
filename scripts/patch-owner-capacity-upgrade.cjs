/** Safe additive UI change: capacity upgrade panel is informational until the backend supports verified prorated orders. */
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(process.cwd(),'app/owner/subscriptions.tsx');
let s=fs.readFileSync(file,'utf8');
const replace=(oldText,newText,label)=>{if(!s.includes(oldText))throw Error('Cannot patch '+label+'; source differs. No file changed.');s=s.replace(oldText,newText)};
if(s.includes('ELEV_CAPACITY_UPGRADE_V1')){console.log('Upgrade panel already installed');process.exit(0)}
replace('  id?: string; planId?: string|null; plan?: Plan|null; status?: string|null;', '  id?: string; planId?: string|null; plan?: Plan|null; status?: string|null; metadata?: { prepaidStudentLimit?: number; [key:string]:unknown }|null; currentPeriodStart?:string|null;', 'Subscription data type');
replace('  const [studentCheckoutPlan,setStudentCheckoutPlan]=useState<Plan|null>(null);', '  const [studentCheckoutPlan,setStudentCheckoutPlan]=useState<Plan|null>(null);\n  const [capacityUpgradePlan,setCapacityUpgradePlan]=useState<Plan|null>(null); // ELEV_CAPACITY_UPGRADE_V1', 'capacity state');
replace('    if(isCurrent)return "Current package";', '    if(isCurrent && mode(p)==="subscription" && pricing(p).mode!=="fixed")return "Increase student capacity";\n    if(isCurrent)return "Current package";', 'button label');
replace('          const disabled=isCurrent||!canCheckout(p);', '          const upgradeAvailable=isCurrent && mode(p)==="subscription" && pricing(p).mode!=="fixed";\n          const disabled=!upgradeAvailable && (isCurrent||!canCheckout(p));', 'active button');
replace('onClick={()=>pricing(p).mode==="fixed"?setSelectedPlan(p):openStudentCheckout(p)}>{buttonLabel(p,isCurrent)}</button>', 'onClick={()=>upgradeAvailable?setCapacityUpgradePlan(p):pricing(p).mode==="fixed"?setSelectedPlan(p):openStudentCheckout(p)}>{buttonLabel(p,isCurrent)}</button>', 'button action');
const insertion=`      {capacityUpgradePlan?<FullViewportOverlay><div className="ba-sheet-backdrop" role="presentation"><section className="ba-sheet small" role="dialog" aria-modal="true" aria-label="Increase purchased student capacity">
        <div className="ba-sheet-head"><div><h2>Increase student capacity</h2><p>Existing Standard subscription · keep the same expiry date</p></div><button type="button" onClick={()=>setCapacityUpgradePlan(null)} aria-label="Close upgrade panel">✕</button></div>
        <div className="student-checkout-content">
          {(()=>{
            const previous=Number(current?.metadata?.prepaidStudentLimit);
            const start=current?.currentPeriodStart?new Date(current.currentPeriodStart).getTime():NaN;
            const end=current?.currentPeriodEnd?new Date(current.currentPeriodEnd).getTime():NaN;
            const now=Date.now();
            const remaining=Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end>now?Math.max(0,Math.min(1,(end-now)/(end-start))):null;
            const oldPrice=Number.isSafeInteger(previous)&&previous>0?quote(capacityUpgradePlan,previous,cycle).amount:null;
            const newPrice=Number.isSafeInteger(previous)&&previous>0&&count>previous?quote(capacityUpgradePlan,count,cycle).amount:null;
            const delta=oldPrice!==null&&newPrice!==null?Math.max(0,newPrice-oldPrice):null;
            const estimate=remaining!==null&&delta!==null?Math.round(delta*remaining*100)/100:null;
            return <>
              <div className="student-checkout-quote"><strong>Current paid allowance: {Number.isSafeInteger(previous)&&previous>0?previous.toLocaleString():"Not available"}</strong><span>Subscription ends: {formatDate(current?.currentPeriodEnd)}</span></div>
              <StudentPlaceSelector value={count} onChange={setCount} label="New TOTAL student allowance (not additional places)" />
              {Number.isSafeInteger(previous)&&previous>0&&count<=previous?<p role="alert" className="student-checkout-error">Enter a total greater than your existing allowance of {previous}.</p>:null}
              {estimate!==null&&count>previous?<div className="student-checkout-quote"><strong>Indicative remaining-term difference: GHS {estimate.toFixed(2)}</strong><span>{count-previous} additional places · {Math.round((remaining??0)*100)}% of the existing period remaining</span><small>For illustration only: not a payable quotation or an invoice.</small></div>:<p>Once the server confirms your existing allowance and remaining term, it will calculate the upgrade balance.</p>}
              <p role="status">Mid-term capacity upgrades require a server-verified, pesewa-accurate quote. Live upgrade payment is not enabled yet. Your current subscription remains active and its expiry date will not change.</p>
              <button type="button" className="student-checkout-primary" onClick={()=>setCapacityUpgradePlan(null)}>Return to subscription</button>
            </>;
          })()}
        </div>
      </section></div></FullViewportOverlay>:null}
`;
replace('      {moreOpen?<FullViewportOverlay>',insertion+'      {moreOpen?<FullViewportOverlay>', 'upgrade panel');
const backup=file.replace(/\.tsx$/,'.before-capacity-upgrade.bak.tsx');
fs.copyFileSync(file,backup); fs.writeFileSync(file,s); console.log('Capacity upgrade panel installed; backup: '+backup);
