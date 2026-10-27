// Run with playwright-cli on the app origin. Intake replies and uploads are intercepted.
async(page)=>{
 const base=new URL(page.url()).origin,check=(ok,msg)=>{if(!ok)throw Error(msg);};
 let openFails=true,opens=0,saves=0,uploads=0,status='draft',version=1,fileCount=0;
 const id='00000000-0000-4000-8000-000000000021',token='a'.repeat(64);
 let fields={companyName:'기존 업체',contactName:'김담당',contactPhone:'01000000000',productName:'',category:'',features:'',target:'',goal:'',salesScope:'',forbidden:'',links:[],notes:'',fulfillment:'',startDate:'',budget:'',visitAddress:'',visitTimes:'',shippingDate:'',providedItems:''};
 await page.route('**/api/intake',async route=>{
 const request=route.request();if(request.method()==='POST'&&request.headers()['content-type']?.includes('multipart/form-data')){
 const text=request.postDataBuffer().toString();check(text.includes(id),'Multipart missing intake binding');uploads++;fileCount++;version++;
 return route.fulfill({json:{id:'asset',version,name:'안내.txt'}});
 }
 const b=request.method()==='POST'?request.postDataJSON():{};
 if(b.action==='open'){opens++;check(b.token===token,'Retry lost original token');if(openFails)return route.fulfill({status:503,json:{error:'접속 확인 실패'}});}
 if(b.action==='save'||b.action==='submit'){check(b.intakeId===id,'Missing campaign binding');fields=b.fields;version++;if(b.action==='save')saves++;else status='submitted';}
 return route.fulfill({json:{id,version,status,fields,requested:['company','campaign','files'],note:'필요한 정보만 확인해요.',fileCount,pendingUploads:[]}});
 });
 await page.goto(base+'/intake#'+token);await page.getByRole('alert').filter({hasText:'접속 확인 실패'}).waitFor();check(!page.url().includes('#'),'Token left in URL');
 openFails=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.getByRole('heading',{name:'회사·브랜드 이름을 확인해주세요.'}).waitFor();
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.getByRole('heading',{name:'어떤 방식으로 진행하나요?'}).waitFor();check(saves===0,'Unchanged prefills still saved');
 await page.getByRole('button',{name:'매장에 방문해요 장소·예약 방법을 알려주세요'}).click();
 for(let i=0;i<15;i++){
 const title=await page.getByRole('heading',{level:2}).innerText();if(title==='입력한 내용을 확인해주세요.')break;
 if(title==='어디로 방문하면 되나요?')await page.getByRole('textbox').fill('서울 성동구');
 if(title==='사진·소개 자료를 추가해주세요.'){
 await page.locator('input[type=file]').setInputFiles({name:'안내.txt',mimeType:'text/plain',buffer:Buffer.from('방문 안내')});await page.getByRole('status').filter({hasText:'안내.txt'}).waitFor();}
 await page.getByRole('button',{name:'다음',exact:true}).click();await page.waitForFunction(previous=>document.querySelector('h2')?.textContent!==previous,title);
 }
 check(saves===2,'Changed fields were repeatedly saved');check(uploads===1,'Small upload should use one request');
 check(await page.getByText('1개 자료',{exact:false}).count()>0,'File review missing real count');
 await page.getByRole('button',{name:'자료 전달하기',exact:true}).click();await page.getByRole('heading',{name:'자료를 잘 전달했어요.'}).waitFor();
 check(await page.getByText('visit',{exact:true}).count()===0,'Internal selection code exposed');
 await page.screenshot({path:'output/playwright/qa-intake-submitted-readable.png',fullPage:true});
 await page.reload();await page.getByRole('heading',{name:'자료를 잘 전달했어요.'}).waitFor();
 await page.unroute('**/api/intake');return {initialLoadRetry:true,originalTokenKept:true,unchangedSavesSkipped:true,saves,smallUploadRequests:uploads,readableSummary:true,submittedAfterReload:true,opens};
}
