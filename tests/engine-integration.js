'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const api=require('../extension/js/runtime');
const crypto=require('node:crypto');
const root=path.resolve(process.argv[2]),source=path.resolve(process.argv[3]),receipt=path.resolve(process.argv[4]);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'Beat Marker clean CEP test '));
function tree(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(path.join(folder,e.name)):[[path.relative(root,path.join(folder,e.name)),crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,e.name))).digest('hex')]]);}
(async()=>{
  try{
    const before=tree(root).sort(),runtime=api.prepare({root,stateRoot:path.join(temp,'user data')});
    const version=await runtime.check();assert.equal(version.frozen,true);
    const output=path.join(runtime.jobs,'analysis result.json');
    let analysis;
    for(let pass=0;pass<2;pass++){
      const job=runtime.analysisJob(source,output,'auto');const result=cp.spawnSync(job.file,job.args,Object.assign({encoding:'utf8',timeout:300000},job.options));
      assert.equal(result.status,0,result.stdout+'\n'+result.stderr);analysis=JSON.parse(fs.readFileSync(output,'utf8'));
      assert.ok(analysis.beats.length>=8);assert.ok(analysis.beats.every(b=>Number.isFinite(b.time)&&b.time>=0&&b.time<=analysis.duration));
      if(pass===1)assert.equal(analysis.cached,true);
    }
    assert.deepEqual(tree(root).sort(),before,'Analysis wrote files into the signed extension.');
    const proof={passed:true,platform:process.platform,panelVersion:api.version,engineVersion:version.version,beats:analysis.beats.length,cacheReused:true,signedFolderUnchanged:true,externalUserData:true};
    fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
