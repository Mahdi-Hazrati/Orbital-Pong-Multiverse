'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../src/engine.js');
const {Game,vector,angles,unit,scale,add,dot,length,CONTACT}=E;
const approx=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function gameFor(n,extra={}){return new Game({dimension:n,mode:'survival',assist:false,...extra},()=>.5);}
function align(g,normal){Object.assign(g.s.players[g.s.active],angles(normal));}
function incoming(g,normal){g.s.phase='play';g.s.ball={p:scale(normal,.89),v:scale(normal,2),speed:2,escaped:false};}
for(const n of [2,3,4]){
  test(`${n}D spherical coordinates are unit length and round-trip`,()=>{
    for(let i=0;i<100;i++){const a=i*.231,b=Math.sin(i)*1.4,c=Math.cos(i)*1.3,v=vector(a,b,c,n),q=angles(v);approx(length(v),1);const back=vector(q.a,q.b,q.c,n);v.forEach((x,k)=>approx(x,back[k]));}
  });
  test(`${n}D tangent basis is orthonormal`,()=>{const v=vector(.8,.4,.7,n),basis=E.tangentBasis(v);assert.equal(basis.length,n-1);for(let i=0;i<basis.length;i++){approx(dot(v,basis[i]),0);approx(length(basis[i]),1);for(let j=i+1;j<basis.length;j++)approx(dot(basis[i],basis[j]),0);}});
  test(`${n}D analytic impact lands on the boundary`,()=>{const g=gameFor(n);g.launch();const hit=g.landing();assert.ok(hit.t>0);approx(length(hit.p),CONTACT);});
  test(`${n}D continuous collision catches a fast ball`,()=>{const g=gameFor(n),normal=vector(.7,.4,.3,n);align(g,normal);incoming(g,normal);g.updateBall(.04);assert.equal(g.s.total,1);assert.ok(dot(g.s.ball.v,normal)<0);assert.ok(length(g.s.ball.p)<CONTACT);});
  test(`${n}D an uncovered boundary loses a life`,()=>{const g=gameFor(n),normal=vector(.7,.4,.3,n);align(g,scale(normal,-1));incoming(g,normal);g.updateBall(.10);assert.equal(g.s.total,0);assert.equal(g.s.players[0].lives,0);assert.equal(g.s.phase,'point');});
  test(`${n}D long simulations keep all numeric state finite`,()=>{
    const g=new Game({dimension:n,mode:'arcade',players:[0,1,2,3].map(id=>({id,bot:true})),lives:7},()=>.48);
    for(let i=0;i<15000;i++)g.step(1/120,{});
    for(const x of [...g.s.ball.p,...g.s.ball.v,g.s.elapsed,g.s.ball.speed])assert.ok(Number.isFinite(x));
    assert.ok(g.s.ball.speed<=g.cfg.max);assert.ok(g.s.players.every(p=>p.lives>=0&&p.lives<=7));
  });
}
test('2D paddles wrap through the full circle in both directions',()=>{
  const g=gameFor(2);g.s.phase='countdown';g.s.timer=100;
  let min=10,max=-10;for(let i=0;i<240;i++){g.step(1/120,{0:{x:1}});min=Math.min(min,g.s.players[0].a);max=Math.max(max,g.s.players[0].a);}
  assert.ok(min<.1&&max>6.1);for(let i=0;i<240;i++)g.step(1/120,{0:{x:-1}});assert.ok(g.s.players[0].a>=0&&g.s.players[0].a<E.TAU);
});
test('3D collision genuinely depends on Z',()=>{const g=gameFor(3);Object.assign(g.s.players[0],{a:0,b:-Math.PI/2});incoming(g,[0,0,1]);g.updateBall(.1);assert.equal(g.s.total,0);assert.equal(g.s.players[0].lives,0);});
test('4D collision genuinely depends on W',()=>{const g=gameFor(4);Object.assign(g.s.players[0],{a:0,b:0,c:-Math.PI/2});incoming(g,[0,0,0,1]);g.updateBall(.1);assert.equal(g.s.total,0);assert.equal(g.s.players[0].lives,0);});
test('4D cap catches the W pole when correctly aligned',()=>{const g=gameFor(4);Object.assign(g.s.players[0],{a:0,b:0,c:Math.PI/2});incoming(g,[0,0,0,1]);g.updateBall(.04);assert.equal(g.s.total,1);assert.ok(g.s.ball.v[3]<0);});
test('4D deflection introduces nonzero W from an equatorial return',()=>{const g=gameFor(4);Object.assign(g.s.players[0],{a:0,b:0,c:0});incoming(g,[1,0,0,0]);g.updateBall(.04);assert.notEqual(g.s.ball.v[3],0);});
test('campaign return target completes a sector and awards stars',()=>{const g=new Game({mode:'campaign',level:0},()=>.5);g.s.phase='play';g.s.ball.speed=g.cfg.speed;for(let i=0;i<E.LEVELS[0].goal;i++)g.hit([-1,0]);assert.equal(g.s.phase,'over');assert.equal(g.s.result.success,true);assert.equal(g.s.result.stars,3);});
test('campaign total returns survive a miss; rally resets',()=>{const g=new Game({mode:'campaign',level:0},()=>.5);g.s.phase='play';g.hit([-1,0]);g.miss();for(let i=0;i<125;i++)g.step(1/120,{});assert.equal(g.s.total,1);assert.equal(g.s.rally,0);assert.equal(g.s.players[0].lives,3);});
test('four-player turn order skips eliminated pilots',()=>{const g=new Game({players:[0,1,2,3].map(id=>({id}))});g.s.players[1].lives=0;assert.equal(g.nextAlive(0),2);assert.equal(g.nextAlive(3),0);});
test('only the active paddle can return the ball',()=>{const g=new Game({players:[{id:0},{id:1}],assist:false},()=>.5);const normal=[1,0];Object.assign(g.s.players[0],{a:Math.PI});Object.assign(g.s.players[1],{a:0});incoming(g,normal);g.updateBall(.1);assert.equal(g.s.total,0);assert.equal(g.s.players[0].lives,2);});
test('last living pilot wins multiplayer',()=>{const g=new Game({players:[{id:0},{id:1}],lives:1});g.s.phase='play';g.s.active=1;g.miss();for(let i=0;i<122;i++)g.step(1/120,{});assert.equal(g.s.phase,'over');assert.equal(g.s.result.winner,0);});
test('disconnecting active player pauses or ends the match safely',()=>{const g=new Game({players:[{id:0},{id:1},{id:2}]});g.disconnect(0);assert.equal(g.s.phase,'pause');assert.equal(g.s.active,1);assert.equal(g.s.players[0].lives,0);g.disconnect(2);assert.equal(g.s.phase,'over');assert.equal(g.s.result.winner,1);});
test('snapshots are detached copies',()=>{const g=gameFor(4),s=g.snapshot();s.ball.p[0]=99;s.players[0].lives=999;assert.notEqual(g.s.ball.p[0],99);assert.notEqual(g.s.players[0].lives,999);});
test('pause freezes the simulation and resume restores its phase',()=>{const g=gameFor(3);g.launch();g.pause();const before=JSON.stringify(g.s);g.step(.05,{0:{x:1}});assert.equal(JSON.stringify(g.s),before);g.resume();assert.equal(g.s.phase,'play');});
test('all twelve campaign sectors have valid dimensions and goals',()=>{assert.equal(E.LEVELS.length,12);for(const n of [2,3,4])assert.equal(E.LEVELS.filter(l=>l.dimension===n).length,4);for(const l of E.LEVELS){assert.ok(l.goal>0);assert.ok(l.speed>0);assert.ok(l.cap>0);}});
vm.runInThisContext(fs.readFileSync(require.resolve('../src/network.js'),'utf8'));
const N=global.OrbitalNetwork;
const tokenData=kind=>({app:'orbital-multiverse',version:2,kind,room:'12345678abcdabcd',nonce:'1234567890abcdef12345678',seat:1,created:Date.now(),name:'Pilot',description:{type:kind==='offer'?'offer':'answer',sdp:'v=0\r\ns=test\r\n'}});
test('connection codes round-trip Unicode callsigns',()=>{const d=tokenData('offer');d.name='Pil\u00f6t';const decoded=N.decode(N.encode(d),'offer');assert.equal(decoded.name,d.name);assert.equal(decoded.room,d.room);});
test('offer and reply codes cannot be interchanged',()=>assert.throws(()=>N.decode(N.encode(tokenData('answer')),'offer')));
test('expired, oversized and damaged codes are rejected',()=>{const d=tokenData('offer');d.created-=3600001;assert.throws(()=>N.decode(N.encode(d),'offer'));assert.throws(()=>N.decode('OP2.'+'x'.repeat(100001),'offer'));assert.throws(()=>N.decode('OP2.!broken','offer'));});
test('snapshot validation rejects malformed dimensional vectors',()=>{const g=gameFor(4),s=g.snapshot();assert.equal(N.validSnapshot(s),true);s.ball.p=[1,2];assert.equal(N.validSnapshot(s),false);});
