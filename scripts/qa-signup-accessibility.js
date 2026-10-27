// Signup keyboard/format regression. Authentication replies are intercepted; signup is not submitted.
async(page)=>{
 const base=new URL(page.url()).origin,check=(ok,msg)=>{if(!ok)throw Error(msg);};
 await page.route('**/api/advertiser-auth',route=>route.fulfill({json:{account:null,kakaoEnabled:true,kakaoPending:false}}));
 await page.goto(base+'/login?role=advertiser&signup=1');await page.getByRole('button',{name:'이메일로 가입하기',exact:true}).click();
 await page.getByRole('button',{name:'개인·창업 준비 중이에요 아직 사업자등록 전이어도 괜찮아요'}).click();await page.getByRole('button',{name:'다음',exact:true}).click();
 for(const value of ['검증용 업체','검증용 브랜드']){await page.getByRole('textbox').fill(value);await page.getByRole('textbox').press('Enter');}
 for(const width of [320,390,768,1440]){
 await page.setViewportSize({width,height:900});
 const layout=await page.getByRole('heading',{name:'어떤 제품이나 서비스를 제공하세요?'}).evaluate(h=>{const n=h.firstChild,t=n.textContent,i=t.indexOf('제공하세요?'),a=document.createRange(),b=document.createRange();a.setStart(n,i);a.setEnd(n,i+1);b.setStart(n,t.length-1);b.setEnd(n,t.length);return {first:a.getBoundingClientRect().top,last:b.getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 check(layout.first===layout.last&&!layout.overflow,'Heading/viewport overflow '+width);
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'음식점·카페',exact:true}).click();await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.getByRole('textbox').fill('확인된 제품을 소개합니다.');await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByRole('textbox').fill('서울');await page.getByRole('textbox').press('Enter');await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByRole('textbox').fill('김담당');await page.getByRole('textbox').press('Enter');
 await page.getByRole('textbox').pressSequentially('01012345678');check(await page.getByRole('textbox').inputValue()==='010-1234-5678','Phone formatting');await page.getByRole('textbox').press('Enter');
 await page.getByRole('textbox').fill('morning@na');await page.getByRole('button',{name:'morning@naver.com',exact:true}).click();await page.getByRole('textbox').press('Enter');await page.getByRole('heading',{name:'로그인 비밀번호를 정해주세요.'}).waitFor();
 check(!(await page.locator('body').innerText()).includes('\uFFFD'),'Broken encoding');check(await page.getByRole('button',{name:/카카오|로그인|체험단/}).count()===0,'Auth controls leaked');
 await page.unroute('**/api/advertiser-auth');return {widths:[320,390,768,1440],wholeWordHeadings:true,noHorizontalOverflow:true,phoneFormatting:true,emailSuggestions:true,emailEnterAdvances:true,noBrokenEncoding:true};
}
