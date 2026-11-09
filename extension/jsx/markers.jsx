/* Source markers use media seconds. Timeline placement is resolved separately for every instance. */
$.global.BeatClipMarkers=(function(){
    var EPS=0.000001,TICKS=254016000000;
    function owned(m){return String(m.type)==='Comment'&&String(m.comments).indexOf('BeatMarker |')===0;}
    function projectPath(){return String(app.project.path||'');}
    function audio(s){var rows=[];if(s.audioTracks)for(var t=0;t<s.audioTracks.numTracks;t++)for(var i=0;i<s.audioTracks[t].clips.numItems;i++)rows.push(s.audioTracks[t].clips[i]);return rows;}
    function owner(c){return {kind:'clip',ownerId:String(c.projectItem.nodeId),source:String(c.projectItem.getMediaPath()).replace(/^\/+/, '/'),name:String(c.projectItem.name||c.name)};}
    function sequenceOwner(s){return {kind:'sequence',sequenceId:String(s.sequenceID)};}
    function record(m,index){
        var color=String(m.name)==='\u2669 1'?0:6;
        try{var value=m.getColorByIndex(index);if(typeof value==='number'&&value>=0&&value<=7)color=value;}catch(ignore){}
        return {time:m.start.seconds,end:m.end.seconds,name:String(m.name),comments:String(m.comments),colorIndex:color,type:String(m.type)};
    }
    function read(collection,predicate){var rows=[],refs=[],m=collection.getFirstMarker(),i=0;while(m){if(!predicate||predicate(m)){rows.push(record(m,i));refs.push(m);}i++;m=collection.getNextMarker(m);}return {rows:rows,refs:refs};}
    function legacy(m){var tag=String(m.comments),clip=/\| clip=([^|]+) \|/.exec(tag),source=/\| source=([-\d.]+) \|/.exec(tag);return owned(m)&&clip&&source?{clipId:clip[1],sourceTime:Number(source[1])}:null;}
    function scope(descriptor,collection,predicate){var found=read(collection,predicate||owned);return {owner:descriptor,collection:collection,rows:found.rows,refs:found.refs};}
    function legacyFor(s,clips){var ids={};for(var i=0;i<clips.length;i++)ids[String(clips[i].nodeId)]=true;return scope(sequenceOwner(s),s.markers,function(m){var item=legacy(m);return !!(item&&ids[item.clipId]);});}
    function selectedClips(s){var clips=audio(s),chosen=[];for(var i=0;i<clips.length;i++)if(clips[i].isSelected()&&clips[i].projectItem&&!clips[i].projectItem.isSequence())chosen.push(clips[i]);return chosen;}
    function inventory(s,chosen){
        var clips=chosen||selectedClips(s);if(!clips.length)throw Error('Select one or more music clips in the timeline.');
        var scopes=[],seen={},count=0,legacyScope=legacyFor(s,clips);if(legacyScope.rows.length)scopes.push(legacyScope);
        for(var i=0;i<clips.length;i++){var id=String(clips[i].projectItem.nodeId);if(seen[id])continue;seen[id]=true;count++;scopes.push(scope(owner(clips[i]),clips[i].projectItem.getMarkers()));}
        var sets=[],flat=[];for(i=0;i<scopes.length;i++){sets.push({owner:scopes[i].owner,markers:scopes[i].rows});for(var j=0;j<scopes[i].rows.length;j++)flat.push(scopes[i].rows[j]);}
        return {scopes:scopes,data:{projectPath:projectPath(),sequenceId:String(s.sequenceID),sequenceName:String(s.name),clipCount:count,scopes:sets,markers:flat}};
    }
    function checkInventory(current,p){if(current.sequenceId!==p.sequenceId||current.projectPath!==p.projectPath)throw Error('The active sequence changed. Select the music clips again.');if(JSON.stringify(current.scopes)!==JSON.stringify(p.scopes))throw Error('The selected clips or their markers changed. Try again.');}
    function restore(collection,row){var m=collection.createMarker(row.time);if(!m)throw Error('Premiere could not create a clip marker.');m.name=row.name;m.comments=row.comments;if(row.end>row.time)m.end=row.end;m.setColorByIndex(row.colorIndex);return m;}
    function commit(s,changes){
        var created=[],deleted=[],i,j,change;
        try{
            // Stage every new marker before deleting any old markers, across all affected sources.
            for(i=0;i<changes.length;i++){change=changes[i];change.written=[];for(j=0;j<change.create.length;j++){var row=change.create[j],m=change.collection.createMarker(row.time);if(!m)throw Error('Premiere could not create a clip marker.');created.push({collection:change.collection,ref:m});m.name=row.name;m.comments=row.comments;if(row.end>row.time)m.end=row.end;m.setColorByIndex(row.colorIndex);change.written.push(record(m,0));}}
            for(i=0;i<changes.length;i++){change=changes[i];for(j=0;j<change.refs.length;j++){change.collection.deleteMarker(change.refs[j]);deleted.push({collection:change.collection,row:change.previous[j]});}}
        }catch(error){
            var failures=[];for(i=created.length-1;i>=0;i--)try{created[i].collection.deleteMarker(created[i].ref);}catch(e){failures.push(String(e));}
            for(i=0;i<deleted.length;i++)try{restore(deleted[i].collection,deleted[i].row);}catch(e){failures.push(String(e));}
            throw Error(String(error.message||error)+(failures.length?' Some markers could not be restored; use the saved marker backup.':''));
        }
        var collections=[];for(i=0;i<changes.length;i++){change=changes[i];if(change.written.length||change.previous.length)collections.push({owner:change.owner,markers:change.written,previous:change.previous,after:read(change.collection,owned).rows});}
        return {version:2,projectPath:projectPath(),sequenceId:String(s.sequenceID),collections:collections};
    }
    function sourceComments(d,b){return 'BeatMarker | sourceItem='+d.ownerId+' | source='+Number(b.time).toFixed(6)+' | beat='+b.beat+' | bar='+b.bar+'\nBar '+(b.bar===null?'unknown':b.bar)+' \u00b7 Beat '+(b.beat===null?'unknown':b.beat)+'\nSource: '+d.source+'\nSource time: '+Number(b.time).toFixed(6)+' seconds\nTiming: '+(b.inferred?'inferred from the stable later pulse':'detected in the source audio');}
    function sourceKey(row){var time=/\| source=([-\d.]+) \|/.exec(row.comments),beat=/\| beat=([^|]+) \|/.exec(row.comments);return time&&beat?Number(time[1]).toFixed(6)+'|'+beat[1]:row.comments;}
    function add(s,c,p){
        var d=owner(c),collection=c.projectItem.getMarkers(),before=read(collection,owned),existing={},proposed=[],skipped=0,visible=0,seen={};
        for(var i=0;i<before.rows.length;i++)existing[sourceKey(before.rows[i])]=true;
        for(i=0;i<p.beats.length;i++){var b=p.beats[i],at=Number(b.time);if(!isFinite(at)||at<0||(isFinite(p.duration)&&at>=Number(p.duration)-EPS)||(p.filter!=='all'&&b.beat!==Number(p.filter)))continue;
            var row={time:at,end:at,name:'\u2669 '+(b.beat===null?'?':b.beat),comments:sourceComments(d,b),colorIndex:b.beat===1?0:6},key=sourceKey(row);
            if(seen[key])continue;seen[key]=true;if(at>=c.inPoint.seconds-EPS&&at<c.outPoint.seconds-EPS&&c.start.seconds+at-c.inPoint.seconds<c.end.seconds-EPS)visible++;
            if(!p.replace&&existing[key]){skipped++;continue;}proposed.push(row);
        }
        var same=[],clips=audio(s);for(i=0;i<clips.length;i++)if(clips[i].projectItem&&String(clips[i].projectItem.nodeId)===d.ownerId)same.push(clips[i]);
        var old=legacyFor(s,same),changes=[{owner:d,collection:collection,create:proposed,previous:p.replace&&proposed.length?before.rows:[],refs:p.replace&&proposed.length?before.refs:[]}];
        if(old.rows.length&&(proposed.length||skipped))changes.push({owner:old.owner,collection:old.collection,create:[],previous:old.rows,refs:old.refs});
        var receipt=commit(s,changes);return {added:proposed.length,skipped:skipped,replaced:changes[0].previous.length,legacyRemoved:changes.length>1?old.rows.length:0,visible:visible,markers:changes[0].written,previous:changes[0].previous,markerChange:receipt};
    }
    function removeSelected(s,p){var current=inventory(s);checkInventory(current.data,p);var changes=[];for(var i=0;i<current.scopes.length;i++){var set=current.scopes[i];changes.push({owner:set.owner,collection:set.collection,create:[],previous:set.rows,refs:set.refs});}var receipt=commit(s,changes);return {sequenceId:String(s.sequenceID),sequenceName:String(s.name),removed:current.data.markers.length,clipCount:current.data.clipCount,markerChange:receipt};}
    function migrationInfo(s){var clips=selectedClips(s),set=legacyFor(s,clips);return {count:set.rows.length,selectedClips:clips.length};}
    function migrate(s,p){
        var current=inventory(s);checkInventory(current.data,p);var clips=selectedClips(s),byId={},groups={},changes=[],removed=0,added=0;
        for(var i=0;i<clips.length;i++)byId[String(clips[i].nodeId)]=clips[i];
        var set=legacyFor(s,clips),refs=[],previous=[];
        for(i=0;i<set.refs.length;i++){var old=set.refs[i],parsed=legacy(old),clip=byId[parsed.clipId];if(!isFinite(parsed.sourceTime)||parsed.sourceTime<0)continue;var d=owner(clip),id=d.ownerId;
            if(!groups[id]){var collection=clip.projectItem.getMarkers(),existing=read(collection,owned).rows,keys={};for(var j=0;j<existing.length;j++)keys[sourceKey(existing[j])]=true;groups[id]={owner:d,collection:collection,create:[],previous:[],refs:[],keys:keys};changes.push(groups[id]);}
            var row=record(old,i);row.end=parsed.sourceTime+Math.max(0,row.end-row.time);row.time=parsed.sourceTime;row.comments=row.comments.replace(/^BeatMarker[^\n]*/,String(row.comments).split('\n')[0].replace(/clip=[^|]+ \| /,'sourceItem='+id+' | ').replace(/timeline=[^|]+ \| /,''));
            var key=sourceKey(row);if(!groups[id].keys[key]){groups[id].create.push(row);groups[id].keys[key]=true;added++;}refs.push(old);previous.push(set.rows[i]);removed++;
        }
        changes.push({owner:sequenceOwner(s),collection:s.markers,create:[],previous:previous,refs:refs});var receipt=commit(s,changes);
        return {added:added,removed:removed,clipCount:changes.length-1,markerChange:receipt};
    }
    function resolve(s,d){
        if(d.kind==='sequence'){if(String(s.sequenceID)!==d.sequenceId)throw Error('Return to the sequence containing the previous marker change.');return s.markers;}
        var found=null,clips=audio(s);for(var i=0;i<clips.length;i++)if(clips[i].projectItem&&String(clips[i].projectItem.nodeId)===d.ownerId)found=clips[i].projectItem;
        function walk(item){if(!item||found)return;if(String(item.nodeId)===d.ownerId){found=item;return;}if(item.children)for(var n=0;n<item.children.numItems;n++)walk(item.children[n]);}if(!found)walk(app.project.rootItem);
        if(!found||String(found.getMediaPath()).replace(/^\/+/, '/')!==d.source)throw Error('The original music source is no longer available for Undo.');return found.getMarkers();
    }
    function undo(s,p){
        if(p.projectPath!==projectPath())throw Error('Return to the project containing the last marker change.');var changes=[],removed=0,restored=0;
        for(var i=0;i<p.collections.length;i++){var set=p.collections[i],collection=resolve(s,set.owner),now=read(collection,owned);if(JSON.stringify(now.rows)!==JSON.stringify(set.after))throw Error('The beat markers changed after this operation. Undo those marker edits first.');
            var refs=[],rows=[];for(var j=0;j<now.rows.length;j++)for(var k=0;k<set.markers.length;k++)if(JSON.stringify(now.rows[j])===JSON.stringify(set.markers[k])){refs.push(now.refs[j]);rows.push(now.rows[j]);break;}
            removed+=rows.length;restored+=set.previous.length;changes.push({owner:set.owner,collection:collection,create:set.previous,previous:rows,refs:refs});
        }
        commit(s,changes);return {removed:removed,restored:restored};
    }
    function beats(s){
        var clips=audio(s),byId={},sourceSets={},markers=[],all=read(s.markers).rows;
        function append(row,at,kind,c){markers.push({time:at,ticks:String(Math.round(at*TICKS)),name:row.name,comments:row.comments,scope:kind,clipNodeId:c?String(c.nodeId):null,sourceTime:kind==='clip'?row.time:null});}
        for(var i=0;i<clips.length;i++){
            var c=clips[i];byId[String(c.nodeId)]=c;if(!c.projectItem||c.projectItem.isSequence()||c.projectItem.isOffline()||Math.abs(Number(c.getSpeed())-1)>EPS||c.isSpeedReversed())continue;
            var id=String(c.projectItem.nodeId),rows=sourceSets[id];if(!rows){rows=read(c.projectItem.getMarkers(),owned).rows;sourceSets[id]=rows;}
            for(var j=0;j<rows.length;j++){var row=rows[j],at=c.start.seconds+row.time-c.inPoint.seconds;if(row.time>=c.inPoint.seconds-EPS&&row.time<c.outPoint.seconds-EPS&&at<c.end.seconds-EPS)append(row,at,'clip',c);}
        }
        for(i=0;i<all.length;i++){
            row=all[i];if(row.type!=='Comment')continue;var parsed=legacy({type:row.type,comments:row.comments});
            if(parsed){c=byId[parsed.clipId];if(!c||!c.projectItem||Math.abs(Number(c.getSpeed())-1)>EPS||c.isSpeedReversed()||(sourceSets[String(c.projectItem.nodeId)]||[]).length)continue;at=c.start.seconds+parsed.sourceTime-c.inPoint.seconds;if(parsed.sourceTime>=c.inPoint.seconds-EPS&&parsed.sourceTime<c.outPoint.seconds-EPS&&at<c.end.seconds-EPS)append(row,at,'legacy',c);}
            else if(row.comments.indexOf('BeatMarker |')===0||row.name.indexOf('\u2669 ')===0)append(row,row.time,'sequence',null);
        }
        markers.sort(function(a,b){return a.time-b.time;});var seen={},unique=[];for(i=0;i<markers.length;i++){var key=String(Math.round(markers[i].time/EPS));if(!seen[key]){seen[key]=true;unique.push(markers[i]);}}
        return {markers:unique,allMarkers:all};
    }
    return {owned:owned,inventory:inventory,add:add,removeSelected:removeSelected,migrationInfo:migrationInfo,migrate:migrate,undo:undo,beats:beats};
})();
