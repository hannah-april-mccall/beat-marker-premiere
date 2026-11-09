(function(root,factory){
  var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.BeatEditAlignment=api;else root.BeatEditAlignment=api;
})(this,function(){
  'use strict';
  var EPS=0.00001;
  function same(a,b){return Math.abs(a-b)<EPS;}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function speed(c){return c.speed===undefined?1:c.speed;}
  function rateMode(options){return options.trim.indexOf('rate-')===0;}
  function frames(item,fd){return {start:item.start/fd,end:item.end/fd,inPoint:item.inPoint/fd,outPoint:item.outPoint/fd};}
  function sourceWindow(c,duration,anchor,fd){
    var old=frames(c,fd),start;duration*=speed(c);
    if(anchor==='start')start=old.inPoint;
    else if(anchor==='end')start=old.outPoint-duration;
    else start=old.inPoint+Math.round(((old.outPoint-old.inPoint)-duration)/2);
    return {inPoint:start*fd,outPoint:(start+duration)*fd};
  }
  function candidates(c,beats,refStart,refEnd,options,fd,forcedStart){
    var threshold=options.threshold,oldDuration=(c.end-c.start)/fd,rows=[];
    var starts=beats.filter(function(f){return Math.abs(f-refStart)<=threshold+EPS&&(forcedStart===null||same(f,forcedStart));});
    var ends=beats.filter(function(f){return Math.abs(f-refEnd)<=threshold+EPS;});
    starts.forEach(function(start){ends.forEach(function(end){
      var duration=end-start;if(start<0||duration<1)return;
      if((options.trim==='extend'||options.trim==='rate-extend')&&duration<oldDuration-EPS)return;
      if((options.trim==='reduce'||options.trim==='rate-reduce')&&duration>oldDuration+EPS)return;
      var retime=rateMode(options),window=retime?{inPoint:c.inPoint,outPoint:c.outPoint}:sourceWindow(c,duration,options.anchor,fd);
      var newSpeed=retime?(c.outPoint-c.inPoint)/(duration*fd):speed(c);
      if(!isFinite(newSpeed)||newSpeed<0.01-EPS||newSpeed>100+EPS)return;
      var members=[c].concat(c.linked||[]),sourceDelta=window.inPoint-c.inPoint;
      if(members.some(function(member){return member.inPoint+sourceDelta< -EPS||!isFinite(member.sourceDuration)||member.outPoint+(window.outPoint-c.outPoint)>member.sourceDuration+EPS;}))return;
      var left=Math.abs(start-refStart),right=Math.abs(end-refEnd),cost;
      if(options.anchor==='start')cost=left*1000+right;
      else if(options.anchor==='end')cost=right*1000+left;
      else cost=Math.abs(start+end-refStart-refEnd)*500+Math.abs(duration-oldDuration);
      rows.push({start:start,end:end,inPoint:window.inPoint,outPoint:window.outPoint,speed:newSpeed,aligned:true,cost:cost});
    });});
    rows.sort(function(a,b){return a.cost-b.cost||a.start-b.start||a.end-b.end;});
    return rows;
  }
  function fallback(c,offset,fd,reason){return {start:c.start/fd+offset,end:c.end/fd+offset,inPoint:c.inPoint,outPoint:c.outPoint,speed:speed(c),aligned:false,cost:0,reason:reason};}
  function noRipple(clips,beats,options,fd){
    var previous=[{end:-Infinity,penalty:0,cost:0,path:[]}];
    clips.forEach(function(c){
      var available=c.target&&!c.reason?candidates(c,beats,c.start/fd,c.end/fd,options,fd,null):[];
      var rows=available.concat([fallback(c,0,fd,c.reason||(c.target?'No compatible beat pair within the threshold and source handles.':null))]),next=[];
      rows.forEach(function(row){
        var best=null;
        previous.forEach(function(p){
          if(row.start<p.end-EPS)return;
          var penalty=p.penalty+(c.target&&!row.aligned?1:0),cost=p.cost+row.cost;
          if(!best||penalty<best.penalty||(penalty===best.penalty&&cost<best.cost))best={end:row.end,penalty:penalty,cost:cost,path:p.path.concat([row])};
        });
        if(best)next.push(best);
      });
      if(!next.length)throw new Error('The source track already contains overlapping clips. Resolve those overlaps before alignment.');
      previous=next;
    });
    previous.sort(function(a,b){return a.penalty-b.penalty||a.cost-b.cost;});return previous[0].path;
  }
  function ripple(clips,beats,options,fd){
    var path=[],offset=0,previous=null;
    clips.forEach(function(c,index){
      var start=c.start/fd+offset,end=c.end/fd+offset;
      var contiguous=index>0&&same(c.start,clips[index-1].end);
      var forced=contiguous&&previous?previous.end:null;
      var rows=c.target&&!c.reason?candidates(c,beats,start,end,options,fd,forced):[];
      rows=rows.filter(function(row){return !previous||row.start>=previous.end-EPS;});
      var blockedCut=forced!==null&&!beats.some(function(beat){return same(beat,forced);});
      var reason=blockedCut?'The previous clip has an off-beat end. This shared cut cannot fit until that clip fits.':'No compatible beat pair within '+options.threshold+' frames and the available source media.';
      var chosen=rows[0]||fallback(c,offset,fd,c.reason||(c.target?reason:null));
      if(previous&&chosen.start<previous.end-EPS)throw new Error('Ripple alignment would overlap an earlier clip.');
      path.push(chosen);offset=chosen.end-c.end/fd;previous=chosen;
    });return path;
  }
  function plan(context,input){
    var options={trim:input.trim,anchor:input.anchor,threshold:Number(input.threshold),ripple:!!input.ripple,scope:input.scope};
    if(['both','extend','reduce','rate-both','rate-extend','rate-reduce'].indexOf(options.trim)<0)throw new Error('Choose a clip-length option.');
    if(['start','middle','end'].indexOf(options.anchor)<0)throw new Error('Choose a source anchor.');
    if(!isFinite(options.threshold)||options.threshold<0||options.threshold>10000||Math.floor(options.threshold)!==options.threshold)throw new Error('Threshold must be a whole number of frames from 0 to 10000.');
    var fd=context.frameDuration;
    if(!(fd>0))throw new Error('Cannot read the sequence frame rate.');
    var beats=context.markers.map(function(m){return Math.round(m.time/fd);}).filter(function(f,i,a){return f>=0&&a.indexOf(f)===i;}).sort(function(a,b){return a-b;});
    if(beats.length<2)throw new Error('Add at least two beat markers to this sequence first.');
    var changes=[],skipped=[],preview=[],aligned=0,targets=0,unchanged=0,groups=[],touched={};
    context.tracks.forEach(function(track){
      var targetTrack=options.scope==='selected'||options.scope==='video-'+track.index;
      var clips=track.clips.map(function(c){var copy=clone(c);copy.target=targetTrack&&(options.scope!=='selected'||c.selected);copy.reason=c.reason||(track.locked?'Track is locked.':null)||(track.transitions?'Track has transitions; align a copy without transitions first.':null);return copy;});
      var count=clips.filter(function(c){return c.target;}).length;
      if(!count)return;targets+=count;
      var path=options.ripple?ripple(clips,beats,options,fd):noRipple(clips,beats,options,fd);
      clips.forEach(function(c,index){
        var row=path[index];
        if(c.target){if(row.aligned)aligned++;else skipped.push({name:c.name,nodeId:c.nodeId,reason:row.reason||'A neighbouring clip prevents this alignment.'});}
        var after={start:row.start*fd,end:row.end*fd,inPoint:row.inPoint,outPoint:row.outPoint,speed:row.speed};
        if(c.reason&&(!same(after.start,c.start)||!same(after.end,c.end)))throw new Error('Ripple would move an unsupported or locked clip: '+c.name+'.');
        var changed=!(same(after.start,c.start)&&same(after.end,c.end)&&same(after.inPoint,c.inPoint)&&same(after.outPoint,c.outPoint)&&same(after.speed,speed(c)));
        if(c.target||changed)preview.push({nodeId:c.nodeId,name:c.name,trackIndex:c.trackIndex,target:c.target,aligned:!!(row.aligned&&c.target),changed:changed,rippleOnly:changed&&!row.aligned,reason:row.reason||null,before:{start:c.start,end:c.end,inPoint:c.inPoint,outPoint:c.outPoint,speed:speed(c)},after:after});
        if(!changed){if(c.target&&row.aligned)unchanged++;return;}
        var group=[],members=[c].concat(c.linked||[]);
        members.forEach(function(member){
          if(touched[member.nodeId])throw new Error('A linked clip belongs to more than one edit. Align one video track at a time.');
          touched[member.nodeId]=true;
          var before={start:member.start,end:member.end,inPoint:member.inPoint,outPoint:member.outPoint,speed:speed(member)};
          var result={start:member.start+(after.start-c.start),end:member.end+(after.end-c.end),inPoint:member.inPoint+(after.inPoint-c.inPoint),outPoint:member.outPoint+(after.outPoint-c.outPoint),speed:row.aligned?after.speed:speed(member)};
          var change={nodeId:member.nodeId,name:member.name,mediaType:member.mediaType,trackIndex:member.trackIndex,before:before,after:result,rippleOnly:!row.aligned,aligned:!!(row.aligned&&c.target)};
          changes.push(change);group.push(member.nodeId);
        });groups.push(group);
      });
    });
    if(!targets)throw new Error(options.scope==='selected'?'Select one or more video clips first.':'The chosen video track has no clips.');
    return {schema:2,sequenceId:context.sequenceId,projectPath:context.projectPath,signature:context.signature,markerSignature:context.markerSignature,frameDuration:fd,options:options,groups:groups,changes:changes,preview:preview,skipped:skipped,summary:{targets:targets,aligned:aligned,alreadyAligned:unchanged,alignedEdits:changes.filter(function(c){return c.mediaType==='Video'&&c.aligned;}).length,changedVideoClips:changes.filter(function(c){return c.mediaType==='Video';}).length,retimedClips:changes.filter(function(c){return c.mediaType==='Video'&&!same(c.before.speed,c.after.speed);}).length,linkedAudioClips:changes.filter(function(c){return c.mediaType==='Audio';}).length,rippledClips:changes.filter(function(c){return c.mediaType==='Video'&&c.rippleOnly;}).length,skipped:skipped.length}};
  }
  return {plan:plan};
});
