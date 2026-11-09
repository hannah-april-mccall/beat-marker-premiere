const assert=require('node:assert/strict');
const {plan}=require('../js/edit-alignment.js');
const fd=1/25;
function clip(id,start,end,sourceIn=50){return {nodeId:id,name:id,mediaType:'Video',trackIndex:0,source:'test.mov',start:start*fd,end:end*fd,inPoint:sourceIn*fd,outPoint:(sourceIn+end-start)*fd,sourceDuration:20,selected:true,linked:[]};}
function ctx(clips,markers=Array.from({length:101},(_,i)=>({time:i*15*fd}))){return {projectPath:'test.prproj',sequenceId:'test',frameDuration:fd,signature:'before',markerSignature:'beats',markers,tracks:[{index:0,locked:false,transitions:0,clips}]};}
function options(extra={}){return Object.assign({trim:'both',anchor:'start',threshold:6,ripple:false,scope:'video-0'},extra);}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
let passed=0;
function test(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n');}
test('both clip edges snap to beats; source start stays fixed',()=>{const c=clip('one',3,47);const p=plan(ctx([c]),options());assert.equal(p.changes.length,1);const n=p.changes[0].after;near(n.start,0);near(n.end,45*fd);near(n.inPoint,c.inPoint);near(n.outPoint-c.outPoint,fd);});
test('end anchor retains source out-point',()=>{const c=clip('one',3,47);const n=plan(ctx([c]),options({anchor:'end'})).changes[0].after;near(n.outPoint,c.outPoint);near(n.inPoint,c.inPoint-fd);});
test('middle anchor distributes an even duration change equally',()=>{const c=clip('one',3,46);const n=plan(ctx([c]),options({anchor:'middle'})).changes[0].after;near(n.inPoint,c.inPoint-fd);near(n.outPoint,c.outPoint+fd);});
test('middle anchor rounds an odd duration change within half a frame',()=>{const c=clip('one',3,47);const n=plan(ctx([c]),options({anchor:'middle'})).changes[0].after;assert.ok(Math.abs((n.inPoint+n.outPoint-c.inPoint-c.outPoint)/2)<=fd/2+1e-8);});
test('extend only does not shorten source duration',()=>{const c=clip('one',3,49);const p=plan(ctx([c]),options({trim:'extend'}));assert.equal(p.changes.length,0);assert.equal(p.summary.skipped,1);});
test('reduce only does not extend source duration',()=>{const c=clip('one',3,47);const p=plan(ctx([c]),options({trim:'reduce'}));assert.equal(p.changes.length,0);assert.equal(p.summary.skipped,1);});
test('threshold is a maximum per edit in frames',()=>{assert.equal(plan(ctx([clip('one',7,49)]),options()).changes.length,0);});
test('threshold zero allows already aligned clips only',()=>{const p=plan(ctx([clip('one',0,45)]),options({threshold:0}));assert.equal(p.summary.alreadyAligned,1);assert.equal(p.changes.length,0);});
test('source head and tail limits block impossible extensions',()=>{const c=clip('one',3,47,0);c.sourceDuration=c.outPoint;assert.equal(plan(ctx([c]),options({anchor:'end'})).changes.length,0);assert.equal(plan(ctx([c]),options({anchor:'start'})).changes.length,0);});
test('joint plan keeps adjacent edits from overlapping',()=>{const p=plan(ctx([clip('one',3,47),clip('two',47,91)]),options());assert.equal(p.summary.aligned,2);near(p.changes[0].after.end,p.changes[1].after.start);});
test('unselected neighbours are preserved without ripple',()=>{const a=clip('one',3,47),b=clip('two',47,91);b.selected=false;const p=plan(ctx([a,b]),options({scope:'selected'}));assert.ok(p.changes.every(c=>c.nodeId==='one'));assert.ok(p.changes[0].after.end<=b.start);});
test('ripple fits a continuous run and moves an unselected follower',()=>{const clips=[clip('one',3,47),clip('two',47,91),clip('tail',91,135)];clips[2].selected=false;const p=plan(ctx(clips),options({scope:'selected',ripple:true}));assert.equal(p.summary.aligned,2);assert.equal(p.summary.rippledClips,1);near(p.changes[0].after.end,p.changes[1].after.start);near(p.changes[1].after.end,p.changes[2].after.start);near(p.changes[2].after.outPoint,p.changes[2].before.outPoint);});
test('ripple threshold is measured after earlier shifts',()=>{const clips=[clip('one',3,47),clip('two',47,91),clip('three',91,135)];const p=plan(ctx(clips),options({ripple:true,trim:'extend'}));assert.equal(p.summary.aligned,3);for(let i=1;i<p.changes.length;i++)near(p.changes[i-1].after.end,p.changes[i].after.start);});
test('linked audio receives the same timeline and source changes',()=>{const c=clip('one',3,47);const audio=Object.assign({},c,{nodeId:'sound',mediaType:'Audio',trackIndex:1});delete audio.linked;c.linked=[audio];const p=plan(ctx([c]),options());assert.equal(p.summary.linkedAudioClips,1);assert.deepEqual(p.changes[0].after,p.changes[1].after);});
test('locked track is skipped',()=>{const c=ctx([clip('one',3,47)]);c.tracks[0].locked=true;assert.equal(plan(c,options()).changes.length,0);});
test('transitions are skipped',()=>{const c=ctx([clip('one',3,47)]);c.tracks[0].transitions=1;assert.equal(plan(c,options()).changes.length,0);});
test('ripple refuses to move a locked linked follower',()=>{const a=clip('one',3,47),b=clip('two',47,91);b.reason='Linked audio track is locked.';assert.throws(()=>plan(ctx([a,b]),options({ripple:true})),/unsupported or locked/);});
test('fractional frame rate uses sequence frame duration',()=>{const c=ctx([clip('one',3,47)]);c.frameDuration=1001/30000;c.tracks[0].clips=[clip('one',3,47)];const p=plan(c,options());for(const m of p.changes){near(m.after.start/c.frameDuration,Math.round(m.after.start/c.frameDuration));near(m.after.end/c.frameDuration,Math.round(m.after.end/c.frameDuration));}});
test('negative or fractional thresholds fail before edits',()=>{assert.throws(()=>plan(ctx([clip('one',3,47)]),options({threshold:-1})),/whole number/);assert.throws(()=>plan(ctx([clip('one',3,47)]),options({threshold:1.5})),/whole number/);});
test('missing beat markers cannot produce a plan',()=>{assert.throws(()=>plan(ctx([clip('one',3,47)],[]),options()),/two beat markers/);});
process.stdout.write(passed+' alignment checks passed.\n');
