'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const TICKS=254016000000;
class NativeTime {constructor(seconds=0){this.seconds=seconds;}get ticks(){return String(Math.round(this.seconds*TICKS));}set ticks(value){this.seconds=Number(value)/TICKS;}}
function fixture(){
  let creates=0,deletes=0,failCreate=0,failDelete=0;const collections=[];
  function collection(){const rows=[];const api={rows,getFirstMarker:()=>rows[0]||null,getNextMarker:m=>rows[rows.indexOf(m)+1]||null,
    createMarker(time){if(++creates===failCreate)throw Error('Simulated creation failure');const m={start:new NativeTime(time),_end:new NativeTime(time),name:'',comments:'',type:'Comment',color:0,getColorByIndex(){return this.color;},setColorByIndex(v){this.color=v;}};Object.defineProperty(m,'end',{get(){return this._end;},set(v){this._end=typeof v==='number'?new NativeTime(v):v;}});rows.push(m);rows.sort((a,b)=>a.start.seconds-b.start.seconds);return m;},
    deleteMarker(m){if(++deletes===failDelete)throw Error('Simulated deletion failure');if(!rows.includes(m))throw Error('Unknown marker');rows.splice(rows.indexOf(m),1);}};collections.push(api);return api;}
  function item(id){const markers=collection();return {nodeId:id,name:id+'.wav',isSequence:()=>false,isOffline:()=>false,getMediaPath:()=>'/music/'+id+'.wav',getMarkers:()=>markers};}
  const A=item('song-A'),B=item('song-B');
  function clip(id,source,start,inPoint,outPoint,selected=false){return {nodeId:id,projectItem:source,name:id,mediaType:'Audio',start:new NativeTime(start),end:new NativeTime(start+outPoint-inPoint),inPoint:new NativeTime(inPoint),outPoint:new NativeTime(outPoint),selected,getSpeed:()=>1,isSpeedReversed:()=>false,isSelected(){return this.selected;},setSelected(v){this.selected=!!v;},isAdjustmentLayer:()=>false,getLinkedItems:()=>({numItems:0}),move(t){this.start.seconds+=t.seconds;this.end.seconds+=t.seconds;}};}
  const a=clip('a',A,30,5,10,true),b=clip('b',B,60,2,6),a2=clip('a-repeat',A,90,7,9),v=clip('video',B,30,0,2);v.mediaType='Video';
  const list=rows=>{Object.defineProperty(rows,'numItems',{get(){return this.length;}});return rows;};
  const tracks=rows=>{Object.defineProperty(rows,'numTracks',{get(){return this.length;}});return rows;};
  const audioTracks=tracks([{name:'A1',clips:list([a,b,a2]),transitions:{numItems:0},isLocked:()=>false}]);
  const videoTracks=tracks([{name:'V1',clips:list([v]),transitions:{numItems:0},isLocked:()=>false}]);
  const sequence={sequenceID:'sequence-1',name:'Source marker test',audioTracks,videoTracks,timebase:String(TICKS/25),zeroPoint:String(TICKS*3600),end:String(TICKS*100),markers:collection()};
  const app={version:'test',project:{path:'/tests/Beat Marker Tests.prproj',activeSequence:sequence,rootItem:{nodeId:'root',children:list([A,B])}}};
  const ctx={$:{global:{}},app,JSON,Time:NativeTime};vm.createContext(ctx);
  const read=name=>fs.readFileSync(path.join(__dirname,'../jsx',name),'utf8').replace(/^#include.*$/gm,'');
  vm.runInContext(read('markers.jsx')+'\nvar BeatClipMarkers=$.global.BeatClipMarkers;\n'+read('alignment.jsx')+'\nvar BeatEditHost=$.global.BeatEditHost;\n'+read('host.jsx'),ctx);
  const dispatch=(method,p={})=>JSON.parse(ctx.$.global.BeatMarker.dispatch(method,JSON.stringify(p)));
  const host=(method,p)=>{const r=dispatch(method,p);if(!r.ok)throw Error(r.error);return r.data;};
  function marker(collection,time,name,comments,color=0,end=time,type='Comment'){const m=collection.createMarker(time);Object.assign(m,{name,comments,color,type});m.end=end;return m;}
  const tag=(clip,source,beat)=>'BeatMarker | clip='+clip+' | source='+source.toFixed(6)+' | timeline=31.000000 | beat='+beat+' | bar=1\nTiming: detected';
  marker(sequence.markers,31,'Renamed beat',tag('a',6,1),3,31.2);marker(sequence.markers,61,'♩ 2',tag('b',3,2),6);marker(sequence.markers,20,'Editor note','Manual editor marker',4,21);
  marker(A.getMarkers(),6,'♩ 1','Manual source beat',4);marker(A.getMarkers(),8,'Chapter',tag('a',8,3),2,8,'Chapter');
  const snapshot=()=>collections.map(c=>c.rows.map(m=>({time:m.start.seconds,end:m.end.seconds,name:m.name,comments:m.comments,color:m.color,type:m.type})).sort((a,b)=>a.time-b.time||a.name.localeCompare(b.name)));
  const select=(...clips)=>{audioTracks.forEach(t=>t.clips.forEach(c=>c.selected=clips.includes(c)));};
  const add=(clip,beats=[1,5,6,7,9,10,12],replace=true,filter='all')=>{select(clip);return host('add',{target:host('selected'),beats:beats.map((time,i)=>typeof time==='number'?{time,beat:i%4+1,bar:1}:time),duration:20,filter,replace});};
  return {runtime:ctx,app,A,B,a,b,a2,v,sequence,host,dispatch,marker,tag,snapshot,select,add,failOnCreate(n){failCreate=creates+n;},failOnDelete(n){failDelete=deletes+n;},owned(item){return item.getMarkers().rows.filter(m=>m.type==='Comment'&&m.comments.startsWith('BeatMarker |'));}};
}
module.exports={fixture,NativeTime};
