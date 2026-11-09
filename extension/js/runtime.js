(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BeatMarkerRuntime=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  var PANEL_VERSION='0.6.0',ENGINE_VERSION='0.4.0';
  function environment(process,path){
    var env=Object.assign({},process.env);
    ['PYTHONHOME','PYTHONPATH','LD_LIBRARY_PATH','DYLD_LIBRARY_PATH','DYLD_FRAMEWORK_PATH','_MEIPASS2'].forEach(function(key){delete env[key];});
    env.PATH=process.platform==='win32'?path.join(env.SystemRoot||env.SYSTEMROOT||'C:\\Windows','System32'):'/usr/bin:/bin';
    return env;
  }
  function prepare(options){
    var req=options.require||require,fs=req('fs'),path=req('path'),os=req('os'),cp=req('child_process'),process=options.process||req('process');
    var extensionRoot=fs.realpathSync(options.root),runtimeRoot=path.join(extensionRoot,'runtime');
    var home=options.home||os.homedir(),stateRoot=options.stateRoot||path.join(process.platform==='win32'?(process.env.APPDATA||path.join(home,'AppData','Roaming')):path.join(home,'Library','Application Support'),'Beat Marker','Premiere');
    stateRoot=path.resolve(stateRoot);
    var existing=stateRoot,missing=[];
    while(!fs.existsSync(existing)){missing.unshift(path.basename(existing));existing=path.dirname(existing);}
    stateRoot=path.join.apply(path,[fs.realpathSync(existing)].concat(missing));
    if(stateRoot===extensionRoot||stateRoot.indexOf(extensionRoot+path.sep)===0)throw Error('Beat Marker user data must be stored outside the installed extension.');
    var info;
    try{info=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'runtime.json'),'utf8'));}catch(e){throw Error('The bundled analysis engine is missing. Reinstall the complete Beat Marker installer.');}
    var architecture=process.arch==='arm64'?'arm64':'x64';
    if(process.platform==='darwin'&&architecture==='x64'){
      try{if(String(cp.execFileSync('/usr/sbin/sysctl',['-n','hw.optional.arm64'],{encoding:'utf8'})).trim()==='1')architecture='arm64';}catch(e){}
    }
    var target=(process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'unsupported')+'-'+architecture;
    if(info.platform!==target)throw Error('This package is for '+info.platform+'. Install Beat Marker for '+target+'.');
    if(info.version!==ENGINE_VERSION||!/^[a-f0-9]{16}$/.test(info.build_id||''))throw Error('The bundled engine does not match this release. Reinstall Beat Marker.');
    function files(root){
      var base=fs.realpathSync(root),out={};
      ['engine','ffmpeg','ffprobe','model'].forEach(function(key){
        if(typeof info[key]!=='string'||path.isAbsolute(info[key]))throw Error('Invalid bundled engine path: '+key);
        var candidate=path.resolve(base,info[key]);
        if(candidate.indexOf(base+path.sep)!==0||!fs.existsSync(candidate)||!fs.statSync(candidate).isFile())throw Error('The bundled engine is incomplete: '+key);
        var real=fs.realpathSync(candidate);
        if(real.indexOf(base+path.sep)!==0)throw Error('The bundled engine contains an invalid file link.');
        out[key]=real;
      });
      return out;
    }
    var resources=files(runtimeRoot);
    fs.mkdirSync(stateRoot,{recursive:true});
    if(process.platform!=='win32'&&['engine','ffmpeg','ffprobe'].some(function(key){try{fs.accessSync(resources[key],fs.constants.X_OK);return false;}catch(e){return true;}})){
      var parent=path.join(stateRoot,'runtimes'),copy=path.join(parent,info.platform+'-'+info.build_id);
      if(!fs.existsSync(copy)){
        fs.mkdirSync(parent,{recursive:true});
        var temporary=fs.mkdtempSync(path.join(parent,'.install-'));
        try{
          fs.cpSync(runtimeRoot,temporary,{recursive:true,dereference:true});
          var copied=files(temporary);
          ['engine','ffmpeg','ffprobe'].forEach(function(key){fs.chmodSync(copied[key],fs.statSync(copied[key]).mode|448);});
          try{fs.renameSync(temporary,copy);}catch(e){if(!fs.existsSync(copy))throw e;}
        }finally{if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true,force:true});}
      }
      runtimeRoot=copy;resources=files(runtimeRoot);
    }
    var jobs=path.join(stateRoot,'jobs'),data=path.join(stateRoot,'analysis');
    fs.mkdirSync(jobs,{recursive:true});fs.mkdirSync(data,{recursive:true});
    // Preserve the most recent operation when upgrading a local prototype.
    ['last-marker-write.json','last-edit-alignment.json'].forEach(function(name){
      var old=path.join(extensionRoot,'jobs',name),destination=path.join(jobs,name);
      if(!fs.existsSync(destination)&&fs.existsSync(old)){
        try{JSON.parse(fs.readFileSync(old,'utf8'));fs.copyFileSync(old,destination,fs.constants.COPYFILE_EXCL);}catch(e){}
      }
    });
    var processOptions={windowsHide:true,cwd:stateRoot,env:environment(process,path)};
    function check(){return new Promise(function(resolve,reject){
      cp.execFile(resources.engine,['--version'],Object.assign({encoding:'utf8',timeout:30000,maxBuffer:1024*1024},processOptions),function(error,stdout,stderr){
        if(error)return reject(Error('The bundled analysis engine could not start: '+(stderr||error.message)));
        try{var result=JSON.parse(String(stdout).trim());if(result.version!==ENGINE_VERSION||result.frozen!==true)throw Error('Unexpected engine version.');resolve(result);}catch(e){reject(e);}
      });
    });}
    function analysisJob(source,output,timing){
      if(['auto','detected','steady'].indexOf(timing)<0)throw Error('Unknown timing mode.');
      return {file:resources.engine,args:['--resources',runtimeRoot,'--data-dir',data,'--source',source,'--output',output,'--timing',timing],options:processOptions};
    }
    return {version:PANEL_VERSION,engineVersion:ENGINE_VERSION,root:runtimeRoot,stateRoot:stateRoot,jobs:jobs,data:data,ffmpeg:resources.ffmpeg,ffprobe:resources.ffprobe,check:check,analysisJob:analysisJob};
  }
  return {prepare:prepare,environment:environment,version:PANEL_VERSION,engineVersion:ENGINE_VERSION};
});
