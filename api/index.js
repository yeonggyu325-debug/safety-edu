'use strict';
const {get,issueSignedToken,presignUrl}=require('@vercel/blob');
const {createLibraryLoader}=require('../server/cloud-library.cjs');
const {createCloudHandler}=require('../server/cloud-handler.cjs');
const loadLibrary=createLibraryLoader(get);
module.exports=createCloudHandler({loadLibrary,async signFile(pathname){
 const validUntil=Date.now()+5*60*1000;
 const token=await issueSignedToken({pathname,operations:['get'],validUntil});
 return (await presignUrl(token,{operation:'get',pathname,validUntil,access:'private'})).presignedUrl;
}});
