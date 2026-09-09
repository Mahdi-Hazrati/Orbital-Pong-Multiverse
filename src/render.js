/* Canvas projections of real 2/3/4-dimensional game state. */
(function(root){
  'use strict';
  const E=root.OrbitalEngine,{TAU,COLORS,DIMENSIONS,vector,unit,scale,add,dot,length,tangentBasis,clamp}=E;
  function landing(s){
    if(!s||s.ball.escaped)return null;
    const {p,v}=s.ball,a=dot(v,v);if(a<1e-9)return null;
    const b=2*dot(p,v),c=dot(p,p)-E.CONTACT**2,d=b*b-4*a*c;if(d<0)return null;
    const t=(-b+Math.sqrt(d))/(2*a);if(t<0)return null;
    const at=add(p,scale(v,t));return {p:at,...E.angles(at)};
  }
  class Renderer{
    constructor(canvas){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
      if(!this.ctx)throw new Error('Canvas is unavailable. Open the game in a browser with Canvas 2D support.');
      this.view={w:800,h:650,cx:400,cy:355,r:250};this.trail=[];this.particles=[];this.ripples=[];
      this.lastEvent=-1;this.lastDimension=2;this.lastTime=0;this.trailClock=0;
      this.stars=Array.from({length:125},(_,i)=>({x:(i*.618034+.157)%1,y:(i*.414214+.231)%1,size:i%13===0?1.1:.55,alpha:i%7===0?.42:.16}));
      this.resize();new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
    }
    resize(){
      const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      if(!rect.width||!rect.height)return;
      this.view={...this.view,w:rect.width,h:rect.height,cx:rect.width*.5,cy:rect.height*.552};
      this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    project(v,n){
      const {cx,cy,r}=this.view;
      if(n===2)return {x:cx+v[0]*r,y:cy+v[1]*r,z:0,s:1};
      const k=n===4?1/(1-(v[3]||0)*.36):1;
      let x=v[0]*k,y=v[1]*k,z=(v[2]||0)*k;
      const ax=.41,ay=-.32;
      let yy=y*Math.cos(ax)-z*Math.sin(ax),zz=y*Math.sin(ax)+z*Math.cos(ax);
      const xx=x*Math.cos(ay)+zz*Math.sin(ay);zz=-x*Math.sin(ay)+zz*Math.cos(ay);
      const perspective=1/(1+zz*.20);
      return {x:cx+xx*r*perspective,y:cy+yy*r*perspective,z:zz,s:perspective*k};
    }
    path(points,n,color,width=1,alpha=1,glow=0,close=false){
      const ctx=this.ctx;if(points.length<2)return;
      ctx.beginPath();points.forEach((v,i)=>{const p=this.project(v,n);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
      if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;
    }
    ring(radius,color,width,alpha){
      const ctx=this.ctx,{cx,cy}=this.view;ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.stroke();ctx.globalAlpha=1;
    }
    reset(){this.trail=[];this.particles=[];this.ripples=[];this.lastEvent=-1;}
    background(time,n,motion){
      const ctx=this.ctx,{w,h,cx,cy,r}=this.view;
      ctx.fillStyle='#060e18';ctx.fillRect(0,0,w,h);
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.5);g.addColorStop(0,n===4?'#141c2e':'#0d202e');g.addColorStop(.7,'#0a1724');g.addColorStop(1,'#060e18');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#83b3ce';for(const star of this.stars){ctx.globalAlpha=star.alpha*(motion?(.78+.22*Math.sin(time*.3+star.x*9)):1);ctx.beginPath();ctx.arc(star.x*w,star.y*h,star.size,0,TAU);ctx.fill();}ctx.globalAlpha=1;
      // Sparse coordinate grid; the playable boundary is drawn independently.
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,r*1.015,0,TAU);ctx.clip();ctx.strokeStyle='#73a9c012';ctx.lineWidth=.7;
      for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(cx+i*r/4,cy-r);ctx.lineTo(cx+i*r/4,cy+r);ctx.moveTo(cx-r,cy+i*r/4);ctx.lineTo(cx+r,cy+i*r/4);ctx.stroke();}ctx.restore();
      this.ring(r*1.09,'#395d77',.75,.32);this.ring(r*1.075,'#263f57',1,.45);
      this.ring(r*.064,'#79a8c2',.8,.20);
      ctx.strokeStyle='#6a91a846';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(cx-4,cy);ctx.lineTo(cx+4,cy);ctx.moveTo(cx,cy-4);ctx.lineTo(cx,cy+4);ctx.stroke();
    }
    circleArena(){
      const ctx=this.ctx,{cx,cy,r,w}=this.view;
      const g=ctx.createLinearGradient(cx-r,cy-r*.5,cx+r,cy+r*.4);g.addColorStop(0,'#65e5ff');g.addColorStop(.5,'#548dab');g.addColorStop(1,'#b282c1');
      ctx.shadowColor='#65d4ff';ctx.shadowBlur=12;this.ring(r*1.025,g,1.7,.75);ctx.shadowBlur=0;this.ring(r*1.01,'#375d78',.7,.48);
      for(let i=0;i<120;i++){
        const a=i/120*TAU,major=i%10===0,mid=i%5===0,len=major?.031:mid?.017:.009;
        ctx.strokeStyle=major?'#9bc5dd88':'#527d9966';ctx.lineWidth=major?1.1:.6;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*(1-len),cy+Math.sin(a)*r*(1-len));ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();
      }
      ctx.save();ctx.setLineDash([3,12]);ctx.strokeStyle='#75c1dd36';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(cx,cy-r*.91);ctx.lineTo(cx,cy+r*.91);ctx.stroke();ctx.restore();
      ctx.font=(w<500?'6':'7')+'px "Segoe UI",sans-serif';ctx.fillStyle='#658ca4';ctx.textAlign='center';ctx.fillText('270\u00b0',cx-r*1.16,cy+3);ctx.fillText('090\u00b0',cx+r*1.16,cy+3);
    }
    sphere(n){
      const color=DIMENSIONS[n].color;
      const slices=n===4?[-1.1,-.65,0,.65,1.1]:[0];
      for(const c of slices){
        const baseAlpha=c===0?.40:.14;
        for(let meridian=0;meridian<10;meridian++){
          const a=meridian/10*TAU,points=[];
          for(let j=0;j<=70;j++)points.push(vector(a,-Math.PI/2+j/70*Math.PI,c,n));
          this.path(points,n,color,.7,baseAlpha*.62);
        }
        for(let latitude=-3;latitude<=3;latitude++){
          const b=latitude/4*Math.PI/2,points=[];
          for(let j=0;j<=90;j++)points.push(vector(j/90*TAU,b,c,n));
          this.path(points,n,color,latitude===0?1.25:.65,latitude===0?baseAlpha*1.7:baseAlpha*.65,latitude===0?8:0);
        }
      }
      if(n===4){
        // Meridians that actually cross the W axis; not just several decorative 3D spheres.
        for(let k=0;k<5;k++){
          const points=[];for(let j=0;j<=110;j++){const c=-Math.PI/2+j/110*Math.PI;points.push(vector(k/5*TAU,.18,c,4));}
          this.path(points,4,color,.75,.24);
        }
      }
      const ctx=this.ctx;ctx.font='7px "Segoe UI",sans-serif';ctx.textAlign='center';
      for(let axis=0;axis<3;axis++){
        const a=Array(n).fill(0),b=Array(n).fill(0);a[axis]=-1.07;b[axis]=1.07;
        ctx.setLineDash([3,8]);this.path([a,b],n,'#86a9c2',.65,.23);ctx.setLineDash([]);
        const p=this.project(scale(b,1.07),n);ctx.fillStyle='#7e9db3';ctx.fillText(['X','Y','Z'][axis],p.x,p.y+3);
      }
    }
    cap(p,index,n,cap,active,preview=false){
      if(!p.lives&&!preview)return;
      const ctx=this.ctx,c=COLORS[p.id%4],normal=vector(p.a,p.b,p.c,n),radius=.956,alpha=active?1:.23;
      if(n===2){
        const points=[];for(let i=0;i<=35;i++)points.push(scale(vector(p.a-cap+i/35*cap*2),radius));
        ctx.lineCap='round';if(active)this.path(points,n,c,this.view.r*.065,.10,20);
        this.path(points,n,c,Math.max(5,this.view.r*.029),alpha,active?17:0);
        this.path(points,n,'#effdff',Math.max(1.3,this.view.r*.007),alpha*.9);ctx.lineCap='butt';
      }else{
        const basis=tangentBasis(normal),pairs=n===4?[[0,1],[1,2],[0,2]]:[[0,1]];
        for(const [i,j] of pairs){
          const points=[];for(let k=0;k<=65;k++){
            const theta=k/65*TAU,t=add(scale(basis[i],Math.cos(theta)),scale(basis[j],Math.sin(theta)));
            points.push(scale(add(scale(normal,Math.cos(cap)),scale(t,Math.sin(cap))),radius));
          }
          if(active)this.path(points,n,c,5,.10,18);
          this.path(points,n,c,active?2:1,alpha,active?8:0);
        }
        const center=this.project(scale(normal,radius),n);
        const glow=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,this.view.r*cap*.72);glow.addColorStop(0,c+(active?'32':'0c'));glow.addColorStop(1,c+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(center.x,center.y,this.view.r*cap*.72,0,TAU);ctx.fill();
        ctx.strokeStyle=c;ctx.globalAlpha=alpha*.7;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(center.x-5,center.y);ctx.lineTo(center.x+5,center.y);ctx.moveTo(center.x,center.y-5);ctx.lineTo(center.x,center.y+5);ctx.stroke();ctx.globalAlpha=1;
      }
      const label=this.project(scale(normal,n===2?.815:.76),n);
      ctx.font='600 '+(this.view.w<500?'6':'8')+'px "Segoe UI",sans-serif';ctx.fillStyle=c;ctx.globalAlpha=alpha*.8;ctx.textAlign='center';ctx.fillText('P'+(index+1),label.x,label.y+3);ctx.globalAlpha=1;
    }
    guide(s){
      const hit=landing(s);if(!hit)return;
      const ctx=this.ctx,color=COLORS[s.players[s.active].id%4];
      ctx.setLineDash([3,8]);this.path([s.ball.p,hit.p],s.n,color,1,.33);ctx.setLineDash([]);
      const at=this.project(scale(unit(hit.p),.99),s.n);
      ctx.save();ctx.translate(at.x,at.y);ctx.rotate(Math.PI/4);ctx.strokeStyle=color;ctx.globalAlpha=.85;ctx.lineWidth=1.2;ctx.strokeRect(-4,-4,8,8);ctx.restore();
      ctx.beginPath();ctx.arc(at.x,at.y,10,0,TAU);ctx.strokeStyle=color;ctx.globalAlpha=.15;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;
    }
    ball(s,preview=false,motion=true){
      const ctx=this.ctx,{r}=this.view,c=COLORS[s.players[s.active]?.id%4||0],ball=s.ball;
      if(motion&&this.trail.length>1){
        for(let i=1;i<this.trail.length;i++){const f=i/this.trail.length;ctx.lineCap='round';this.path([this.trail[i-1],this.trail[i]],s.n,c,Math.max(.5,r*.032*f),f*f*.30);}
        ctx.lineCap='butt';
      }
      const at=this.project(ball.p,s.n),rad=Math.max(3.5,r*.022*at.s);
      ctx.shadowColor=c;ctx.shadowBlur=22;ctx.fillStyle=c;ctx.beginPath();ctx.arc(at.x,at.y,rad*1.25,0,TAU);ctx.fill();
      ctx.shadowBlur=9;ctx.fillStyle='#f4fdff';ctx.beginPath();ctx.arc(at.x,at.y,rad,0,TAU);ctx.fill();ctx.shadowBlur=0;
    }
    event(s,motion){
      if(s.eventId===this.lastEvent)return;
      this.lastEvent=s.eventId;
      if(['serve','launch','miss','complete','over'].includes(s.event.type))this.trail=[];
      if(s.event.type==='hit'){
        const p=this.project(s.event.p,s.n),color=COLORS[s.players[s.event.player].id%4];
        for(let i=0;i<(motion?15:4);i++){const a=Math.random()*TAU,speed=20+Math.random()*75;this.particles.push({x:p.x,y:p.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:.28+Math.random()*.24,max:.52,c:color});}
        if(motion)this.ripples.push({x:p.x,y:p.y,life:.45,c:color});
      }
    }
    effects(dt){
      const ctx=this.ctx;
      for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;ctx.globalAlpha=Math.min(1,p.life*3);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,1.1,0,TAU);ctx.fill();}
      for(let i=this.ripples.length-1;i>=0;i--){const p=this.ripples[i];p.life-=dt;if(p.life<=0){this.ripples.splice(i,1);continue;}ctx.globalAlpha=p.life;ctx.strokeStyle=p.c;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,6+(.45-p.life)*55,0,TAU);ctx.stroke();}
      ctx.globalAlpha=1;
    }
    draw(state,time,{preview=false,guide=true,motion=true}={}){
      if(!state)return;const s=state,{w,h}=this.view;
      this.view.r=Math.min(w*(s.n===4?.345:.389),h*(s.n===4?.331:.355));
      if(this.lastDimension!==s.n){this.reset();this.lastDimension=s.n;}
      const dt=Math.min(.05,this.lastTime?time-this.lastTime:0);this.lastTime=time;this.trailClock+=dt;
      this.background(time,s.n,motion);if(s.n===2)this.circleArena();else this.sphere(s.n);
      if(!preview)this.event(s,motion);
      if(guide&&!preview&&['play','pause'].includes(s.phase))this.guide(s);
      s.players.forEach((p,i)=>{if(i!==s.active)this.cap(p,i,s.n,s.cap,false,preview);});
      this.cap(s.players[s.active],s.active,s.n,s.cap,true,preview);
      if(preview||['play','countdown','pause'].includes(s.phase)){
        if(this.trailClock>=1/90&&motion&&s.phase!=='pause'){this.trail.push([...s.ball.p]);if(this.trail.length>24)this.trail.shift();this.trailClock=0;}
        this.ball(s,preview,motion);
      }
      this.effects(s.phase==='pause'?0:dt);
      if(s.n>2&&!preview){
        const ctx=this.ctx;ctx.fillStyle='#51758f';ctx.textAlign='center';ctx.font=(w<450?'6':'7')+'px "Segoe UI",sans-serif';
        ctx.fillText(s.n===3?'XYZ SPACE / PERSPECTIVE VIEW':'XYZW SPACE / 4D TO 2D PROJECTION',this.view.cx,h-43);
      }
    }
    pointerAngle(clientX,clientY,s,p,assisted=true){
      const rect=this.canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;
      if(s.n===2)return Math.atan2(y-this.view.cy,x-this.view.cx);
      const hit=assisted?landing(s):null,b=hit?hit.b:p.b,c=hit?hit.c:p.c;
      let bestA=p.a,best=Infinity;
      for(let i=0;i<144;i++){const a=i/144*TAU,at=this.project(scale(vector(a,b,c,s.n),.956),s.n),d=(at.x-x)**2+(at.y-y)**2;if(d<best){best=d;bestA=a;}}
      return bestA;
    }
  }
  root.OrbitalRender={Renderer,landing};
})(typeof globalThis!=='undefined'?globalThis:this);
