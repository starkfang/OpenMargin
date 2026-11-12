'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const RETRY_DELAYS=[50,100,200,400,800,1000,1000];
const retryable=new Set(['EPERM','EACCES','EBUSY']);
const defaultDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Windows scanners and other readers may temporarily hold a file without
// delete sharing. Never remove the destination: retry the atomic rename, and
// check the source hash again before every attempt so a new external edit is
// not knowingly overwritten while the application waits for the lock.
async function checkedReplace(temp,file,expectedHash,{io=fs,platform=process.platform,delay=defaultDelay}={}){
  for(let attempt=0;;attempt++){
    const actual=crypto.createHash('sha256').update(await io.readFile(file,'utf8')).digest('hex');
    if(actual!==expectedHash)throw new Error('FILE_CONFLICT');
    try{return await io.rename(temp,file)}catch(error){
      if(platform!=='win32'||!retryable.has(error.code)||attempt>=RETRY_DELAYS.length)throw error;
      await delay(RETRY_DELAYS[attempt]);
    }
  }
}
module.exports={checkedReplace};
