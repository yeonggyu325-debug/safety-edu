'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
function createNetworkAccess(networks){
 if(!Array.isArray(networks)||!networks.length)throw Error('At least one intranet network is required');
 const list=new net.BlockList();list.addSubnet('127.0.0.0',8,'ipv4');
 for(const cidr of networks){
  const parts=String(cidr).split('/'),address=parts[0],prefix=Number(parts[1]),octets=address.split('.').map(Number);
  const privatePrefix=octets[0]===10?8:octets[0]===172&&octets[1]>=16&&octets[1]<=31?12:octets[0]===192&&octets[1]===168?16:0;
  if(parts.length!==2||!net.isIPv4(address)||!Number.isInteger(prefix)||!privatePrefix||prefix<privatePrefix||prefix>32)throw Error('Only explicit private IPv4 networks are allowed: '+cidr);
  list.addSubnet(address,prefix,'ipv4');
 }
 return ip=>{if(ip==='::1')return true;const address=String(ip||'').replace(/^::ffff:/,'');return net.isIPv4(address)&&list.check(address,'ipv4')};
}

function loadIntranetSettings({project=path.resolve(__dirname,'..'),env=process.env,loadTls=true}={}){
 const config=JSON.parse(fs.readFileSync(path.join(project,'config/intranet.json'),'utf8'));
 const localFile=path.join(project,'config/intranet.local.json');
 const local=fs.existsSync(localFile)?JSON.parse(fs.readFileSync(localFile,'utf8')):{};
 const settings={...config,...local};
 const host=env.SAFETY_HOST??settings.host??'0.0.0.0';
 const port=Number(env.PORT??settings.port);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid server port');
 if(!net.isIPv4(host))throw Error('Intranet binding requires an IPv4 address');
 const allowedNetworks=env.SAFETY_ALLOWED_NETWORKS!==undefined?env.SAFETY_ALLOWED_NETWORKS.split(',').map(value=>value.trim()).filter(Boolean):settings.allowedNetworks;
 const allowed=createNetworkAccess(allowedNetworks);
 const displayHost=env.SAFETY_DISPLAY_HOST??settings.displayHost??host;
 if(typeof displayHost!=='string'||!displayHost||!/^[a-zA-Z0-9.-]+$/.test(displayHost))throw Error('Invalid display host');
 const listenAddress=env.SAFETY_LISTEN_ADDRESS??settings.listenAddress??(net.isIPv4(displayHost)?displayHost:null);
 if(!net.isIPv4(listenAddress)||!allowed(listenAddress))throw Error('Firewall listen address must belong to an allowed intranet network');
 if(host!=='0.0.0.0'&&!allowed(host))throw Error('Binding address must belong to an allowed intranet network');
 let tls=null;if(settings.tls&&loadTls){
  if(!settings.tls.cert||!settings.tls.key)throw Error('Both TLS certificate and key paths are required');
  tls={cert:fs.readFileSync(path.resolve(project,settings.tls.cert)),key:fs.readFileSync(path.resolve(project,settings.tls.key))};
 }
 return {host,port,displayHost,listenAddress,allowedNetworks,tls};
}
module.exports={createNetworkAccess,loadIntranetSettings};
