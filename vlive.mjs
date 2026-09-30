import { io } from 'socket.io-client';
const url = 'https://127.0.0.1:8891';
const s = io(url, { path:'/rpg-socket', transports:['websocket'], rejectUnauthorized:false });
let done=false;
const finish=(code,msg)=>{ if(done)return; done=true; console.log(msg); try{s.close();}catch{} process.exit(code); };
s.on('connect', ()=>{ console.log('socket connected', s.id); s.emit('auth',{displayName:'MapProbe',avatar:'🧙'}); });
s.on('connect_error', e=>finish(1,'connect_error: '+e.message));
s.onAny((ev, ...a)=>{ if(!done) console.log('  event:', ev, JSON.stringify(a).slice(0,160)); });
setTimeout(()=>finish(done?0:1, done?'(already finished)':'timeout after 12s — no scene map event seen'),12000);
