/* Shared with the timing regression tests. Source seconds never include sequence display timecode. */
(function(root){
  'use strict';
  function mapBeats(analysis,clip,filter){
    if(!clip||Math.abs(clip.speed-1)>0.00001||clip.reversed)throw new Error('Use a normal-speed, forward music clip.');
    var start=Number(clip.start),end=Number(clip.end),sourceIn=Number(clip.inPoint),sourceOut=Number(clip.outPoint);
    if(![start,end,sourceIn,sourceOut].every(Number.isFinite)||end<=start||sourceOut<=sourceIn)throw new Error('The clip has invalid timing.');
    return analysis.beats.filter(function(b){return b.time>=sourceIn-0.000001&&b.time<sourceOut-0.000001;}).map(function(b){
      return {sourceTime:b.time,time:start+b.time-sourceIn,beat:b.beat,bar:b.bar,inferred:!!b.inferred,name:'♩ '+(b.beat||'?')};
    }).filter(function(b){return b.time>=start-0.000001&&b.time<end-0.000001&&(filter==='all'||b.beat===Number(filter));});
  }
  var api={mapBeats:mapBeats};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BeatTiming=api;
})(typeof window!=='undefined'?window:globalThis);
