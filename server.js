'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const {WebSocketServer}=require('ws');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||8080);
const rooms=new Map(),clients=new Map();
const httpServer=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}
 if(pathname!=='/'&&pathname!=='/index.html'){res.writeHead(404);res.end('Not found');return;}
 const file=path.join(__dirname,'index.html');
 fs.readFile(file,(err,html)=>{if(err){res.writeHead(500);res.end('Game HTML missing');return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);});
});
const wss=new WebSocketServer({server:httpServer,maxPayload:32768});
function send(ws,data){if(ws.readyState===1)ws.send(JSON.stringify(data));}
function roomView(room){return {code:room.code,host:room.host,started:room.started,settings:room.settings,players:[...room.players].map(id=>({id,name:clients.get(id)?.name||'Player',ready:!!clients.get(id)?.ready}))};}
function broadcast(room,data,exclude){for(const id of room.players){if(id===exclude)continue;const c=clients.get(id);if(c)send(c.ws,data);}}
function leave(id){const c=clients.get(id);if(!c?.room)return;const room=rooms.get(c.room);c.room=null;c.ready=false;if(!room)return;room.players.delete(id);broadcast(room,{type:'peer_left',id});if(!room.players.size){rooms.delete(room.code);return;}if(room.host===id){room.host=[...room.players][0];room.started=false;for(const pid of room.players){const player=clients.get(pid);if(player)player.ready=false;}}broadcast(room,{type:'room',room:roomView(room)});}
function code(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(c));return c;}
function validSettings(d,l,map){return {difficulty:['easy','normal','hard','nightmare'].includes(d)?d:'normal',length:'endless',map:['ruins','frost','ember','void'].includes(map)?map:'ruins'};}
wss.on('connection',ws=>{
 const id=crypto.randomUUID(),client={id,ws,name:'Player',room:null,ready:false,lastHit:0,lastSnapshot:0,lastPlayer:0};clients.set(id,client);send(ws,{type:'welcome',id});
 ws.on('message',buf=>{
  let msg;try{msg=JSON.parse(buf.toString());}catch(e){send(ws,{type:'error',message:'Invalid JSON'});return;}
  if(!msg||typeof msg.type!=='string')return;
  if(msg.type==='create'||msg.type==='join'){
   leave(id);client.ready=false;client.name=String(msg.name||'Player').replace(/[<>]/g,'').slice(0,18)||'Player';let room;
   if(msg.type==='create'){room={code:code(),host:id,players:new Set(),started:false,settings:validSettings('normal','endless','ruins')};rooms.set(room.code,room);}
   else{room=rooms.get(String(msg.code||'').trim().toUpperCase());if(!room){send(ws,{type:'error',message:'Room code not found'});return;}if(room.started){send(ws,{type:'error',message:'That room already started a match. Ask the host to create a new room.'});return;}if(room.players.size>=4){send(ws,{type:'error',message:'Room full (4 players)'});return;}}
   room.players.add(id);client.room=room.code;broadcast(room,{type:'room',room:roomView(room)});return;
  }
  const room=rooms.get(client.room);if(!room)return;
  if(msg.type==='ready'){if(room.started)return;client.ready=!!msg.ready;broadcast(room,{type:'room',room:roomView(room)});return;}
  if(msg.type==='kick'){
   if(room.host!==id){send(ws,{type:'error',message:'Only host can kick'});return;}
   const target=String(msg.target||'');if(target===id||!room.players.has(target))return;
   const other=clients.get(target);if(other){other.room=null;send(other.ws,{type:'kicked'});}room.players.delete(target);broadcast(room,{type:'peer_left',id:target});broadcast(room,{type:'room',room:roomView(room)});return;
  }
  if(msg.type==='settings'){
   if(room.host!==id||room.started)return;
   room.settings=validSettings(msg.difficulty,'endless',msg.map);broadcast(room,{type:'room',room:roomView(room)});return;
  }
  if(msg.type==='start'){
   if(room.host!==id){send(ws,{type:'error',message:'Only host can start'});return;}
   if(room.started)return;if(room.players.size<2){send(ws,{type:'error',message:'At least two players must join before starting.'});return;}if(![...room.players].every(pid=>clients.get(pid)?.ready)){send(ws,{type:'error',message:'Every player must press READY before the host can start.'});return;}room.started=true;broadcast(room,{type:'room',room:roomView(room)});broadcast(room,{type:'started',settings:room.settings});return;
  }
  if(!room.started)return;
  const now=Date.now();
  if(msg.type==='player'){
   if(now-client.lastPlayer<45)return;client.lastPlayer=now;
   const x=Number(msg.x),z=Number(msg.z),rot=Number(msg.rot);
   if(![x,z,rot].every(Number.isFinite)||Math.abs(x)>25||Math.abs(z)>25)return;
   broadcast(room,{type:'peer',id,x,z,rot,hp:Math.max(0,Math.min(999999,Number(msg.hp)||0))},id);return;
  }
  if(msg.type==='snapshot'){
   if(room.host!==id||now-client.lastSnapshot<65)return;client.lastSnapshot=now;
   if(!Array.isArray(msg.enemyList)||msg.enemyList.length>60)return;
   const safe=msg.enemyList.map(e=>({id:String(e.id||'').slice(0,32),x:Number(e.x)||0,z:Number(e.z)||0,hp:Number(e.hp)||0,maxHp:Number(e.maxHp)||1,boss:!!e.boss,creature:String(e.creature||'Enemy').slice(0,48),trait:String(e.trait||'').slice(0,32),rarity:String(e.rarity||'').slice(0,24),necromancer:!!e.necromancer}));
   broadcast(room,{type:'snapshot',round:Math.max(1,Math.min(100000,Number(msg.round)||1)),roundRemaining:Math.max(0,Number(msg.roundRemaining)||0),roundSpawnGoal:Number(msg.roundSpawnGoal)||0,roundSpawned:Number(msg.roundSpawned)||0,roundActive:!!msg.roundActive,choosingReward:!!msg.choosingReward,eeBossPending:!!msg.eeBossPending,eeBossSpawned:!!msg.eeBossSpawned,enemyList:safe},id);return;
  }
  if(msg.type==='hit'){
   if(room.host===id||now-client.lastHit<70)return;client.lastHit=now;
   const damage=Number(msg.damage);if(!Number.isFinite(damage)||damage<=0)return;
   const host=clients.get(room.host);if(host)send(host.ws,{type:'hit',enemyId:String(msg.enemyId||'').slice(0,32),damage:Math.min(400,damage),from:id});
  }
 });
 ws.on('close',()=>{leave(id);clients.delete(id);});ws.on('error',()=>{});
});
httpServer.listen(PORT,'0.0.0.0',()=>console.log('Endless Evolution v8.2 private co-op server listening on '+PORT));
