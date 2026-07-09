const https = require('https');
const fs = require('fs');
const path = './connected-accounts.json';
const data = JSON.parse(fs.readFileSync(path,'utf8'));
const accounts = data;
async function httpGetJson(url){
  return new Promise((res,rej)=>{
    https.get(url,(r)=>{
      let raw='';
      r.on('data',(c)=>raw+=c);
      r.on('end',()=>{
        try{ res({statusCode:r.statusCode,headers:r.headers,body:raw,parsed:JSON.parse(raw)}); }catch(e){ res({statusCode:r.statusCode,headers:r.headers,body:raw}); }
      });
    }).on('error',rej);
  });
}
(async ()=>{
  for(const acct of accounts){
    try{
      console.log('\n--- ACCOUNT:', acct.platform, acct.account_id);
      const url = `https://graph.facebook.com/v25.0/${acct.account_id}?fields=id,name,instagram_business_account&access_token=${acct.access_token}`;
      const r = await httpGetJson(url);
      console.log('FB GET status', r.statusCode, 'bodyPreview', (r.body||'').slice(0,500));
      if(r.parsed && r.parsed.instagram_business_account && r.parsed.instagram_business_account.id){
        const igid = r.parsed.instagram_business_account.id;
        const url2 = `https://graph.facebook.com/v25.0/${igid}?fields=id,username&access_token=${acct.access_token}`;
        const r2 = await httpGetJson(url2);
        console.log('IG GET status', r2.statusCode, 'bodyPreview', (r2.body||'').slice(0,500));
      }
    }catch(e){console.error('ERR for', acct.account_id, e.message||e);} 
  }
  const testUrl = 'https://evv-client-portal-production.up.railway.app/uploads/1783187144853-2c659b374d34.png';
  console.log('\n--- Media URL HEAD test:', testUrl);
  const head = await new Promise((res,rej)=>{https.get(testUrl,(r)=>{res({status:r.statusCode,headers:r.headers});}).on('error',rej);});
  console.log('Media status', head.status, 'content-type', head.headers['content-type']);
})();