(function(root,factory){
  var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.BeatEditView=api;else root.BeatEditView=api;
})(this,function(){
  'use strict';
  function count(context,scope){return context.tracks.reduce(function(total,track){return total+track.clips.filter(function(c){return scope==='selected'?c.selected:scope==='video-'+track.index;}).length;},0);}
  function key(context,scope){var selected=[];if(scope==='selected')context.tracks.forEach(function(t){t.clips.forEach(function(c){if(c.selected)selected.push(c.nodeId);});});return JSON.stringify([context.signature,context.markerSignature,scope,selected]);}
  function frames(value,fd){var n=Math.round(value/fd);return (n>0?'+':'')+n+'f';}
  function rows(plan){return (plan.preview||[]).map(function(c,index){var retimed=c.after.speed!==undefined&&Math.abs(c.after.speed-(c.before.speed===undefined?1:c.before.speed))>.00001;return {number:index+1,name:c.name,start:c.after.start.toFixed(2)+'s',end:c.after.end.toFixed(2)+'s',startChange:frames(c.after.start-c.before.start,plan.frameDuration),endChange:frames(c.after.end-c.before.end,plan.frameDuration),result:(c.aligned?(c.changed?'Fit':'On beat'):(c.changed?'Ripple only':'Skipped'))+(retimed?' · '+(c.after.speed*100).toFixed(1)+'%':''),reason:c.reason,offBeat:c.target&&!c.aligned};});}
  function summary(plan,applied){var s=plan.summary;return (applied?'Applied · ':'Preview · ')+s.aligned+' / '+s.targets+' clips fit the beats. '+(s.alignedEdits===undefined?s.changedVideoClips-s.rippledClips:s.alignedEdits)+' aligned edits'+(s.alreadyAligned?' · '+s.alreadyAligned+' already on beats':'')+(s.rippledClips?' · '+s.rippledClips+' moved by ripple only':'')+(s.skipped?' · '+s.skipped+' could not fit':'')+'.'+(!plan.changes.length?' No changes to apply.':'');}
  function suggestion(context,options,plan,planner){if(!plan.summary.skipped)return null;var start=Number(options.threshold);for(var n=start+1;n<=Math.min(start+30,10000);n++){var candidate;try{candidate=planner(context,Object.assign({},options,{threshold:n}));}catch(e){continue;}if(candidate.summary.aligned>plan.summary.aligned)return {threshold:n,aligned:candidate.summary.aligned,targets:candidate.summary.targets};}return null;}
  return {count:count,key:key,rows:rows,summary:summary,suggestion:suggestion};
});
