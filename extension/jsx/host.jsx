/* Premiere ExtendScript bridge. All edit targets are checked again at write time. */
#include "json2.js"
#include "markers.jsx"
#include "alignment.jsx"
$.global.BeatMarker = (function(){
    function wrap(fn){try{return JSON.stringify({ok:true,data:fn()});}catch(e){return JSON.stringify({ok:false,error:String(e.message||e)});}}
    function sequence(){var s=app.project.activeSequence;if(!s)throw Error('Open a sequence in Premiere.');return s;}
    function describe(c,s){
        if(!c.projectItem||c.projectItem.isSequence())throw Error('Select a source music clip, not a nested sequence.');
        if(c.projectItem.isOffline())throw Error('The music clip is offline. Relink it first.');
        var speed=Number(c.getSpeed());
        var reversed=!!c.isSpeedReversed();
        if(Math.abs(speed-1)>0.00001||reversed)throw Error('This version supports normal-speed, forward clips. Render speed changes or Remix edits to audio first.');
        var source=c.projectItem.getMediaPath();
        if(!source)throw Error('This clip has no readable source file.');
        if(source.charAt(0)==='/')source=source.replace(/^\/+/, '/');
        return {nodeId:String(c.nodeId),sequenceId:String(s.sequenceID),name:c.name,source:source,start:c.start.seconds,end:c.end.seconds,inPoint:c.inPoint.seconds,outPoint:c.outPoint.seconds,speed:speed,reversed:reversed,zeroPoint:s.zeroPoint,sequenceName:s.name};
    }
    function find(target){
        var s=sequence();
        if(String(s.sequenceID)!==target.sequenceId)throw Error('Return to the analysed sequence before placing markers.');
        for(var t=0;t<s.audioTracks.numTracks;t++){
            var track=s.audioTracks[t];
            for(var i=0;i<track.clips.numItems;i++){
                var c=track.clips[i];
                if(String(c.nodeId)===target.nodeId){var d=describe(c,s);if(d.source!==target.source)throw Error('The clip source has changed. Analyse it again.');return {clip:c,info:d,seq:s};}
            }
        }
        throw Error('The analysed clip was removed. Select a clip and analyse again.');
    }
    function selected(){
        var s=sequence(),found=[];
        for(var t=0;t<s.audioTracks.numTracks;t++)for(var i=0;i<s.audioTracks[t].clips.numItems;i++){
            var c=s.audioTracks[t].clips[i];if(c.isSelected())found.push(c);
        }
        if(found.length!==1)throw Error('Select exactly one audio clip in the timeline.');
        return describe(found[0],s);
    }
    function add(payload){
        var current=find(payload.target),result=BeatClipMarkers.add(current.seq,current.clip,payload);result.clip=current.info;return result;
    }
    function restoreMarker(markers,item){
        var m=markers.createMarker(item.time);m.name=item.name;m.comments=item.comments;
        if(item.end>item.time)m.end=item.end;
        m.setColorByIndex(item.colorIndex);return m;
    }
    function ownedMarkers(){return BeatClipMarkers.inventory(sequence());}
    function removeAll(payload){return BeatClipMarkers.removeSelected(sequence(),payload);}
    function remove(payload){
        var s=sequence();if(payload.version===2)return BeatClipMarkers.undo(s,payload);if(String(s.sequenceID)!==payload.sequenceId)throw Error('Return to the sequence where the last batch was added.');
        var wanted={},removed=0;for(var i=0;i<payload.markers.length;i++)wanted[payload.markers[i].comments]=true;
        var markers=s.markers,m=markers.getFirstMarker();
        while(m){var next=markers.getNextMarker(m);if(wanted[String(m.comments)]){markers.deleteMarker(m);removed++;}m=next;}
        var restored=0;if(payload.previous)for(i=0;i<payload.previous.length;i++){restoreMarker(markers,payload.previous[i]);restored++;}
        return {removed:removed,restored:restored};
    }
    function audit(){
        var s=sequence(),data=BeatClipMarkers.beats(s);return {premiere:app.version,sequence:s.name,sequenceId:String(s.sequenceID),zeroPoint:s.zeroPoint,markers:data.markers,sequenceMarkers:data.allMarkers};
    }
    function testCase(p){
        if(decodeURI(new File(app.project.path).name)!=='Beat Marker Tests.prproj')throw Error('Open the supplied Beat Marker Tests project first.');
        var s=null;for(var i=0;i<app.project.sequences.numSequences;i++){if(app.project.sequences[i].name===p.name)s=app.project.sequences[i];}
        if(!s)throw Error('Import Music tests.xml into the test project first.');
        app.project.openSequence(s.sequenceID);
        var first=null;
        for(var t=0;t<s.audioTracks.numTracks;t++)for(var j=0;j<s.audioTracks[t].clips.numItems;j++){var c=s.audioTracks[t].clips[j];c.setSelected(0,0);if(!first)first=c;}
        if(!first)throw Error('Test sequence has no audio.');first.setSelected(1,1);
        s.setPlayerPosition(first.start.ticks);
        return describe(first,s);
    }
    return {version:"0.6.0",dispatch:function(method,json){return wrap(function(){var p=JSON.parse(json||'{}');if(method.indexOf('align')===0)return BeatEditHost.dispatch(method,p);if(method==='selected')return selected();if(method==='current')return find(p).info;if(method==='add')return add(p);if(method==='remove')return remove(p);if(method==='markerBackup'){var backup=find(p);return BeatClipMarkers.inventory(backup.seq,[backup.clip]).data;}if(method==='migrationInfo')return BeatClipMarkers.migrationInfo(sequence());if(method==='migrate')return BeatClipMarkers.migrate(sequence(),p);if(method==='ownedMarkers')return ownedMarkers().data;if(method==='removeAll')return removeAll(p);if(method==='audit')return audit();if(method==='testCase')return testCase(p);if(method==='testMove'){if(decodeURI(new File(app.project.path).name)!=='Beat Marker Tests.prproj')throw Error('Test project required.');var f=find(p.target),delta=new Time();delta.seconds=p.delta;f.clip.move(delta);return describe(f.clip,f.seq);}if(method==='saveProject'){if(decodeURI(new File(app.project.path).name)!=='Beat Marker Tests.prproj')throw Error('Test project required.');app.project.save();return {saved:true};}if(method==='openProject'){if(!new File(p.path).exists)throw Error('The test project has not been created.');app.openDocument(p.path);return {opened:true};}throw Error('Unknown request.');});}};
})();
