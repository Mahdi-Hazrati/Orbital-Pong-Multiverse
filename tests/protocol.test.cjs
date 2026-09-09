/* Transport-mocked protocol tests. These do NOT establish real WebRTC connections. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/network.js');
const {Game}=require('../src/engine.js'),{Room}=global.OrbitalNetwork;
function network(guestCount=1){
  const hostEvents=[],host=new Room((type,data)=>hostEvents.push({type,data}));
  host.role='host';host.room='aabbccdd00112233';host.name='Host';host.ready=true;host.iceMode='direct';
  const guests=[],queue=[];
  function endpoint(seat,name){return {seat,name,ready:false,open:true,status:'Connected',input:{},lastInput:0,lastSeq:-1,chatAt:0,pc:{close(){}},closing:false};}
  for(let seat=1;seat<=guestCount;seat++){
    const events=[],guest=new Room((type,data)=>events.push({type,data}));guest.role='guest';guest.room=host.room;guest.name='Guest '+seat;guest.seat=seat;
    const hp=endpoint(seat,guest.name),gp=endpoint(0,host.name);
    for(const kind of ['control','fast']){
      hp[kind]={readyState:'open',bufferedAmount:0,send(raw){queue.push(()=>guest.receive(gp,kind,raw));}};
      gp[kind]={readyState:'open',bufferedAmount:0,send(raw){queue.push(()=>host.receive(hp,kind,raw));}};
    }
    host.peers.set(seat,hp);guest.peers.set(0,gp);guests.push({room:guest,events});
  }
  const flush=()=>{let count=0;while(queue.length){assert.ok(++count<1000,'Message loop');queue.shift()();}};
  const dispose=()=>{host.destroy();guests.forEach(g=>g.room.destroy());};
  return {host,hostEvents,guests,flush,dispose};
}
test('protocol: all three guests must ready before a four-player start',()=>{const n=network(3);try{assert.equal(n.host.canStart(),false);n.guests[0].room.setReady(true);n.flush();assert.equal(n.host.canStart(),false);n.guests.slice(1).forEach(g=>g.room.setReady(true));n.flush();assert.equal(n.host.canStart(),true);}finally{n.dispose();}});
test('protocol: host starts one consistent 4D game for all four peers',()=>{const n=network(3);try{n.guests.forEach(g=>g.room.setReady(true));n.flush();const game=new Game({dimension:4,mode:'online',players:[0,1,2,3].map(id=>({id}))});n.host.start(game.snapshot());n.flush();for(const g of n.guests){const start=g.events.find(e=>e.type==='start');assert.equal(start.data.n,4);assert.equal(start.data.players.length,4);assert.equal(g.room.epoch,n.host.epoch);assert.equal(g.room.locked,true);}}finally{n.dispose();}});
test('protocol: remote input is clamped, scoped to its seat, and sequence-checked',()=>{const n=network();try{const g=n.guests[0].room;g.input({x:800,y:-9,z:NaN,a:900,c:.5,assist:false});n.flush();const input=n.host.inputs()[1];assert.equal(input.x,1);assert.equal(input.y,-1);assert.equal(input.z,0);assert.equal(input.a,Math.PI*2);assert.equal(input.assist,false);assert.equal(n.host.inputs()[0],undefined);const peer=n.host.peers.get(1);n.host.receive(peer,'fast',JSON.stringify({type:'input',seq:0,input:{x:-1}}));assert.equal(peer.input.x,1);}finally{n.dispose();}});
test('protocol: stale movement expires without moving the peer forever',()=>{const n=network();try{n.guests[0].room.input({x:1});n.flush();n.host.peers.get(1).lastInput=performance.now()-1000;assert.deepEqual(n.host.inputs()[1],{});}finally{n.dispose();}});
test('protocol: snapshots synchronize and out-of-order packets are ignored',()=>{const n=network();try{n.guests[0].room.setReady(true);n.flush();const game=new Game({mode:'online'});n.host.start(game.snapshot());n.flush();n.host.snapshot(game.snapshot());n.flush();const guest=n.guests[0],before=guest.events.filter(e=>e.type==='snapshot').length;n.host.send(n.host.peers.get(1),'fast',{type:'snapshot',epoch:n.host.epoch,seq:0,state:game.snapshot()});n.flush();assert.equal(guest.events.filter(e=>e.type==='snapshot').length,before);}finally{n.dispose();}});
test('protocol: old-match packets cannot corrupt a rematch',()=>{const n=network();try{const guest=n.guests[0];guest.room.setReady(true);n.flush();const game=new Game({mode:'online'});n.host.start(game.snapshot());n.flush();const oldEpoch=n.host.epoch;n.host.lobby();n.flush();n.host.start(game.snapshot());n.flush();assert.notEqual(n.host.epoch,oldEpoch);const before=guest.events.filter(e=>e.type==='snapshot').length;n.host.send(n.host.peers.get(1),'fast',{type:'snapshot',epoch:oldEpoch,seq:999999,state:game.snapshot()});n.flush();assert.equal(guest.events.filter(e=>e.type==='snapshot').length,before);}finally{n.dispose();}});
test('protocol: lobby, chat, and host-controlled pause synchronize',()=>{const n=network(3);try{n.guests.forEach(g=>g.room.setReady(true));n.flush();n.guests[1].room.chat('<b>literal text</b>');n.flush();for(const g of n.guests)assert.equal(g.events.find(e=>e.type==='chat').data.text,'<b>literal text</b>');const game=new Game({mode:'online',players:[0,1,2,3].map(id=>({id}))});n.host.start(game.snapshot());n.flush();game.pause();n.host.snapshot(game.snapshot(),true);n.flush();for(const g of n.guests)assert.equal(g.events.filter(e=>e.type==='snapshot').at(-1).data.phase,'pause');n.host.lobby();n.flush();for(const g of n.guests)assert.equal(g.room.locked,false);}finally{n.dispose();}});
test('protocol: invalid packets cannot throw or inject host game state',()=>{const n=network();try{const hp=n.host.peers.get(1);for(const value of ['not json','null','[]','{"type":"input","seq":1}','x'.repeat(61000)])assert.doesNotThrow(()=>n.host.receive(hp,'fast',value));n.host.receive(hp,'fast',JSON.stringify({type:'snapshot',state:{},seq:1}));assert.equal(n.hostEvents.some(e=>e.type==='snapshot'),false);}finally{n.dispose();}});
