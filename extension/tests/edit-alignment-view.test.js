const assert=require('node:assert/strict');
const planner=require('../js/edit-alignment.js');
const view=require('../js/edit-alignment-view.js');
const fd=.04;
function clip(id,start,end){return {nodeId:id,name:id,mediaType:'Video',trackIndex:0,source:'example.mov',start:start*fd,end:end*fd,inPoint:2,outPoint:2+(end-start)*fd,sourceDuration:20,selected:true,linked:[]};}
function context(clips){return {sequenceName:'Edited example',signature:'timeline',markerSignature:'beats',frameDuration:fd,tracks:[{index:0,clips}],markers:Array.from({length:81},(_,i)=>({time:i*.6}))};}
const options={trim:'both',anchor:'start',threshold:6,ripple:true,scope:'video-0'};
const cuts=[3,81,134,219,249,283,302,396];
const c=context(cuts.slice(0,-1).map((start,i)=>clip('Shot '+(i+1),start,cuts[i+1])));
let passed=0;
function test(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n');}
test('a moved ripple follower is not counted as an aligned edit',()=>{const p=planner.plan(c,options);assert.equal(p.summary.aligned,1);assert.equal(p.summary.changedVideoClips,7);assert.equal(p.summary.alignedEdits,1);assert.equal(p.summary.rippledClips,6);assert.equal(p.preview.length,7);assert.equal(p.preview.filter(c=>c.rippleOnly).length,6);});
test('preview and applied summaries disclose the real fitted count',()=>{const p=planner.plan(c,options);for(const applied of [false,true]){const text=view.summary(p,applied);assert.match(text,/1 \/ 7 clips fit/);assert.match(text,/6 moved by ripple only/);assert.match(text,/6 could not fit/);assert.doesNotMatch(text,/Aligned 7/);}});
test('each preview row distinguishes fit, ripple only and already on beat',()=>{const rows=view.rows(planner.plan(c,options));assert.equal(rows[0].result,'Fit');assert.equal(rows[1].result,'Ripple only');assert.equal(rows[1].offBeat,true);const aligned=context([clip('Aligned',0,45)]);assert.equal(view.rows(planner.plan(aligned,options))[0].result,'On beat');});
test('the edited example suggests seven frames, then all clips fit',()=>{const p=planner.plan(c,options),s=view.suggestion(c,options,p,planner.plan);assert.deepEqual(s,{threshold:7,aligned:7,targets:7});const full=planner.plan(c,{...options,threshold:s.threshold});assert.equal(full.summary.skipped,0);});
test('no threshold suggestion is offered for unavailable source media',()=>{const locked=context([clip('Locked',3,47)]);locked.tracks[0].locked=true;const p=planner.plan(locked,options);assert.equal(view.suggestion(locked,options,p,planner.plan),null);});
test('clip counts reflect additions, deletions and selection from fresh context',()=>{const current=context([clip('One',3,47),clip('Two',47,91)]);assert.equal(view.count(current,'video-0'),2);current.tracks[0].clips.pop();assert.equal(view.count(current,'video-0'),1);current.tracks[0].clips.push(clip('New',91,135));assert.equal(view.count(current,'video-0'),2);current.tracks[0].clips[0].selected=false;assert.equal(view.count(current,'selected'),1);current.tracks.push({index:1,clips:[{...clip('Other',3,47),trackIndex:1}]});assert.equal(view.count(current,'video-0'),2);assert.equal(view.count(current,'selected'),2);});
test('selection changes invalidate selected-clip previews',()=>{const current=context([clip('One',3,47),clip('Two',47,91)]);const before=view.key(current,'selected'),all=view.key(current,'video-0');current.tracks[0].clips[0].selected=false;assert.notEqual(view.key(current,'selected'),before);assert.equal(view.key(current,'video-0'),all);current.signature='deleted clip';assert.notEqual(view.key(current,'video-0'),all);});
process.stdout.write(passed+' preview checks passed.\n');
