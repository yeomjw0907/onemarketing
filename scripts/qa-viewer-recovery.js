// Viewer failures must keep the last known navigation instead of logging the visitor out.
async(page)=>{
 const base=new URL(page.url()).origin;let failed=false;
 await page.route('**/api/viewer',r=>r.fulfill(failed?{status:503,json:{error:'서버 연결 지연'}}:{json:{admin:false,advertiser:true,participant:false}}));
 await page.goto(base+'/about');
 await page.getByRole('link',{name:'광고주 마이페이지',exact:true}).waitFor();
 failed=true;await page.evaluate(()=>window.dispatchEvent(new Event('om-auth-change')));
 await page.waitForTimeout(700);
 if(!await page.getByRole('link',{name:'광고주 마이페이지',exact:true}).isVisible())throw Error('Viewer failure cleared known session');
 await page.unroute('**/api/viewer');return {viewerFailurePreservesNavigation:true};
}
