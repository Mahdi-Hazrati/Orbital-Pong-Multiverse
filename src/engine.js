/* Orbital Pong Multiverse - dimension-independent deterministic simulation.
 * Browser global + CommonJS export. No DOM, clocks, network calls or dependencies.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, CONTACT = 0.9175, BALL_RADIUS = 0.022;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = a => ((a % TAU) + TAU) % TAU;
  const delta = (a, b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
  const dot = (a,b) => a.reduce((n,x,i)=>n+x*b[i],0);
  const length = a => Math.sqrt(dot(a,a));
  const scale = (a,s) => a.map(x=>x*s);
  const add = (a,b) => a.map((x,i)=>x+b[i]);
  const unit = a => { const n=length(a); return n>1e-9?scale(a,1/n):a.map((_,i)=>i===0?1:0); };
  function vector(a,b=0,c=0,n=2) {
    if(n===2) return [Math.cos(a),Math.sin(a)];
    const v=[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)];
    return n===3?v:[...scale(v,Math.cos(c)),Math.sin(c)];
  }
  function angles(v) {
    const c=v.length===4?Math.asin(clamp(v[3]/(length(v)||1),-1,1)):0;
    return {a:Math.atan2(v[1],v[0]),b:v.length>2?Math.atan2(v[2],Math.hypot(v[0],v[1])):0,c};
  }
  function tangentBasis(normal) {
    const basis=[];
    for(let k=0;k<normal.length && basis.length<normal.length-1;k++){
      let v=normal.map((_,i)=>i===k?1:0);
      v=add(v,scale(normal,-dot(v,normal)));
      for(const b of basis)v=add(v,scale(b,-dot(v,b)));
      if(length(v)>1e-6)basis.push(unit(v));
    }
    return basis;
  }
  const COLORS=['#65e5ff','#fc7dba','#b9ec78','#c0a0ff'];
  const DIMENSIONS={
    2:{name:'Orbit',label:'2D',subtitle:'The original. Without the sidelines.',color:'#65e5ff'},
    3:{name:'Sphere',label:'3D',subtitle:'A new axis. A whole new angle.',color:'#b9ec78'},
    4:{name:'Hypersphere',label:'4D',subtitle:'Beyond the plane. Beyond the obvious.',color:'#c0a0ff'}
  };
  const LEVELS=[
    {name:'First light',dimension:2,goal:6,speed:.76,cap:.39,lives:4,tip:'Follow the landing diamond. Catch six returns.'},
    {name:'Momentum',dimension:2,goal:10,speed:.87,cap:.36,lives:3,tip:'Off-center contact changes the outgoing angle.'},
    {name:'Afterglow',dimension:2,goal:13,speed:.96,cap:.335,lives:3,tip:'Every return adds speed. Start moving early.'},
    {name:'Escape velocity',dimension:2,goal:16,speed:1.08,cap:.31,lives:3,tip:'Your first dimension trial. Hold the orbit.'},
    {name:'A new axis',dimension:3,goal:6,speed:.76,cap:.46,lives:4,tip:'The ball now moves in XYZ. Depth assist follows Z for you.'},
    {name:'Parallax',dimension:3,goal:10,speed:.86,cap:.425,lives:3,tip:'Near and far contacts project to different parts of the sphere.'},
    {name:'Deep field',dimension:3,goal:13,speed:.95,cap:.40,lives:3,tip:'Use the trajectory and depth readout to anticipate each catch.'},
    {name:'Event horizon',dimension:3,goal:16,speed:1.06,cap:.37,lives:3,tip:'A smaller capture cap. A faster sphere.'},
    {name:'Fourth light',dimension:4,goal:6,speed:.73,cap:.50,lives:4,tip:'The ball has four coordinates: XYZW. Phase assist tracks W.'},
    {name:'Phase shift',dimension:4,goal:10,speed:.84,cap:.47,lives:3,tip:'W changes the projection scale. The geometry is still four-dimensional.'},
    {name:'Beyond sight',dimension:4,goal:14,speed:.94,cap:.44,lives:3,tip:'Trust the landing marker, not just the apparent ball size.'},
    {name:'Singularity',dimension:4,goal:18,speed:1.03,cap:.405,lives:3,tip:'The final trial. Every axis, one orbit.'}
  ];
  const DIFFICULTIES={
    easy:{speed:.80,max:1.65,cap:.40,ai:3.0,error:.18,reaction:.23},
    normal:{speed:1.00,max:2.05,cap:.34,ai:4.0,error:.13,reaction:.16},
    hard:{speed:1.20,max:2.45,cap:.29,ai:5.0,error:.09,reaction:.10}
  };
  class Game {
    constructor(options={},rng=Math.random){
      this.rng=rng;
      const difficulty=DIFFICULTIES[options.difficulty]?options.difficulty:'normal';
      const level=options.mode==='campaign'?LEVELS[clamp(options.level|0,0,11)]:null;
      const n=level?level.dimension:([2,3,4].includes(options.dimension)?options.dimension:2);
      const base=DIFFICULTIES[difficulty];
      this.cfg={...base,speed:level?level.speed:base.speed,max:level?level.speed*1.9:base.max,
        cap:level?level.cap:base.cap+(n-2)*.06,human:7.2};
      this.options={mode:options.mode||'arcade',dimension:n,difficulty,level:level?options.level|0:-1,assist:options.assist!==false};
      const solo=this.options.mode==='campaign'||this.options.mode==='survival';
      const specs=solo?[{id:0,name:options.name||'You',bot:false}]:(options.players||[{id:0,name:'You'},{id:1,name:'CPU',bot:true}]).slice(0,4);
      if(!solo&&specs.length<2)throw new Error('Multiplayer needs at least two players.');
      const lives=level?level.lives:this.options.mode==='survival'?1:clamp(options.lives||3,1,7);
      this.s={version:2,n,mode:this.options.mode,level:this.options.level,phase:'countdown',previous:'play',timer:1.8,
        active:0,elapsed:0,rally:0,total:0,best:0,goal:level?level.goal:0,initialLives:lives,
        eventId:0,event:{type:'serve',player:0},result:null,ball:{p:Array(n).fill(0),v:Array(n).fill(0),speed:this.cfg.speed,escaped:false},
        cap:this.cfg.cap,maxSpeed:this.cfg.max,baseSpeed:this.cfg.speed,
        players:specs.map((p,i)=>({id:p.id===undefined?i:p.id,name:String(p.name||'Pilot '+(i+1)).slice(0,20),bot:!!p.bot,
          a:wrap(Math.PI+i*TAU/specs.length),b:n>2?.18*(i%2?1:-1):0,c:0,da:0,db:0,dc:0,lives,hits:0,connected:true,
          aiTimer:0,aiError:0}))};
    }
    event(type,player,extra={}){this.s.eventId++;this.s.event={type,player,...extra};}
    position(p){return vector(p.a,p.b,p.c,this.s.n);}
    landing(){
      const {p,v,escaped}=this.s.ball,a=dot(v,v);
      if(escaped||a<1e-12)return null;
      const b=2*dot(p,v),c=dot(p,p)-CONTACT*CONTACT,d=b*b-4*a*c;
      if(d<0)return null;
      const t=(-b+Math.sqrt(d))/(2*a);
      if(t< -1e-8)return null;
      const at=add(p,scale(v,Math.max(0,t)));
      return {t:Math.max(0,t),p:at,normal:unit(at),...angles(at)};
    }
    nextAlive(i){
      for(let k=1;k<=this.s.players.length;k++){const j=(i+k)%this.s.players.length;if(this.s.players[j].lives>0)return j;}
      return i;
    }
    prepare(index,delay=1.15){
      const s=this.s;s.active=index;s.phase='countdown';s.timer=delay;s.rally=0;
      s.ball={p:Array(s.n).fill(0),v:Array(s.n).fill(0),speed:this.cfg.speed,escaped:false};
      this.event('serve',index);
    }
    launch(){
      const s=this.s,p=s.players[s.active];
      const a=p.a+(this.rng()-.5)*.20;
      const b=s.n>2?clamp(p.b+(this.rng()-.5)*.22,-1.4,1.4):0;
      const c=s.n>3?clamp(p.c+(this.rng()-.5)*.20,-1.4,1.4):0;
      s.ball.v=scale(vector(a,b,c,s.n),s.ball.speed);s.phase='play';s.timer=0;
      this.event('launch',s.active);
    }
    pause(){if(['play','countdown','point'].includes(this.s.phase)){this.s.previous=this.s.phase;this.s.phase='pause';this.event('pause',this.s.active);}}
    resume(){if(this.s.phase==='pause'){this.s.phase=this.s.previous;this.event('resume',this.s.active);}}
    finish(winner,success=false){
      const s=this.s;s.phase='over';s.result={winner,success,stars:success?clamp(3-(s.initialLives-s.players[0].lives),1,3):0};
      this.event(success?'complete':'over',winner);
    }
    disconnect(id){
      const s=this.s,i=s.players.findIndex(p=>p.id===id);if(i<0)return;
      s.players[i].connected=false;s.players[i].lives=0;
      if(s.phase==='over')return;
      const alive=s.players.filter(p=>p.lives>0);
      if(alive.length<=1){this.finish(alive.length?s.players.indexOf(alive[0]):-1);return;}
      if(s.active===i)this.prepare(this.nextAlive(i));
      this.pause();
    }
    steer(p,key,target,speed,dt){
      const vel='d'+key,err=key==='a'?delta(target,p[key]):target-p[key];
      const want=clamp(err*14,-speed,speed);
      p[vel]+=clamp(want-p[vel],-45*dt,45*dt);
      p[key]+=p[vel]*dt;
      if(key==='a')p.a=wrap(p.a);else{
        p[key]=clamp(p[key],-Math.PI/2,Math.PI/2);
        if(Math.abs(p[key])===Math.PI/2)p[vel]=0;
      }
    }
    updatePaddles(dt,inputs){
      const s=this.s,hit=this.landing();
      s.players.forEach((p,i)=>{
        if(!p.lives)return;
        let input=inputs[p.id]||{},target={a:p.a,b:p.b,c:p.c},speed=this.cfg.human;
        if(p.bot){
          p.aiTimer-=dt;
          if(p.aiTimer<=0){p.aiTimer=this.cfg.reaction;p.aiError=(this.rng()-.5)*this.cfg.error*4.3;}
          const goal=hit&&i===s.active?hit:angles(scale(this.position(s.players[s.active]),-1));
          target={a:goal.a+p.aiError,b:goal.b+p.aiError*.35,c:goal.c-p.aiError*.25};speed=this.cfg.ai;
        }else{
          const assisted=typeof input.assist==='boolean'?input.assist:this.options.assist;
          const goal=hit||{b:0,c:0};
          for(const [key,dir] of [['a','x'],['b','y'],['c','z']]){
            if(key==='b'&&s.n<3||key==='c'&&s.n<4)continue;
            const d=Number.isFinite(input[dir])?clamp(input[dir],-1,1):0;
            if(d)target[key]=p[key]+d*speed*.15;
            else if(Number.isFinite(input[key]))target[key]=key==='a'?wrap(input[key]):clamp(input[key],-Math.PI/2,Math.PI/2);
            else if(key!=='a'&&assisted)target[key]=goal[key];
          }
        }
        this.steer(p,'a',target.a,speed,dt);
        if(s.n>2)this.steer(p,'b',target.b,speed,dt);
        if(s.n>3)this.steer(p,'c',target.c,speed,dt);
      });
    }
    hit(normal){
      const s=this.s,b=s.ball,i=s.active,p=s.players[i],u=this.position(p);
      const incoming=scale(b.v,1/b.speed),vt=add(incoming,scale(normal,-dot(incoming,normal)));
      const offset=scale(add(u,scale(normal,-dot(u,normal))),-1/Math.sin(s.cap));
      const nextU=vector(p.a+p.da*.012,p.b+p.db*.012,p.c+p.dc*.012,s.n);
      const motion=scale(add(nextU,scale(u,-1)),1/(this.cfg.human*.012));
      let tangent=add(add(scale(vt,.18),scale(offset,.59)),scale(motion,.20));
      tangent=add(tangent,scale(normal,-dot(tangent,normal)));
      // Small out-of-plane deflection makes higher dimensions matter even with centered returns.
      if(s.n>2){const basis=tangentBasis(normal);const bend=basis[1]||basis[0];tangent=add(tangent,scale(bend,.08*Math.sin((s.total+1)*1.7)));}
      if(s.n>3){const basis=tangentBasis(normal);tangent=add(tangent,scale(basis[2],.10*Math.cos((s.total+1)*1.3)));}
      let mag=length(tangent);if(mag>.83){tangent=scale(tangent,.83/mag);mag=.83;}
      b.speed=Math.min(this.cfg.max,b.speed*1.033+.004);
      b.v=scale(add(scale(normal,-Math.sqrt(1-mag*mag)),tangent),b.speed);
      b.p=scale(normal,CONTACT-.001);s.rally++;s.total++;p.hits++;s.best=Math.max(s.best,s.rally);
      this.event('hit',i,{p:[...b.p],spin:mag});
      if(s.goal&&s.total>=s.goal){this.finish(0,true);return;}
      s.active=this.nextAlive(i);
      s.players[s.active].aiTimer=this.cfg.reaction;
    }
    miss(){
      const s=this.s,p=s.players[s.active];p.lives=Math.max(0,p.lives-1);
      this.event('miss',s.active);s.phase='point';s.timer=1.0;
    }
    updateBall(dt){
      const s=this.s,b=s.ball;let remaining=dt;
      for(let k=0;k<4&&remaining>1e-8&&s.phase==='play';k++){
        const end=add(b.p,scale(b.v,remaining));
        if(!b.escaped&&length(end)>=CONTACT){
          const hit=this.landing();
          if(hit&&hit.t<=remaining+1e-8){
            b.p=hit.p;remaining=Math.max(0,remaining-hit.t);
            if(dot(hit.normal,this.position(s.players[s.active]))>=Math.cos(s.cap+.016)){
              this.hit(hit.normal);continue;
            }
            b.escaped=true;
          }else {b.p=end;remaining=0;}
        }else {b.p=end;remaining=0;}
        if(b.escaped&&remaining>0){b.p=add(b.p,scale(b.v,remaining));remaining=0;}
      }
      if(b.escaped&&length(b.p)>1.07)this.miss();
    }
    step(dt,inputs={}){
      const s=this.s;if(!Number.isFinite(dt)||dt<=0||dt>.1||['over','pause'].includes(s.phase))return;
      this.updatePaddles(dt,inputs);
      if(s.phase==='countdown'){s.timer-=dt;if(s.timer<=0)this.launch();return;}
      if(s.phase==='point'){
        s.timer-=dt;
        if(s.timer<=0){
          if(s.players.length===1){if(s.players[0].lives===0)this.finish(-1);else this.prepare(0);}
          else {const alive=s.players.filter(p=>p.lives>0);if(alive.length<=1)this.finish(alive.length?s.players.indexOf(alive[0]):-1);else this.prepare(this.nextAlive(s.active));}
        }
        return;
      }
      if(s.phase==='play'){s.elapsed+=dt;this.updateBall(dt);}
    }
    snapshot(){return JSON.parse(JSON.stringify(this.s));}
  }
  const api={Game,LEVELS,DIMENSIONS,DIFFICULTIES,COLORS,TAU,CONTACT,BALL_RADIUS,clamp,wrap,delta,dot,length,scale,add,unit,vector,angles,tangentBasis};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.OrbitalEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
