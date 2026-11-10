(() => {
  let ctx;
  let muted = false;
  const tracks = {
    start: new Audio('/assets/%E6%B8%B8%E6%88%8F%E5%BC%80%E5%A7%8B%E5%87%86%E5%A4%87%E9%9F%B3%E4%B9%90.mp3'),
    game: new Audio('/assets/%E6%B8%B8%E6%88%8F%E8%BF%87%E7%A8%8B%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.mp3'),
    finish: new Audio('/assets/%E7%AD%94%E9%A2%98%E7%BB%93%E6%9D%9F%E6%8F%AD%E6%99%93%E5%86%A0%E5%86%9B%E9%9F%B3%E4%B9%90.mp3')
  };
  Object.values(tracks).forEach(track => { track.loop = true; track.volume = 0.25; });
  let currentTrack = null;
  let currentTrackName = 'start';
  let currentPhaseStartedAt = 0;
  let mediaUnlocked = false;
  let pendingTrack = null;
  let playRequestId = 0;
  let celebrationTimer = null;

  const style = document.createElement('style');
  style.textContent = `
    .confetti-layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 9999; }
    .confetti-piece { position: absolute; top: -24px; width: 10px; height: 16px; opacity: 0; animation: confetti-fall 1.8s cubic-bezier(.15,.75,.3,1) forwards; }
    @keyframes confetti-fall { 0% { opacity: 1; transform: translate3d(0, -20px, 0) rotate(0deg); } 100% { opacity: 0; transform: translate3d(var(--drift), 105vh, 0) rotate(var(--spin)); } }
  `;
  document.head.appendChild(style);

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(frequency, duration = 0.12, type = 'sine', volume = 0.04, delay = 0) {
    const ac = audio();
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(volume, ac.currentTime + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + duration);
    oscillator.connect(gain).connect(ac.destination);
    oscillator.start(ac.currentTime + delay);
    oscillator.stop(ac.currentTime + delay + duration + 0.02);
  }

  function playTrack(name, offsetMs = 0) {
    currentTrackName = name;
    currentTrack = tracks[name];
    if (muted || !currentTrack) return;
    if (!mediaUnlocked) {
      pendingTrack = { name, offsetMs };
      return;
    }
    const requestId = ++playRequestId;
    Object.values(tracks).forEach(track => { if (track !== currentTrack) { track.pause(); track.currentTime = 0; } });
    const play = () => {
      if (requestId !== playRequestId) return;
      if (Number.isFinite(currentTrack.duration) && currentTrack.duration > 0) currentTrack.currentTime = (offsetMs / 1000) % currentTrack.duration;
      currentTrack.play().catch(() => {});
    };
    if (currentTrack.readyState >= 1) play();
    else currentTrack.addEventListener('loadedmetadata', play, { once: true });
  }

  function unlockMedia() {
    if (mediaUnlocked) {
      audio();
      return;
    }
    audio();
    const probe = tracks.start;
    probe.muted = true;
    const result = probe.play();
    const finish = () => {
      probe.pause();
      probe.currentTime = 0;
      probe.muted = false;
      mediaUnlocked = true;
      if (pendingTrack) {
        const next = pendingTrack;
        pendingTrack = null;
        playTrack(next.name, next.offsetMs);
      }
    };
    if (result && typeof result.then === 'function') result.then(finish).catch(() => { mediaUnlocked = true; });
    else finish();
  }

  function createConfettiBurst() {
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const colors = ['#facc15', '#f97316', '#ef4444', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];
    ['left', 'right'].forEach(side => {
      for (let i = 0; i < 24; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = side === 'left' ? `${Math.random() * 18}%` : `${82 + Math.random() * 18}%`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = `${Math.random() * 0.35}s`;
        piece.style.setProperty('--drift', `${(Math.random() * 180 - 90).toFixed(0)}px`);
        piece.style.setProperty('--spin', `${(Math.random() * 900 - 450).toFixed(0)}deg`);
        layer.appendChild(piece);
      }
    });
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 2600);
  }

  window.quizFx = {
    init: audio,
    unlock: unlockMedia,
    click: () => tone(520, 0.07, 'sine', 0.025),
    start: () => { unlockMedia(); tone(392, 0.12, 'triangle', 0.045); tone(523.25, 0.2, 'triangle', 0.045, 0.1); },
    setPhase: (phase, startedAt = 0) => {
      currentPhaseStartedAt = startedAt || Date.now();
      playTrack(phase, Math.max(0, Date.now() - currentPhaseStartedAt));
    },
    game: () => playTrack('game'),
    finish: () => playTrack('finish'),
    correct: () => { tone(523.25, 0.12, 'sine', 0.05); tone(659.25, 0.18, 'sine', 0.05, 0.11); },
    wrong: () => { tone(220, 0.2, 'sawtooth', 0.035); tone(174.61, 0.25, 'sawtooth', 0.03, 0.12); },
    toggleMute: () => {
      audio();
      muted = !muted;
      if (muted) {
        Object.values(tracks).forEach(track => track.pause());
      } else {
        const offset = currentPhaseStartedAt ? Math.max(0, Date.now() - currentPhaseStartedAt) : 0;
        playTrack(currentTrackName, offset);
      }
      return muted;
    },
    celebrate: () => {
      if (celebrationTimer) return;
      const spray = () => {
        createConfettiBurst();
        celebrationTimer = setTimeout(spray, 1200 + Math.random() * 2600);
      };
      spray();
    },
    stopCelebration: () => {
      if (celebrationTimer) clearTimeout(celebrationTimer);
      celebrationTimer = null;
      document.querySelectorAll('.confetti-layer').forEach(layer => layer.remove());
    }
  };
  window.addEventListener('beforeunload', () => window.quizFx.stopCelebration());
})();
