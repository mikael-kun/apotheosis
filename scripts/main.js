/*
  Track and act data lives in data/tracks.json — edit content there, not here.
  In each track entry: audioSrc points at real Suno exports in tracks/,
  coverSrc at illustrations/. corruption is a 0..1 authorial value driving
  glitch intensity (0 = clean signal, 1 = peak system failure). act is
  1-indexed into acts[].

  Note: fetch() of local JSON is blocked on file:// in most browsers —
  test via a local server (python3 -m http.server) or GitHub Pages.
*/
let ACTS = [];
let TRACKS = [];
const ROMAN = ["I","II","III","IV","V"];

function parseDur(str){
  const [m,s] = str.split(':').map(Number);
  const sec = m*60 + s;
  return isNaN(sec) ? 240 : sec; // 240s fallback for placeholder durations like "--:--"
}
function fmt(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60), s = sec%60;
  return m + ':' + String(s).padStart(2,'0');
}
const COLOR_MAP = {
  "sunrise gold":"#e8c766", "pale blue":"#a9c6e8", "blue-black":"#1a1a30",
  "electric blue":"#4d9fff",
};
function cssColor(name){
  return COLOR_MAP[name.toLowerCase()] || name.toLowerCase();
}

function moodGradient(t){
  const colors = (t.colors || []).map(cssColor);
  if(!colors.length) return null;
  const washed = colors.map(c => `color-mix(in srgb, ${c} 20%, transparent)`);
  const stops = washed.map((c, i) => `${c} ${washed.length > 1 ? (i/(washed.length-1)*100).toFixed(0) : 0}%`);
  return `linear-gradient(120deg, ${stops.join(', ')})`;
}

function applyTileArt(el, t){
  if(t.coverSrc){
    el.style.backgroundImage = `url('${t.coverSrc}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.style.backgroundImage = `linear-gradient(hsla(${t.hue}, ${t.sat||60}%, 12%, 0.72), hsla(${t.hue}, ${t.sat||60}%, 8%, 0.82)), url('illustrations/apotheosis_LP_cover.jpg')`;
    el.style.backgroundSize = 'cover, 340% auto';
    el.style.backgroundPosition = `center, ${t.pos}`;
  }
}

async function init(){
  const res = await fetch('data/tracks.json');
  if(!res.ok) throw new Error('tracks.json failed to load: ' + res.status);
  const data = await res.json();
  ACTS = data.acts;
  TRACKS = data.tracks;

const album = document.getElementById('album');
let lastAct = null;
TRACKS.forEach((t, i) => {
  if(t.act !== lastAct){
    const info = ACTS[t.act - 1];
    const divider = document.createElement('div');
    divider.className = 'act-divider';
    divider.innerHTML = `
      <div class="act-row">Act ${ROMAN[t.act-1]}<span class="act-name">&nbsp;— ${info.name}</span></div>
      <div class="act-desc">${info.desc}</div>
    `;
    album.appendChild(divider);
    lastAct = t.act;
  }

  const el = document.createElement('div');
  el.className = 'track';
  el.dataset.index = i;
  el.innerHTML = `
    <div class="track-num">${String(i+1).padStart(2,'0')}</div>
    <div class="cover" data-index="${i}">
      <div class="play-btn">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <div class="track-body">
      <div class="title-row">
        <h3 class="track-title">${t.title}</h3>
        <span class="pill">v5.5</span>
      </div>
      ${t.jp ? `<div class="track-title-jp">${t.jp}</div>` : ''}
      <div class="duration">${t.dur}</div>
      ${t.style ? `<div class="style-line">${t.style}</div>` : ''}
      ${t.shot ? `<div class="shot-line">${t.shot}</div>` : ''}
      ${t.story ? `<div class="story">${t.story}</div>` : ''}
      ${t.mood ? `<div class="mood-row">${t.mood}${t.colors ? ' · ' + t.colors.map(c => `<span class="swatch" style="background:${cssColor(c)}"></span>`).join('') : ''}</div>` : ''}
      ${t.hiddenSymbol ? `<div class="hidden-symbol">${t.hiddenSymbol}</div>` : ''}
      <div class="tags">${t.tags.map(tag => `<span>${tag}</span>`).join('')}</div>
    </div>
  `;
  album.appendChild(el);
  applyTileArt(el.querySelector('.cover'), t);
  const grad = moodGradient(t);
  if(grad) el.style.setProperty('--track-bg', grad);
});

/* ---------- playback ---------- */
let current = 0;
let playing = false;

const audioEl = document.getElementById('audio-el');
const railFill = document.getElementById('rail-fill');
const miniFill = document.getElementById('mini-rail-fill');
const curTimeEl = document.getElementById('cur-time');
const durTimeEl = document.getElementById('dur-time');
const npTitle = document.getElementById('np-title');
const npNum = document.getElementById('np-num');
const npArt = document.getElementById('np-art');
const playIcon = document.getElementById('play-icon');
const playPauseBtn = document.getElementById('play-pause');
const trackEls = Array.from(document.querySelectorAll('.track'));
const coverEls = Array.from(document.querySelectorAll('.cover'));

function setCorruptionVars(t){
  document.documentElement.style.setProperty('--corruption', t.corruption);
  const accent = `hsl(${t.hue} ${t.sat||80}% ${Math.max(t.light||60, 45)}%)`;
  document.documentElement.style.setProperty('--accent', accent);
}

function loadTrack(i, autoplay){
  current = i;
  const t = TRACKS[i];
  audioEl.src = t.audioSrc;
  if(autoplay) audioEl.play(); else audioEl.pause();
  durTimeEl.textContent = t.dur;
  curTimeEl.textContent = '0:00';
  npTitle.textContent = t.title;
  npNum.textContent = 'Track ' + String(i+1).padStart(2,'0');
  applyTileArt(npArt, t);
  setCorruptionVars(t);
  trackEls.forEach((el,idx) => el.classList.toggle('is-active', idx === i));
  coverEls.forEach((el,idx) => el.classList.toggle('is-playing', idx === i && playing));
  updateProgress();
}

function updateProgress(){
  const dur = audioEl.duration || parseDur(TRACKS[current].dur);
  const pct = Math.min(100, (audioEl.currentTime/dur)*100) || 0;
  railFill.style.width = pct + '%';
  miniFill.style.width = pct + '%';
  curTimeEl.textContent = fmt(audioEl.currentTime);
}

function play(){
  playing = true;
  audioEl.play();
  playIcon.outerHTML = '<svg id="play-icon" viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  coverEls.forEach((el,idx) => el.classList.toggle('is-playing', idx === current));
}

function pause(){
  playing = false;
  audioEl.pause();
  document.getElementById('play-icon').outerHTML = '<svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  coverEls.forEach(el => el.classList.remove('is-playing'));
}

function togglePlay(){ playing ? pause() : play(); }

function nextTrack(){
  const i = (current + 1) % TRACKS.length;
  loadTrack(i, playing);
  document.getElementById('track-' + i)?.scrollIntoView({behavior:'smooth', block:'center'});
}
function prevTrack(){
  const i = (current - 1 + TRACKS.length) % TRACKS.length;
  loadTrack(i, playing);
}

audioEl.addEventListener('timeupdate', updateProgress);
audioEl.addEventListener('loadedmetadata', () => {
  durTimeEl.textContent = fmt(audioEl.duration);
});
audioEl.addEventListener('ended', nextTrack);

playPauseBtn.addEventListener('click', togglePlay);
document.getElementById('next-btn').addEventListener('click', nextTrack);
document.getElementById('prev-btn').addEventListener('click', prevTrack);

coverEls.forEach(el => {
  el.addEventListener('click', () => {
    const idx = Number(el.dataset.index);
    if(idx === current){
      togglePlay();
    } else {
      loadTrack(idx, true);
      play();
    }
  });
});

function seekFromEvent(e, railEl){
  // works for mouse, touch, and pen via Pointer Events
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  if(clientX == null) return;
  const rect = railEl.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const dur = audioEl.duration || parseDur(TRACKS[current].dur);
  audioEl.currentTime = pct * dur;
  updateProgress();
}

function makeScrubbable(railEl){
  let scrubbing = false;
  railEl.addEventListener('pointerdown', e => {
    scrubbing = true;
    railEl.setPointerCapture(e.pointerId);
    seekFromEvent(e, railEl);
    e.preventDefault(); // stop the page scrolling while scrubbing
  });
  railEl.addEventListener('pointermove', e => { if(scrubbing) seekFromEvent(e, railEl); });
  railEl.addEventListener('pointerup', () => { scrubbing = false; });
  railEl.addEventListener('pointercancel', () => { scrubbing = false; });
}
makeScrubbable(document.getElementById('rail'));
makeScrubbable(document.getElementById('mini-rail'));

/* scroll-linked "now viewing" state — separate from playback.
   Scrolling changes which track is highlighted/active visually and primed
   as "up next" but does not auto-start playback, matching how the mini
   player above stays anchored to whatever is actually playing. */
trackEls.forEach((el,i) => el.id = 'track-' + i);
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting && entry.intersectionRatio > 0.5 && !playing){
      const idx = Number(entry.target.dataset.index);
      setCorruptionVars(TRACKS[idx]);
    }
  });
}, { threshold: [0.5] });
trackEls.forEach(el => observer.observe(el));

/* ---------- vertical spine ----------
   Static gradient: each track's hue placed at the vertical percentage
   where that track's section actually falls in the document, so the
   spine is a fixed color map of the whole page's mood arc. A marker
   dot travels down it in sync with real scroll position, and small
   ticks mark each track's start (click to jump there). */
function buildSpine(){
  const totalHeight = document.body.scrollHeight;
  const stops = TRACKS.map((t,i) => {
    const el = document.getElementById('track-' + i);
    const pct = (el.offsetTop / totalHeight * 100).toFixed(2);
    return { pct, hue: t.hue, sat: t.sat||70, light: Math.max(t.light||55, 40) };
  });
  const gradientStops = stops.map(s => `hsl(${s.hue} ${s.sat}% ${s.light}%) ${s.pct}%`).join(', ');
  document.documentElement.style.setProperty('--spine-gradient', `linear-gradient(180deg, ${gradientStops})`);

  const spine = document.getElementById('spine');
  document.querySelectorAll('.spine-tick').forEach(t => t.remove());
  stops.forEach((s, i) => {
    const tick = document.createElement('div');
    tick.className = 'spine-tick';
    tick.style.top = (parseFloat(s.pct) / 100 * window.innerHeight) + 'px';
    tick.title = TRACKS[i].title;
    tick.addEventListener('click', () => document.getElementById('track-' + i).scrollIntoView({behavior:'smooth', block:'start'}));
    document.body.appendChild(tick);
  });
}

function updateSpineMarker(){
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const frac = scrollable > 0 ? window.scrollY / scrollable : 0;
  const y = frac * (window.innerHeight - 9);
  document.getElementById('spine-marker').style.transform = `translateY(${y}px)`;
}
window.addEventListener('scroll', updateSpineMarker);
window.addEventListener('resize', () => { buildSpine(); updateSpineMarker(); });

loadTrack(0);
requestAnimationFrame(() => { buildSpine(); updateSpineMarker(); });
}

init().catch(err => {
  console.error(err);
  document.getElementById('album').innerHTML =
    '<p style="color:var(--chrome-dim); padding:56px 0;">Could not load track data (' + err.message + '). If opening via file://, run a local server instead.</p>';
});
