(function(){
  'use strict';
  var cs=new CSInterface(),req=window.cep_node?window.cep_node.require:require;
  var fs=req('fs'),path=req('path'),cp=req('child_process');
  var extensionRoot=decodeURI(cs.getSystemPath(SystemPath.EXTENSION)).replace(/^file:\/\//,'');
  extensionRoot=fs.realpathSync(extensionRoot);
  var runtime=BeatMarkerRuntime.prepare({root:extensionRoot,require:req}),jobs=runtime.jobs;
  var config={ffmpeg:runtime.ffmpeg},engineReady=runtime.check();
  var bridgeReady=new Promise(function(resolve,reject){
    var script='(function(){try{$.evalFile('+JSON.stringify(path.join(extensionRoot,'jsx','host.jsx'))+');if(!$.global.BeatMarker||$.global.BeatMarker.version!=="0.6.0")throw Error("Premiere bridge version did not update");return "ready";}catch(e){return String(e);}})()';
    cs.evalScript(script,function(value){if(value==='ready')resolve();else reject(new Error('Cannot load the Premiere bridge: '+value));});
  });
  fs.mkdirSync(path.join(jobs),{recursive:true});
  fs.writeFileSync(path.join(jobs,'panel-start.json'),JSON.stringify({version:"0.6.0",root:extensionRoot,started:new Date().toISOString()}));
  var state={analysis:null,target:null,clip:null,mapped:[],busy:false,child:null,lastBatch:null,migrationCount:0,selectedMusicClips:0};
  var $=function(id){return document.getElementById(id);};
  function status(message,kind){$('status').hidden=!message;$('status').textContent=message;$('status').className=kind||'';}
  function markerStatus(message,kind){status(message,kind);$('markerStatus').hidden=false;$('markerStatus').textContent=message;$('markerStatus').className='hint '+(kind||'');}
  function rememberMarkerChange(batch){state.lastBatch=batch;fs.writeFileSync(path.join(jobs,'last-marker-write.json'),JSON.stringify(batch,null,2));}
  function busy(value){state.busy=value;$('analyse').disabled=value;$('add').disabled=value||(!state.analysis&&!state.migrationCount);$('remove').disabled=value||!state.lastBatch;$('removeAll').disabled=value||!state.selectedMusicClips;$('cancel').hidden=!value;$('progress').hidden=!value;['timing','filter','replace'].forEach(function(id){$(id).disabled=value;});if(window.BeatEditPanel)window.BeatEditPanel.setBusy(value);}
  function host(method,payload){return bridgeReady.then(function(){return new Promise(function(resolve,reject){
    var code='BeatMarker.dispatch('+JSON.stringify(method)+','+JSON.stringify(JSON.stringify(payload||{}))+')';
    cs.evalScript(code,function(raw){try{var r=JSON.parse(raw);if(!r.ok)throw new Error(r.error);resolve(r.data);}catch(e){reject(new Error(raw==='EvalScript error.'?'Premiere could not run the extension bridge. Reopen the panel.':e.message));}});
  });});}
  function selectedLabel(clip){$('clipName').textContent=clip.name;}
  function render(){
    var analysis=state.analysis,clip=state.clip;if(!analysis||!clip)return;
    var all=BeatTiming.mapBeats(analysis,clip,'all');state.mapped=BeatTiming.mapBeats(analysis,clip,$('filter').value);
    selectedLabel(clip);$('results').hidden=false;$('beatCount').textContent=all.length;$('tempo').textContent=analysis.medianBpm?analysis.medianBpm.toFixed(1):'—';$('barCount').textContent=all.filter(function(b){return b.beat===1;}).length;
    $('alignment').textContent='Beats stay attached to the music when it moves or is trimmed.';
    var post=analysis.postAnalysis||{};
    $('recovery').textContent=post.applied?post.bpm.toFixed(2)+' BPM reference · '+post.referenceBeatCount+' stable beats between '+post.referenceStart.toFixed(2)+'s and '+post.referenceEnd.toFixed(2)+'s. '+post.inferredBeatCount+' beats inferred'+(post.beatsPerBar?' · '+post.beatsPerBar+' beats per bar.':'. Beat-in-bar remains uncertain.'):(post.message||'Original model detections.');
    $('add').textContent=($('replace').checked?'Update ':'Add ')+'clip markers';$('add').disabled=state.busy||!state.mapped.length;
  }
  async function refresh(){state.clip=await host('current',state.target);render();return state.clip;}
  async function analyse(){
    if(state.busy)return;busy(true);state.analysis=null;$('results').hidden=true;
    try{
      await engineReady;state.target=await host('selected');state.clip=state.target;selectedLabel(state.clip);
      if(!fs.existsSync(state.target.source))throw new Error('The source file is not available on this computer.');
      var jobDir=path.join(jobs);fs.mkdirSync(jobDir,{recursive:true});
      var output=path.join(jobDir,'analysis-'+Date.now()+'.json');
      status('Starting full-song analysis…');
      await new Promise(function(resolve,reject){
        var job=runtime.analysisJob(state.target.source,output,$('timing').value);
        var child=cp.spawn(job.file,job.args,job.options);
        state.child=child;var errors='',messages='',settled=false;
        child.stdout.on('data',function(data){messages=(messages+String(data)).slice(-6000);});
        child.stderr.on('data',function(data){var text=String(data);errors=(errors+text).slice(-6000);var lines=text.trim().split('\n');var line=lines[lines.length-1];if(line)status(line);});
        child.on('error',function(e){settled=true;reject(e);});
        child.on('close',function(code,signal){state.child=null;if(settled)return;if(code!==0)return reject(new Error(signal?'Analysis cancelled.':errors.trim()||messages.trim()||'Analysis failed.'));try{state.analysis=JSON.parse(fs.readFileSync(output,'utf8'));fs.unlinkSync(output);resolve();}catch(e){reject(e);}});
      });
      await refresh();var post=state.analysis.postAnalysis;status((state.analysis.cached?'Loaded saved analysis. ':'Analysis complete. ')+state.mapped.length+' beats in the visible clip.'+(post&&post.applied?' '+post.inferredBeatCount+' inferred from a stable pulse.':''),'success');
    }catch(e){status(e.message,'error');}finally{busy(false);if(state.analysis)render();}
  }
  async function add(){if(state.busy)return;if(!state.analysis)return migrate();busy(true);try{
    var dir=path.join(jobs);fs.mkdirSync(dir,{recursive:true});
    if($('replace').checked){var before=await host('markerBackup',state.target);fs.writeFileSync(path.join(dir,'marker-backup-'+Date.now()+'.json'),JSON.stringify(before,null,2));}
    var result=await host('add',{target:state.target,beats:state.analysis.beats,filter:$('filter').value,replace:$('replace').checked,duration:state.analysis.duration});
    state.clip=result.clip;if(result.markerChange.collections.length){rememberMarkerChange(result.markerChange);$('remove').disabled=false;}
    render();status('Added '+result.added+' clip markers · '+result.visible+' beats in this clip'+(result.replaced?' · replaced '+result.replaced+' previous beats':'')+(result.skipped?' · '+result.skipped+' existing beats kept':'')+(result.legacyRemoved?' · moved '+result.legacyRemoved+' old sequence markers off the timeline':'')+'.','success');
  }catch(e){status(e.message,'error');}finally{busy(false);if(state.analysis)render();}}
  async function removeAll(){
    if(state.busy)return;busy(true);
    try{
      var before=await host('ownedMarkers');
      if(!before.markers.length){markerStatus('No beat markers on the selected music clips.');return;}
      fs.writeFileSync(path.join(jobs,'marker-removal-backup-'+Date.now()+'.json'),JSON.stringify(before,null,2));
      var result=await host('removeAll',before);
      rememberMarkerChange(result.markerChange);
      markerStatus('Removed '+result.removed+' beat markers from '+result.clipCount+' selected music '+(result.clipCount===1?'source':'sources')+'. Use Undo to restore them.','success');
    }catch(e){markerStatus(e.message,'error');}finally{busy(false);if(state.analysis)render();}
  }
  function observeMarkers(info){
    state.migrationCount=info.count||0;state.selectedMusicClips=info.selectedClips||0;
    if(!state.analysis)$('add').textContent=state.migrationCount?'Move existing beats to clips':'Add clip markers';
    if(!state.busy){$('add').disabled=!state.analysis&&!state.migrationCount;$('removeAll').disabled=!state.selectedMusicClips;}
  }
  async function migrate(){if(state.busy||!state.migrationCount)return;busy(true);try{
    var before=await host('ownedMarkers');fs.writeFileSync(path.join(jobs,'marker-migration-backup-'+Date.now()+'.json'),JSON.stringify(before,null,2));
    var result=await host('migrate',before);if(result.markerChange.collections.length)rememberMarkerChange(result.markerChange);
    observeMarkers(await host('migrationInfo'));markerStatus('Moved '+result.removed+' sequence markers onto '+result.clipCount+' selected music '+(result.clipCount===1?'source':'sources')+'. Use Undo to restore the previous markers.','success');
  }catch(e){markerStatus(e.message,'error');}finally{busy(false);}}
  $('analyse').addEventListener('click',analyse);$('add').addEventListener('click',add);$('filter').addEventListener('change',render);
  Array.prototype.forEach.call(document.querySelectorAll('.help'),function(button){button.addEventListener('click',function(){var open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));});button.addEventListener('keydown',function(event){if(event.key==='Escape'){button.setAttribute('aria-expanded','false');button.blur();}});button.addEventListener('blur',function(){button.setAttribute('aria-expanded','false');});});
  $('replace').addEventListener('change',render);
  $('timing').addEventListener('change',function(){state.analysis=null;$('results').hidden=true;busy(false);status('Select your music clip and analyse to apply the new settings.');});
  $('cancel').addEventListener('click',function(){if(state.child)state.child.kill();});
  $('removeAll').addEventListener('click',removeAll);
  $('remove').addEventListener('click',async function(){if(state.busy||!state.lastBatch)return;busy(true);try{var r=await host('remove',state.lastBatch);state.lastBatch=null;var receipt=path.join(jobs,'last-marker-write.json');if(fs.existsSync(receipt))fs.unlinkSync(receipt);markerStatus((r.removed?'Removed '+r.removed+' markers'+(r.restored?' · restored '+r.restored+' previous markers':''):'Restored '+r.restored+' markers')+'.','success');}catch(e){markerStatus(e.message,'error');}finally{busy(false);if(state.analysis)render();}});
  // Developer controls are absent from the normal panel.
  if($('demo')){
  $('openDemo').addEventListener('click',function(){host('openProject',{path:path.resolve(extensionRoot,'..','BeatMarker Tests','Beat Marker Tests.prproj')}).then(function(){status('Test project opened. Select a music clip, then analyse.');}).catch(function(e){status(e.message,'error');});});
  $('audit').addEventListener('click',async function(){try{var r=await host('audit');var file=path.join(jobs,'premiere-marker-audit.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2));status('Saved verification of '+r.markers.length+' markers.','success');}catch(e){status(e.message,'error');}});
  $('reload').addEventListener('click',function(){window.location.reload();});
  $('selectDemo').addEventListener('click',async function(){try{var c=await host('testCase',{name:$('demoSequence').value+' - offset test'});selectedLabel(c);status('Test clip selected. Click Analyse selected clip.');}catch(e){status(e.message,'error');}});
  $('runChecks').addEventListener('click',runChecks);
  }
  async function runChecks(){
    if(state.busy)return;
    var reports=[],testRoot=path.resolve(extensionRoot,'..','BeatMarker Tests');
    $('runChecks').disabled=true;
    function check(condition,message){if(!condition)throw new Error(message);}
    async function clear(audit){if(audit.markers.length)await host('remove',{sequenceId:audit.sequenceId,markers:audit.markers});}
    try{
      ['premiere-verification.json','premiere-verification-error.txt'].forEach(function(name){var f=path.join(testRoot,name);if(fs.existsSync(f))fs.unlinkSync(f);});
      var cases=JSON.parse(fs.readFileSync(path.join(testRoot,'cases.json'),'utf8'));
      for(var i=0;i<cases.length;i++){
        var test=cases[i];await host('testCase',{name:test.name});
        await clear(await host('audit'));$('filter').value='all';await analyse();
        check(!!state.analysis,'Analysis failed for '+test.name);
        var c=await refresh();
        check(Math.abs(c.start-test.start)<0.001&&Math.abs(c.inPoint-test.inPoint)<0.001,'Imported clip timing mismatch.');
        var result=await host('add',{target:state.target,beats:state.analysis.beats,filter:'all'});
        var audit=await host('audit');
        var expected=state.analysis.beats.filter(function(b){return b.time>=c.inPoint&&b.time<c.outPoint&&c.start+b.time-c.inPoint<c.end;});
        check(audit.markers.length===expected.length,'Marker count mismatch.');
        var maxError=0;
        for(var j=0;j<expected.length;j++){
          var error=Math.abs(audit.markers[j].time-(c.start+expected[j].time-c.inPoint));maxError=Math.max(maxError,error);
          check(error<0.00001,'Marker offset error: '+error);
          check(audit.markers[j].name==='♩ '+(expected[j].beat===null?'?':expected[j].beat),'Marker name mismatch.');
        }
        var again=await host('add',{target:state.target,beats:state.analysis.beats,filter:'all'});
        check(again.added===0&&again.skipped===expected.length,'Duplicate prevention failed.');
        await clear(audit);
        var threes=await host('add',{target:state.target,beats:state.analysis.beats,filter:'3'});
        var thirdsAudit=await host('audit');check(thirdsAudit.markers.length===expected.filter(function(b){return b.beat===3;}).length,'Beat-three count mismatch.');
        check(thirdsAudit.markers.every(function(m){return m.name==='♩ 3';}),'Beat-three filter failed.');await clear(thirdsAudit);
        var moved=false;
        if(i===0){
          await host('testMove',{target:state.target,delta:3});
          var shifted=await host('add',{target:state.target,beats:state.analysis.beats,filter:'all'}),shiftAudit=await host('audit');
          check(Math.abs(shifted.clip.start-test.start-3)<0.0001,'Clip did not move by three seconds.');
          check(shiftAudit.markers.every(function(m,k){return Math.abs(m.time-(test.start+3+expected[k].time-test.inPoint))<0.00001;}),'Moved clip markers use an outdated offset.');
          await clear(shiftAudit);await host('testMove',{target:state.target,delta:-3});moved=true;
        }
        result=await host('add',{target:state.target,beats:state.analysis.beats,filter:'all'});audit=await host('audit');
        reports.push({name:test.name,passed:true,clip:result.clip,markers:audit.markers.length,maxMappingErrorSeconds:maxError,duplicatePrevention:true,beatThreeFilter:true,movedClipChecked:moved,audit:audit});
        fs.writeFileSync(path.join(testRoot,'premiere-verification.json'),JSON.stringify(reports,null,2));
      }
      await host('saveProject');await refresh();
      status('Premiere checks passed for '+reports.length+' sequences: offsets, source trims, ♩ names, duplicate prevention and beat-three filtering.','success');
    }catch(e){status('Verification stopped: '+e.message,'error');fs.writeFileSync(path.join(testRoot,'premiere-verification-error.txt'),e.stack||e.message);}
    finally{$('runChecks').disabled=false;busy(false);}
  }

  window.BeatMarkerPanel={runtime:runtime,state:state,host:host,observeMarkers:observeMarkers,analyse:analyse,add:add,removeAll:removeAll,refresh:refresh,render:render,busy:busy};
  window.addEventListener('error',function(e){status(e.message,'error');});
  bridgeReady.then(function(){fs.writeFileSync(path.join(jobs,'bridge-ready.json'),JSON.stringify({version:runtime.version,host:cs.getHostEnvironment(),ready:true}));}).catch(function(e){status(e.message,'error');});
  engineReady.then(function(info){fs.writeFileSync(path.join(jobs,'engine-ready.json'),JSON.stringify(info));}).catch(function(e){status(e.message,'error');});
  try{var receipt=JSON.parse(fs.readFileSync(path.join(jobs,'last-marker-write.json'),'utf8'));state.lastBatch=receipt.version===2?receipt:{sequenceId:receipt.sequenceId||(receipt.clip&&receipt.clip.sequenceId),markers:receipt.markers,previous:receipt.previous||[]};if(state.lastBatch.sequenceId)$('remove').disabled=false;else state.lastBatch=null;}catch(e){}

})();
