'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./host-fixture');
test('Remove All affects only selected-source tool markers',()=>{
 const f=fixture();f.add(f.a);f.add(f.b);f.select(f.a);const other=JSON.stringify(f.B.getMarkers().rows),r=f.host('removeAll',f.host('ownedMarkers'));assert.equal(r.removed,7);assert.equal(f.owned(f.A).length,0);assert.equal(JSON.stringify(f.B.getMarkers().rows),other);assert.equal(f.A.getMarkers().rows.length,2);assert.ok(f.sequence.markers.rows.some(m=>m.name==='Editor note'));
});
test('removal Undo restores complete source marker state',()=>{
 const f=fixture();f.add(f.a);const before=f.snapshot(),r=f.host('removeAll',f.host('ownedMarkers'));f.host('remove',JSON.parse(JSON.stringify(r.markerChange)));assert.deepEqual(f.snapshot(),before);
});
test('multiple selected instances of one source are removed once',()=>{
 const f=fixture();f.add(f.a);f.select(f.a,f.a2);const r=f.host('removeAll',f.host('ownedMarkers'));assert.equal(r.removed,7);assert.equal(r.clipCount,1);
});
test('multiple selected songs are removed and undone together',()=>{
 const f=fixture();f.add(f.a);f.add(f.b);f.select(f.a,f.a2,f.b);const before=f.snapshot(),r=f.host('removeAll',f.host('ownedMarkers'));assert.equal(r.clipCount,2);assert.equal(r.removed,14);f.host('remove',r.markerChange);assert.deepEqual(f.snapshot(),before);
});
test('legacy sequence beats are removed only for the selected song',()=>{
 const f=fixture(),r=f.host('removeAll',f.host('ownedMarkers'));assert.equal(r.removed,1);assert.ok(f.sequence.markers.rows.some(m=>m.comments.includes('clip=b')));assert.equal(f.A.getMarkers().rows.length,2);
});
test('selection and sequence changes after backup are rejected',()=>{
 const f=fixture(),p=f.host('ownedMarkers'),before=f.snapshot();f.select(f.b);assert.throws(()=>f.host('removeAll',p),/selected clips or their markers changed/);f.select(f.a);f.sequence.sequenceID='other';assert.throws(()=>f.host('removeAll',p),/active sequence changed/);assert.deepEqual(f.snapshot(),before);
});
test('marker edits after backup are rejected',()=>{
 const f=fixture(),p=f.host('ownedMarkers');f.sequence.markers.rows.find(m=>m.comments.includes('clip=a')).name='Edited';const before=f.snapshot();assert.throws(()=>f.host('removeAll',p),/markers changed/);assert.deepEqual(f.snapshot(),before);
});
test('deletion failure restores all selected sources',()=>{
 const f=fixture();f.add(f.a);f.add(f.b);f.select(f.a,f.b);const before=f.snapshot();f.failOnDelete(9);assert.throws(()=>f.host('removeAll',f.host('ownedMarkers')),/deletion failure/);assert.deepEqual(f.snapshot(),before);
});
test('no selection reports an error without deleting markers',()=>{
 const f=fixture(),before=f.snapshot();f.select();assert.throws(()=>f.host('ownedMarkers'),/Select one or more music clips/);assert.deepEqual(f.snapshot(),before);
});
test('no tool markers is a harmless no-op',()=>{
 const f=fixture();f.host('removeAll',f.host('ownedMarkers'));const before=f.snapshot(),r=f.host('removeAll',f.host('ownedMarkers'));assert.equal(r.removed,0);assert.deepEqual(f.snapshot(),before);
});
