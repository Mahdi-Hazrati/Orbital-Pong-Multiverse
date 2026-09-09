/* Application, progression, input, UI and authoritative peer-host integration. */
(function(){
  'use strict';
  const E=window.OrbitalEngine,N=window.OrbitalNetwork,R=window.OrbitalRender;
  const $=id=>document.getElementById(id),escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE='orbital-pong-multiverse-v2',TAU=E.TAU;
  const ACHIEVEMENTS=[
    ['first','First contact','Make your first return.'],['twenty','In the flow','Reach a 20-return rally.'],
    ['firstclear','Liftoff','Clear your first sector.'],['sphere','Depth perception','Clear the first 3D sector.'],
    ['hyper','Beyond the visible','Clear the first 4D sector.'],['master','Multiverse pilot','Clear all 12 sectors.']
  ];
  const defaultProfile=()=>({version:2,name:'Pilot',xp:0,stars:Array(12).fill(0),best:{2:0,3:0,4:0},achievements:{},sound:true,guide:true,assist:true,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches});
  function validateProfile(data){
    if(!data||data.version!==2||!Array.isArray(data.stars)||data.stars.length!==12)throw new Error('This is not a Multiverse v2 progress file.');
    const p=defaultProfile();p.name=N.cleanName(data.name);p.xp=E.clamp(Math.floor(Number(data.xp)||0),0,1e9);
    p.stars=data.stars.map(x=>E.clamp(Number.isFinite(x)?Math.floor(x):0,0,3));
    for(const n of [2,3,4])p.best[n]=E.clamp(Math.floor(Number(data.best?.[n])||0),0,1000000);
    for(const [key] of ACHIEVEMENTS)p.achievements[key]=data.achievements?.[key]===true;
    for(const key of ['sound','guide','assist','motion'])if(typeof data[key]==='boolean')p[key]=data[key];
    return p;
  }
  let storageAvailable=true,profile;
  try{const raw=localStorage.getItem(STORE);profile=raw?validateProfile(JSON.parse(raw)):defaultProfile();}catch{profile=defaultProfile();}
  function save(){try{localStorage.setItem(STORE,JSON.stringify(profile));}catch{storageAvailable=false;}}
  function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').classList.remove('show'),3800);$('announcer').textContent=text;}
  function download(name,text,type='text/plain'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  let audio=null,gain=null;
  function unlockAudio(){
    if(!profile.sound)return;
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audio){audio=new AC();gain=audio.createGain();gain.gain.value=.10;gain.connect(audio.destination);}if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}
  }
  function tone(freq=440,duration=.1,slide=0,delay=0){
    if(!profile.sound||!audio||audio.state!=='running')return;
    try{const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.65,t+.007);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(gain);o.start(t);o.stop(t+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();};}catch{}
  }
  function soundUI(){
    $('soundButton').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m11 4-5 4H3v8h3l5 4z"/>'+(profile.sound?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>')+'</svg>';
    $('soundButton').setAttribute('aria-label',profile.sound?'Mute sound':'Enable sound');$('soundButton').setAttribute('aria-pressed',String(profile.sound));$('soundSetting').checked=profile.sound;
  }
  function toggleSound(){profile.sound=!profile.sound;save();soundUI();if(profile.sound){unlockAudio();tone(660,.08);}}
  let tab='campaign',selectedLevel=Math.min(11,Math.max(0,profile.stars.findIndex(x=>x===0))),selectedDimension=2;
  let game=null,remote=null,preview=null,lastRemote=null,remoteAt=0,room=null;
  let activeOptions=null,processedEvent=-1,processedHits=0,resultProcessed=false,uiDirty=true,netBusy=false;
  const keys=new Set(),targets=new Map(),touches=new Map();
  const renderer=new R.Renderer($('arena'));
  const titleSets={campaign:['THE CAMPAIGN','Your next frontier.','12 sectors <span>/</span> 3 dimensions <span>/</span> One orbit'],arcade:['FREE FLIGHT','Find your flow.','Your arena <span>/</span> Your challenge'],local:['SAME DEVICE. SHARED ORBIT.','Bring your crew.','2-4 pilots <span>/</span> Keyboard + touch'],online:['PEER-TO-PEER MULTIPLAYER','Together, without a backend.','2-4 browsers <span>/</span> Direct data channels']};
  const aliveState=()=>game?.s||remote;
  const current=()=>aliveState()||preview?.s;
  const inputId=()=>room?.role==='guest'?room.seat:0;
  function clearInputs(){keys.clear();targets.clear();touches.clear();room?.away();}
  function getUnlocked(){const next=profile.stars.findIndex(x=>x===0);return next<0?11:next;}
  function settings(){return {dimension:tab==='online'&&room?.role!=='none'?Number(room.settings.dimension)||2:selectedDimension,difficulty:$('difficulty').value,lives:Number($('lives').value),assist:profile.assist};}
  function previewGame(){
    const options=settings();if(tab==='campaign'){options.dimension=E.LEVELS[selectedLevel].dimension;}
    preview=new E.Game({...options,mode:'arcade',players:[{id:0,name:profile.name},{id:1,name:'Next orbit'}]});
    preview.s.phase='play';renderer.reset();uiDirty=true;
  }
  function refreshProfile(){
    const rank=1+Math.floor(profile.xp/300),names=['Stargazer','Cadet','Navigator','Pathfinder','Voyager','Orbit ace','Dimension walker','Multiverse pilot'];
    $('rankValue').textContent=String(rank).padStart(2,'0');$('rankName').textContent=names[Math.min(names.length-1,rank-1)];$('xpFill').style.width=(profile.xp%300)/3+'%';$('xpTotal').textContent=profile.xp.toLocaleString()+' XP';
    $('completionCount').textContent=String(profile.stars.filter(Boolean).length).padStart(2,'0')+' / 12';
    $('achievements').innerHTML=ACHIEVEMENTS.map(([key,title,copy])=>'<div class="achievement '+(profile.achievements[key]?'earned':'')+'"><span>'+(profile.achievements[key]?'&#10022;':'&#9671;')+'</span><b>'+title+'</b><small>'+copy+'</small></div>').join('');
  }
  function achievement(key){if(!profile.achievements[key]){profile.achievements[key]=true;const item=ACHIEVEMENTS.find(a=>a[0]===key);notify('Flight record unlocked: '+item[1]);}}
  function renderLevels(){
    const lock='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor"><rect x="3" y="5" width="6" height="5" rx="1"/><path d="M4 5V3a2 2 0 0 1 4 0v2"/></svg>';
    for(const n of [2,3,4])$('levels'+n).innerHTML=E.LEVELS.map((level,i)=>({level,i})).filter(x=>x.level.dimension===n).map(({level,i})=>{
      const locked=i>getUnlocked(),stars=profile.stars[i];
      return '<button class="level-btn '+(i===selectedLevel?'selected ':'')+(locked?'locked':'')+'" data-level="'+i+'" '+(locked?'disabled ':'')+'aria-pressed="'+(i===selectedLevel)+'" aria-label="Sector '+(i+1)+': '+level.name+(locked?', locked':', '+stars+' stars')+'">'+String(i+1).padStart(2,'0')+(locked?lock:'')+(stars?'<span class="level-stars">'+'&#10022;'.repeat(stars)+'</span>':'')+'</button>';
    }).join('');
    document.querySelectorAll('[data-level]').forEach(btn=>btn.onclick=()=>selectLevel(Number(btn.dataset.level)));
    const l=E.LEVELS[selectedLevel];$('missionIndex').textContent='SECTOR '+String(selectedLevel+1).padStart(2,'0');$('missionTitle').textContent=l.name;$('missionCopy').textContent=l.tip;$('missionGoal').textContent=l.goal+' returns';$('missionLives').textContent=l.lives+' lives';
  }
  function selectLevel(i){
    if(i<0||i>getUnlocked())return;
    if(aliveState()&&aliveState().phase!=='over'&&!confirm('Leave this run and select another sector?'))return;
    selectedLevel=i;game=null;remote=null;resetMatchTracking();renderLevels();previewGame();refreshPanels();
  }
  function chooseTab(next,force=false){
    if(next===tab&&!force){if(next==='online')openDialog('roomDialog');return;}
    if(!force&&room.role!=='none'&&next!=='online'&&!confirm('Leave your P2P room and change mode?'))return;
    if(!force&&room.role==='none'&&aliveState()&&aliveState().phase!=='over'&&!confirm('Leave the current run and change mode?'))return;
    if(next!=='online'&&room.role!=='none')room.close();
    tab=next;game=null;remote=null;activeOptions=null;resetMatchTracking();previewGame();refreshPanels();
  }
  function refreshPanels(){
    document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===tab;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const [kicker,title,note]=titleSets[tab];$('sectionKicker').textContent=kicker;$('sectionTitle').textContent=title;$('sectionNote').innerHTML=note;
    $('campaignPanel').hidden=tab!=='campaign';$('quickPanel').hidden=!['arcade','local'].includes(tab);$('onlinePanel').hidden=tab!=='online';
    $('arcadeTypeRow').hidden=tab!=='arcade';$('playerCountRow').hidden=tab==='arcade'&&$('arcadeType').value==='survival';$('livesRow').hidden=$('playerCountRow').hidden;
    $('quickRules').textContent=tab==='arcade'&&$('arcadeType').value==='survival'?'One paddle. One life. Keep the ball in orbit for as many returns as you can.':'Return when your paddle glows. Miss a return and lose a life. Last pilot in orbit wins.';
    document.querySelectorAll('[data-dimension]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.dimension)===selectedDimension)));
    $('dimensionCopy').textContent={2:'A full-circle arena with XY physics.',3:'XYZ physics inside a sphere. Depth assist is available.',4:'XYZW physics in a hypersphere, projected onto the screen.'}[selectedDimension];
    const s=current(),n=s?.n||2;
    $('progressPanel').hidden=tab!=='campaign';$('axisReadouts').hidden=n<3;$('wReadout').hidden=n<4;$('assistRow').hidden=n<3;
    $('guideToggle').checked=profile.guide;$('assistToggle').checked=profile.assist;$('manualDepth').hidden=n<3||profile.assist;$('phaseSliderWrap').hidden=n<4;
    $('controlsText').innerHTML=tab==='local'?'<kbd>A</kbd><kbd>D</kbd> P1 <span class="dock-sep">/</span> <kbd>&larr;</kbd><kbd>&rarr;</kbd> P2'+(Number($('playerCount').value)>2?' <span class="dock-sep">/</span> <kbd>J</kbd><kbd>L</kbd> P3':'')+(Number($('playerCount').value)>3?' <span class="dock-sep">/</span> <kbd>V</kbd><kbd>N</kbd> P4':''):'<kbd>A</kbd><kbd>D</kbd> orbit <span class="dock-sep">/</span> point or touch';
    $('depthControlText').textContent=n===2?'All 360 degrees are yours.':profile.assist?'Depth assistance active.':n===3?'W/S depth':'W/S depth - Q/E phase';
    uiDirty=true;updateUI();
  }
  function resetMatchTracking(){processedEvent=-1;processedHits=0;resultProcessed=false;lastRemote=null;clearInputs();renderer.reset();}
  function newOfflineGame(){
    const opts={...settings(),name:profile.name};
    if(tab==='campaign'){opts.mode='campaign';opts.level=selectedLevel;}
    else if(tab==='arcade'&&$('arcadeType').value==='survival')opts.mode='survival';
    else{opts.mode=tab==='local'?'local':'arcade';opts.players=Array.from({length:Number($('playerCount').value)},(_,i)=>({id:i,name:i===0?profile.name:tab==='local'?'Pilot '+(i+1):['','Nova','Echo','Vega'][i],bot:tab==='arcade'&&i>0}));}
    activeOptions=opts;game=new E.Game(opts);remote=null;resetMatchTracking();unlockAudio();refreshPanels();
  }
  function startRoomGame(){
    if(room.role!=='host')return;
    if(!room.canStart()){openDialog('roomDialog');networkStatus('Connect every invited pilot and have each guest press Ready. Remove unused invites.',true);return;}
    const players=room.roster().filter(p=>p.open).map(p=>({id:p.seat,name:p.name,bot:false}));
    activeOptions={...room.settings,mode:'online',assist:profile.assist,players};game=new E.Game(activeOptions);remote=null;resetMatchTracking();
    try{room.start(game.snapshot());$('roomDialog').close();unlockAudio();refreshPanels();}catch(error){game=null;networkStatus(error.message,true);}
  }
  function returnToLobby(){
    if(tab==='online'){
      if(room.role==='host'){game=null;remote=null;room.lobby();resetMatchTracking();previewGame();openDialog('roomDialog');}
      else openDialog('roomDialog');
    }else{game=null;remote=null;resetMatchTracking();previewGame();refreshPanels();}
  }
  function action(){
    unlockAudio();const s=aliveState();
    if(tab==='online'){
      if(room.role==='none'){openDialog('roomDialog');return;}
      if(room.role==='guest'){if(!room.locked||s?.phase==='over')openDialog('roomDialog');else notify('The host controls pause, restart and the next match.');return;}
      if(!s){startRoomGame();return;}
      if(s.phase==='over'){returnToLobby();return;}
    }
    if(!s){newOfflineGame();return;}
    if(s.phase==='over'){
      if(tab==='campaign'&&s.result?.success&&selectedLevel<11){selectedLevel++;renderLevels();}
      newOfflineGame();return;
    }
    if(s.phase==='pause')game?.resume();else game?.pause();clearInputs();uiDirty=true;if(room.role==='host'&&game)room.snapshot(game.snapshot(),true);updateUI();
  }
  function restart(){
    if(room.role==='guest'){notify('Only the host can restart the shared match.');return;}
    if(!aliveState())return;
    if(tab==='online'){if(confirm('Restart the match for everyone?'))startRoomGame();}
    else newOfflineGame();
  }
  function pause(){if(game&&['play','countdown','point'].includes(game.s.phase)){game.pause();clearInputs();uiDirty=true;if(room.role==='host')room.snapshot(game.snapshot(),true);updateUI();}}
  function openDialog(id){
    if(id!=='roomDialog'||game)pause();
    if(!$(''+id).open)$(id).showModal();clearInputs();
  }
  function progress(s){
    const mine=s.players.find(p=>p.id===inputId());
    if(mine&&mine.hits>processedHits){
      const earned=mine.hits-processedHits;processedHits=mine.hits;profile.xp+=earned*10;achievement('first');
      profile.best[s.n]=Math.max(profile.best[s.n],s.best);if(s.best>=20)achievement('twenty');save();refreshProfile();
    }
    if(s.phase==='over'&&!resultProcessed){
      resultProcessed=true;
      if(s.mode==='campaign'&&s.result?.success&&room.role==='none'&&tab==='campaign'){
        const i=s.level,stars=s.result.stars,improvement=Math.max(0,stars-profile.stars[i]);profile.stars[i]=Math.max(profile.stars[i],stars);profile.xp+=improvement*50;
        achievement('firstclear');if(i>=4)achievement('sphere');if(i>=8)achievement('hyper');if(profile.stars.every(Boolean))achievement('master');
        save();refreshProfile();renderLevels();
      }
    }
  }
  function processEvents(s){
    progress(s);
    if(s.eventId===processedEvent)return;processedEvent=s.eventId;uiDirty=true;
    if(s.event.type==='hit')tone(420+(s.event.player%4)*100,.085,100);
    else if(s.event.type==='miss'){tone(180,.25,-95);$('announcer').textContent=s.players[s.event.player].name+' missed. '+s.players[s.event.player].lives+' lives remaining.';}
    else if(s.event.type==='launch')tone(330,.1,190);
    else if(s.phase==='over'){tone(523,.18);tone(659,.18,0,.12);tone(784,.25,0,.24);}
  }
  function scoreMarkup(s,isPreview){
    const players=isPreview&&tab==='campaign'?[s.players[0]]:s.players;
    let markup=players.map((p,i)=>'<div class="score-card '+(s.active===i?'current ':'')+(!p.lives?'eliminated':'')+'" style="--player:'+E.COLORS[p.id%4]+'"><div class="score-name">'+escapeText(isPreview&&i===0?profile.name:p.name)+(room.role!=='none'&&p.id===inputId()?' / YOU':'')+'</div><div class="lives-dots">'+Array.from({length:s.initialLives},(_,k)=>'<i class="'+(k>=p.lives?'empty':'')+'"></i>').join('')+'</div><strong>'+p.hits+'</strong><span class="score-sub">RETURNS</span></div>').join('');
    if(players.length===1)markup+='<div class="score-card" style="--player:#c0a0ff;text-align:right"><div class="score-name">PERSONAL BEST</div><strong>'+profile.best[s.n]+'</strong><div class="score-sub">'+E.DIMENSIONS[s.n].label+' RALLY RECORD</div></div>';
    return markup;
  }
  function updateUI(){
    const s=current();if(!s)return;
    const live=!!aliveState(),phase=live?s.phase:'menu',dimension=E.DIMENSIONS[s.n],mine=s.players.find(p=>p.id===inputId())||s.players[0];
    $('arenaTag').textContent=dimension.label+' / '+dimension.name.toUpperCase();
    $('arenaStatus').textContent=phase==='menu'?'STANDBY':phase==='over'?'ORBIT COMPLETE':phase==='pause'?'PAUSED':phase==='countdown'?'PREPARING':phase==='point'?'RETURN MISSED':(s.players[s.active].id===inputId()?'YOUR RETURN':'P'+(s.active+1)+' RETURN');
    $('arenaStatus').style.color=phase==='play'?E.COLORS[s.players[s.active].id%4]:'';
    $('scoreboard').innerHTML=scoreMarkup(s,!live);
    $('rallyValue').textContent=live?s.rally:0;$('bestValue').textContent=profile.best[s.n];
    const speed=live?s.ball.speed/s.baseSpeed:1;$('speedValue').textContent=speed.toFixed(2)+'\u00d7';$('speedFill').style.width=E.clamp((live?s.ball.speed:s.baseSpeed)/s.maxSpeed*100,0,100)+'%';
    const goal=tab==='campaign'?E.LEVELS[selectedLevel].goal:0;$('progressValue').textContent=(live?s.total:0)+' / '+goal;$('progressFill').style.width=(goal?Math.min(100,(live?s.total:0)/goal*100):0)+'%';
    const deg=E.wrap(mine.a+Math.PI/2)/TAU*360;$('angleReadout').textContent=String(Math.round(deg)%360).padStart(3,'0')+'\u00b0 / 360\u00b0';
    const sec=Math.floor(live?s.elapsed:0);$('timeReadout').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
    $('stageHint').textContent=!live?'NO WALLS. NO SIDELINES.':s.mode==='campaign'?'TOTAL RETURNS '+s.total+' / '+s.goal:s.players.length===1?'ONE PADDLE. EVERY ANGLE.':'CATCH WHEN YOUR PADDLE GLOWS';
    $('zValue').textContent=(s.ball.p[2]>=0?'+':'')+(s.ball.p[2]||0).toFixed(2);$('wValue').textContent=(s.ball.p[3]>=0?'+':'')+(s.ball.p[3]||0).toFixed(2);
    $('axisReadouts').hidden=s.n<3;$('wReadout').hidden=s.n<4;$('assistRow').hidden=s.n<3;$('manualDepth').hidden=s.n<3||profile.assist;$('phaseSliderWrap').hidden=s.n<4;
    $('countdown').hidden=!live||!['countdown','point'].includes(phase);
    if(phase==='countdown'){$('countdownTitle').textContent=s.timer>1.15?'READY':s.timer>.55?'SET':'ORBIT';$('countdownCopy').textContent=s.players[s.active].name.toUpperCase()+' TO RETURN';$('countdownTitle').style.color=E.COLORS[s.players[s.active].id%4];}
    if(phase==='point'){$('countdownTitle').textContent=s.players[s.active].lives?'SIGNAL LOST':'OUT OF ORBIT';$('countdownCopy').textContent=s.players[s.active].name.toUpperCase()+' / '+s.players[s.active].lives+' LIVES LEFT';$('countdownTitle').style.color=E.COLORS[s.players[s.active].id%4];}
    $('gameOverlay').hidden=!['menu','pause','over'].includes(phase);
    $('overlaySecondary').hidden=phase==='menu';$('overlayAction').disabled=false;
    let button='Launch sector '+String(selectedLevel+1).padStart(2,'0'),overlayButton='Enter the multiverse';
    if(phase==='menu'){
      $('overlayKicker').textContent=tab==='campaign'?'A NEW ORBIT AWAITS':tab==='online'?'NO GAME BACKEND. JUST YOUR CREW.':'THE WHOLE ARENA IS YOURS';
      $('overlayTitle').innerHTML=tab==='campaign'?'Every angle.<br><em>Every dimension.</em>':tab==='arcade'?'Find your<br><em>next orbit.</em>':tab==='local'?'Same screen.<br><em>New rivals.</em>':'Your room.<br><em>Your rules.</em>';
      $('overlayCopy').innerHTML=tab==='campaign'?'Leave the sidelines behind. Master the ring,<br>the sphere, and everything beyond.':tab==='arcade'?'Test your reflexes against the computer.<br>Or take on the whole orbit alone.':tab==='local'?'Up to four pilots. One shared device.<br>Last paddle in orbit takes the win.':'Direct browser connections. Up to four pilots.<br>Create a room, exchange invites, take orbit.';
      if(tab==='arcade')button=overlayButton=$('arcadeType').value==='survival'?'Launch survival':'Launch arcade';
      if(tab==='local')button=overlayButton='Launch local match';
      if(tab==='online'){button=overlayButton=room.role==='host'?'Launch room match':room.role==='guest'?'Open room console':'Create or join room';}
    }else if(phase==='pause'){
      $('overlayKicker').textContent='TAKE A BREATHER';$('overlayTitle').innerHTML='Orbit<br><em>paused.</em>';
      $('overlayCopy').textContent=room.role==='guest'?'The host paused the shared match. Wait for the host to resume.':'Your place in the multiverse is safe. Pick up exactly where you left off.';
      button=overlayButton=room.role==='guest'?'Waiting for host':'Resume orbit';$('overlayAction').disabled=room.role==='guest';
    }else if(phase==='over'){
      const success=s.result?.success,winner=s.result?.winner;
      $('overlayKicker').textContent=success?'SECTOR CLEARED / '+'\u2726'.repeat(s.result.stars):s.players.length===1?'ONE MORE REVOLUTION?':'LAST PILOT IN ORBIT';
      $('overlayTitle').innerHTML=success?(selectedLevel===11?'Multiverse<br><em>mastered.</em>':'Frontier<br><em>conquered.</em>'):s.players.length===1?'Orbit<br><em>complete.</em>':'<span>'+escapeText(winner>=0?s.players[winner].name:'No one')+'</span><br><em>takes orbit.</em>';
      $('overlayCopy').textContent=success?s.total+' returns. '+s.players[0].lives+' lives remaining. '+(selectedLevel<11?'The next sector is unlocked.':'Every sector cleared. Replay for three stars.'):'Best rally: '+s.best+'. '+(s.players.length===1?'Every orbit is a fresh start.':'A new match, a new chance.');
      button=overlayButton=tab==='online'?(room.role==='host'?'Return to lobby':'Open room console'):success&&selectedLevel<11?'Launch next sector':'Play another orbit';
    }else button=room.role==='guest'?'Host controls pause':'Pause orbit';
    $('mainAction').querySelector('span').textContent=button;$('overlayAction').querySelector('span').textContent=overlayButton;
    $('overlaySecondary').textContent=tab==='online'?'Open room console':'Return to mission control';
    $('overlayHint').textContent=tab==='online'&&room.role==='guest'?'Your host controls the shared match.':'or press Space to '+(phase==='pause'?'resume':phase==='over'?'continue':'launch');
    $('restartButton').disabled=!live||room.role==='guest';$('mainAction').disabled=room.role==='guest'&&live&&phase!=='over';
    uiDirty=false;
  }
  const CONTROL_MAP=[
    ['KeyA','KeyD','KeyW','KeyS','KeyQ','KeyE'],['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'],
    ['KeyJ','KeyL','KeyI','KeyK','KeyU','KeyO'],['KeyV','KeyN','KeyT','KeyG','KeyB','KeyH']
  ];
  function playerInput(id,localIndex=0){
    const map=CONTROL_MAP[localIndex],t=targets.get(id)||{};
    let x=(keys.has(map[1])?1:0)-(keys.has(map[0])?1:0),y=(keys.has(map[2])?1:0)-(keys.has(map[3])?1:0),z=(keys.has(map[5])?1:0)-(keys.has(map[4])?1:0);
    if(tab!=='local')x+=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
    const input={x:E.clamp(x,-1,1),y,z,assist:profile.assist};
    if(x)delete t.a;else if(Number.isFinite(t.a))input.a=t.a;
    if(y)delete t.b;else if(Number.isFinite(t.b))input.b=t.b;
    if(z)delete t.c;else if(Number.isFinite(t.c))input.c=t.c;
    return input;
  }
  function allInputs(){
    if(document.querySelector('dialog[open]'))return room.role==='host'?room.inputs():{};
    const inputs=room.role==='host'?room.inputs():{};
    if(tab==='local'&&game)game.s.players.forEach((p,i)=>inputs[p.id]=playerInput(p.id,i));
    else inputs[0]=playerInput(0);
    return inputs;
  }
  function pointer(event,down=false){
    const s=aliveState();if(!s||!['countdown','play','point'].includes(s.phase))return;
    let id=inputId();
    if(event.pointerType==='mouse'){
      if(down&&event.button!==0)return;
    }else if(down){
      if(tab==='local'){
        const claimed=[...touches.values()],candidates=s.players.filter(p=>p.lives&&!claimed.includes(p.id));if(!candidates.length)return;
        const rect=$('arena').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
        candidates.sort((a,b)=>{const av=renderer.project(E.vector(a.a,a.b,a.c,s.n),s.n),bv=renderer.project(E.vector(b.a,b.b,b.c,s.n),s.n);return (av.x-x)**2+(av.y-y)**2-((bv.x-x)**2+(bv.y-y)**2);});id=candidates[0].id;
      }
      touches.set(event.pointerId,id);
    }else{if(!touches.has(event.pointerId))return;id=touches.get(event.pointerId);}
    const p=s.players.find(p=>p.id===id);if(!p||!p.lives)return;
    const target=targets.get(id)||{};target.a=renderer.pointerAngle(event.clientX,event.clientY,s,p,profile.assist);targets.set(id,target);
    if(down){unlockAudio();try{$('arena').setPointerCapture(event.pointerId);}catch{}$('arena').focus({preventScroll:true});}
    event.preventDefault();
  }
  $('arena').addEventListener('pointerdown',e=>pointer(e,true));$('arena').addEventListener('pointermove',e=>pointer(e));
  for(const name of ['pointerup','pointercancel'])$('arena').addEventListener(name,e=>{touches.delete(e.pointerId);try{$('arena').releasePointerCapture(e.pointerId);}catch{}});
  $('arena').addEventListener('contextmenu',e=>e.preventDefault());
  $('depthSlider').addEventListener('input',()=>{const id=inputId(),t=targets.get(id)||{};t.b=Number($('depthSlider').value)*Math.PI/180;targets.set(id,t);});
  $('phaseSlider').addEventListener('input',()=>{const id=inputId(),t=targets.get(id)||{};t.c=Number($('phaseSlider').value)*Math.PI/180;targets.set(id,t);});
  const movementKeys=new Set(CONTROL_MAP.flat());
  window.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(movementKeys.has(e.code)){e.preventDefault();keys.add(e.code);return;}
    if(['Space','Escape','KeyR','KeyM','KeyF'].includes(e.code))e.preventDefault();if(e.repeat)return;
    if(e.code==='Space')action();else if(e.code==='Escape'){if(game?.s.phase==='pause')action();else pause();}
    else if(e.code==='KeyR')restart();else if(e.code==='KeyM')toggleSound();else if(e.code==='KeyF')fullscreen();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{clearInputs();if(room.role!=='guest')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(room.role!=='guest')pause();}});
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('Fullscreen is unavailable in this browser view.');}catch{notify('Fullscreen is unavailable in this browser view.');}}
  document.addEventListener('fullscreenchange',()=>{$('fullButton').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');renderer.resize();});
  // Room console and connection state.
  function networkStatus(text,error=false){$('networkStatus').textContent=text;$('networkStatus').classList.toggle('error',error);}
  function appendChat(message){
    const p=document.createElement('p'),b=document.createElement('b'),span=document.createElement('span');p.style.setProperty('--player',E.COLORS[message.seat%4]||E.COLORS[0]);b.textContent=message.name;span.textContent=message.text;p.append(b,span);$('chatLog').append(p);while($('chatLog').children.length>80)$('chatLog').firstElementChild.remove();$('chatLog').scrollTop=$('chatLog').scrollHeight;
  }
  function roomEvent(type,data){
    if(type==='roster'||type==='ready'){renderRoom();if(!game&&!remote&&preview){previewGame();refreshPanels();}}
    else if(type==='connected'){networkStatus(room.role==='host'?'A pilot connected. Guests must press Ready before launch.':'Connected directly. Press Ready when you are set.');renderRoom();tone(700,.12);}
    else if(type==='settings'){if(data&&[2,3,4].includes(data.dimension))room.settings=data;}
    else if(type==='start'){
      game=null;remote=data;lastRemote=null;remoteAt=performance.now();resetMatchTracking();renderer.reset();$('roomDialog').close();unlockAudio();refreshPanels();
    }else if(type==='snapshot'){
      if(!room.locked)return;lastRemote=remote;remote=data;remoteAt=performance.now();processEvents(remote);uiDirty=true;
    }else if(type==='lobby'){game=null;remote=null;resetMatchTracking();previewGame();refreshPanels();networkStatus('Back in the lobby. Your host can launch another match.');openDialog('roomDialog');}
    else if(type==='departed'){if(game){game.disconnect(data.seat);room.snapshot(game.snapshot(),true);uiDirty=true;}renderRoom();}
    else if(type==='lost'){game=null;remote=null;resetMatchTracking();previewGame();refreshPanels();networkStatus(data,true);openDialog('roomDialog');}
    else if(type==='closed'){
      $('signalIn').value='';$('signalOut').value='';$('latencyBadge').textContent='NOT CONNECTED';
      $('chatLog').innerHTML='<p class="chat-system">Messages stay in this session. No chat server, no history sync.</p>';
      if(tab==='online'){game=null;remote=null;clearInputs();if(preview)previewGame();uiDirty=true;}
      if(room){renderRoom();}
    }else if(type==='chat')appendChat(data);
    else if(type==='latency'){$('latencyBadge').textContent=data+' MS RTT';}
    else if(type==='notice'){networkStatus(data,true);notify(data);}
  }
  room=new N.Room(roomEvent);
  function renderRoom(){
    const role=room.role,active=role!=='none',roster=room.roster();
    $('roomSetup').hidden=active;$('roomActive').hidden=!active;$('pilotName').disabled=active;
    $('roomId').textContent=active?'#'+room.room.slice(0,6).toUpperCase():'';
    $('roleLabel').textContent=role==='host'?'YOU ARE HOST':'YOU ARE P'+(room.seat+1);$('routeLabel').textContent=room.iceMode==='internet'?'INTERNET / STUN':'DIRECT / LAN';
    $('hostSettings').hidden=role!=='host';$('newInvite').hidden=role!=='host';$('readyButton').hidden=role!=='guest';$('startRoom').hidden=role!=='host';
    $('readyButton').textContent=room.ready?'Ready - undo':'Ready up';$('readyButton').disabled=!room.peers.get(0)?.open||room.locked;
    $('startRoom').disabled=!room.canStart()||netBusy;$('startRoom').querySelector('span').textContent=room.locked?'Return to lobby':'Launch match';
    if(room.locked)$('startRoom').disabled=role!=='host';
    $('newInvite').disabled=room.locked||room.peers.size>=3||netBusy;
    for(const id of ['roomDimension','roomDifficulty','roomLives'])$(id).disabled=room.locked;
    $('acceptReply').disabled=role!=='host'||room.locked||netBusy;
    $('roomRoster').innerHTML=roster.map(p=>'<div class="room-player" style="--player:'+E.COLORS[p.seat%4]+'"><span class="avatar">'+(p.seat+1)+'</span><div class="pilot-info"><b>'+escapeText(p.name)+(p.seat===(role==='host'?0:room.seat)?' / YOU':'')+'</b><small>'+escapeText(p.status)+(p.rtt>0?' / '+p.rtt+' ms':'')+'</small></div><span class="ready">'+(p.open?(p.ready?'READY':'NOT READY'):'PENDING')+'</span>'+(role==='host'&&p.seat>0&&!room.locked?'<button class="remove" data-remove="'+p.seat+'" aria-label="Remove pilot or pending invite">&#10005;</button>':'')+'</div>').join('');
    document.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{room.remove(Number(btn.dataset.remove));networkStatus('Seat cleared. You can generate a fresh invite.');});
    $('miniRoster').innerHTML=roster.filter(p=>p.open).map(p=>'<div class="mini-player"><span>'+escapeText(p.name)+'</span><span>'+(p.ready?'READY':'IN LOBBY')+'</span></div>').join('');
    $('roomSummaryTitle').textContent=active?'Room #'+room.room.slice(0,6).toUpperCase():'Your crew. Your orbit.';
    $('roomSummaryCopy').textContent=active?roster.filter(p=>p.open).length+' pilots connected. '+(room.locked?'Match in progress.':'Waiting for the crew to ready up.'):'Connect up to four browsers directly. No game backend. No account.';
    $('connectionBadge').textContent=active?(room.locked?'P2P MATCH LIVE':'P2P ROOM OPEN'):'OFFLINE READY';
    $('inputSignalLabel').textContent=role==='host'?'PASTE YOUR GUEST\'S REPLY':'PASTE YOUR HOST\'S INVITE';
    uiDirty=true;
  }
  async function busy(task){
    if(netBusy)return;netBusy=true;for(const id of ['createRoom','joinRoom','newInvite','acceptReply'])$(id).disabled=true;
    try{await task();}catch(error){networkStatus(error.message||'Connection setup failed.',true);}
    finally{netBusy=false;$('createRoom').disabled=false;$('joinRoom').disabled=false;renderRoom();}
  }
  function outgoing(token,label){$('signalOut').value=token;$('outputSignalLabel').textContent=label;$('signalIn').value='';}
  $('hostTab').onclick=()=>{$('hostSetup').hidden=false;$('joinSetup').hidden=true;$('hostTab').classList.add('selected');$('joinTab').classList.remove('selected');$('hostTab').setAttribute('aria-pressed','true');$('joinTab').setAttribute('aria-pressed','false');$('inputSignalLabel').textContent='PASTE A GUEST REPLY AFTER CREATING YOUR ROOM';};
  $('joinTab').onclick=()=>{$('hostSetup').hidden=true;$('joinSetup').hidden=false;$('joinTab').classList.add('selected');$('hostTab').classList.remove('selected');$('hostTab').setAttribute('aria-pressed','false');$('joinTab').setAttribute('aria-pressed','true');$('inputSignalLabel').textContent='PASTE YOUR HOST\'S INVITE';$('signalIn').focus();};
  $('networkMode').onchange=()=>{$('routeNote').textContent=$('networkMode').value==='internet'?'Contacts Google public STUN servers to discover direct internet routes. No gameplay relay. Restrictive networks may still fail.':'For the same device or compatible local networks. No external discovery service is contacted.';};
  $('createRoom').onclick=()=>busy(async()=>{
    profile.name=N.cleanName($('pilotName').value);save();room.create(profile.name,$('networkMode').value);
    room.setSettings({dimension:Number($('roomDimension').value),difficulty:$('roomDifficulty').value,lives:Number($('roomLives').value)});
    networkStatus('Gathering a complete invite. Keep this tab open.');const {token,seat}=await room.invite();outgoing(token,'INVITE FOR PILOT '+(seat+1)+' - SEND THIS TO ONE GUEST');
    networkStatus('Invite ready. Send the full code to one guest, then paste their reply above and accept it.');
  });
  $('newInvite').onclick=()=>busy(async()=>{networkStatus('Preparing a unique invite for another pilot.');const {token,seat}=await room.invite();outgoing(token,'INVITE FOR PILOT '+(seat+1)+' - SEND TO ONE NEW GUEST');networkStatus('New invite ready. Each guest must use their own invite.');});
  $('joinRoom').onclick=()=>busy(async()=>{
    const invite=$('signalIn').value;if(!invite.trim())throw new Error('Paste your host\'s invite into the connection exchange first.');
    profile.name=N.cleanName($('pilotName').value);save();networkStatus('Reading the invite and preparing your reply.');
    const {token}=await room.join(invite,profile.name);outgoing(token,'YOUR REPLY - SEND THIS BACK TO THE HOST');
    networkStatus('Reply ready. Send it back to the host. After the host accepts it, press Ready.');
  });
  $('acceptReply').onclick=()=>busy(async()=>{const reply=$('signalIn').value;networkStatus('Accepting reply and opening the direct connection.');await room.accept(reply);$('signalIn').value='';networkStatus('Reply accepted. Keep both tabs open while the browsers connect.');});
  $('readyButton').onclick=()=>room.setReady(!room.ready);
  $('startRoom').onclick=()=>{if(room.locked)returnToLobby();else startRoomGame();};
  $('leaveRoom').onclick=()=>{if(confirm(room.role==='host'?'Close the room for all pilots?':'Leave this room?')){room.close();game=null;remote=null;previewGame();refreshPanels();$('signalIn').value='';$('signalOut').value='';networkStatus('Room closed. Create or join another orbit.');}};
  for(const id of ['roomDimension','roomDifficulty','roomLives'])$(id).onchange=()=>{room.setSettings({dimension:Number($('roomDimension').value),difficulty:$('roomDifficulty').value,lives:Number($('roomLives').value)});previewGame();refreshPanels();};
  $('copySignal').onclick=async()=>{
    const text=$('signalOut').value;if(!text){networkStatus('Generate an invite or reply first.',true);return;}
    try{await navigator.clipboard.writeText(text);networkStatus('Full code copied. Send it privately to the other pilot.');}
    catch{$('signalOut').focus();$('signalOut').select();let copied=false;try{copied=document.execCommand('copy');}catch{}networkStatus(copied?'Full code copied.':'Code selected. Press Ctrl+C or use your device\'s Copy command.');}
  };
  $('downloadSignal').onclick=()=>{if(!$('signalOut').value){networkStatus('Generate an invite or reply first.',true);return;}download('orbital-'+(room.role==='host'?'invite':'reply')+'.txt',$('signalOut').value);};
  $('loadSignal').onclick=()=>$('signalFile').click();$('signalFile').onchange=async e=>{const file=e.target.files[0];if(file){if(file.size>100000)networkStatus('The connection code file is too large.',true);else $('signalIn').value=await file.text();}e.target.value='';};
  $('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chatInput').value.trim();if(!text)return;if(!room.roster().some(p=>p.seat!==room.seat&&p.open)){networkStatus('Connect another pilot before sending messages.',true);return;}room.chat(text);$('chatInput').value='';};
  // General interface events.
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>chooseTab(btn.dataset.tab));
  document.querySelectorAll('[data-dimension]').forEach(btn=>btn.onclick=()=>{if(aliveState()&&aliveState().phase!=='over'&&!confirm('Leave the current run and change dimension?'))return;selectedDimension=Number(btn.dataset.dimension);game=null;remote=null;previewGame();refreshPanels();});
  for(const id of ['arcadeType','playerCount','difficulty','lives'])$(id).onchange=()=>{game=null;remote=null;resetMatchTracking();previewGame();refreshPanels();};
  $('mainAction').onclick=action;$('overlayAction').onclick=action;$('overlaySecondary').onclick=()=>{if(tab==='online')openDialog('roomDialog');else returnToLobby();};$('restartButton').onclick=restart;
  $('soundButton').onclick=toggleSound;$('fullButton').onclick=fullscreen;$('settingsButton').onclick=()=>{refreshProfile();$('settingsName').value=profile.name;openDialog('settingsDialog');};$('helpButton').onclick=()=>openDialog('helpDialog');
  $('brandHome').onclick=e=>{e.preventDefault();chooseTab('campaign',false);};
  $('openRoomButton').onclick=()=>openDialog('roomDialog');
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>$(btn.dataset.close).close());
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{clearInputs();uiDirty=true;}));
  $('guideToggle').onchange=()=>{profile.guide=$('guideToggle').checked;save();};
  $('assistToggle').onchange=()=>{profile.assist=$('assistToggle').checked;targets.clear();save();refreshPanels();};
  $('soundSetting').onchange=()=>{profile.sound=$('soundSetting').checked;save();soundUI();if(profile.sound)unlockAudio();};
  $('motionSetting').checked=!profile.motion;$('motionSetting').onchange=()=>{profile.motion=!$('motionSetting').checked;document.body.classList.toggle('reduce-motion',!profile.motion);save();};
  $('settingsName').onchange=()=>{profile.name=N.cleanName($('settingsName').value);$('settingsName').value=profile.name;if(room.role==='none')$('pilotName').value=profile.name;save();if(!aliveState())previewGame();};
  $('exportSave').onclick=()=>download('orbital-multiverse-progress.json',JSON.stringify(profile,null,2),'application/json');
  $('importSave').onclick=()=>$('saveFile').click();
  $('saveFile').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>25000)throw new Error('This progress file is too large.');const imported=validateProfile(JSON.parse(await file.text()));if(!confirm('Replace the progress and preferences saved in this browser?'))return;profile=imported;save();selectedLevel=getUnlocked();refreshProfile();renderLevels();soundUI();$('guideToggle').checked=profile.guide;$('assistToggle').checked=profile.assist;$('motionSetting').checked=!profile.motion;document.body.classList.toggle('reduce-motion',!profile.motion);$('settingsName').value=profile.name;if(room.role==='none')$('pilotName').value=profile.name;if(!aliveState())previewGame();refreshPanels();notify('Progress imported. Your flight record is restored.');}
    catch(error){notify(error.message||'Could not import this progress file.');}finally{event.target.value='';}
  };
  // One simulation clock, a bounded snapshot cadence, and a separate presentation clock.
  let last=0,accumulator=0,networkClock=0,uiClock=0;
  function interpolatedRemote(now){
    if(!remote)return null;
    if(!lastRemote||remote.phase!==lastRemote.phase||remote.eventId!==lastRemote.eventId||remote.n!==lastRemote.n)return remote;
    const t=E.clamp((now-remoteAt)/34,0,1),s={...remote,ball:{...remote.ball,p:remote.ball.p.map((x,i)=>lastRemote.ball.p[i]+(x-lastRemote.ball.p[i])*t)},players:remote.players.map((p,i)=>{
      const prev=lastRemote.players[i];if(!prev||prev.id!==p.id)return p;
      return {...p,a:prev.a+E.delta(p.a,prev.a)*t,b:prev.b+(p.b-prev.b)*t,c:prev.c+(p.c-prev.c)*t};
    })};
    // Short, cosmetic local prediction; collision and scoring remain authoritative at the host.
    if(!document.querySelector('dialog[open]')&&['play','countdown'].includes(s.phase)){
      const p=s.players.find(p=>p.id===room.seat),input=playerInput(room.seat),ahead=Math.min(.09,(now-remoteAt)/1000+.034);
      if(p){if(input.x)p.a+=input.x*7.2*ahead;else if(Number.isFinite(input.a))p.a+=E.clamp(E.delta(input.a,p.a)*12,-7.2,7.2)*ahead;}
    }
    return s;
  }
  function frame(timestamp){
    const dt=Math.min(last?(timestamp-last)/1000:0,.05);last=timestamp;accumulator+=dt;networkClock+=dt;uiClock+=dt;
    if(game){const inputs=allInputs();while(accumulator>=1/120){game.step(1/120,inputs);accumulator-=1/120;}processEvents(game.s);}
    else accumulator=0;
    if(networkClock>=1/30){
      networkClock=0;
      if(room.role==='host'&&game)room.snapshot(game.snapshot());
      else if(room.role==='guest'&&room.locked)room.input(document.querySelector('dialog[open]')?{assist:profile.assist}:playerInput(room.seat));
    }
    let state=game?.s||interpolatedRemote(timestamp);
    if(!state){
      state=preview.s;const tm=profile.motion?timestamp/1000:0;
      state.players.forEach((p,i)=>{p.a=Math.PI+i*Math.PI+Math.sin(tm*.25+i)*.5;p.b=state.n>2?Math.sin(tm*.3+i)*.45:0;p.c=state.n>3?Math.sin(tm*.22+i)*.38:0;});
      state.ball.p=E.scale(E.vector(-.6+tm*.32,Math.sin(tm*.21)*.4,Math.sin(tm*.17)*.35,state.n),.63);state.active=0;
    }
    renderer.draw(state,timestamp/1000,{preview:!aliveState(),guide:profile.guide,motion:profile.motion});
    if(uiDirty||uiClock>.10){uiClock=0;updateUI();}
    requestAnimationFrame(frame);
  }
  $('pilotName').value=profile.name;$('settingsName').value=profile.name;document.body.classList.toggle('reduce-motion',!profile.motion);
  refreshProfile();renderLevels();soundUI();previewGame();refreshPanels();renderRoom();requestAnimationFrame(frame);
  if(!storageAvailable)notify('Local storage is unavailable. Export your progress to keep a backup.');
  window.addEventListener('beforeunload',()=>room.destroy());
  // Only exposed by an explicit ?test URL; production UI does not depend on test hooks.
  if(new URLSearchParams(location.search).has('test'))window.__orbit={E,N,room,renderer,current,chooseTab,selectLevel,action,newOfflineGame,startRoomGame,returnToLobby,refreshPanels,previewGame,validateProfile,playerInput,
    get game(){return game;},get remote(){return remote;},get profile(){return profile;},get tab(){return tab;},get selectedLevel(){return selectedLevel;},get selectedDimension(){return selectedDimension;}};
})();
