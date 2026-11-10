const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// 内存中的房间数据（重启会丢失，适合演示）
const rooms = new Map();
const QUESTION_TIME_LIMIT = 15;
const avatars = ['😀', '😎', '🤩', '🥳', '🦊', '🐼', '🐸', '🦄', '🐯', '🐨', '🚀', '🌟'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// 找到本机可供局域网设备访问的 IPv4 地址。
function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

// 生成 6 位房间码
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function readQuestionCell(row, names) {
  const key = Object.keys(row).find((name) => names.includes(String(name).replace(/^\uFEFF/, '').trim().toLowerCase()));
  return key === undefined ? '' : row[key];
}

function parseCorrectIndex(value) {
  const text = String(value ?? '').trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(text)) return text.charCodeAt(0) - 65;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 && number <= 3 ? number : -1;
}

// CSV 模板列：题目、选项A、选项B、选项C、选项D、正确答案、答题时间
app.post('/api/import-questions', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传 .csv 文件' });
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const questions = rows.map((row) => {
      const options = [
        readQuestionCell(row, ['选项a', '选项 A', 'a', 'optiona']),
        readQuestionCell(row, ['选项b', '选项 B', 'b', 'optionb']),
        readQuestionCell(row, ['选项c', '选项 C', 'c', 'optionc']),
        readQuestionCell(row, ['选项d', '选项 D', 'd', 'optiond'])
      ].map(String);
      return {
        text: String(readQuestionCell(row, ['题目', '问题', 'question', 'text'])).trim(),
        options,
        correctIndex: parseCorrectIndex(readQuestionCell(row, ['正确答案', '答案', 'correctanswer', 'correctindex'])),
        timeLimit: Number(readQuestionCell(row, ['答题时间', '时间', 'timelimit', 'time'])) || 20
      };
    }).filter((question) => question.text && question.options.every((option) => option.trim()) && question.correctIndex >= 0);

    if (!questions.length) return res.status(400).json({ error: '没有找到有效题目，请检查表头和内容' });
    res.json({ questions });
  } catch (error) {
    console.error('Question import failed:', error);
    res.status(400).json({ error: 'CSV 文件读取失败，请确认文件格式正确' });
  }
});

// 创建房间
app.post('/api/create-room', async (req, res) => {
  const { quizTitle, questions } = req.body;
  
  if (!questions || questions.length === 0) {
    return res.status(400).json({ error: '至少需要一道题' });
  }

  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    title: quizTitle || '知识竞赛',
    questions: questions.map((question) => ({ ...question, timeLimit: 15 })),
    players: new Map(),
    hostId: null,
    currentQuestionIndex: -1,
    status: 'waiting', // waiting | question | reveal | finished
    phase: 'start',
    phaseStartedAt: Date.now(),
    questionStartTime: null,
    questionTimer: null,
    answers: new Map(), // questionIndex -> Map(playerId -> {answer, time})
  };

  rooms.set(code, room);

  // 生成二维码（玩家加入地址）
  // 默认生成局域网二维码，方便手机访问；部署到公网时可设置 PUBLIC_URL 覆盖它。
  const baseUrl = process.env.PUBLIC_URL || `http://${getLanAddress()}:${PORT}`;
  const joinUrl = `${baseUrl.replace(/\/$/, '')}/play.html?code=${code}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 300, margin: 2 });
  } catch (e) {
    console.error('QR generation failed', e);
  }

  res.json({
    code,
    joinUrl,
    qrDataUrl
  });
});

// 获取房间信息（不包含答案）
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: '房间不存在' });

  res.json({
    code: room.code,
    title: room.title,
    status: room.status,
    playerCount: room.players.size,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length
  });
});

io.on('connection', (socket) => {
  console.log('连接:', socket.id);

  // 主持人加入房间
  socket.on('host-join', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    room.hostId = socket.id;
    socket.join(code.toUpperCase());
    socket.emit('host-joined', {
      code: room.code,
      title: room.title,
      questions: room.questions,
      players: Array.from(room.players.values()),
      phase: room.phase,
      phaseStartedAt: room.phaseStartedAt
    });
    socket.emit('game-phase', { phase: room.phase, startedAt: room.phaseStartedAt });
  });

  // 音乐从创建房间时开始；点击开始只同步当前开始阶段，不重置音乐进度。
  socket.on('start-game', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    io.to(room.code).emit('game-phase', { phase: room.phase, startedAt: room.phaseStartedAt });
  });

  // 玩家加入
  socket.on('player-join', ({ code, nickname, avatar }) => {
    const roomCode = code?.toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: '房间不存在或已结束' });
      return;
    }

    const playerId = uuidv4();
    const player = {
      id: playerId,
      nickname: nickname?.trim() || `玩家${Math.floor(Math.random()*1000)}`,
      avatar: avatars.includes(avatar) ? avatar : avatars[0],
      score: 0,
      socketId: socket.id
    };

    room.players.set(playerId, player);
    socket.join(roomCode);
    socket.data.playerId = playerId;
    socket.data.roomCode = roomCode;

    // 通知本人
    socket.emit('joined', {
      playerId,
      nickname: player.nickname,
      avatar: player.avatar,
      code: roomCode,
      title: room.title
    });

    // 广播给房间所有人（包括主持人）
    io.to(roomCode).emit('player-list', Array.from(room.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score
    })));
    socket.emit('game-phase', { phase: room.phase, startedAt: room.phaseStartedAt });
  });

  // 主持人开始游戏 / 下一题
  socket.on('next-question', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    if (room.status === 'finished') return;
    if (room.currentQuestionIndex >= 0 && room.status !== 'reveal') return;

    room.currentQuestionIndex += 1;

    if (room.currentQuestionIndex >= room.questions.length) {
      room.status = 'finished';
      // 最终排名
      const ranking = Array.from(room.players.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({
          rank: i + 1,
          nickname: p.nickname,
          avatar: p.avatar,
          score: p.score
        }));
      io.to(code.toUpperCase()).emit('game-over', { ranking });
      return;
    }

    const q = room.questions[room.currentQuestionIndex];
    room.status = 'question';
    room.questionStartTime = Date.now();
    room.phase = 'game';
    room.phaseStartedAt = room.questionStartTime;
    room.answers.set(room.currentQuestionIndex, new Map());

    // 发给玩家（不带正确答案）
    const playerQuestion = {
      index: room.currentQuestionIndex,
      total: room.questions.length,
      text: q.text,
      options: q.options,
      timeLimit: QUESTION_TIME_LIMIT,
      startedAt: room.questionStartTime
    };

    // 发给主持人（带正确答案，方便控制）
    io.to(code.toUpperCase()).emit('game-phase', { phase: room.phase, startedAt: room.phaseStartedAt });
    io.to(code.toUpperCase()).emit('question', playerQuestion);
    
    // 单独给主持人更多信息
    socket.emit('question-host', {
      ...playerQuestion,
      correctIndex: q.correctIndex
    });
    room.questionTimer = setTimeout(() => expireQuestion(room), QUESTION_TIME_LIMIT * 1000);
  });

  // 玩家提交答案
  socket.on('submit-answer', ({ answerIndex }) => {
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!roomCode || !playerId) return;

    const room = rooms.get(roomCode);
    if (!room || room.status !== 'question') return;

    const qIndex = room.currentQuestionIndex;
    const answersMap = room.answers.get(qIndex);
    if (!answersMap || answersMap.has(playerId)) return; // 已答过

    const now = Date.now();
    const elapsed = (now - room.questionStartTime) / 1000;
    const q = room.questions[qIndex];
    const timeLimit = QUESTION_TIME_LIMIT;

    if (elapsed >= timeLimit) return;

    const isCorrect = answerIndex === q.correctIndex;
    let points = 0;
    if (isCorrect) {
      // 速度加分：答对基础分 + 剩余时间比例加分
      const base = 500;
      const speedBonus = Math.max(0, Math.floor((1 - elapsed / timeLimit) * 500));
      points = base + speedBonus;
    }

    answersMap.set(playerId, { answerIndex, time: elapsed, isCorrect, points });

    const player = room.players.get(playerId);
    if (player) {
      player.score += points;
    }

    const optionStats = q.options.map((_, idx) => {
      let count = 0;
      for (const answer of answersMap.values()) if (answer.answerIndex === idx) count++;
      return count;
    });
    io.to(roomCode).emit('answer-progress', {
      nickname: player?.nickname || '玩家',
      avatar: player?.avatar || avatars[0],
      answerIndex,
      optionStats,
      answeredCount: answersMap.size
    });

    // 通知该玩家自己的得分
    socket.emit('answer-result', {
      isCorrect,
      points,
      correctIndex: q.correctIndex,
      yourScore: player ? player.score : 0
    });

    // 更新排行榜给所有人
    const ranking = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
        .map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score }));
    io.to(roomCode).emit('score-update', ranking);
  });

  function expireQuestion(room) {
    if (!room || room.status !== 'question') return;
    if (room.currentQuestionIndex === room.questions.length - 1) {
      if (room.questionTimer) clearTimeout(room.questionTimer);
      room.questionTimer = null;
      room.status = 'reveal-ready';
      io.to(room.code).emit('final-reveal-ready');
      return;
    }
    revealRoom(room);
  }

  function revealRoom(room) {
    if (!room || !['question', 'reveal-ready'].includes(room.status)) return;
    if (room.questionTimer) clearTimeout(room.questionTimer);
    room.questionTimer = null;
    room.status = 'reveal';

    const qIndex = room.currentQuestionIndex;
    const q = room.questions[qIndex];
    const answersMap = room.answers.get(qIndex) || new Map();
    const optionStats = q.options.map((_, idx) => {
      let count = 0;
      for (const answer of answersMap.values()) if (answer.answerIndex === idx) count++;
      return count;
    });
    const ranking = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => ({ nickname: p.nickname, avatar: p.avatar, score: p.score }));

    io.to(room.code).emit('reveal', { correctIndex: q.correctIndex, optionStats, ranking });

    if (qIndex === room.questions.length - 1) {
      room.status = 'finished';
      room.phase = 'finish';
      room.phaseStartedAt = Date.now();
      io.to(room.code).emit('game-phase', { phase: room.phase, startedAt: room.phaseStartedAt });
      const finalRanking = Array.from(room.players.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ rank: i + 1, nickname: p.nickname, avatar: p.avatar, score: p.score }));
      io.to(room.code).emit('game-over', { ranking: finalRanking });
    }
  }

  // 兼容主持人主动揭晓；正式流程会在 15 秒到点自动揭晓。
  socket.on('reveal-answer', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    revealRoom(room);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (roomCode && playerId) {
      const room = rooms.get(roomCode);
      if (room) {
        room.players.delete(playerId);
        io.to(roomCode).emit('player-list', Array.from(room.players.values()).map(p => ({
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          score: p.score
        })));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 多人答题系统已启动: http://localhost:${PORT}`);
  console.log(`📱 主持人请打开: http://localhost:${PORT}/host.html`);
  console.log(`👥 玩家请打开:   http://localhost:${PORT}/play.html\n`);
});
