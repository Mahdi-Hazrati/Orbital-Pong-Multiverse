/* Manual signaling WebRTC rooms. One browser hosts the simulation, not a web service.
 * Control messages: reliable/ordered. Inputs and complete snapshots: unordered/no retry.
 * No WebSocket, matchmaking service, accounts, relay, analytics or media tracks.
 */
(function(root){
  'use strict';
  const APP='orbital-multiverse',VERSION=2;
  const cleanName=value=>String(value||'Pilot').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,20)||'Pilot';
  const randomId=bytes=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function encode(data){
    const bytes=new TextEncoder().encode(JSON.stringify(data));let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return 'OP2.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(text,kind){
    const raw=String(text).replace(/\s/g,'');
    if(!raw.startsWith('OP2.')||raw.length>100000)throw new Error('Paste a complete OP2 invite or reply from this version of the game.');
    let data;
    try{const b=atob(raw.slice(4).replace(/-/g,'+').replace(/_/g,'/'));data=JSON.parse(new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0))));}
    catch{throw new Error('The connection code is incomplete or damaged. Copy the whole code again.');}
    if(!data||data.app!==APP||data.version!==VERSION||data.kind!==kind||
      !/^[a-f0-9]{16}$/.test(data.room)||!/^[a-f0-9]{24}$/.test(data.nonce)||
      !Number.isInteger(data.seat)||data.seat<1||data.seat>3||!finite(data.created)||
      !data.description||data.description.type!==(kind==='offer'?'offer':'answer')||
      typeof data.description.sdp!=='string'||!data.description.sdp.startsWith('v=0')||data.description.sdp.length>65000)
      throw new Error('This is not a valid '+(kind==='offer'?'host invite':'guest reply')+'.');
    if(Date.now()-data.created>60*60*1000)throw new Error('This code is over an hour old. Ask the host for a fresh invite.');
    data.name=cleanName(data.name);return data;
  }
  function validSnapshot(s){
    if(!s||![2,3,4].includes(s.n)||!Array.isArray(s.players)||s.players.length<1||s.players.length>4||
      !s.ball||!Array.isArray(s.ball.p)||!Array.isArray(s.ball.v)||s.ball.p.length!==s.n||s.ball.v.length!==s.n||
      !s.ball.p.every(finite)||!s.ball.v.every(finite)||!finite(s.ball.speed)||s.ball.speed<0||s.ball.speed>10||
      !Number.isInteger(s.active)||s.active<0||s.active>=s.players.length||
      !['play','countdown','pause','point','over'].includes(s.phase)||!finite(s.elapsed)||!finite(s.cap)||s.cap<=0||s.cap>1||
      !finite(s.baseSpeed)||s.baseSpeed<=0||!finite(s.maxSpeed)||s.maxSpeed<=0||
      !Number.isSafeInteger(s.eventId)||!s.event||typeof s.event.type!=='string'||
      !Number.isSafeInteger(s.total)||!Number.isSafeInteger(s.rally)||!Number.isSafeInteger(s.best))return false;
    if(s.event.type==='hit'&&(!Array.isArray(s.event.p)||s.event.p.length!==s.n||!s.event.p.every(finite)))return false;
    if(s.phase==='over'&&(!s.result||!Number.isInteger(s.result.winner)||s.result.winner < -1||s.result.winner>=s.players.length))return false;
    if(new Set(s.players.map(p=>p.id)).size!==s.players.length)return false;
    return s.players.every(p=>p&&Number.isInteger(p.id)&&p.id>=0&&p.id<4&&finite(p.a)&&finite(p.b)&&finite(p.c)&&finite(p.lives)&&finite(p.hits)&&typeof p.name==='string'&&p.name.length<=20);
  }
  function waitForIce(pc){
    if(pc.iceGatheringState==='complete')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);pc.removeEventListener('connectionstatechange',check);error?reject(error):resolve();};
      const check=()=>{if(pc.signalingState==='closed')finish(new Error('Connection setup was cancelled.'));else if(pc.iceGatheringState==='complete')finish();};
      const timer=setTimeout(()=>finish(new Error('Network discovery timed out. Try Direct / LAN, or a different network, then create a fresh invite.')),18000);
      pc.addEventListener('icegatheringstatechange',check);pc.addEventListener('connectionstatechange',check);check();
    });
  }
  function requireRoutes(pc){
    if(!pc.localDescription?.sdp?.includes('a=candidate:'))throw new Error('No connection routes were exposed by this browser. WebRTC may be blocked by a browser policy, VPN or network. Open the game in an unrestricted browser, check network settings, and create a fresh invite.');
  }
  class Room {
    constructor(onEvent=()=>{}){
      this.onEvent=onEvent;this.role='none';this.room='';this.seat=0;this.name='Pilot';this.iceMode='direct';this.peers=new Map();
      this.settings={dimension:2,difficulty:'normal',lives:3};this.ready=false;this.locked=false;this.inputSequence=0;this.snapshotSequence=0;
      this.lastSnapshot=-1;this.guestRoster=[];this.lastChat=0;this.generation=0;this.epoch='';
      this.pingTimer=setInterval(()=>{for(const p of this.peers.values())if(p.open)this.send(p,'control',{type:'ping',stamp:Date.now()});},2000);
    }
    emit(type,data){this.onEvent(type,data);}
    supported(){if(typeof RTCPeerConnection==='undefined')throw new Error('WebRTC is unavailable here. Open the game in a full browser, not an embedded preview.');}
    create(name,mode='direct'){
      this.supported();this.close(false);this.role='host';this.name=cleanName(name);this.room=randomId(8);this.iceMode=mode==='internet'?'internet':'direct';
      this.ready=true;this.locked=false;this.updateRoster();return this.room;
    }
    makePeer(seat,nonce){
      const pc=new RTCPeerConnection({iceServers:this.iceMode==='internet'?[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]:[]});
      const peer={seat,nonce,pc,control:null,fast:null,open:false,ready:false,name:'Pilot '+(seat+1),status:'Preparing invite',input:{},lastInput:0,lastSeq:-1,rtt:null,closing:false,chatAt:0};
      this.peers.set(seat,peer);
      pc.addEventListener('datachannel',event=>this.attach(peer,event.channel));
      pc.addEventListener('connectionstatechange',()=>{
        if(peer.closing)return;
        if(pc.connectionState==='failed')this.fail(peer,'Direct connection failed. Try Internet / STUN or another network. Some routers require a relay, which this server-free build does not use.');
        else if(pc.connectionState==='disconnected'){
          peer.status='Reconnecting';this.updateRoster();
          clearTimeout(peer.disconnectTimer);peer.disconnectTimer=setTimeout(()=>{if(pc.connectionState==='disconnected')this.fail(peer,'The peer disconnected. Create a fresh invite to reconnect.');},8000);
        }else if(pc.connectionState==='connected'){clearTimeout(peer.disconnectTimer);peer.status=peer.open?'Connected':'Opening data channels';this.updateRoster();}
      });
      return peer;
    }
    attach(peer,channel){
      if(!['control','fast'].includes(channel.label)){channel.close();return;}
      if(peer[channel.label]){channel.close();return;}
      peer[channel.label]=channel;
      channel.addEventListener('open',()=>{
        if(peer.control?.readyState==='open'&&peer.fast?.readyState==='open'&&!peer.open){
          peer.open=true;peer.status='Connected';clearTimeout(peer.connectTimer);
          if(this.role==='guest')this.send(peer,'control',{type:'hello',name:this.name});
          else this.send(peer,'control',{type:'welcome',seat:peer.seat,room:this.room,settings:this.settings});
          this.updateRoster();this.emit('connected',{seat:peer.seat});
        }
      });
      channel.addEventListener('message',event=>this.receive(peer,channel.label,event.data));
      channel.addEventListener('close',()=>{if(!peer.closing&&peer.open)this.fail(peer,'A data channel closed. Create a fresh invite to reconnect.');});
      channel.addEventListener('error',()=>this.emit('notice','A network packet could not be delivered.'));
    }
    send(peer,channel,data){
      const ch=peer[channel];if(ch?.readyState!=='open'||ch.bufferedAmount>(channel==='fast'?24000:256000))return false;
      try{ch.send(JSON.stringify(data));return true;}catch{return false;}
    }
    broadcast(channel,data){for(const p of this.peers.values())if(p.open)this.send(p,channel,data);}
    async invite(){
      if(this.role!=='host')throw new Error('Create a room first.');
      if(this.locked)throw new Error('Return to the lobby before inviting more pilots.');
      const seat=[1,2,3].find(i=>!this.peers.has(i));if(seat===undefined)throw new Error('The room has four seats. Remove a pending invite to free a seat.');
      const generation=this.generation,peer=this.makePeer(seat,randomId(12));
      this.attach(peer,peer.pc.createDataChannel('control',{ordered:true}));
      this.attach(peer,peer.pc.createDataChannel('fast',{ordered:false,maxRetransmits:0}));
      this.updateRoster();
      try{
        await peer.pc.setLocalDescription(await peer.pc.createOffer());await waitForIce(peer.pc);requireRoutes(peer.pc);
        if(this.generation!==generation||peer.closing)throw new Error('Invite cancelled.');
        const token=encode({app:APP,version:VERSION,kind:'offer',room:this.room,seat,nonce:peer.nonce,name:this.name,
          created:Date.now(),iceMode:this.iceMode,description:peer.pc.localDescription.toJSON()});
        peer.status='Awaiting reply';peer.token=token;this.updateRoster();return {token,seat};
      }catch(error){this.remove(seat,false);throw error;}
    }
    async join(text,name){
      this.supported();const offer=decode(text,'offer');this.close(false);
      const generation=this.generation;this.role='guest';this.name=cleanName(name);this.room=offer.room;this.seat=offer.seat;
      this.iceMode=offer.iceMode==='internet'?'internet':'direct';this.ready=false;this.locked=false;
      const peer=this.makePeer(0,offer.nonce);peer.name=offer.name;peer.status='Preparing reply';this.updateRoster();
      try{
        await peer.pc.setRemoteDescription(offer.description);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());await waitForIce(peer.pc);requireRoutes(peer.pc);
        if(this.generation!==generation||peer.closing)throw new Error('Join cancelled.');
        const token=encode({app:APP,version:VERSION,kind:'answer',room:this.room,seat:this.seat,nonce:offer.nonce,name:this.name,
          created:Date.now(),description:peer.pc.localDescription.toJSON()});
        peer.status='Send reply to host';this.updateRoster();return {token,seat:this.seat};
      }catch(error){this.close(false);throw error;}
    }
    async accept(text){
      if(this.role!=='host'||this.locked)throw new Error('Only a host in the lobby can accept replies.');
      const reply=decode(text,'answer'),peer=this.peers.get(reply.seat);
      if(reply.room!==this.room||!peer||reply.nonce!==peer.nonce)throw new Error('This reply does not match an active invite in this room.');
      if(peer.pc.remoteDescription)throw new Error('This reply has already been accepted.');
      peer.name=reply.name;peer.status='Connecting';this.updateRoster();
      await peer.pc.setRemoteDescription(reply.description);
      peer.connectTimer=setTimeout(()=>{if(!peer.open)this.fail(peer,'Connection timed out. Verify both tabs are open. Try another network or recreate the room in Internet / STUN mode.');},35000);
    }
    receive(peer,channel,raw){
      if(peer.closing||this.peers.get(peer.seat)!==peer)return;
      if(typeof raw!=='string'||raw.length>60000)return;
      let message;try{message=JSON.parse(raw);}catch{return;}
      if(!message||typeof message!=='object'||typeof message.type!=='string')return;
      if(channel==='fast'){
        if(this.role==='host'&&message.type==='input'&&Number.isSafeInteger(message.seq)&&message.seq>peer.lastSeq){
          const src=message.input;if(!src||typeof src!=='object')return;
          const input={assist:src.assist!==false};
          for(const key of ['x','y','z'])input[key]=finite(src[key])?Math.max(-1,Math.min(1,src[key])):0;
          for(const key of ['a','b','c'])if(finite(src[key]))input[key]=Math.max(-Math.PI*2,Math.min(Math.PI*2,src[key]));
          peer.input=input;peer.lastInput=performance.now();peer.lastSeq=message.seq;
        }else if(this.role==='guest'&&message.type==='snapshot'&&message.epoch===this.epoch&&Number.isSafeInteger(message.seq)&&message.seq>this.lastSnapshot&&validSnapshot(message.state)){
          this.lastSnapshot=message.seq;this.emit('snapshot',message.state);
        }
        return;
      }
      if(message.type==='ping'&&finite(message.stamp)){this.send(peer,'control',{type:'pong',stamp:message.stamp});return;}
      if(message.type==='pong'&&finite(message.stamp)){peer.rtt=Math.max(0,Math.min(9999,Date.now()-message.stamp));this.emit('latency',peer.rtt);if(this.role==='host')this.updateRoster();return;}
      if(this.role==='host'){
        if(message.type==='hello'){
          peer.name=cleanName(message.name);this.send(peer,'control',{type:'welcome',seat:peer.seat,room:this.room,settings:this.settings});this.updateRoster();
        }else if(message.type==='ready'&&!this.locked){peer.ready=message.ready===true;this.updateRoster();}
        else if(message.type==='chat'&&typeof message.text==='string'&&Date.now()-peer.chatAt>350){
          peer.chatAt=Date.now();this.chatMessage(peer.name,message.text,peer.seat);
        }else if(message.type==='away'){peer.input={};peer.lastInput=0;}
        else if(message.type==='leave'){this.remove(peer.seat);}
      }else if(this.role==='guest'){
        if(message.type==='welcome'&&message.room===this.room){this.emit('settings',message.settings);}
        else if(message.type==='roster'&&Array.isArray(message.players)){
          this.guestRoster=message.players.slice(0,4).map(p=>({seat:p.seat,name:cleanName(p.name),ready:p.ready===true,open:p.open===true,status:String(p.status||'').slice(0,40),rtt:p.rtt}));
          this.locked=message.locked===true;this.settings=message.settings||this.settings;this.emit('roster',this.guestRoster);
        }else if(message.type==='start'&&/^[a-f0-9]{16}$/.test(message.epoch)&&validSnapshot(message.state)){this.locked=true;this.epoch=message.epoch;this.lastSnapshot=-1;this.emit('start',message.state);}
        else if(message.type==='sync'&&message.epoch===this.epoch&&validSnapshot(message.state)){this.emit('snapshot',message.state);}
        else if(message.type==='lobby'){this.locked=false;this.emit('lobby');}
        else if(message.type==='chat'&&typeof message.text==='string'){this.emit('chat',{name:cleanName(message.name),text:message.text.slice(0,240),seat:message.seat});}
        else if(message.type==='closed'){this.fail(peer,'The host closed the room.');}
      }
    }
    chatMessage(name,text,seat){
      const message={type:'chat',name:cleanName(name),text:String(text).trim().slice(0,240),seat};
      if(!message.text)return;this.emit('chat',message);this.broadcast('control',message);
    }
    chat(text){
      if(Date.now()-this.lastChat<350)return;this.lastChat=Date.now();
      if(this.role==='host')this.chatMessage(this.name,text,0);
      else {const p=this.peers.get(0);if(p?.open)this.send(p,'control',{type:'chat',text:String(text).slice(0,240)});}
    }
    setReady(value){this.ready=!!value;if(this.role==='guest'){const p=this.peers.get(0);if(p)this.send(p,'control',{type:'ready',ready:this.ready});}this.emit('ready',this.ready);}
    setSettings(settings){if(this.role==='host'&&!this.locked){this.settings={...settings};this.updateRoster();}}
    roster(){
      if(this.role==='host')return [{seat:0,name:this.name,ready:true,open:true,status:'Host',rtt:0},...Array.from(this.peers.values()).map(p=>({seat:p.seat,name:p.name,ready:p.ready,open:p.open,status:p.status,rtt:p.rtt}))];
      if(this.guestRoster.length)return this.guestRoster;
      if(this.role==='guest')return [{seat:0,name:this.peers.get(0)?.name||'Host',ready:true,open:!!this.peers.get(0)?.open,status:this.peers.get(0)?.status||'Connecting'},{seat:this.seat,name:this.name,ready:this.ready,open:!!this.peers.get(0)?.open,status:'You'}];
      return [];
    }
    updateRoster(){const players=this.roster();this.emit('roster',players);if(this.role==='host')this.broadcast('control',{type:'roster',players,settings:this.settings,locked:this.locked});}
    canStart(){return this.role==='host'&&this.peers.size>0&&Array.from(this.peers.values()).every(p=>p.open&&p.ready);}
    start(state){
      if(!this.canStart())throw new Error('Every invited pilot must connect and press Ready. Remove unused invites first.');
      this.locked=true;this.epoch=randomId(8);this.snapshotSequence=0;this.broadcast('control',{type:'start',state,epoch:this.epoch});this.updateRoster();
    }
    lobby(){if(this.role!=='host')return;this.locked=false;this.broadcast('control',{type:'lobby'});this.updateRoster();}
    snapshot(state,reliable=false){if(this.role==='host')this.broadcast(reliable?'control':'fast',reliable?{type:'sync',state,epoch:this.epoch}:{type:'snapshot',seq:++this.snapshotSequence,state,epoch:this.epoch});}
    input(input){const p=this.peers.get(0);if(this.role==='guest'&&p?.open)this.send(p,'fast',{type:'input',seq:++this.inputSequence,input});}
    inputs(){const out={},now=performance.now();for(const p of this.peers.values())out[p.seat]=now-p.lastInput<450?p.input:{};return out;}
    away(){if(this.role==='guest'){const p=this.peers.get(0);if(p)this.send(p,'control',{type:'away'});}}
    remove(seat,notify=true){
      const p=this.peers.get(seat);if(!p)return;p.closing=true;clearTimeout(p.connectTimer);clearTimeout(p.disconnectTimer);
      if(notify)this.send(p,'control',{type:'closed'});p.pc.close();this.peers.delete(seat);this.updateRoster();
      if(notify)this.emit('departed',{seat});
    }
    fail(peer,reason){
      if(peer.closing)return;
      if(this.role==='host'){this.remove(peer.seat);this.emit('notice',reason);}
      else{this.close(false);this.emit('lost',reason);}
    }
    close(notify=true){
      this.generation++;
      if(notify){if(this.role==='host')this.broadcast('control',{type:'closed'});else if(this.role==='guest'){const p=this.peers.get(0);if(p)this.send(p,'control',{type:'leave'});}}
      for(const p of this.peers.values()){p.closing=true;clearTimeout(p.connectTimer);clearTimeout(p.disconnectTimer);p.pc.close();}
      this.peers.clear();this.role='none';this.room='';this.seat=0;this.ready=false;this.locked=false;this.guestRoster=[];this.lastSnapshot=-1;this.snapshotSequence=0;this.inputSequence=0;this.epoch='';
      this.emit('closed');
    }
    destroy(){this.close();clearInterval(this.pingTimer);}
  }
  root.OrbitalNetwork={Room,encode,decode,validSnapshot,cleanName};
})(typeof globalThis!=='undefined'?globalThis:this);
