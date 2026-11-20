// Record what the game actually sends to the speakers while points are played with real mouse
// events, together with a log of every sound it asked for, for tools/audio_check.py.
//   SECS=60 OUT=/tmp/cap [VENUE=rg] node tools/shot.mjs http://127.0.0.1:8765/pro/index.html - --steps tools/audio_capture.mjs
// Writes OUT.wav and OUT.json. The chair umpire's voice is the browser's speech engine and is not captured.
import fs from 'node:fs';
export default async function ({ ev, sleep, key, mouse, shot, send }) {
  const hook = `(() => {
    const orig = AudioNode.prototype.connect; window.__rec = null;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = orig.call(this, dest, ...rest);
      try {
        if (dest instanceof AudioDestinationNode && !window.__rec) {
          const ctx = this.context, sp = ctx.createScriptProcessor(4096, 2, 1), z = ctx.createGain(); z.gain.value = 0;
          const R = window.__rec = { sr: ctx.sampleRate, L: [], Rr: [], t: [], ctx };
          sp.onaudioprocess = e => { R.L.push(new Float32Array(e.inputBuffer.getChannelData(0))); R.Rr.push(new Float32Array(e.inputBuffer.getChannelData(1))); R.t.push(e.playbackTime); };
          orig.call(this, sp); orig.call(sp, z); orig.call(z, ctx.destination);
        }
      } catch (err) { console.log('rec hook failed ' + err); }
      return r;
    };
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: hook });
  await send('Page.reload'); await sleep(3500); await send('Page.bringToFront');
  const click = async sel => { const r = await ev(`(()=>{const n=document.querySelector(${JSON.stringify(sel)}); if(!n) return null; const b=n.getBoundingClientRect(); return [b.x+b.width/2, b.y+b.height/2];})()`); if (!r) return null; await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1]); await mouse('mouseReleased', r[0], r[1]); await sleep(600); return 1; };
  await click('[data-go="quick"]');
  if (process.env.VENUE) { await ev(`(()=>{const n=document.querySelector('[data-tab="court"]'); if(n) n.click(); return 1;})()`); await sleep(400); await ev(`(()=>{const n=document.querySelector('[data-t="${process.env.VENUE}"]'); if(n) n.click(); return 1;})()`); await sleep(400); }
  console.log('start', await click('[data-start]')); await sleep(7000);
  let x = 800, y = 450; const press = async () => mouse('mousePressed', x, y), release = async () => mouse('mouseReleased', x, y);
  await mouse('mouseMoved', x, y); await press(); await release(); await sleep(500);
  // log what the game asks its sound engine for
  await ev(`(()=>{ const a=__app.audio; window.__alog=[]; const o=a.event.bind(a); a.event=(type,e,g)=>{ try{ __alog.push({t:a.ctx?a.ctx.currentTime:-1,type,kind:e&&e.kind,speed:e&&e.speed,who:e&&e.who,vy:e&&e.vy,first:e&&e.first,why:e&&e.why,x:e&&e.x,z:e&&e.z}); }catch(err){} return o(type,e,g); }; const sq=a.squeak.bind(a); a.squeak=(x,z,k)=>{ const t=a.ctx.currentTime; if (t-a.lastSqueak>=0.14) __alog.push({t,type:'squeak',k}); return sq(x,z,k); }; return 1; })()`);
  const st = async () => JSON.parse(await ev("JSON.stringify({phase: __app.game.match.phase, pt: +__app.game.match.phaseT.toFixed(2), srv: __app.game.match.score.server, tau: __app.game.human.tau, hold: !!__app.game.human.hold, held: __app.game.match.ball.held, swingOk: __app.game.match.t >= (__app.game.match.tossIdeal||0) - 0.33, n: __app.game.match.history.length, ctx: __app.audio.ctx ? __app.audio.ctx.state : 'none', bufs: Object.keys(__app.audio.buf)})"));
  const t0 = Date.now(), secs = +(process.env.SECS || 50); let s;
  while (Date.now() - t0 < secs * 1000) {
    s = await st();
    if (s.phase === 'ready' && s.srv === 0 && s.pt > 0.8) { await press(); await release(); await sleep(150); }
    else if (s.phase === 'toss' && s.srv === 0 && s.held < 0 && s.swingOk) { await press(); await release(); await sleep(250); }
    else if (s.phase === 'live' && s.tau != null) { if (!s.hold && s.tau < 0.32 && s.tau > 0.05) await press(); else if (s.hold && s.tau <= 0.03) await release(); }
    await sleep(6);
  }
  console.log('state', JSON.stringify(s));
  const meta = JSON.parse(await ev("JSON.stringify({sr: __rec ? __rec.sr : 0, chunks: __rec ? __rec.L.length : 0, t0: __rec && __rec.t[0], t1: __rec && __rec.t[__rec.t.length-1], gaps: __rec ? __rec.t.filter((v,i,a)=>i>0 && Math.abs(v-a[i-1]-4096/__rec.sr)>0.002).length : -1, log: window.__alog, surface: __app.audio.surface, vol: __app.audio.vol, times: __rec ? Array.from(__rec.t) : []})"));
  console.log('recorded', meta.chunks, 'chunks at', meta.sr, 'Hz, gaps', meta.gaps, 'events', meta.log.length);
  // pull the samples out as 16-bit PCM, a slice at a time
  const out = process.env.OUT || '/tmp/rally-audio/cap';
  const N = meta.times.length, per = 40; const bufs = [];
  for (let i = 0; i < N; i += per) {
    const b64 = await ev(`(()=>{ const R=__rec, a=${i}, b=Math.min(${N}, ${i + per}); const o=new Int16Array((b-a)*4096*2); let k=0; for(let c=a;c<b;c++){ const l=R.L[c], r=R.Rr[c]; for(let j=0;j<4096;j++){ o[k++]=Math.max(-32768,Math.min(32767,Math.round(l[j]*32767))); o[k++]=Math.max(-32768,Math.min(32767,Math.round(r[j]*32767))); } } const u=new Uint8Array(o.buffer); let s=''; for(let j=0;j<u.length;j+=8192) s+=String.fromCharCode.apply(null,u.subarray(j,j+8192)); return btoa(s); })()`);
    bufs.push(Buffer.from(b64, 'base64'));
  }
  const pcm = Buffer.concat(bufs), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(meta.sr, 24); h.writeUInt32LE(meta.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
  fs.writeFileSync(out + '.wav', Buffer.concat([h, pcm])); fs.writeFileSync(out + '.json', JSON.stringify(meta));
  console.log('wrote', out + '.wav', (pcm.length / 4 / meta.sr).toFixed(1), 's');
}
