'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./host-fixture');
test('beats use source seconds across the full song and exclusive trim bounds',()=>{
 const f=fixture(),r=f.add(f.a);assert.equal(r.added,7);assert.equal(r.visible,4);assert.equal(r.legacyRemoved,1);assert.deepEqual(f.owned(f.A).map(m=>m.start.seconds),[1,5,6,7,9,10,12]);assert.deepEqual(f.host('alignContext').markers.map(m=>m.time),[30,31,32,34,61,90]);
});
test('moving and trimming changes mapped beats without rewriting source markers',()=>{
 const f=fixture();f.add(f.a);const before=f.snapshot()[0];f.a.start.seconds=40;f.a.end.seconds=43;f.a.inPoint.seconds=6;f.a.outPoint.seconds=9;assert.deepEqual(f.host('alignContext').markers.map(m=>m.time),[40,41,61,90]);assert.deepEqual(f.snapshot()[0],before);
});
test('different songs and repeated uses keep their own offsets',()=>{
 const f=fixture();f.add(f.a,[5,6,7,8,9]);f.add(f.b,[2,3,4,5]);assert.deepEqual(f.host('alignContext').markers.map(m=>m.time),[30,31,32,33,34,60,61,62,63,90,91]);
});
test('repeated additions after moving skip existing source beats',()=>{
 const f=fixture();f.add(f.a);f.a.start.seconds+=3;f.a.end.seconds+=3;const r=f.add(f.a,[1,5,6,7,9,10,12],false);assert.equal(r.added,0);assert.equal(r.skipped,7);assert.equal(f.owned(f.A).length,7);
});
test('filter replacement preserves manual source markers',()=>{
 const f=fixture();f.add(f.a);const r=f.add(f.a,[{time:6,beat:1,bar:2},{time:7,beat:2,bar:2}],true,'2');assert.equal(r.added,1);assert.equal(r.replaced,7);assert.equal(f.owned(f.A)[0].name,'♩ 2');assert.equal(f.A.getMarkers().rows.length,3);
});
test('Undo survives serialization and a timeline move',()=>{
 const f=fixture(),before=f.snapshot(),r=f.add(f.a);f.a.start.seconds+=5;f.a.end.seconds+=5;f.host('remove',JSON.parse(JSON.stringify(r.markerChange)));assert.deepEqual(f.snapshot(),before);
});
test('Undo rejects manually changed tool markers',()=>{
 const f=fixture(),r=f.add(f.a);f.owned(f.A)[0].start.seconds+=.1;const before=f.snapshot();assert.throws(()=>f.host('remove',r.markerChange),/markers changed/);assert.deepEqual(f.snapshot(),before);
});
test('Undo resolves a source after its timeline instances are removed',()=>{
 const f=fixture();f.sequence.markers.rows.splice(0,1);const before=f.snapshot()[0],r=f.add(f.a);f.sequence.audioTracks[0].clips.splice(0,1);f.sequence.audioTracks[0].clips.splice(1,1);f.host('remove',r.markerChange);assert.deepEqual(f.snapshot()[0],before);
});
test('creation failure rolls back staged additions before removing legacy beats',()=>{
 const f=fixture(),before=f.snapshot();f.failOnCreate(3);assert.throws(()=>f.add(f.a),/creation failure/);assert.deepEqual(f.snapshot(),before);
});
test('deletion failure rolls back source changes',()=>{
 const f=fixture();f.add(f.a);const before=f.snapshot();f.failOnDelete(2);assert.throws(()=>f.add(f.a,[5,6,7]),/deletion failure/);assert.deepEqual(f.snapshot(),before);
});
test('migration moves selected songs and preserves names and duration',()=>{
 const f=fixture(),before=f.snapshot(),r=f.host('migrate',f.host('ownedMarkers'));assert.equal(r.removed,1);assert.equal(r.added,1);assert.equal(f.owned(f.A)[0].name,'Renamed beat');assert.ok(Math.abs(f.owned(f.A)[0].end.seconds-6.2)<.000001);assert.ok(f.sequence.markers.rows.some(m=>m.comments.includes('clip=b')));f.host('remove',r.markerChange);assert.deepEqual(f.snapshot(),before);
});
test('source beat changes invalidate an alignment preview',()=>{
 const f=fixture();f.add(f.a);const c=f.host('alignContext');f.owned(f.A)[1].start.seconds+=.2;assert.throws(()=>f.host('alignApply',{...c,changes:[],groups:[]}),/markers changed after preview/);
});
test('legacy Undo receipts remain usable',()=>{
 const f=fixture(),m=f.sequence.markers.rows[0];assert.equal(f.host('remove',{sequenceId:'sequence-1',markers:[{comments:m.comments}],previous:[]}).removed,1);assert.ok(f.sequence.markers.rows.some(m=>m.comments.includes('clip=b')));
});
