'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const api=require('../extension/js/runtime');
function fixture(t){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'Beat Marker runtime test ')));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const extension=path.join(base,'extension'),root=path.join(extension,'runtime'),state=path.join(base,'user data');
  fs.mkdirSync(root,{recursive:true});
  const info={version:'0.4.0',platform:'macos-arm64',build_id:'0123456789abcdef',engine:'engine/beat-marker-engine',ffmpeg:'bin/ffmpeg',ffprobe:'bin/ffprobe',model:'models/model.ckpt'};
  for(const name of ['engine','ffmpeg','ffprobe','model']){const file=path.join(root,info[name]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');fs.chmodSync(file,0o755);}
  const save=()=>fs.writeFileSync(path.join(root,'runtime.json'),JSON.stringify(info));save();
  const options={root:extension,stateRoot:state,process:{platform:'darwin',arch:'arm64',env:{PATH:'/Adobe',PYTHONPATH:'wrong',DYLD_LIBRARY_PATH:'wrong'}}};
  return {base,extension,root,state,info,save,options,prepare:()=>api.prepare(options)};
}
test('user data stays outside the installed extension',t=>{
  const f=fixture(t),r=f.prepare();assert.equal(r.jobs,path.join(f.state,'jobs'));
  assert.ok(!fs.existsSync(path.join(f.extension,'jobs')));
  f.options.stateRoot=path.join(f.extension,'jobs');assert.throws(f.prepare,/outside/);
  const link=path.join(f.base,'linked-extension');fs.symlinkSync(f.extension,link);
  f.options.stateRoot=path.join(link,'jobs');assert.throws(f.prepare,/outside/);
});
test('wrong platform and engine version fail before starting a process',t=>{
  const f=fixture(t);f.info.platform='windows-x64';f.save();assert.throws(f.prepare,/macos-arm64/);
  f.info.platform='macos-arm64';f.info.version='wrong';f.save();assert.throws(f.prepare,/does not match/);
});
test('resource traversal and external symlinks are rejected',t=>{
  const f=fixture(t),outside=path.join(f.base,'outside');fs.writeFileSync(outside,'outside');
  f.info.model='../../outside';f.save();assert.throws(f.prepare,/incomplete/);
  f.info.model='models/external';fs.symlinkSync(outside,path.join(f.root,f.info.model));f.save();assert.throws(f.prepare,/invalid file link/);
});
test('analysis arguments retain spaces and special characters without a shell',t=>{
  const f=fixture(t),r=f.prepare(),source=path.join(f.base,'song & drum.wav'),output=path.join(r.jobs,'analysis.json'),job=r.analysisJob(source,output,'auto');
  assert.equal(job.args[job.args.indexOf('--source')+1],source);assert.equal(job.args[job.args.indexOf('--output')+1],output);
  assert.equal(job.options.windowsHide,true);assert.equal(job.options.shell,undefined);assert.equal(job.options.env.PYTHONPATH,undefined);
  assert.equal(job.options.env.DYLD_LIBRARY_PATH,undefined);assert.equal(job.options.env.PATH,'/usr/bin:/bin');
  assert.throws(()=>r.analysisJob(source,output,'invalid'),/Unknown timing/);
});
test('a ZIP with missing executable permissions gets a separate runnable copy',t=>{
  const f=fixture(t);fs.chmodSync(path.join(f.root,f.info.engine),0o644);const r=f.prepare();
  assert.notEqual(r.root,f.root);assert.ok(r.root.startsWith(f.state+path.sep));assert.equal(fs.statSync(path.join(f.root,f.info.engine)).mode&0o111,0);
  fs.accessSync(path.join(r.root,f.info.engine),fs.constants.X_OK);assert.equal(f.prepare().root,r.root);
});
test('upgrades preserve previous Undo records without replacing newer records',t=>{
  const f=fixture(t),old=path.join(f.extension,'jobs');fs.mkdirSync(old);fs.writeFileSync(path.join(old,'last-marker-write.json'),'{"previous":true}');
  const r=f.prepare(),record=path.join(r.jobs,'last-marker-write.json');assert.deepEqual(JSON.parse(fs.readFileSync(record)),{previous:true});
  fs.writeFileSync(record,'{"newer":true}');f.prepare();assert.deepEqual(JSON.parse(fs.readFileSync(record)),{newer:true});
});
test('Windows workers use the system DLL path and hide console windows',()=>{
  const env=api.environment({platform:'win32',env:{SystemRoot:'C:\\Windows',PATH:'Adobe',PYTHONHOME:'bad'}},path.win32);
  assert.equal(env.PATH,'C:\\Windows\\System32');assert.equal(env.PYTHONHOME,undefined);
});
