'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createNetworkAccess,loadIntranetSettings}=require('../server/intranet.cjs');
test('Intranet access accepts the configured private subnet and loopback; denies all other source addresses',()=>{
 const allowed=createNetworkAccess(['10.23.0.0/20']);
 for(const address of ['10.23.8.10','10.23.7.20','10.23.15.254','127.0.0.1','::1','::ffff:10.23.8.10'])assert.equal(allowed(address),true);
 for(const address of ['10.23.16.1','10.11.1.1','192.168.1.10','203.0.113.1','::ffff:203.0.113.1','garbage','2001:db8::1'])assert.equal(allowed(address),false);
 for(const networks of [[],['0.0.0.0/0'],['10.0.0.0/0'],['172.16.0.0/8'],['192.168.0.0/8'],['10.23.0.0/33']])assert.throws(()=>createNetworkAccess(networks));

});

test('Local intranet settings stay separate from defaults; environment overrides are shared with firewall configuration',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'safety-intranet-settings-'));
 try{
  fs.mkdirSync(path.join(project,'config'));
  fs.writeFileSync(path.join(project,'config/intranet.json'),JSON.stringify({host:'0.0.0.0',port:3000,allowedNetworks:[],tls:null}));
  assert.throws(()=>loadIntranetSettings({project,env:{}}),/At least one intranet network/);
  fs.writeFileSync(path.join(project,'config/intranet.local.json'),JSON.stringify({displayHost:'10.23.8.10',listenAddress:'10.23.8.10',allowedNetworks:['10.23.0.0/20']}));
  const settings=loadIntranetSettings({project,env:{}});
  assert.equal(settings.displayHost,'10.23.8.10');assert.deepEqual(settings.allowedNetworks,['10.23.0.0/20']);assert.equal(settings.port,3000);
  const env={SAFETY_HOST:'10.24.2.10',SAFETY_DISPLAY_HOST:'safety.company.example',SAFETY_LISTEN_ADDRESS:'10.24.2.10',SAFETY_ALLOWED_NETWORKS:' 10.24.0.0/16, 192.168.50.0/24 ',PORT:'4443'};
  const overridden=loadIntranetSettings({project,env,loadTls:false});
  assert.equal(overridden.host,'10.24.2.10');assert.equal(overridden.listenAddress,'10.24.2.10');assert.equal(overridden.displayHost,'safety.company.example');assert.equal(overridden.port,4443);
  assert.deepEqual(overridden.allowedNetworks,['10.24.0.0/16','192.168.50.0/24']);
  for(const bad of [{PORT:'0'},{SAFETY_ALLOWED_NETWORKS:''},{SAFETY_ALLOWED_NETWORKS:'0.0.0.0/0'},{SAFETY_LISTEN_ADDRESS:'203.0.113.1'},{SAFETY_DISPLAY_HOST:'https://example.com'},{SAFETY_HOST:'203.0.113.1'}]){
   assert.throws(()=>loadIntranetSettings({project,env:{...env,...bad}}));
  }
  fs.writeFileSync(path.join(project,'config/intranet.local.json'),'{malformed');
  assert.throws(()=>loadIntranetSettings({project,env:{}}),SyntaxError);
 }finally{fs.rmSync(project,{recursive:true,force:true})}
});
