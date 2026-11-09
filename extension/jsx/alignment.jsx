/* Clip alignment bridge. Plans are revalidated before any timeline mutation. */
$.global.BeatEditHost=(function(){
    var TICKS=254016000000;
    function time(seconds){var t=new Time();t.ticks=String(Math.round(seconds*TICKS));return t;}
    function seq(){var s=app.project.activeSequence;if(!s)throw Error('Open a sequence containing video clips and beat markers.');return s;}
    function locked(track){try{return !!track.isLocked();}catch(e){return false;}}
    function basic(c,type,index){
        var reason=null,source='',speed=Number(c.getSpeed()),reversed=!!c.isSpeedReversed();
        try{
            if(!c.projectItem||c.projectItem.isSequence())reason='Nested sequences are not supported in this version.';
            else if(c.projectItem.isOffline())reason='Source media is offline.';
            else source=String(c.projectItem.getMediaPath()).replace(/^\/+/, '/');
            if(!(speed>0)||reversed)reason='Reversed or invalid-speed clips are not supported.';
            if(Math.abs((c.outPoint.seconds-c.inPoint.seconds)-(c.end.seconds-c.start.seconds))>0.00001)reason='Variable speed clips must be rendered before alignment.';
            if(type==='Video'&&c.isAdjustmentLayer())reason='Adjustment layers are not edited.';
        }catch(error){reason='Cannot read this clip as normal source media.';}
        // Premiere reports in/out on the retimed source clock. The planner uses
        // original source seconds so subsequent trims preserve the chosen frame.
        return {nodeId:String(c.nodeId),name:String(c.name),mediaType:type,trackIndex:index,source:source,start:c.start.seconds,end:c.end.seconds,inPoint:c.inPoint.seconds*speed,outPoint:c.outPoint.seconds*speed,speed:speed,reversed:reversed,selected:!!c.isSelected(),reason:reason};
    }
    function inspect(){
        var s=seq(),tracks=[],all=[],refs={},byId={},signature=[],markers=[],allMarkers=[],lockMap={},transitionMap={};
        var collections=[s.videoTracks,s.audioTracks],types=['Video','Audio'];
        for(var g=0;g<2;g++)for(var t=0;t<collections[g].numTracks;t++){
            var track=collections[g][t],isLocked=locked(track),transitions=track.transitions.numItems,rows=[];
            lockMap[types[g]+t]=isLocked;
            transitionMap[types[g]+t]=transitions;
            signature.push([types[g],t,isLocked,transitions]);
            for(var i=0;i<track.clips.numItems;i++){
                var c=track.clips[i],row=basic(c,types[g],t);refs[row.nodeId]=c;byId[row.nodeId]=row;rows.push(row);all.push(row);
                signature.push([row.nodeId,types[g],t,row.source,String(c.start.ticks),String(c.end.ticks),String(c.inPoint.ticks),String(c.outPoint.ticks),row.reason]);
                if(!close(row.speed,1)||row.reversed)signature.push(['rate',row.nodeId,row.speed,row.reversed]);
            }
            if(g===0)tracks.push({index:t,name:String(track.name),locked:isLocked,transitions:transitions,clips:rows});
        }
        for(i=0;i<all.length;i++)if(all[i].mediaType==='Video'){
            var video=all[i],links=[];
            try{
                var nativeLinks=refs[video.nodeId].getLinkedItems();
                if(nativeLinks)for(var j=0;j<nativeLinks.numItems;j++){
                    var linked=nativeLinks[j],id=linked?String(linked.nodeId):'',member=byId[id];
                    if(!member||id===video.nodeId)continue;
                    if(member.mediaType!=='Audio'){video.reason='Linked video clips must be aligned separately.';continue;}
                    if(Math.abs(member.start-video.start)>0.00001||Math.abs(member.end-video.end)>0.00001||Math.abs(member.inPoint-video.inPoint)>0.00001||Math.abs(member.outPoint-video.outPoint)>0.00001||Math.abs(member.speed-video.speed)>0.00001){video.reason='Linked audio has different trims or speed; align a copy with matching audio.';continue;}
                    if(lockMap['Audio'+member.trackIndex])video.reason='Linked audio track is locked.';
                    if(transitionMap['Audio'+member.trackIndex])video.reason='Linked audio track has transitions; align a copy without transitions first.';
                    if(member.reason)video.reason=member.reason;
                    links.push(member);
                }
            }catch(error){video.reason='Cannot inspect this clip\'s linked audio.';}
            video.linked=links;
            var linkedIds=[];for(j=0;j<links.length;j++)linkedIds.push(links[j].nodeId);signature.push(['links',video.nodeId,linkedIds,video.reason]);
        }
        var beatData=BeatClipMarkers.beats(s);markers=beatData.markers;allMarkers=beatData.allMarkers;
        var migration=BeatClipMarkers.migrationInfo(s);
        var path=String(app.project.path),sequenceId=String(s.sequenceID),fd=Number(s.timebase)/TICKS;
        return {s:s,refs:refs,data:{sequenceId:sequenceId,sequenceName:String(s.name),projectPath:path,frameDuration:fd,migration:migration,tracks:tracks,allClips:all,markers:markers,allMarkers:allMarkers,signature:JSON.stringify([path,sequenceId,String(s.timebase),signature]),markerSignature:JSON.stringify(markers)}};
    }
    function context(){var data=inspect().data;data.nativeUndoCapabilities={beginUndoGroup:typeof app.beginUndoGroup==='function',endUndoGroup:typeof app.endUndoGroup==='function',executeTransaction:typeof app.project.executeTransaction==='function'};return data;}
    function close(a,b){return Math.abs(a-b)<0.00001;}
    function stateSpeed(state){return state.speed===undefined?1:state.speed;}
    function matches(c,wanted){var rate=Number(c.getSpeed());return close(c.start.seconds,wanted.start)&&close(c.end.seconds,wanted.end)&&close(c.inPoint.seconds*rate,wanted.inPoint)&&close(c.outPoint.seconds*rate,wanted.outPoint)&&close(rate,stateSpeed(wanted));}
    function qeClip(c,type,index){
        var q=qe.project.getActiveSequence(),track=type==='Video'?q.getVideoTrackAt(index):q.getAudioTrackAt(index),found=null;
        for(var i=0;i<track.numItems;i++){
            var item=track.getItemAt(i);
            if(String(item.type)!=='Clip'||String(item.name)!==String(c.name))continue;
            if(Math.abs(Number(item.start.secs)-c.start.seconds)>0.001||Math.abs(Number(item.end.secs)-c.end.seconds)>0.001)continue;
            if(found)throw Error('Cannot identify one unique speed-change target: '+c.name+'.');found=item;
        }
        if(!found||typeof found.setSpeed!=='function')throw Error('This Premiere build cannot rate-stretch '+c.name+'.');return found;
    }
    function durationCode(seconds){
        var s=seq(),fd=Number(s.timebase)/TICKS,format=Number(s.videoDisplayFormat),rate=time(fd);
        if(format===109||format===111||format===112||!isFinite(format)){
            var fps=1/fd;format=Math.abs(fps-23.976)<.01?110:Math.abs(fps-29.97)<.01?103:Math.abs(fps-59.94)<.01?107:Math.round(fps)===24?100:Math.round(fps)===25?101:Math.round(fps)===30?104:Math.round(fps)===48?113:Math.round(fps)===50?105:108;
        }
        return time(seconds).getFormatted(rate,format);
    }
    function prepareSpeed(refs,changes,side){
        var enabled=false;
        for(var i=0;i<changes.length;i++){
            var change=changes[i],c=refs[change.nodeId];
            if(close(Number(c.getSpeed()),stateSpeed(change[side])))continue;
            if(!enabled){if(typeof app.enableQE!=='function')throw Error('Rate stretching is unavailable in this Premiere build.');app.enableQE();enabled=true;}
            qeClip(c,change.mediaType,change.trackIndex);
        }
    }
    function writeSource(c,at){var rate=Number(c.getSpeed());c.inPoint=time(at.inPoint/rate);c.outPoint=time(at.outPoint/rate);}
    function preserveLinks(refs,groups){
        var selection=[],key,i,j;
        for(key in refs)selection.push({clip:refs[key],selected:!!refs[key].isSelected()});
        try{for(i=0;i<groups.length;i++){
            var group=groups[i];if(group.length<2)continue;
            var links=refs[group[0]].getLinkedItems(),ids={},complete=true;
            if(links)for(j=0;j<links.numItems;j++)ids[String(links[j].nodeId)]=true;
            for(j=1;j<group.length;j++)if(!ids[group[j]])complete=false;
            if(complete)continue;
            for(j=0;j<selection.length;j++)selection[j].clip.setSelected(0,0);
            for(j=0;j<group.length;j++)refs[group[j]].setSelected(1,0);
            if(typeof seq().linkSelection!=='function')throw Error('Premiere cannot restore linked audio for this edit.');seq().linkSelection();
            links=refs[group[0]].getLinkedItems();ids={};if(links)for(j=0;j<links.numItems;j++)ids[String(links[j].nodeId)]=true;
            for(j=1;j<group.length;j++)if(!ids[group[j]])throw Error('Premiere did not restore the audio link for '+refs[group[0]].name+'.');
        }}finally{for(i=0;i<selection.length;i++)selection[i].clip.setSelected(selection[i].selected?1:0,0);}
    }
    function moveTo(c,seconds){var delta=Math.round(seconds*TICKS)-Number(c.start.ticks);if(delta){var amount=new Time();amount.ticks=String(delta);c.move(amount);}}
    function validateCollisions(data,changes){
        var mapped={},rows=[];for(var i=0;i<changes.length;i++)mapped[changes[i].nodeId]=changes[i].after;
        for(i=0;i<data.allClips.length;i++){
            var c=data.allClips[i],at=mapped[c.nodeId]||c;
            var rate=stateSpeed(at);
            if(!isFinite(at.start)||!isFinite(at.end)||!isFinite(at.inPoint)||!isFinite(at.outPoint)||!isFinite(rate)||rate<.01-0.00001||rate>100+0.00001||at.start<0||at.inPoint< -0.00001||at.end<=at.start||at.outPoint<=at.inPoint)throw Error('An edit has invalid timing or speed. Preview again.');
            if(mapped[c.nodeId]&&Math.abs((at.outPoint-at.inPoint)-rate*(at.end-at.start))>0.00001)throw Error('An edit has inconsistent source timing and speed. Preview again.');
            rows.push({c:c,start:at.start,end:at.end,changed:!!mapped[c.nodeId]});
        }
        for(i=0;i<rows.length;i++)for(var j=i+1;j<rows.length;j++){
            var a=rows[i],b=rows[j];if(a.c.mediaType!==b.c.mediaType||a.c.trackIndex!==b.c.trackIndex||(!a.changed&&!b.changed))continue;
            if(Math.min(a.end,b.end)-Math.max(a.start,b.start)>0.00001)throw Error('Alignment would overlap '+a.c.name+' and '+b.c.name+'. Adjust the options or selection.');
        }
    }
    function writeStates(refs,changes,groups,side){
        prepareSpeed(refs,changes,side);
        var maxEnd=0,i,j,group,changeById={};
        for(i=0;i<changes.length;i++){var c=changes[i];changeById[c.nodeId]=c;maxEnd=Math.max(maxEnd,refs[c.nodeId].end.seconds,c.before.end,c.after.end);}
        var base=Math.max(seq().end/TICKS,maxEnd)+10;
        // Move affected groups into empty space before changing lengths, so temporary
        // overlaps cannot overwrite neighbouring clips. Unaffected media stays put.
        for(i=0;i<groups.length;i++){
            group=groups[i];var min=Infinity,max=0;
            for(j=0;j<group.length;j++){var nativeClip=refs[group[j]];min=Math.min(min,nativeClip.start.seconds);max=Math.max(max,nativeClip.end.seconds);}
            var duration=max-min,offset=base-min;
            for(j=0;j<group.length;j++){var bounds=changeById[group[j]];duration=Math.max(duration,bounds.before.end-bounds.before.start,bounds.after.end-bounds.after.start);}
            var destinations=[];for(j=0;j<group.length;j++)destinations.push(refs[group[j]].start.seconds+offset);
            for(j=0;j<group.length;j++)moveTo(refs[group[j]],destinations[j]);
            base+=duration+2;
        }
        for(i=0;i<changes.length;i++){
            var item=changes[i],clip=refs[item.nodeId],at=item[side],parked=clip.start.seconds;
            if(!close(Number(clip.getSpeed()),stateSpeed(at))){
                // QE requires a sequence timecode duration, not tick text.
                // Setting the rate first also changes Premiere's source clock.
                var result=qeClip(clip,item.mediaType,item.trackIndex).setSpeed(stateSpeed(at),durationCode(at.end-at.start),false,true,false);
                if(result===false||!close(Number(clip.getSpeed()),stateSpeed(at)))throw Error('Premiere did not retain the requested speed for '+item.name+'.');
            }
            writeSource(clip,at);clip.end=time(parked+at.end-at.start);
        }
        for(i=0;i<groups.length;i++)for(j=0;j<groups[i].length;j++){
            var id=groups[i][j],entry=changeById[id],clipRef=refs[id],target=entry[side];
            moveTo(clipRef,target.start);writeSource(clipRef,target);clipRef.end=time(target.end);
        }
        preserveLinks(refs,groups);
        for(i=0;i<changes.length;i++)if(!matches(refs[changes[i].nodeId],changes[i][side]))throw Error('Premiere did not retain the requested timing for '+changes[i].name+'.');
    }
    function apply(p){
        var current=inspect(),data=current.data;
        if(p.projectPath!==data.projectPath||p.sequenceId!==data.sequenceId||p.signature!==data.signature||p.markerSignature!==data.markerSignature)throw Error('The timeline or beat markers changed after preview. Preview again.');
        if(!p.changes||!p.changes.length)throw Error('There are no clip changes to apply.');
        validateCollisions(data,p.changes);
        for(var i=0;i<p.changes.length;i++)if(!current.refs[p.changes[i].nodeId]||!matches(current.refs[p.changes[i].nodeId],p.changes[i].before))throw Error('A previewed clip changed. Preview again.');
        prepareSpeed(current.refs,p.changes,'after');
        try{writeStates(current.refs,p.changes,p.groups,'after');}
        catch(error){try{writeStates(current.refs,p.changes,p.groups,'before');}catch(restoreError){throw Error(String(error)+' Restore also failed: '+String(restoreError)+'. The alignment backup contains the original timing.');}throw Error(String(error)+' Original clip timing restored.');}
        var after=inspect().data;
        return {sequenceId:data.sequenceId,projectPath:data.projectPath,changes:p.changes,groups:p.groups,beforeSignature:data.signature,afterSignature:after.signature,summary:p.summary,verified:true};
    }
    function undo(p){
        var current=inspect();if(p.projectPath!==current.data.projectPath||p.sequenceId!==current.data.sequenceId||p.afterSignature!==current.data.signature)throw Error('The clips changed after alignment. Undo those changes first, or use the saved alignment backup.');
        prepareSpeed(current.refs,p.changes,'before');
        try{writeStates(current.refs,p.changes,p.groups,'before');}
        catch(error){try{writeStates(current.refs,p.changes,p.groups,'after');}catch(ignore){}throw error;}
        return {restored:p.changes.length,verified:true,signature:inspect().data.signature};
    }
    function testSequence(){var s=seq();if(String(s.name).indexOf('Beat Marker - Edit Alignment Test')!==0)throw Error('Open the generated alignment test sequence first.');return s;}
    function testPrepare(p){
        var name=String(p.name||'Beat Marker - Edit Alignment Test');
        if(name.indexOf('Beat Marker - Edit Alignment Test')!==0)throw Error('Use a dedicated alignment test sequence.');
        var s=null;for(var i=0;i<app.project.sequences.numSequences;i++)if(app.project.sequences[i].name===name)s=app.project.sequences[i];
        if(!s){if(!new File(p.xml).exists)throw Error('The alignment fixture is missing.');if(!app.project.importFiles([p.xml],true,app.project.rootItem,false))throw Error('Premiere could not import the alignment fixture.');for(i=0;i<app.project.sequences.numSequences;i++)if(app.project.sequences[i].name===name)s=app.project.sequences[i];}
        if(!s)throw Error('The alignment test sequence was not imported.');
        app.project.openSequence(s.sequenceID);
        var m=s.markers.getFirstMarker(),has=false;while(m){if(String(m.comments).indexOf('BeatMarker | fixture=edit-alignment')===0)has=true;m=s.markers.getNextMarker(m);}
        if(!has)for(i=0;i<=80;i++){m=s.markers.createMarker(i*.6);m.name='\u2669 '+(i%4+1);m.comments='BeatMarker | fixture=edit-alignment | beat='+(i%4+1);m.setColorByIndex(i%4===0?0:6);}
        for(var t=0;t<s.videoTracks.numTracks;t++)for(i=0;i<s.videoTracks[t].clips.numItems;i++)s.videoTracks[t].clips[i].setSelected(1,0);
        s.setPlayerPosition('0');return context();
    }
    function dispatch(method,p){
        if(method==='alignContext')return context();
        if(method==='alignApply')return apply(p);
        if(method==='alignUndo')return undo(p);
        if(method==='alignTestPrepare')return testPrepare(p);
        if(method==='alignTestExport'){var s=testSequence();if(!s.exportAsProject(p.path))throw Error('Could not export the alignment test project.');return {path:p.path};}
        if(method==='alignTestSelect'){s=testSequence();for(var t=0;t<s.videoTracks.numTracks;t++)for(var i=0;i<s.videoTracks[t].clips.numItems;i++)s.videoTracks[t].clips[i].setSelected(i<Number(p.count)?1:0,0);return context();}
        throw Error('Unknown alignment request.');
    }
    return {dispatch:dispatch};
})();
