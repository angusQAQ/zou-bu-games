(() => {
  'use strict';

  const ROUND_MS = 30000;
  const READY_MS = 3000;
  const INK = '#2b2622';
  const TEAM_NAME = { red: '紅隊', blue: '藍隊' };

  const ZOU_CHARS = ['起', '趕', '超', '越', '趣'];
  const LOOKALIKES = ['建', '延'];
  const DISTRACTORS = [
    '這', '進', '道', '過', '還', '遠', '邊', '送', '通', '近',
    '連', '迎', '追', '遊', '運', '選', '速', '造', '建', '延',
  ];
  const BUILDS = [
    { char: '起', part: '\u5DF3', wrong: ['\u5DF1', '\u5DF2', '巴'] },
    { char: '趕', part: '旱', wrong: ['早', '\u5E72', '午'] },
    { char: '超', part: '召', wrong: ['刀', '口', '力'] },
    { char: '越', part: '\u6209', wrong: ['\u620A', '\u620C', '\u620D'] },
    { char: '趣', part: '取', wrong: ['耳', '又', '\u53CC'] },
  ];

  const TUG_STEP = 14;
  const TUG_LIMIT = 70;
  const TUG_FINALE = 125;
  const RUN_STEP = 36;
  const RUN_MIN = -2;
  const RUN_MAX = 15;
  const RUN_FINISH = 615;

  const $ = (id) => document.getElementById(id);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const fmtScore = (n) => (n < 0 ? `\u2212${Math.abs(n)}` : String(n));
  const restart = (el, cls) => {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  };

  // ---------- 聲音 ----------

  const Sound = (() => {
    let ctx = null;
    let muted = false;
    const unlock = () => {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) {
        ctx = null;
      }
    };
    const tone = (freq, at, dur, type = 'triangle', vol = 0.22, slideTo = 0) => {
      if (muted || !ctx) return;
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    return {
      unlock,
      setMuted(v) {
        muted = v;
      },
      isMuted: () => muted,
      right() {
        tone(660, 0, 0.12);
        tone(990, 0.09, 0.22);
      },
      wrong() {
        tone(240, 0, 0.3, 'square', 0.08, 130);
      },
      tick() {
        tone(1250, 0, 0.07, 'sine', 0.14);
      },
      count() {
        tone(520, 0, 0.16);
      },
      go() {
        tone(784, 0, 0.32);
        tone(1046, 0.02, 0.32, 'sine', 0.12);
      },
      win() {
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.13, 0.3));
      },
      draw() {
        tone(523, 0, 0.25);
        tone(523, 0.32, 0.35);
      },
    };
  })();

  // ---------- 遊戲時鐘（暫停時凍結） ----------

  const clock = { t: 0, last: 0, paused: false, timer: 0, tasks: [] };

  const after = (ms, fn) => {
    clock.tasks.push({ at: clock.t + ms, fn });
  };

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(now - clock.last, 1000);
    clock.last = now;
    if (clock.paused) return;
    clock.t += dt;
    const due = clock.tasks.filter((k) => k.at <= clock.t);
    if (due.length) {
      clock.tasks = clock.tasks.filter((k) => k.at > clock.t);
      due.forEach((k) => k.fn());
    }
    updateTimer();
  };

  const startClock = () => {
    stopClock();
    clock.t = 0;
    clock.last = performance.now();
    clock.paused = false;
    clock.timer = setInterval(tick, 50);
  };

  const stopClock = () => {
    clearInterval(clock.timer);
    clock.timer = 0;
    clock.tasks = [];
  };

  // ---------- 卡通人物 ----------

  const kidParts = (team, girl, pose) => {
    const shirt = team === 'red' ? '#f0524f' : '#3f86e8';
    const pants = '#3b4a66';
    const skin = '#ffd9b5';
    const hair = girl ? '#6b3d25' : '#2f2a28';

    const limb = (x1, y1, x2, y2, color, w) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w + 7}" stroke-linecap="round"/>` +
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    const leg = (cls, x, fx) =>
      `<g class="${cls}">${limb(x, -58, fx, -14, pants, 12)}` +
      `<ellipse cx="${fx + 5}" cy="-7" rx="13" ry="7" fill="#fff" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M ${fx - 2} -7 h 13" stroke="${shirt}" stroke-width="3" stroke-linecap="round"/></g>`;
    const arm = (cls, sx, sy, hx, hy) =>
      `<g class="${cls}">${limb(sx, sy, hx, hy, skin, 9)}` +
      `<circle cx="${hx}" cy="${hy}" r="7" fill="${skin}" stroke="${INK}" stroke-width="3.5"/>` +
      `<circle cx="${sx}" cy="${sy}" r="10" fill="${shirt}" stroke="${INK}" stroke-width="3.5"/></g>`;

    const body =
      `<rect x="-18" y="-68" width="36" height="17" rx="7" fill="${pants}" stroke="${INK}" stroke-width="4"/>` +
      `<rect x="-21" y="-106" width="42" height="48" rx="17" fill="${shirt}" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M -9 -105 L 0 -95 L 9 -105" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M 6 -88 l 3 6 l 6 1 l -4.5 4 l 1 6 l -5.5 -3 l -5.5 3 l 1 -6 l -4.5 -4 l 6 -1 z" fill="#ffd43b" stroke="${INK}" stroke-width="2"/>`;

    const mouth =
      pose === 'tug'
        ? `<g class="m-happy"><rect x="11" y="-124" width="17" height="9" rx="3.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>` +
          `<line x1="11.5" y1="-119.5" x2="27.5" y2="-119.5" stroke="${INK}" stroke-width="1.6"/></g>` +
          `<path class="m-cheer" d="M 7 -126 Q 19 -108 32 -126 Q 19 -114 7 -126 Z" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
          `<path d="M 5 -145 l 10 4 M 21 -142 l 9 -3" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`
        : `<path class="m-happy" d="M 11 -121 Q 19 -111 28 -122" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;

    const head =
      `<g class="head">` +
      (girl
        ? `<g class="pony"><path d="M -22 -152 C -52 -160 -62 -126 -48 -104 C -42 -122 -38 -136 -20 -140 Z" fill="${hair}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`
        : '') +
      `<circle cx="0" cy="-134" r="31" fill="${skin}" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="-9" cy="-130" r="7" fill="${skin}" stroke="${INK}" stroke-width="3.5"/>` +
      `<path d="M -29 -116 C -41 -146 -27 -169 2 -168 C 27 -167 37 -151 32 -137 C 22 -148 6 -152 -4 -147 C -10 -137 -17 -126 -29 -116 Z" fill="${hair}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      (girl ? `<circle cx="-22" cy="-149" r="6" fill="#ffd43b" stroke="${INK}" stroke-width="3"/>` : '') +
      `<ellipse cx="11" cy="-134" rx="3.8" ry="5.2" fill="${INK}"/><ellipse cx="24" cy="-134" rx="3.6" ry="5" fill="${INK}"/>` +
      `<circle cx="12.3" cy="-136" r="1.5" fill="#fff"/><circle cx="25.2" cy="-136" r="1.4" fill="#fff"/>` +
      `<circle cx="5" cy="-121" r="5.5" fill="#ff8fa0" opacity=".65"/><circle cx="29" cy="-122" r="4" fill="#ff8fa0" opacity=".65"/>` +
      mouth +
      `<ellipse class="m-oops" cx="19" cy="-116" rx="4.5" ry="5.5" fill="${INK}"/>` +
      `</g>`;

    if (pose === 'tug') {
      return (
        `<g class="feet">${leg('leg-b', -6, -26)}${leg('leg-f', 6, 22)}</g>` +
        body +
        head +
        arm('arm-b', -3, -90, 36, -80) +
        arm('arm-f', 5, -93, 41, -86)
      );
    }
    return (
      arm('arm arm-b', -3, -94, -3, -66) +
      leg('leg leg-b', -5, -5) +
      leg('leg leg-a', 5, 5) +
      body +
      head +
      arm('arm arm-a', 4, -94, 4, -66)
    );
  };

  const kid = ({ x, y, s = 1, flip = false, team, girl = false, pose, delay = 0 }) =>
    `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">` +
    `<g class="kid ${pose}" style="--d:${delay}s"><g class="lean">${kidParts(team, girl, pose)}</g></g></g>`;

  // ---------- 場景 ----------

  const skyBits = (id, h) =>
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#a5dcff"/><stop offset="1" stop-color="#eaf8ff"/></linearGradient></defs>` +
    `<rect width="800" height="${h}" fill="url(#${id})"/>` +
    `<g transform="translate(690 110)"><g class="sun-rays">` +
    Array.from({ length: 12 }, (_, i) => `<rect x="-5" y="-74" width="10" height="22" rx="5" fill="#ffd43b" transform="rotate(${i * 30})"/>`).join('') +
    `</g><circle r="44" fill="#ffd43b" stroke="${INK}" stroke-width="5"/>` +
    `<circle cx="-14" cy="-6" r="4" fill="${INK}"/><circle cx="14" cy="-6" r="4" fill="${INK}"/>` +
    `<path d="M -14 10 Q 0 22 14 10" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/></g>` +
    `<g class="cloud"><g transform="translate(90 120)">${cloudShape()}</g></g>` +
    `<g class="cloud slow"><g transform="translate(360 70) scale(.8)">${cloudShape()}</g></g>` +
    `<g class="flaglets">${bunting()}</g>`;

  function cloudShape() {
    return (
      `<path d="M 0 30 C -30 30 -30 0 -4 -2 C 0 -28 40 -32 50 -8 C 72 -16 92 6 78 30 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    );
  }

  function bunting() {
    const colors = ['#f0524f', '#ffd43b', '#3f86e8', '#4fd36a'];
    let out = `<path d="M -10 18 Q 400 64 810 18" fill="none" stroke="${INK}" stroke-width="3"/>`;
    for (let i = 0; i < 17; i++) {
      const x = 10 + i * 48;
      const t = x / 800;
      const y = 18 + 4 * 46 * t * (1 - t) + 2;
      out += `<path d="M ${x - 14} ${y} L ${x + 14} ${y} L ${x} ${y + 30} Z" fill="${colors[i % 4]}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    return out;
  }

  const tree = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-9" y="-50" width="18" height="52" rx="6" fill="#a8693a" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="0" cy="-82" r="44" fill="#5dbb4a" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="-16" cy="-92" r="10" fill="#7fd86a"/></g>`;

  const tugSceneSVG = () => {
    const ropeY = 534;
    return (
      `<svg class="scene" viewBox="0 0 800 760" preserveAspectRatio="xMidYMax meet" aria-hidden="true">` +
      skyBits('skyTug', 560) +
      `<ellipse cx="200" cy="572" rx="320" ry="70" fill="#a6dd82"/><ellipse cx="640" cy="580" rx="300" ry="64" fill="#a6dd82"/>` +
      tree(70, 566, 1) +
      tree(745, 566, 0.85) +
      `<rect y="560" width="800" height="200" fill="#8fd16a"/>` +
      `<rect y="560" width="800" height="12" fill="#7cc057"/>` +
      `<line x1="400" y1="566" x2="400" y2="760" stroke="#fff" stroke-width="9" stroke-dasharray="20 14"/>` +
      `<g id="tugMove">` +
      `<g class="team red" id="tugRed">` +
      kid({ x: 170, y: 640, s: 1.25, team: 'red', girl: false, pose: 'tug', delay: 0 }) +
      kid({ x: 280, y: 640, s: 1.25, team: 'red', girl: true, pose: 'tug', delay: -0.35 }) +
      `</g>` +
      `<g class="team blue" id="tugBlue">` +
      kid({ x: 630, y: 640, s: 1.25, flip: true, team: 'blue', girl: true, pose: 'tug', delay: -0.2 }) +
      kid({ x: 520, y: 640, s: 1.25, flip: true, team: 'blue', girl: false, pose: 'tug', delay: -0.55 }) +
      `</g>` +
      `<g class="rope-wobble">` +
      `<line x1="40" y1="${ropeY}" x2="760" y2="${ropeY}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>` +
      `<line x1="40" y1="${ropeY}" x2="760" y2="${ropeY}" stroke="#d29552" stroke-width="9" stroke-linecap="round"/>` +
      `<line x1="40" y1="${ropeY}" x2="760" y2="${ropeY}" stroke="#a5682f" stroke-width="9" stroke-dasharray="5 11"/>` +
      `<path d="M 400 ${ropeY} l -16 52 l 16 -12 l 16 12 z" fill="#ffd43b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="400" cy="${ropeY}" r="11" fill="#ff6b5e" stroke="${INK}" stroke-width="4"/>` +
      `</g></g></svg>`
    );
  };

  const LANES = { red: 345, blue: 545 };

  const raceLane = (team) => {
    const top = LANES[team];
    const mid = top + 98;
    const ribX = 748;
    return (
      `<g class="ribbon" id="rib-${team}">` +
      `<line x1="${ribX}" y1="${top + 6}" x2="${ribX}" y2="${top + 20}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` +
      `<line x1="${ribX}" y1="${top + 178}" x2="${ribX}" y2="${top + 192}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` +
      `<g class="rib-a"><line x1="${ribX}" y1="${top + 18}" x2="${ribX}" y2="${mid}" stroke="${INK}" stroke-width="11"/>` +
      `<line x1="${ribX}" y1="${top + 18}" x2="${ribX}" y2="${mid}" stroke="#ffd43b" stroke-width="6"/></g>` +
      `<g class="rib-b"><line x1="${ribX}" y1="${mid}" x2="${ribX}" y2="${top + 180}" stroke="${INK}" stroke-width="11"/>` +
      `<line x1="${ribX}" y1="${mid}" x2="${ribX}" y2="${top + 180}" stroke="#ffd43b" stroke-width="6"/></g>` +
      `</g>` +
      `<g class="team-run ${team}" id="run-${team}">` +
      `<g class="speed" stroke="#fff" stroke-width="6" stroke-linecap="round">` +
      `<line x1="40" y1="${top + 70}" x2="92" y2="${top + 70}"/><line x1="58" y1="${top + 100}" x2="104" y2="${top + 100}"/><line x1="36" y1="${top + 132}" x2="86" y2="${top + 132}"/></g>` +
      kid({ x: 130, y: top + 128, s: 0.85, team, girl: team === 'blue', pose: 'run', delay: 0 }) +
      kid({ x: 164, y: top + 180, s: 0.88, team, girl: team === 'red', pose: 'run', delay: -0.12 }) +
      `</g>`
    );
  };

  const raceSceneSVG = () => {
    const crowdColors = ['#f0524f', '#3f86e8', '#ffd43b', '#4fd36a', '#b07de0', '#ff9f43'];
    let crowd = '<g class="crowd">';
    for (let r = 0; r < 3; r++) {
      crowd += '<g>';
      for (let i = 0; i < 27; i++) {
        const cx = 14 + i * 30 + (r % 2) * 15;
        const cy = 196 + r * 40;
        crowd += `<circle cx="${cx}" cy="${cy}" r="12" fill="${crowdColors[(i + r * 2) % 6]}" stroke="${INK}" stroke-width="2.5"/>`;
      }
      crowd += '</g>';
    }
    crowd += '</g>';

    let checker = '';
    for (let y = 342; y < 738; y += 12) {
      checker += `<rect x="${(y / 12) % 2 ? 724 : 736}" y="${y}" width="12" height="12" fill="${INK}"/>`;
    }

    return (
      `<svg class="scene" viewBox="0 0 800 760" preserveAspectRatio="xMidYMax meet" aria-hidden="true">` +
      skyBits('skyRace', 330) +
      `<rect x="0" y="168" width="800" height="150" fill="#8d97ab" stroke="${INK}" stroke-width="4"/>` +
      `<rect x="0" y="168" width="800" height="12" fill="#6f7a90"/>` +
      crowd +
      `<rect y="318" width="800" height="24" fill="#8fd16a"/>` +
      `<rect y="342" width="800" height="400" fill="#e27b52"/>` +
      `<rect x="0" y="345" width="130" height="194" fill="#f0524f" opacity=".22"/>` +
      `<rect x="0" y="545" width="130" height="194" fill="#3f86e8" opacity=".22"/>` +
      `<g stroke="#fff" stroke-width="6"><line x1="0" y1="342" x2="800" y2="342"/><line x1="0" y1="542" x2="800" y2="542"/><line x1="0" y1="740" x2="800" y2="740"/></g>` +
      `<line x1="150" y1="342" x2="150" y2="740" stroke="#fff" stroke-width="8"/>` +
      `<rect x="724" y="342" width="24" height="398" fill="#fff"/>` +
      checker +
      raceLane('red') +
      raceLane('blue') +
      `</svg>`
    );
  };

  const cardTugSVG = () =>
    `<svg class="scene live" viewBox="0 0 420 250" aria-hidden="true">` +
    `<rect width="420" height="250" fill="#bfe6ff"/><rect y="190" width="420" height="60" fill="#8fd16a"/>` +
    `<line x1="210" y1="186" x2="210" y2="250" stroke="#fff" stroke-width="6" stroke-dasharray="12 9"/>` +
    kid({ x: 120, y: 226, s: 0.95, team: 'red', girl: true, pose: 'tug' }) +
    kid({ x: 300, y: 226, s: 0.95, flip: true, team: 'blue', pose: 'tug', delay: -0.4 }) +
    `<g class="rope-wobble"><line x1="20" y1="146" x2="400" y2="146" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>` +
    `<line x1="20" y1="146" x2="400" y2="146" stroke="#d29552" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="210" cy="146" r="9" fill="#ff6b5e" stroke="${INK}" stroke-width="3.5"/></g></svg>`;

  const cardRaceSVG = () =>
    `<svg class="scene live" viewBox="0 0 420 250" aria-hidden="true">` +
    `<rect width="420" height="250" fill="#bfe6ff"/><rect y="120" width="420" height="130" fill="#e27b52"/>` +
    `<g stroke="#fff" stroke-width="5"><line x1="0" y1="122" x2="420" y2="122"/><line x1="0" y1="186" x2="420" y2="186"/></g>` +
    `<rect x="370" y="120" width="16" height="130" fill="#fff"/>` +
    kid({ x: 170, y: 176, s: 0.78, team: 'red', pose: 'run' }) +
    kid({ x: 240, y: 238, s: 0.78, team: 'blue', girl: true, pose: 'run', delay: -0.15 }) +
    `</svg>`;

  // ---------- 狀態 ----------

  const S = {
    game: 'tug',
    phase: 'idle',
    playStart: 0,
    lastSec: null,
    teams: {},
  };

  const makeTeam = (id) => ({
    id,
    score: 0,
    log: [],
    q: null,
    prev: null,
    busy: false,
    panel: $(id === 'red' ? 'panelRed' : 'panelBlue'),
  });

  const otherOf = (team) => S.teams[team.id === 'red' ? 'blue' : 'red'];

  const show = (id) => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('is-active', el.id === id));
  };

  const stageRoot = () => $('stage');

  // ---------- 題目 ----------

  const deal = (team) => {
    const other = otherOf(team);
    const avoid = other.q ? other.q.target : null;
    if (S.game === 'tug') {
      const target = pick(ZOU_CHARS.filter((c) => c !== avoid && c !== team.prev));
      const look = pick(LOOKALIKES);
      const rest = shuffle(DISTRACTORS.filter((c) => c !== look)).slice(0, 2);
      team.q = { target, answer: target, options: shuffle([target, look, ...rest]) };
    } else {
      const b = pick(BUILDS.filter((x) => x.char !== avoid && x.char !== team.prev));
      team.q = { target: b.char, answer: b.part, options: shuffle([b.part, ...b.wrong]) };
    }
    team.prev = team.q.target;
    renderQuestion(team);
  };

  const buildPanel = (team) => {
    const p = team.panel;
    p.className = `panel ${team.id} ${S.game} locked`;
    p.innerHTML =
      `<div class="panel-tag">${TEAM_NAME[team.id]}</div>` +
      (S.game === 'race'
        ? `<div class="prompt"><span class="eq"><span class="g zou">走</span><span class="g plus">＋</span><span class="g slot">？</span></span><span class="g result"></span></div>`
        : '') +
      `<div class="options"></div><div class="float-layer"></div>`;
    const opts = p.querySelector('.options');
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt blank';
      b.disabled = true;
      b.setAttribute('aria-hidden', 'true');
      opts.appendChild(b);
    }
  };

  const renderQuestion = (team) => {
    const p = team.panel;
    const prompt = p.querySelector('.prompt');
    if (prompt) {
      prompt.classList.remove('merge', 'reveal');
      prompt.querySelector('.slot').textContent = '？';
      prompt.querySelector('.result').textContent = '';
    }
    const opts = p.querySelector('.options');
    opts.innerHTML = '';
    team.q.options.forEach((value, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt deal';
      b.textContent = value;
      b.style.animationDelay = `${i * 45}ms`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        choose(team, b, value);
      });
      b.addEventListener('click', (e) => {
        if (e.detail === 0) choose(team, b, value);
      });
      opts.appendChild(b);
    });
    p.classList.remove('locked');
  };

  const choose = (team, btn, value) => {
    if (S.phase !== 'play' || clock.paused || team.busy) return;
    team.busy = true;
    team.panel.classList.add('locked');

    const ok = value === team.q.answer;
    team.log.push({ ok, target: team.q.target, answer: team.q.answer, chosen: value });
    team.score += ok ? 1 : -1;

    updateScores(team);
    if (ok) showGain(team);
    else floatScore(team);
    moveStage();
    reactStage(team, ok);
    if (ok) Sound.right();
    else Sound.wrong();

    btn.classList.remove('deal');
    btn.style.animationDelay = '';
    btn.classList.add(ok ? 'is-right' : 'is-wrong');

    let wait = 700;
    if (ok && S.game === 'race') {
      const prompt = team.panel.querySelector('.prompt');
      prompt.querySelector('.slot').textContent = team.q.answer;
      prompt.classList.add('merge');
      after(480, () => {
        prompt.querySelector('.result').textContent = team.q.target;
        prompt.classList.add('reveal');
      });
      wait = 1450;
    }
    after(wait, () => {
      team.busy = false;
      if (S.phase === 'play') deal(team);
    });
  };

  // ---------- 畫面更新 ----------

  const updateScores = (changed) => {
    const red = $('scoreRed');
    const blue = $('scoreBlue');
    red.textContent = fmtScore(S.teams.red.score);
    blue.textContent = fmtScore(S.teams.blue.score);
    if (changed) restart(changed.id === 'red' ? red : blue, 'bump');
  };

  const floatScore = (team) => {
    const layer = team.panel.querySelector('.float-layer');
    const el = document.createElement('span');
    el.className = 'float bad';
    el.textContent = '\u22121';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  };

  const showGain = (team) => {
    const el = document.createElement('span');
    el.className = team.id;
    el.textContent = '+1';
    $('gain').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  };

  const moveStage = () => {
    const { red, blue } = S.teams;
    if (S.game === 'tug') {
      const off = clamp((blue.score - red.score) * TUG_STEP, -TUG_LIMIT, TUG_LIMIT);
      $('tugMove').style.transform = `translateX(${off}px)`;
    } else {
      [red, blue].forEach((t) => {
        const pos = clamp(t.score, RUN_MIN, RUN_MAX) * RUN_STEP;
        $(`run-${t.id}`).style.transform = `translateX(${pos}px)`;
      });
    }
  };

  const reactStage = (team, ok) => {
    if (S.game === 'tug') {
      const el = $(team.id === 'red' ? 'tugRed' : 'tugBlue');
      el.classList.remove('cheer', 'heave', 'stagger');
      restart(el, ok ? 'cheer' : 'stagger');
      after(ok ? 1100 : 620, () => el.classList.remove('cheer', 'heave', 'stagger'));
    } else {
      const el = $(`run-${team.id}`);
      el.classList.remove('boost', 'stumble');
      restart(el, ok ? 'boost' : 'stumble');
      after(650, () => el.classList.remove('boost', 'stumble'));
    }
  };

  const updateTimer = () => {
    const timer = $('timer');
    if (S.phase === 'ready') {
      timer.style.setProperty('--p', 1);
      return;
    }
    if (S.phase !== 'play') return;
    const rem = ROUND_MS - (clock.t - S.playStart);
    timer.style.setProperty('--p', Math.max(0, rem / ROUND_MS));
    const sec = Math.max(0, Math.ceil(rem / 1000));
    if (sec !== S.lastSec) {
      S.lastSec = sec;
      timer.textContent = String(sec);
      timer.classList.toggle('hurry', sec <= 10);
      if (sec <= 5 && sec > 0) Sound.tick();
    }
    if (rem <= 0) endRound();
  };

  const showBanner = (text, kind) => {
    const b = $('banner');
    b.textContent = text;
    b.className = `banner ${kind}`;
    restart(b, 'show');
  };

  const confetti = (team) => {
    const box = $('confetti');
    const colors = team === 'red' ? ['#f0524f', '#ffd43b', '#ff9aa2', '#fff'] : ['#3f86e8', '#ffd43b', '#9cc8ff', '#fff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${2.2 + Math.random() * 2}s`;
      c.style.animationDelay = `${Math.random() * 1.2}s`;
      box.appendChild(c);
    }
  };

  // ---------- 流程 ----------

  const startGame = (game) => {
    stopClock();
    S.game = game;
    S.phase = 'ready';
    S.lastSec = null;
    S.teams = { red: makeTeam('red'), blue: makeTeam('blue') };

    const stage = stageRoot();
    stage.className = `stage ready ${game}`;
    stage.innerHTML = game === 'tug' ? tugSceneSVG() : raceSceneSVG();
    buildPanel(S.teams.red);
    buildPanel(S.teams.blue);
    updateScores();
    moveStage();

    $('banner').className = 'banner';
    $('banner').textContent = '';
    $('confetti').innerHTML = '';
    $('readyCount').innerHTML = '';
    $('readyCount').classList.remove('show');
    const timer = $('timer');
    timer.textContent = String(ROUND_MS / 1000);
    timer.classList.remove('hurry');
    timer.style.setProperty('--p', 1);
    setPaused(false);

    show('game');
    startClock();

    [3, 2, 1].forEach((n, i) => {
      after(i * 1000, () => {
        const box = $('readyCount');
        box.classList.add('show');
        box.innerHTML = `<span>${n}</span><em>預備</em>`;
        Sound.count();
      });
    });
    after(READY_MS, beginPlay);
  };

  const beginPlay = () => {
    $('readyCount').innerHTML = '';
    $('readyCount').classList.remove('show');
    S.phase = 'play';
    S.playStart = clock.t;
    const stage = stageRoot();
    stage.classList.remove('ready');
    stage.classList.add('live');
    Sound.go();
    deal(S.teams.red);
    deal(S.teams.blue);
  };

  const endRound = () => {
    if (S.phase !== 'play') return;
    S.phase = 'over';
    $('timer').textContent = '0';
    $('timer').style.setProperty('--p', 0);
    Object.values(S.teams).forEach((t) => t.panel.classList.add('locked'));

    const stage = stageRoot();
    stage.classList.remove('live');
    stage.classList.add('over');

    const r = S.teams.red.score;
    const b = S.teams.blue.score;
    const winner = r > b ? 'red' : b > r ? 'blue' : null;

    if (!winner) {
      stage.classList.add('draw');
      showBanner('平手', 'draw');
      Sound.draw();
      after(3000, () => showSummary(null));
      return;
    }

    const loser = winner === 'red' ? 'blue' : 'red';
    showBanner(`${TEAM_NAME[winner]}勝出`, winner);
    Sound.win();

    if (S.game === 'tug') {
      const move = $('tugMove');
      move.classList.add('finale');
      move.style.transform = `translateX(${winner === 'red' ? -TUG_FINALE : TUG_FINALE}px)`;
      $(winner === 'red' ? 'tugRed' : 'tugBlue').classList.add('win');
      $(loser === 'red' ? 'tugRed' : 'tugBlue').classList.add('lose');
      after(900, () => confetti(winner));
    } else {
      const w = $(`run-${winner}`);
      w.classList.add('finale', 'dash');
      w.style.transform = `translateX(${RUN_FINISH}px)`;
      $(`run-${loser}`).classList.add('stopped');
      after(1050, () => {
        $(`rib-${winner}`).classList.add('broken');
        confetti(winner);
      });
      after(1550, () => {
        w.classList.remove('dash');
        w.classList.add('win');
      });
    }
    after(4300, () => showSummary(winner));
  };

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const crownSVG =
    `<svg class="crown" viewBox="0 0 64 48" aria-hidden="true"><path d="M 4 44 L 8 12 L 22 26 L 32 4 L 42 26 L 56 12 L 60 44 Z" fill="#ffd43b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="32" cy="32" r="5" fill="#f0524f" stroke="${INK}" stroke-width="2.5"/></svg>`;

  const showSummary = (winner) => {
    stopClock();
    S.phase = 'summary';
    $('sumGame').textContent = S.game === 'tug' ? '拔河' : '賽跑';
    const title = $('sumResult');
    title.textContent = winner ? `${TEAM_NAME[winner]}勝出` : '平手';
    title.className = `sum-result ${winner || 'draw'}`;

    $('sumCols').innerHTML = ['red', 'blue']
      .map((id) => {
        const t = S.teams[id];
        const right = t.log.filter((x) => x.ok);
        const rightItems = right
          .map((x, i) => `<li style="animation-delay:${i * 40}ms">${esc(x.target)}</li>`)
          .join('');
        return (
          `<article class="sum-team ${id}${winner === id ? ' champ' : ''}${right.length > 10 ? ' dense' : ''}">` +
          `<div class="sum-head"><span class="team-name">${TEAM_NAME[id]}</span>${winner === id ? crownSVG : ''}<span class="score">${fmtScore(t.score)}</span></div>` +
          `<ul class="sum-list">${rightItems}</ul>` +
          `</article>`
        );
      })
      .join('');
    show('summary');
  };

  const setPaused = (p) => {
    clock.paused = p;
    $('game').classList.toggle('paused', p);
    const btn = $('btnPause');
    btn.textContent = p ? '繼續' : '暫停';
    btn.classList.toggle('on', p);
  };

  const goMenu = () => {
    stopClock();
    S.phase = 'idle';
    setPaused(false);
    show('menu');
  };

  // ---------- 事件 ----------

  document.addEventListener('pointerdown', Sound.unlock, { passive: true });
  document.addEventListener('keydown', Sound.unlock);
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  $('cardTug').innerHTML = cardTugSVG();
  $('cardRace').innerHTML = cardRaceSVG();

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      Sound.unlock();
      startGame(card.dataset.game);
    });
  });

  $('btnPause').addEventListener('click', () => {
    if (S.phase === 'ready' || S.phase === 'play' || S.phase === 'over') setPaused(!clock.paused);
  });

  $('btnMute').addEventListener('click', () => {
    const m = !Sound.isMuted();
    Sound.setMuted(m);
    const btn = $('btnMute');
    btn.textContent = m ? '開音' : '靜音';
    btn.classList.toggle('on', m);
  });

  $('btnBack').addEventListener('click', goMenu);
  $('btnAgain').addEventListener('click', () => startGame(S.game));
  $('btnHome').addEventListener('click', goMenu);
})();
