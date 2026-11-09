(function(){
  'use strict';
  var main=window.BeatMarkerPanel,host=main.host,req=window.cep_node?window.cep_node.require:require;
  var fs=req('fs'),path=req('path'),cp=req('child_process'),cs=new CSInterface();
  var root=fs.realpathSync(decodeURI(cs.getSystemPath(SystemPath.EXTENSION)).replace(/^file:\/\//,''));
  var runtime=main.runtime,config={ffmpeg:runtime.ffmpeg};
  var jobs=runtime.jobs,testRoot=path.resolve(root,'..','BeatMarker Tests','Edit alignment');
  var receiptFile=path.join(jobs,'last-edit-alignment.json'),durationCache={},view=window.BeatEditView;
  var state={plan:null,last:null,context:null,contextKey:null,watchPreview:false,undoMatches:false,suggestion:null},polling=false,settingsTimer=null,trackOptionsKey=null;
  function $(id){return document.getElementById(id);}
  function message(value,kind){$('editStatus').hidden=!value;$('editStatus').textContent=value;$('editStatus').className='hint '+(kind||'');}
  function setBusy(value){
    ['alignScope','alignTrim','alignAnchor','alignThreshold','alignRipple','previewEdits','editSuggestion'].forEach(function(id){$(id).disabled=value;});
    ['prepareEditTest','runEditChecks'].forEach(function(id){if($(id))$(id).disabled=value;});
    $('alignEdits').disabled=value||!state.plan||!state.plan.changes.length;$('undoEdits').disabled=value||!state.last||!state.undoMatches;
  }
  function busy(value){main.busy(value);$('cancel').hidden=true;$('progress').hidden=true;}
  function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
  function populateTracks(context){
    var optionKey=JSON.stringify(context.tracks.map(function(t){return [t.index,t.name];}));
    if(trackOptionsKey===optionKey)return;trackOptionsKey=optionKey;
    var selected=$('alignScope').value,select=$('alignScope');select.textContent='';
    context.tracks.forEach(function(track){var option=document.createElement('option');option.value='video-'+track.index;option.textContent='All clips on V'+(track.index+1);select.appendChild(option);});
    var option=document.createElement('option');option.value='selected';option.textContent='Selected video clips';select.appendChild(option);
    if(Array.prototype.some.call(select.options,function(o){return o.value===selected;}))select.value=selected;
  }
  function observe(context){
    populateTracks(context);main.observeMarkers(context.migration||{});state.context=context;state.contextKey=view.key(context,$('alignScope').value);
    var count=view.count(context,$('alignScope').value);$('editLiveCount').textContent=count+' video '+(count===1?'clip':'clips')+' · '+context.markers.length+' beat markers · '+context.sequenceName;
    state.undoMatches=!!(state.last&&state.last.sequenceId===context.sequenceId&&state.last.projectPath===context.projectPath&&state.last.afterSignature===context.signature);
    $('undoEdits').title=state.last&&!state.undoMatches?'The timeline changed after alignment. Undo intervening edits first.':'';
    save(path.join(jobs,'edit-alignment-live.json'),{sequenceName:context.sequenceName,sequenceId:context.sequenceId,scope:$('alignScope').value,clipCount:count,markers:context.markers.length,signature:context.signature,nativeUndoCapabilities:context.nativeUndoCapabilities});
  }
  async function duration(source){
    if(!source||!fs.existsSync(source))return null;
    var stat=fs.statSync(source),key=source+'|'+stat.size+'|'+stat.mtimeMs;
    if(durationCache[key]!==undefined)return durationCache[key];
    var probe=path.join(path.dirname(config.ffmpeg),'ffprobe'+(process.platform==='win32'?'.exe':''));
    var value=await new Promise(function(resolve){cp.execFile(probe,['-v','error','-show_entries','format=duration:stream=codec_type,duration','-of','json',source],{encoding:'utf8',maxBuffer:1024*1024},function(error,out){if(error)return resolve(null);try{var data=JSON.parse(out),bounds={};['Video','Audio'].forEach(function(type){var times=(data.streams||[]).filter(function(s){return s.codec_type===type.toLowerCase();}).map(function(s){return Number(s.duration);}).filter(function(n){return isFinite(n)&&n>0;});var fallback=Number((data.format||{}).duration);bounds[type]=times.length?Math.min.apply(Math,times):(isFinite(fallback)&&fallback>0?fallback:null);});resolve(bounds);}catch(e){resolve(null);}});});
    durationCache[key]=value;return value;
  }
  async function addBounds(context){
    var sources={};context.allClips.forEach(function(c){if(c.source)sources[c.source]=true;});
    var paths=Object.keys(sources),values={};
    for(var i=0;i<paths.length;i+=4){var batch=paths.slice(i,i+4);var found=await Promise.all(batch.map(duration));batch.forEach(function(file,j){values[file]=found[j];});}
    function fill(c){c.sourceDuration=values[c.source]?values[c.source][c.mediaType]:null;if(!c.reason&&!c.sourceDuration)c.reason='The source duration could not be read.';(c.linked||[]).forEach(fill);}
    context.tracks.forEach(function(track){track.clips.forEach(fill);});return context;
  }
  function options(){return {scope:$('alignScope').value,trim:$('alignTrim').value,anchor:$('alignAnchor').value,threshold:$('alignThreshold').value,ripple:$('alignRipple').checked};}
  function drawPreview(plan,context){
    var area=$('editPreviewVisual');area.textContent='';var ns='http://www.w3.org/2000/svg',width=520,left=43,span=470,rows=plan.preview||[],tracks=[];
    rows.forEach(function(c){if(tracks.indexOf(c.trackIndex)<0)tracks.push(c.trackIndex);});
    var min=Math.min.apply(Math,rows.map(function(c){return Math.min(c.before.start,c.after.start);})),max=Math.max.apply(Math,rows.map(function(c){return Math.max(c.before.end,c.after.end);}));
    if(!rows.length)return;max=Math.max(max,min+context.frameDuration);var scale=span/(max-min),svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+width+' '+(tracks.length*55+17));svg.setAttribute('role','img');svg.setAttribute('aria-label','Current and proposed clip positions against beat markers');
    function node(type,attrs,text){var n=document.createElementNS(ns,type);Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!==undefined)n.textContent=text;svg.appendChild(n);return n;}
    var colors=['#26c6eb','#f365bb','#7bdcf2','#f7a1d4','#bcebf6','#fbcfe9','#69afc9'];
    tracks.forEach(function(track,ti){var y=ti*55+14;node('text',{x:0,y:y+5,fill:'#b1b8c9','font-size':8},'V'+(track+1)+' now');node('text',{x:0,y:y+26,fill:'#f3eef3','font-size':8},'Preview');
      context.markers.forEach(function(m){var at=Math.round(m.time/context.frameDuration)*context.frameDuration;if(at>=min&&at<=max)node('line',{x1:left+(at-min)*scale,x2:left+(at-min)*scale,y1:y-6,y2:y+35,stroke:'#53617d','stroke-width':.6,'stroke-dasharray':'2 2'});});
      rows.forEach(function(c,i){if(c.trackIndex!==track)return;['before','after'].forEach(function(side,j){var at=c[side],x=left+(at.start-min)*scale,w=Math.max(.8,(at.end-at.start)*scale),yy=y-4+j*21;var rect=node('rect',{x:x,y:yy,width:w,height:15,rx:2,fill:colors[i%colors.length],opacity:j?1:.38,stroke:c.target&&!c.aligned&&j?'#f29375':'none','stroke-width':1});var title=document.createElementNS(ns,'title');title.textContent=c.name+' · '+side+' '+at.start.toFixed(2)+'–'+at.end.toFixed(2)+'s';rect.appendChild(title);if(w>12)node('text',{x:x+4,y:yy+11,fill:j?'#10131e':'#f3eef3','font-size':9},String(i+1));});});
    });area.appendChild(svg);
    $('editPreviewRows').textContent='';$('editPreviewRowsTitle').textContent='Each clip · '+rows.length+' results';view.rows(plan).forEach(function(row){var tr=document.createElement('tr');[row.number+'. '+row.name,row.start,row.end,row.result].forEach(function(text,i){var td=document.createElement('td');td.textContent=text;if(i===1||i===2){var small=document.createElement('small');small.textContent=i===1?row.startChange:row.endChange;td.appendChild(small);}if(i===3)td.className=row.offBeat?'offbeat':'fit';tr.appendChild(td);});if(row.reason)tr.title=row.reason;$('editPreviewRows').appendChild(tr);});
    $('editPreview').hidden=false;$('editPreview').open=true;$('editPreviewTitle').textContent='Preview · timeline unchanged';
  }
  function showPlan(plan,context){
    state.plan=plan;var s=plan.summary;message(view.summary(plan,false),s.skipped?'warning':'');
    $('editSkipped').hidden=!plan.skipped.length;$('editSkippedRows').textContent='';plan.skipped.forEach(function(c){var li=document.createElement('li');li.textContent=c.name+': '+c.reason;$('editSkippedRows').appendChild(li);});
    $('alignEdits').textContent=s.changedVideoClips?'Apply '+s.changedVideoClips+' changes':'No changes';drawPreview(plan,context);
    state.suggestion=view.suggestion(context,plan.options,plan,BeatEditAlignment.plan);$('editSuggestion').hidden=!state.suggestion;
    if(state.suggestion)$('editSuggestion').textContent='Use '+state.suggestion.threshold+' frames · fit '+state.suggestion.aligned+' / '+state.suggestion.targets+' clips';
  }
  async function preview(scroll,knownContext){if(main.state.busy)return;busy(true);state.plan=null;state.watchPreview=true;try{message('Checking clips, source handles and beat markers…');var context=knownContext||await host('alignContext');observe(context);await addBounds(context);var plan=BeatEditAlignment.plan(context,options());save(path.join(jobs,'edit-alignment-preview.json'),plan);showPlan(plan,context);if(scroll)$('editPreview').scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){$('editPreview').hidden=true;$('editSkipped').hidden=true;$('editSuggestion').hidden=true;message(e.message,'error');}finally{busy(false);}}
  async function apply(){if(main.state.busy||!state.plan)return;busy(true);try{
    save(path.join(jobs,'edit-alignment-backup-'+Date.now()+'.json'),state.plan);message('Aligning clips…');
    var appliedPlan=state.plan,result=await host('alignApply',appliedPlan);state.last=result;save(receiptFile,result);state.plan=null;state.watchPreview=false;
    observe(await host('alignContext'));$('editPreviewTitle').textContent='Applied · before and after';$('editSuggestion').hidden=true;$('alignEdits').textContent='Preview again';
    message(view.summary(appliedPlan,true)+' Timing verified in Premiere.',result.summary.skipped?'warning':'success');
  }catch(e){message(e.message,'error');}finally{busy(false);}}
  async function undo(){if(main.state.busy||!state.last)return;busy(true);try{var result=await host('alignUndo',state.last);state.last=null;state.plan=null;state.watchPreview=false;$('editPreview').hidden=true;$('editSuggestion').hidden=true;if(fs.existsSync(receiptFile))fs.unlinkSync(receiptFile);observe(await host('alignContext'));message('Restored '+result.restored+' clips to their previous timing.','success');}catch(e){message(e.message,'error');}finally{busy(false);}}
  async function prepareTest(){if(main.state.busy)return;busy(true);try{message('Preparing the alignment test sequence…');var context=await host('alignTestPrepare',{xml:path.join(testRoot,'Edit alignment test.xml')});populateTracks(context);save(path.join(testRoot,'premiere-fixture.json'),context);await host('alignTestExport',{path:path.join(testRoot,'Edit Alignment Tests.prproj')});message('Alignment test project created. Seven video clips, linked camera audio, a fixed music bed and 100 BPM beat markers.','success');}catch(e){message(e.message,'error');}finally{busy(false);}}
  function check(value,message){if(!value)throw new Error(message);}
  function near(a,b){return Math.abs(a-b)<0.00001;}
  function verify(plan,before,after){
    check(after.allClips.length===before.allClips.length,'A clip was added or removed.');
    check(JSON.stringify(after.allMarkers)===JSON.stringify(before.allMarkers),'Sequence markers changed.');
    var mapped={};plan.changes.forEach(function(c){mapped[c.nodeId]=c;});
    before.allClips.forEach(function(c){var actual=after.allClips.filter(function(a){return a.nodeId===c.nodeId;})[0],change=mapped[c.nodeId],want=change?change.after:c;check(!!actual,'A clip disappeared: '+c.name);['start','end','inPoint','outPoint'].forEach(function(k){check(near(actual[k],want[k]),c.name+' '+k+' did not match the preview.');});
      if(change&&change.aligned&&change.mediaType==='Video'){
        [actual.start,actual.end].forEach(function(at){check(before.markers.some(function(m){return near(Math.round(m.time/before.frameDuration)*before.frameDuration,at);}),c.name+' edge is not on a beat.');});
        var oldDuration=change.before.end-change.before.start,newDuration=actual.end-actual.start;
        if(plan.options.trim==='extend')check(newDuration>=oldDuration-0.00001,'Extend-only shortened a clip.');
        if(plan.options.trim==='reduce')check(newDuration<=oldDuration+0.00001,'Reduce-only extended a clip.');
        if(plan.options.anchor==='start')check(near(actual.inPoint,c.inPoint),'Source start anchor moved.');
        if(plan.options.anchor==='end')check(near(actual.outPoint,c.outPoint),'Source end anchor moved.');
        if(plan.options.anchor==='middle')check(Math.abs(actual.inPoint+actual.outPoint-c.inPoint-c.outPoint)<=before.frameDuration+0.00001,'Source midpoint moved more than half a frame.');
      }
    });return true;
  }
  async function runChecks(){
    if(main.state.busy)return;busy(true);state.watchPreview=false;state.plan=null;$('editPreview').hidden=true;var activeReceipt=null,reports=[];
    var reportFile=path.join(testRoot,'premiere-edit-verification.json'),errorFile=path.join(testRoot,'premiere-edit-error.txt');
    try{
      if(fs.existsSync(errorFile))fs.unlinkSync(errorFile);
      var testName='Beat Marker - Edit Alignment Test - Regression',testXML=path.join(testRoot,'Edit alignment regression.xml');
      fs.writeFileSync(testXML,fs.readFileSync(path.join(testRoot,'Edit alignment test.xml'),'utf8').replace('<name>Beat Marker - Edit Alignment Test</name>','<name>'+testName+'</name>'));
      var initial=await host('alignTestPrepare',{xml:testXML,name:testName});await addBounds(initial);save(path.join(testRoot,'premiere-fixture.json'),initial);
      for(var r=0;r<2;r++)for(var t=0;t<3;t++)for(var a=0;a<3;a++){
        var trim=['both','extend','reduce'][t],anchor=['start','middle','end'][a];message('Checking '+trim+' · '+anchor+' · ripple '+(r?'on':'off')+'…');
        var context=await host('alignContext');await addBounds(context);
        var plan=BeatEditAlignment.plan(context,{scope:'video-0',trim:trim,anchor:anchor,threshold:16,ripple:!!r});
        save(path.join(testRoot,'last-test-plan.json'),plan);
        check(plan.changes.length>0,'This test produced no edits: '+trim+' '+anchor);
        activeReceipt=await host('alignApply',plan);save(path.join(testRoot,'last-test-receipt.json'),activeReceipt);
        var actual=await host('alignContext');verify(plan,context,actual);
        await host('alignUndo',activeReceipt);activeReceipt=null;
        var restored=await host('alignContext');check(restored.signature===context.signature,'Undo did not restore all original clip timing.');
        reports.push({trim:trim,anchor:anchor,ripple:!!r,passed:true,summary:plan.summary,sourceAnchorsVerified:true,beatEdgesVerified:true,unaffectedClipsAndMarkersVerified:true,undoVerified:true,actual:actual.allClips});
        save(reportFile,{passed:false,completed:reports.length,cases:reports});
      }
      var narrowContext=await host('alignContext');await addBounds(narrowContext);
      var narrowPlan=BeatEditAlignment.plan(narrowContext,{scope:'video-0',trim:'reduce',anchor:'start',threshold:8,ripple:false});
      check(narrowPlan.changes.length===0&&narrowPlan.skipped.length===7,'Incompatible reduce-only clips were not skipped.');
      await host('alignTestSelect',{count:2});var selected=await host('alignContext');await addBounds(selected);
      var tailPlan=BeatEditAlignment.plan(selected,{scope:'selected',trim:'both',anchor:'start',threshold:8,ripple:true});
      check(tailPlan.summary.rippledClips>0,'Selected-clip ripple did not move followers.');
      activeReceipt=await host('alignApply',tailPlan);verify(tailPlan,selected,await host('alignContext'));await host('alignUndo',activeReceipt);activeReceipt=null;
      check((await host('alignContext')).signature===selected.signature,'Selected ripple undo failed.');
      var stale=JSON.parse(JSON.stringify(tailPlan));stale.signature+='stale';var rejected=false;
      try{await host('alignApply',stale);}catch(e){rejected=true;}
      check(rejected,'A stale preview was accepted.');check((await host('alignContext')).signature===selected.signature,'Stale preview changed the sequence.');
      await host('alignTestSelect',{count:7});
      await host('alignTestExport',{path:path.join(testRoot,'Edit Alignment Regression Tests.prproj')});
      save(reportFile,{passed:true,premiereCases:reports.length,narrowThresholdSkipVerified:true,selectedClipRippleVerified:true,stalePreviewRejected:true,linkedAudioIncluded:initial.tracks[0].clips.some(function(c){return c.linked.length>0;}),cases:reports});
      observe(await host('alignContext'));state.plan=null;message('Premiere checks passed: all 18 trim / anchor / ripple combinations, linked audio, undo, selected-clip ripple and stale-preview rejection.','success');
    }catch(e){
      if(activeReceipt)try{await host('alignUndo',activeReceipt);}catch(restoreError){e.message+=' Undo: '+restoreError.message;}
      save(reportFile,{passed:false,completed:reports.length,error:e.message,cases:reports});fs.writeFileSync(errorFile,e.stack||e.message);message('Alignment checks stopped: '+e.message,'error');
    }finally{busy(false);}
  }
  async function refreshTimeline(){
    if(main.state.busy||polling)return;polling=true;
    try{var context=await host('alignContext');if(main.state.busy)return;main.observeMarkers(context.migration||{});populateTracks(context);var changed=state.contextKey!==view.key(context,$('alignScope').value);
      if(changed){state.plan=null;$('alignEdits').disabled=true;observe(context);if(state.watchPreview)await preview(false,context);else if(state.last&&!state.undoMatches){$('editPreview').hidden=true;message('The timeline changed. Preview the current clips to align them.');}setBusy(false);}
    }catch(e){main.observeMarkers({});state.plan=null;state.contextKey=null;$('editLiveCount').textContent='Open a sequence to read its clips.';$('editPreview').hidden=true;$('alignEdits').disabled=true;}
    finally{polling=false;}
  }
  function settingsChanged(){
    state.plan=null;$('alignEdits').disabled=true;clearTimeout(settingsTimer);
    if(state.watchPreview){$('editPreviewTitle').textContent='Refreshing preview…';settingsTimer=setTimeout(function(){preview(false);},300);}else{message('');refreshTimeline();}
  }
  ['alignScope','alignTrim','alignAnchor','alignThreshold','alignRipple'].forEach(function(id){$(id).addEventListener('change',settingsChanged);});
  $('alignThreshold').addEventListener('input',settingsChanged);
  $('previewEdits').addEventListener('click',function(){preview(true);});$('alignEdits').addEventListener('click',apply);$('undoEdits').addEventListener('click',undo);
  $('editSuggestion').addEventListener('click',function(){if(!state.suggestion)return;$('alignThreshold').value=state.suggestion.threshold;preview(true);});
  if($('prepareEditTest'))$('prepareEditTest').addEventListener('click',prepareTest);if($('runEditChecks'))$('runEditChecks').addEventListener('click',runChecks);
  try{state.last=JSON.parse(fs.readFileSync(receiptFile,'utf8'));}catch(e){}
  window.BeatEditPanel={state:state,setBusy:setBusy,preview:preview,apply:apply,undo:undo};setBusy(main.state.busy);
  refreshTimeline();setInterval(refreshTimeline,1500);
})();
