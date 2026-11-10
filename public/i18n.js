(() => {
  const dict = {
    zh: {
      homeTitle: '多人实时答题', tagline: 'Huat ah! 让答题变成一场刺激的抢分挑战！扫码即玩，拼知识、拼速度、拼反应，看看谁才是真正的答题之王！', homeSubtitle: '类似 Kahoot 的实时抢分游戏<br>支持扫码加入 · 速度加分 · 实时排行', host: '我是主持人（出题开房）', player: '我是玩家（加入游戏）', musicOn: '🔊 音乐开启', musicOff: '🔇 音乐静音', footer: '本地运行 · 局域网多人可用<br>部署到公网后即可真正在线多人玩',
      backHome: '← 返回首页', join: '🎮 加入游戏', joinButton: '加入', roomCode: '输入6位房间码', nickname: '你的昵称', chooseAvatar: '选择你的头像',
      hostConsole: '🎯 主持人控制台', activityTitle: '活动标题', importTitle: '一键导入题目（CSV 格式）', importButton: '导入 CSV 题库', downloadTemplate: '下载题目模板', addQuestion: '+ 添加题目', createRoom: '创建房间并生成二维码', roomCodeTitle: '房间码', startFirst: '开始第一题', backPrevious: '← 返回上一步', online: '人在线',
      language: 'EN', joinedRoom: '已成功加入房间', waitingHost: '等待主持人开始...', currentRanking: '本题当前排名', finalRanking: '🏆 最终排名', myFinalScore: '我的最终成绩', currentTotal: '当前总分', resultWaiting: '等待揭晓答案……', answering: '答题进行中', questionEnded: '本题结束', speedRanking: '答题速度实时排名', scoreRanking: '目前答题积分排名', questionList: '题目列表（可添加多道）', playerJoined: '已加入玩家：', hostJoinHint: '让玩家用手机扫描上方二维码，或打开 /play.html 输入房间码', deleteQuestion: '删除这道题', answerOptions: '选项（选中正确选项）', noAnswer: '未作答', correct: '回答正确！', wrong: '回答错误'
    },
    en: {
      homeTitle: 'Live Quiz Arena', tagline: 'Huat ah! Turn every quiz into an exciting scoring challenge! Scan to play, test your knowledge, speed and reactions, and see who becomes the quiz champion!', homeSubtitle: 'A Kahoot-style live scoring game<br>Scan to join · Speed bonuses · Live leaderboard', host: 'I’m the Host (Create Game)', player: 'I’m a Player (Join Game)', musicOn: '🔊 Music On', musicOff: '🔇 Music Muted', footer: 'Run locally · Works for multiplayer on the same network<br>Deploy publicly for online multiplayer',
      backHome: '← Home', join: '🎮 Join Game', joinButton: 'Join', roomCode: 'Enter 6-digit room code', nickname: 'Your nickname', chooseAvatar: 'Choose your avatar',
      hostConsole: '🎯 Host Console', activityTitle: 'Quiz title', importTitle: 'Import questions (CSV)', importButton: 'Import CSV', downloadTemplate: 'Download template', addQuestion: '+ Add question', createRoom: 'Create room & QR code', roomCodeTitle: 'Room code', startFirst: 'Start first question', backPrevious: '← Previous step', online: 'online',
      language: '中文', joinedRoom: 'Joined the room', waitingHost: 'Waiting for the host to start...', currentRanking: 'Current ranking', finalRanking: '🏆 Final ranking', myFinalScore: 'My final score', currentTotal: 'Current total', resultWaiting: 'Waiting for the answer...', answering: 'Question in progress', questionEnded: 'Question ended', speedRanking: 'Live speed ranking', scoreRanking: 'Current score ranking', questionList: 'Question list', playerJoined: 'Players joined:', hostJoinHint: 'Scan the QR code or open /play.html and enter the room code', deleteQuestion: 'Delete question', answerOptions: 'Options (select the correct answer)', noAnswer: 'No answer', correct: 'Correct!', wrong: 'Incorrect'
    }
  };
  let lang = localStorage.getItem('quiz-language') || 'zh';
  function apply() {
    const t = dict[lang];
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t[el.dataset.i18n] ?? el.innerHTML; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t[el.dataset.i18nPlaceholder] ?? el.placeholder; });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t[el.dataset.i18nTitle] ?? el.title; });
    document.querySelectorAll('[data-language-toggle]').forEach(el => { el.textContent = `🌐 ${t.language}`; });
    window.dispatchEvent(new Event('languagechange'));
  }
  function toggle() { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('quiz-language', lang); apply(); }
  window.quizI18n = { toggle, apply, getLanguage: () => lang, t: key => dict[lang][key] || key };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
