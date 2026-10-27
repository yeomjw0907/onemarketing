// Run with playwright-cli run-code --filename=scripts/qa-customer-recovery.js after opening the app.
// Every product write is intercepted; no customer data is created by this check.
async (page) => {
 const base=new URL(page.url()).origin,check=(ok,msg)=>{if(!ok)throw Error(msg);};
 let commerceFail=true,productsFail=true,stall=false,posts=0,productGets=0;
 let products=[{id:'00000000-0000-4000-8000-000000000011',version:1,name:'QA 제품',facts:'검증된 제품 설명',claims:'',forbidden:'',preserve:'',links:[],files:[]}];
 await page.route('**/api/commerce',route=>route.fulfill(commerceFail?{status:503,json:{error:'캠페인 조회 실패'}}:{json:{campaigns:[],orders:[]}}));
 await page.route('**/api/advertiser-products',async route=>{
  if(route.request().method()==='POST'){posts++;const body=route.request().postDataJSON();products.push({...products[0],...body,id:'00000000-0000-4000-8000-000000000012'});productsFail=true;return route.fulfill({json:{id:products[1].id}});}
  productGets++;if(stall)return new Promise(()=>{});
  return route.fulfill(productsFail?{status:503,json:{error:'제품 조회 실패'}}:{json:products});
 });
 await page.goto(base+'/advertisers');await page.getByRole('alert').filter({hasText:'캠페인 조회 실패'}).waitFor();
 check(await page.getByRole('link',{name:'로그인으로 이동',exact:true}).count()===0,'Transient failure incorrectly asks login');
 await page.getByRole('button',{name:'내 제품·서비스',exact:true}).click();await page.getByRole('alert').filter({hasText:'제품 조회 실패'}).waitFor();
 check(await page.getByRole('heading',{name:'아직 등록된 제품이 없어요.'}).count()===0,'Error rendered as empty products');
 await page.screenshot({path:'output/playwright/qa-after-recoverable-products-error.png',fullPage:true});
 productsFail=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.getByRole('heading',{name:'QA 제품',exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'QA 제품',exact:true}).waitFor();
 check(new URL(page.url()).searchParams.get('tab')==='products','Tab not preserved after reload');
 await page.getByRole('button',{name:'제품 등록',exact:true}).click();await page.getByRole('textbox').fill('저장된 새 제품');
 for(let i=0;i<8;i++){const title=await page.getByRole('heading',{level:2}).last().innerText();if(title==='입력한 내용을 확인해주세요.')break;await page.getByRole('button',{name:'다음',exact:true}).click();}
 await page.getByRole('button',{name:'제품 정보 저장',exact:true}).click();
 await page.getByRole('status').filter({hasText:'제품 저장은 완료'}).waitFor();check(posts===1,'Product save repeated after refresh failure');
 check(await page.getByRole('button',{name:'제품 정보 저장',exact:true}).count()===0,'Saved editor left open');
 productsFail=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.getByRole('heading',{name:'저장된 새 제품',exact:true}).waitFor();
 const before=posts;await page.locator('input[type=file]').first().setInputFiles({name:'oversized.txt',mimeType:'text/plain',buffer:Buffer.alloc(4*1024*1024+1)});
 await page.getByRole('alert').filter({hasText:'4MB'}).waitFor();check(posts===before,'Oversized upload sent');
 stall=true;await page.getByRole('button',{name:'새로고침',exact:true}).click();await page.getByRole('alert').filter({hasText:'응답이 늦어지고'}).waitFor({timeout:15000});
 check(await page.getByRole('status').filter({hasText:'불러오고'}).count()===0,'Timeout did not leave loading state');
 stall=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.getByRole('heading',{name:'저장된 새 제품',exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/qa-after-products-recovered.png',fullPage:true});
 await page.unroute('**/api/commerce');await page.unroute('**/api/advertiser-products');
 return {commerceFailureDoesNotBlockProducts:true,productsRetry:true,noFalseEmpty:true,tabRestored:true,mutationSentOnce:posts===1,oversizedUploadBlocked:true,timeoutRecovered:true,productGets};
}
