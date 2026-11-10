(() => {
  let ctx;
  let muted = false;
  const tracks = {
    start: new Audio('/assets/%E6%B8%B8%E6%88%8F%E5%BC%80%E5%A7%8B%E5%87%86%E5%A4%87%E9%9F%B3%E4%B9%90.mp3'),
    game: new Audio('/assets/%E6%B8%B8%E6%88%8F%E8%BF%87%E7%A8%8B%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.mp3'),
    finish: new Audio('/assets/%E7%AD%94%E9%A2%98%E7%BB%93%E6%9D%9F%E6%8F%AD%E6%99%93%E5%86%A0%E5%86%9B%E9%9F%B3%E4%B9%90.mp3')
  };
  const sounds = {
    answerClick: new Audio('/assets/%E5%8F%82%E4%B8%8E%E8%80%85%E7%82%B9%E5%87%BB%E9%80%89%E6%8B%A9%E7%AD%94%E6%A1%88%E9%9F%B3%E6%95%88.mp3'),
    questionStart: new Audio('/assets/%E4%B8%BB%E6%8C%81%E4%BA%BA%E5%BC%80%E5%A7%8B%E6%AF%8F%E4%B8%80%E9%81%93%E9%A2%98%E9%9F%B3%E6%95%88.mp3'),
    questionEnd: new Audio('/assets/%E6%9C%AC%E9%A2%98%E7%AD%94%E9%A2%98%E7%BB%93%E6%9D%9F%E5%80%92%E8%AE%A1%E6%97%B6%E9%9F%B3%E6%95%88.mp3'),
    correct: new Audio('/assets/%E6%9C%AC%E9%A2%98%E7%AD%94%E9%A2%98%E6%AD%A3%E7%A1%AE%E9%9F%B3%E6%95%88.mp3'),
    wrong: new Audio('/assets/%E6%9C%AC%E9%A2%98%E7%AD%94%E9%A2%98%E9%94%99%E8%AF%AF%E9%9F%B3%E6%95%88.mp3')
  };
  Object.values(sounds).forEach(sound => { sound.volume = 0.55; });
  Object.values(tracks).forEach(track => { track.loop = true; track.volume = 0.25; });
  let currentTrack = null;
  let currentTrackName = 'start';
  let currentPhaseStartedAt = 0;
  let mediaUnlocked = false;
  let pendingTrack = null;
  let playRequestId = 0;
  let celebrationTimer = null;
  let musicRampTimer = null;
  let sfxResumeTrack = null;
  const MUSIC_VOLUME = 0.25;

  const style = document.createElement('style');
  style.textContent = `
    .confetti-layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 9999; }
    .confetti-piece { position: absolute; width: 10px; height: 16px; opacity: 0; animation: confetti-fall 1.8s cubic-bezier(.15,.75,.3,1) forwards; }
    @keyframes confetti-fall { 0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); } 100% { opacity: 0; transform: translate3d(var(--drift), var(--rise), 0) rotate(var(--spin)); } }
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
      if (currentTrack.volume === 0) currentTrack.volume = MUSIC_VOLUME;
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
    const media = [...Object.values(tracks), ...Object.values(sounds)];
    const probes = media.map(item => {
      item.muted = true;
      return item.play().catch(() => {});
    });
    const finish = () => {
      media.forEach(item => {
        item.pause();
        item.currentTime = 0;
        item.muted = false;
      });
      mediaUnlocked = true;
      if (pendingTrack) {
        const next = pendingTrack;
        pendingTrack = null;
        playTrack(next.name, next.offsetMs);
      }
    };
    Promise.all(probes).then(finish).catch(() => { mediaUnlocked = true; });
  }

  function rampMusic(target, duration = 280) {
    if (musicRampTimer) clearInterval(musicRampTimer);
    const start = Object.values(tracks)[0]?.volume ?? MUSIC_VOLUME;
    const startedAt = Date.now();
    musicRampTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const volume = start + (target - start) * progress;
      Object.values(tracks).forEach(track => { track.volume = volume; });
      if (progress >= 1) { clearInterval(musicRampTimer); musicRampTimer = null; }
    }, 30);
  }

  function playSound(name) {
    const sound = sounds[name];
    if (muted || !sound) return;
    sfxResumeTrack = currentTrack && !currentTrack.paused ? currentTrack : null;
    if (musicRampTimer) clearInterval(musicRampTimer);
    Object.values(tracks).forEach(track => { track.volume = 0; if (track !== sfxResumeTrack) track.pause(); });
    if (sfxResumeTrack) sfxResumeTrack.pause();
    sound.currentTime = 0;
    const restore = () => {
      if (sfxResumeTrack && !muted && currentTrack === sfxResumeTrack) {
        sfxResumeTrack.volume = 0;
        sfxResumeTrack.play().catch(() => {});
        rampMusic(MUSIC_VOLUME, 420);
      }
      sfxResumeTrack = null;
    };
    sound.addEventListener('ended', restore, { once: true });
    sound.play().catch(restore);
  }

  function createConfettiBurst() {
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const colors = ['#facc15', '#f97316', '#ef4444', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];
    ['left', 'right'].forEach(side => {
      for (let i = 0; i < 24; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = side === 'left' ? '0%' : '100%';
        piece.style.top = `${68 + Math.random() * 14}%`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = `${Math.random() * 0.35}s`;
        piece.style.setProperty('--drift', `${side === 'left' ? (220 + Math.random() * 380) : -(220 + Math.random() * 380)}px`);
        piece.style.setProperty('--rise', `${-(260 + Math.random() * 420)}px`);
        piece.style.setProperty('--spin', `${(side === 'left' ? 45 : -45) + (Math.random() * 30 - 15)}deg`);
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
    answerClick: () => playSound('answerClick'),
    start: () => { unlockMedia(); tone(392, 0.12, 'triangle', 0.045); tone(523.25, 0.2, 'triangle', 0.045, 0.1); },
    questionStart: () => playSound('questionStart'),
    questionEnd: () => playSound('questionEnd'),
    setPhase: (phase, startedAt = 0) => {
      currentPhaseStartedAt = startedAt || Date.now();
      playTrack(phase, Math.max(0, Date.now() - currentPhaseStartedAt));
    },
    game: () => playTrack('game'),
    finish: () => playTrack('finish'),
    correct: () => playSound('correct'),
    wrong: () => playSound('wrong'),
    toggleMute: () => {
      audio();
      muted = !muted;
      if (muted) {
        Object.values(tracks).forEach(track => track.pause());
        Object.values(sounds).forEach(sound => sound.pause());
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
