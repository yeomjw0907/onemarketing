// Requires an isolated QA admin session on the app origin; never run against another customer's records.
async(page)=>{
 const base=new URL(page.url()).origin,meta=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa_fixture')));let fail=true;
 await page.setViewportSize({width:1440,height:1000});
 await page.route(url=>url.pathname==='/api/customer-account',route=>fail?route.fulfill({status:503,json:{error:'계정 조회 확인 실패'}}):route.continue());
 await page.goto(base+'/admin?page=customers&id='+meta.customerId);await page.getByRole('alert').filter({hasText:'계정 조회 확인 실패'}).waitFor();
 if(await page.getByText('계정 정보를 확인 중입니다.',{exact:true}).count())throw Error('Admin spinner stuck after failure');
 await page.screenshot({path:'output/playwright/qa-admin-account-error.png',fullPage:true});
 fail=false;await page.getByRole('button',{name:'계정 정보 다시 불러오기',exact:true}).click();await page.getByText('로그인 아이디:',{exact:false}).waitFor();
 await page.getByRole('combobox',{name:'자료 종류',exact:true}).selectOption('reference');
 await page.getByLabel('고객 자료 업로드',{exact:true}).setInputFiles({name:'관리자 자료.txt',mimeType:'text/plain',buffer:Buffer.from('관리자 자료 업로드 확인')});
 await page.getByRole('status').filter({hasText:'1개 파일을 등록했습니다.'}).waitFor();
 await page.unroute(url=>url.pathname==='/api/customer-account');
 return {adminAccountErrorLeavesLoading:true,adminRetry:true,realAdminFileUpload:true};
}
