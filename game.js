// =============================================
// 舍我棋谁 - 核心游戏逻辑
// =============================================

(function () {
  'use strict';

  // ========== 常量 ==========
  const GRID_SIZE = 10;
  const TIMER_DURATION = 10;
  const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const PRESET_EMOJIS = [
    '😀', '😎', '🤖', '🦊', '🐱', '🐶', '🦁', '🐼',
    '🐸', '🦄', '👻', '🎃', '🐲', '🦋', '🌟', '🔥'
  ];
  const PLAYER_COLORS = ['#4A90D9', '#E74C3C'];
  const PLACEMENT_COLORS = ['rgba(74, 144, 217, 0.5)', 'rgba(231, 76, 60, 0.5)'];

  // ========== 游戏状态 ==========
  const gameState = {
    phase: 'setup',
    players: [
      { name: '', avatar: '', avatarType: '', cellCount: 0 },
      { name: '', avatar: '', avatarType: '', cellCount: 0 }
    ],
    grid: [],
    currentPlayer: 0,
    timerStart: 0,
    timerInterval: null,
    skipCount: 0,
    placementPhase: false,
    placementPlayer: 0,
    placedPositions: [null, null],
    placementTimer: null,
    hasCollided: false,
    explosionCounts: [] // 记录每个格子的爆炸次数
  };

  // ========== DOM 缓存 ==========
  const dom = {};

  function cacheDom() {
    dom.screens = {
      setup: document.getElementById('setup-screen'),
      game: document.getElementById('game-screen'),
      result: document.getElementById('result-screen')
    };
    dom.startBtn = document.getElementById('start-btn');
    dom.restartBtn = document.getElementById('restart-btn');
    dom.grid = document.getElementById('grid');
    dom.timerBar = document.getElementById('timer-bar');
    dom.timerText = document.getElementById('timer-text');
    dom.turnIndicator = document.getElementById('turn-indicator');
    dom.fireworksCanvas = document.getElementById('fireworks-canvas');
    dom.resultTitle = document.getElementById('result-title');
    dom.resultScore = document.getElementById('result-score');
    dom.winnerAvatar = document.getElementById('winner-avatar');
    dom.loserAvatar = document.getElementById('loser-avatar');
    dom.bonkEffect = document.getElementById('bonk-effect');

    for (let i = 0; i < 2; i++) {
      dom['avatarPreview' + i] = document.getElementById('avatar-preview-' + i);
      dom['nameInput' + i] = document.getElementById('name-input-' + i);
      dom['emojiGrid' + i] = document.getElementById('emoji-grid-' + i);
      dom['headerAvatar' + i] = document.getElementById('header-avatar-' + i);
      dom['headerName' + i] = document.getElementById('header-name-' + i);
      dom['headerScore' + i] = document.getElementById('header-score-' + i);
      dom['playerInfo' + i] = document.getElementById('player-info-' + i);
    }
  }

  // ========== 屏幕管理 ==========
  function showScreen(name) {
    Object.values(dom.screens).forEach(s => s.classList.remove('active'));
    dom.screens[name].classList.add('active');
  }

  // ========== 设置屏幕 ==========
  function initSetupScreen() {
    for (let p = 0; p < 2; p++) {
      buildEmojiGrid(p);
      const fileInput = document.querySelector(`.file-input[data-player="${p}"]`);
      fileInput.addEventListener('change', (e) => handleFileUpload(p, e));
      dom['nameInput' + p].addEventListener('input', validateSetup);
    }
    dom.startBtn.addEventListener('click', startGame);
  }

  function buildEmojiGrid(playerIdx) {
    const container = dom['emojiGrid' + playerIdx];
    container.innerHTML = '';
    PRESET_EMOJIS.forEach(emoji => {
      const el = document.createElement('div');
      el.className = 'emoji-option';
      el.textContent = emoji;
      el.addEventListener('click', () => selectEmoji(playerIdx, emoji, el));
      container.appendChild(el);
    });
  }

  function selectEmoji(playerIdx, emoji, el) {
    const container = dom['emojiGrid' + playerIdx];
    container.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');

    gameState.players[playerIdx].avatar = emoji;
    gameState.players[playerIdx].avatarType = 'emoji';

    const preview = dom['avatarPreview' + playerIdx];
    preview.innerHTML = emoji;
    preview.classList.add('has-avatar');
    validateSetup();
  }

  function handleFileUpload(playerIdx, event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      compressImage(e.target.result, (dataURL) => {
        gameState.players[playerIdx].avatar = dataURL;
        gameState.players[playerIdx].avatarType = 'image';

        const preview = dom['avatarPreview' + playerIdx];
        preview.innerHTML = `<img src="${dataURL}" alt="avatar">`;
        preview.classList.add('has-avatar');

        // 清除 emoji 选中状态
        dom['emojiGrid' + playerIdx].querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
        validateSetup();
      });
    };
    reader.readAsDataURL(file);
  }

  function compressImage(dataURL, callback) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 64, 64);
      callback(canvas.toDataURL('image/png'));
    };
    img.src = dataURL;
  }

  function validateSetup() {
    const p0Valid = gameState.players[0].avatar && dom.nameInput0.value.trim().length >= 2;
    const p1Valid = gameState.players[1].avatar && dom.nameInput1.value.trim().length >= 2;
    dom.startBtn.disabled = !(p0Valid && p1Valid);
  }

  // ========== 游戏开始 ==========
  function startGame() {
    gameState.players[0].name = dom.nameInput0.value.trim();
    gameState.players[1].name = dom.nameInput1.value.trim();
    gameState.phase = 'placement';
    gameState.placementPhase = true;
    gameState.placementPlayer = 0;
    gameState.placedPositions = [null, null];
    gameState.currentPlayer = 0;
    gameState.skipCount = 0;

    initGridForPlacement();
    updateHeader();
    showScreen('game');
    updatePlacementUI();
  }

  // ========== 位置选择阶段 ==========
  function initGridForPlacement() {
    // 初始化空网格和爆炸计数
    gameState.grid = [];
    gameState.explosionCounts = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      gameState.grid[r] = [];
      gameState.explosionCounts[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        gameState.grid[r][c] = 0;
        gameState.explosionCounts[r][c] = 0;
      }
    }

    gameState.players[0].cellCount = 0;
    gameState.players[1].cellCount = 0;

    // 生成 DOM
    dom.grid.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell placement-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        dom.grid.appendChild(cell);
      }
    }

    // 移除旧的事件监听并添加新的
    const newGrid = dom.grid.cloneNode(true);
    dom.grid.parentNode.replaceChild(newGrid, dom.grid);
    dom.grid = newGrid;
    dom.grid.addEventListener('click', handlePlacementClick);
  }

  function handlePlacementClick(e) {
    if (!gameState.placementPhase) return;

    const cell = e.target.closest('.cell');
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    // 检查该位置是否已被占用
    if (gameState.grid[row][col] !== 0) return;

    const playerIdx = gameState.placementPlayer;
    const opponentIdx = 1 - playerIdx;
    
    // 检查与对方位置的距离（必须间隔至少一个格子）
    const opponentPos = gameState.placedPositions[opponentIdx];
    if (opponentPos) {
      const distance = Math.abs(row - opponentPos.row) + Math.abs(col - opponentPos.col);
      if (distance <= 2) {
        // 距离太近，显示提示
        showPlacementWarning('距离对方太近，请重新选择！');
        return;
      }
    }
    
    // 如果该玩家已经放置过，先清除之前的位置
    if (gameState.placedPositions[playerIdx]) {
      const oldPos = gameState.placedPositions[playerIdx];
      gameState.grid[oldPos.row][oldPos.col] = 0;
      updatePlacementCell(oldPos.row, oldPos.col);
    }

    // 在新位置放置
    gameState.grid[row][col] = playerIdx + 1;
    gameState.placedPositions[playerIdx] = { row, col };
    updatePlacementCell(row, col);
    
    // 清除之前的定时器
    if (gameState.placementTimer) {
      clearTimeout(gameState.placementTimer);
    }
    
    // 立即切换或开始游戏
    const nextPlayer = 1 - playerIdx;
    const countdownEl = document.getElementById('placement-countdown');
    
    if (nextPlayer === 1 && !gameState.placedPositions[1]) {
      // 切换到玩家二
      if (countdownEl) {
        countdownEl.textContent = `${gameState.players[playerIdx].name} 已选择，轮到玩家二`;
      }
      gameState.placementTimer = setTimeout(() => {
        gameState.placementPlayer = 1;
        updatePlacementUI();
      }, 500);
    } else if (playerIdx === 1) {
      // 玩家二已选择，立即开始游戏
      if (countdownEl) {
        countdownEl.textContent = '双方已就绪，游戏开始！';
      }
      gameState.placementTimer = setTimeout(() => {
        startGameplay();
      }, 500);
    }
  }

  // 显示位置选择警告
  function showPlacementWarning(message) {
    let warning = document.getElementById('placement-warning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'placement-warning';
      warning.className = 'placement-warning';
      dom.grid.parentNode.insertBefore(warning, dom.grid);
    }
    warning.textContent = message;
    warning.classList.add('show');
    
    setTimeout(() => {
      warning.classList.remove('show');
    }, 1500);
  }
  
  function startGameplayWithDelay() {
    const countdownEl = document.getElementById('placement-countdown');
    let countdown = 3;
    
    if (countdownEl) {
      countdownEl.textContent = `游戏将在 ${countdown} 秒后开始...`;
    }
    
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl && countdown > 0) {
        countdownEl.textContent = `游戏将在 ${countdown} 秒后开始...`;
      }
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        if (countdownEl) countdownEl.textContent = '';
      }
    }, 1000);
    
    gameState.placementTimer = setTimeout(() => {
      clearInterval(countdownInterval);
      startGameplay();
    }, 3000);
  }

  function updatePlacementCell(row, col) {
    const cell = dom.grid.children[row * GRID_SIZE + col];
    const val = gameState.grid[row][col];
    
    cell.className = 'cell placement-cell';
    cell.innerHTML = '';

    if (val === 0) return;

    const playerIdx = val - 1;
    const player = gameState.players[playerIdx];
    cell.classList.add(val === 1 ? 'player1' : 'player2');
    cell.classList.add('placement-occupied');

    if (player.avatarType === 'emoji') {
      cell.textContent = player.avatar;
    } else {
      cell.innerHTML = `<img src="${player.avatar}" alt="">`;
    }
  }

  function validatePlacement() {
    // 检查两个玩家是否都已放置
    const bothPlaced = gameState.placedPositions[0] !== null && gameState.placedPositions[1] !== null;
    
    // 更新UI显示确认按钮
    let confirmBtn = document.getElementById('placement-confirm-btn');
    if (!confirmBtn) {
      confirmBtn = document.createElement('button');
      confirmBtn.id = 'placement-confirm-btn';
      confirmBtn.className = 'btn-primary placement-confirm-btn';
      confirmBtn.textContent = '确认位置，开始游戏';
      confirmBtn.addEventListener('click', startGameplay);
      dom.grid.parentNode.insertBefore(confirmBtn, dom.grid.nextSibling);
    }
    confirmBtn.disabled = !bothPlaced;
    confirmBtn.style.opacity = bothPlaced ? '1' : '0.4';
  }

  function updatePlacementUI() {
    const playerIdx = gameState.placementPlayer;
    const player = gameState.players[playerIdx];
    
    // 更新回合指示器
    dom.turnIndicator.textContent = `${player.name} 请选择初始位置`;
    
    // 高亮当前玩家的信息栏
    for (let i = 0; i < 2; i++) {
      dom['playerInfo' + i].classList.toggle('active-turn', i === playerIdx);
      dom['playerInfo' + i].classList.toggle('placement-active', i === playerIdx);
    }

    // 更新网格提示样式
    Array.from(dom.grid.children).forEach(cell => {
      cell.classList.remove('placement-target-p1', 'placement-target-p2');
      if (gameState.grid[parseInt(cell.dataset.row)][parseInt(cell.dataset.col)] === 0) {
        cell.classList.add(playerIdx === 0 ? 'placement-target-p1' : 'placement-target-p2');
      }
    });
    
    // 添加倒计时显示
    let countdownEl = document.getElementById('placement-countdown');
    if (!countdownEl) {
      countdownEl = document.createElement('div');
      countdownEl.id = 'placement-countdown';
      countdownEl.className = 'placement-countdown';
      dom.grid.parentNode.insertBefore(countdownEl, dom.grid.nextSibling);
    }
    countdownEl.textContent = `${player.name} 请选择位置...`;
  }

  function startGameplay() {
    gameState.placementPhase = false;
    gameState.phase = 'playing';
    gameState.hasCollided = false;
    
    // 移除确认按钮和倒计时
    const confirmBtn = document.getElementById('placement-confirm-btn');
    if (confirmBtn) confirmBtn.remove();
    const countdownEl = document.getElementById('placement-countdown');
    if (countdownEl) countdownEl.remove();

    // 更新格子样式
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = dom.grid.children[r * GRID_SIZE + c];
        cell.classList.remove('placement-cell', 'placement-target-p1', 'placement-target-p2', 'placement-active');
        const val = gameState.grid[r][c];
        if (val !== 0) {
          cell.classList.add('pop-in');
        }
      }
    }

    // 重新绑定点击事件
    const newGrid = dom.grid.cloneNode(true);
    dom.grid.parentNode.replaceChild(newGrid, dom.grid);
    dom.grid = newGrid;
    dom.grid.addEventListener('click', handleCellClick);

    // 更新计数
    recountCells();
    updateScoreboard();
    
    // 随机决定谁先开始
    gameState.currentPlayer = Math.random() < 0.5 ? 0 : 1;
    updateHeader();
    startTimer();
  }

  // ========== 网格系统 ==========
  function initGrid() {
    // 初始化数据
    gameState.grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      gameState.grid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        gameState.grid[r][c] = 0;
      }
    }

    // 使用已选择的位置
    if (gameState.placedPositions[0]) {
      const p0 = gameState.placedPositions[0];
      gameState.grid[p0.row][p0.col] = 1;
    }
    if (gameState.placedPositions[1]) {
      const p1 = gameState.placedPositions[1];
      gameState.grid[p1.row][p1.col] = 2;
    }

    gameState.players[0].cellCount = gameState.placedPositions[0] ? 1 : 0;
    gameState.players[1].cellCount = gameState.placedPositions[1] ? 1 : 0;

    // 生成 DOM
    dom.grid.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        dom.grid.appendChild(cell);
        updateCellDOM(r, c, cell);
      }
    }

    // 事件委托
    dom.grid.addEventListener('click', handleCellClick);
  }

  function getCellDOM(row, col) {
    return dom.grid.children[row * GRID_SIZE + col];
  }

  function updateCellDOM(row, col, cellEl) {
    const val = gameState.grid[row][col];
    const cell = cellEl || getCellDOM(row, col);
    cell.className = 'cell';
    cell.innerHTML = '';

    if (val === 0) return;
    
    // 弹坑
    if (val === -1) {
      cell.classList.add('crater');
      return;
    }

    const playerIdx = val - 1;
    const player = gameState.players[playerIdx];
    cell.classList.add(val === 1 ? 'player1' : 'player2');

    if (player.avatarType === 'emoji') {
      cell.textContent = player.avatar;
    } else {
      cell.innerHTML = `<img src="${player.avatar}" alt="">`;
    }
  }

  // ========== 点击处理 ==========
  function handleCellClick(e) {
    if (gameState.phase !== 'playing') return;

    const cell = e.target.closest('.cell');
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const cellValue = gameState.grid[row][col];

    // 必须点击当前玩家自己的格子
    if (cellValue !== gameState.currentPlayer + 1) return;

    // 向四个方向扩展
    let expanded = false;
    const expandedPositions = [];
    const coveredPositions = []; // 记录覆盖对方的位置
    
    DIRECTIONS.forEach(([dr, dc]) => {
      const nr = row + dr;
      const nc = col + dc;
      if (isInBounds(nr, nc)) {
        const targetValue = gameState.grid[nr][nc];
        
        // 跳过弹坑（-1）
        if (targetValue === -1) return;
        
        // 如果目标格子是空的或者是对方的，都可以扩展
        if (targetValue === 0) {
          gameState.grid[nr][nc] = gameState.currentPlayer + 1;
          const newCell = getCellDOM(nr, nc);
          updateCellDOM(nr, nc, newCell);
          newCell.classList.add('pop-in');
          newCell.classList.add(gameState.currentPlayer === 0 ? 'glow-p1' : 'glow-p2');
          expanded = true;
          expandedPositions.push({ row: nr, col: nc });
        } else if (targetValue !== gameState.currentPlayer + 1) {
          // 覆盖对方的格子
          coveredPositions.push({ row: nr, col: nc, wasPlayer: targetValue });
        }
      }
    });

    if (!expanded && coveredPositions.length === 0) return; // 无法扩展

    // 处理覆盖爆炸
    if (coveredPositions.length > 0) {
      handleCoverExplosion(coveredPositions);
    } else {
      // 没有覆盖，检查是否首次相邻碰撞
      checkFirstCollision(expandedPositions);
    }

    // 更新计分
    recountCells();
    updateScoreboard();

    // 检查游戏结束
    if (checkGameEnd()) return;

    // 切换回合
    gameState.skipCount = 0;
    switchTurn();
  }

  // 处理覆盖爆炸效果
  function handleCoverExplosion(coveredPositions) {
    const craterPositions = [];
    const normalExplosions = [];
    
    // 先统计爆炸次数
    coveredPositions.forEach(pos => {
      gameState.explosionCounts[pos.row][pos.col]++;
      const count = gameState.explosionCounts[pos.row][pos.col];
      
      if (count >= 3) {
        // 第三次爆炸，变成弹坑
        craterPositions.push(pos);
      } else {
        // 普通爆炸
        normalExplosions.push(pos);
      }
    });
    
    // 处理普通爆炸
    if (normalExplosions.length > 0) {
      showBoomEffect(false); // 普通红色BOOM
      
      normalExplosions.forEach(pos => {
        const cell = getCellDOM(pos.row, pos.col);
        const player = gameState.players[coveredPositions.find(p => p.row === pos.row && p.col === pos.col).wasPlayer - 1];
        
        createAvatarFragments(pos.row, pos.col, player);
        cell.classList.add('cover-explosion');
      });
      
      setTimeout(() => {
        normalExplosions.forEach(pos => {
          gameState.grid[pos.row][pos.col] = 0;
          const cell = getCellDOM(pos.row, pos.col);
          cell.className = 'cell';
          cell.innerHTML = '';
        });
        recountCells();
        updateScoreboard();
      }, 500);
    }
    
    // 处理弹坑爆炸
    if (craterPositions.length > 0) {
      showBoomEffect(true); // 黑色BOOM
      
      craterPositions.forEach(pos => {
        const cell = getCellDOM(pos.row, pos.col);
        const player = gameState.players[coveredPositions.find(p => p.row === pos.row && p.col === pos.col).wasPlayer - 1];
        
        createAvatarFragments(pos.row, pos.col, player);
        cell.classList.add('crater-explosion');
      });
      
      setTimeout(() => {
        craterPositions.forEach(pos => {
          gameState.grid[pos.row][pos.col] = -1; // -1 表示弹坑
          const cell = getCellDOM(pos.row, pos.col);
          cell.className = 'cell crater';
          cell.innerHTML = '';
        });
        recountCells();
        updateScoreboard();
      }, 500);
    }
  }

  // 创建头像碎片爆炸效果
  function createAvatarFragments(row, col, player) {
    const cell = getCellDOM(row, col);
    const rect = cell.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // 创建碎片容器
    const fragmentContainer = document.createElement('div');
    fragmentContainer.className = 'fragment-container';
    fragmentContainer.style.cssText = `
      position: fixed;
      left: ${centerX}px;
      top: ${centerY}px;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2000;
    `;
    document.body.appendChild(fragmentContainer);
    
    // 创建4个碎片（四分五裂）
    const fragmentCount = 4;
    for (let i = 0; i < fragmentCount; i++) {
      const fragment = document.createElement('div');
      fragment.className = 'avatar-fragment';
      
      // 根据玩家设置碎片内容
      if (player.avatarType === 'emoji') {
        fragment.textContent = player.avatar;
        fragment.style.cssText = `
          position: absolute;
          font-size: 16px;
          opacity: 1;
          clip-path: ${getClipPath(i)};
        `;
      } else {
        fragment.style.cssText = `
          position: absolute;
          width: 20px;
          height: 20px;
          background-image: url(${player.avatar});
          background-size: cover;
          opacity: 1;
          clip-path: ${getClipPath(i)};
        `;
      }
      
      fragmentContainer.appendChild(fragment);
      
      // 计算飞散方向（四个对角方向）
      const angle = (Math.PI / 4) + (Math.PI / 2) * i; // 45°, 135°, 225°, 315°
      const velocity = 80 + Math.random() * 40;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      const rotation = (Math.random() - 0.5) * 720;
      
      // 动画
      fragment.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(0.3)`, opacity: 0 }
      ], {
        duration: 600,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      });
    }
    
    // 清理
    setTimeout(() => fragmentContainer.remove(), 600);
  }

  // 获取裁剪路径（四分）
  function getClipPath(index) {
    const clips = [
      'polygon(0 0, 50% 0, 50% 50%, 0 50%)',      // 左上
      'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)', // 右上
      'polygon(0 50%, 50% 50%, 50% 100%, 0 100%)', // 左下
      'polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)' // 右下
    ];
    return clips[index];
  }

  // 显示 BOOM 效果
  function showBoomEffect(isCrater = false) {
    const boom = document.createElement('div');
    boom.className = isCrater ? 'boom-effect crater-boom' : 'boom-effect';
    boom.textContent = 'BOOM!';
    document.body.appendChild(boom);
    
    // 触发重绘
    requestAnimationFrame(() => {
      boom.classList.add('show');
    });
    
    // 0.5秒后消失
    setTimeout(() => {
      boom.classList.remove('show');
      setTimeout(() => boom.remove(), 200);
    }, 500);
  }

  // 检查是否首次相邻碰撞
  function checkFirstCollision(expandedPositions) {
    if (gameState.hasCollided) return;
    
    const currentPlayer = gameState.currentPlayer;
    const opponent = 1 - currentPlayer;
    let collisionDetected = false;
    
    for (const pos of expandedPositions) {
      // 检查新扩展的格子四周是否有对方玩家
      for (const [dr, dc] of DIRECTIONS) {
        const nr = pos.row + dr;
        const nc = pos.col + dc;
        if (isInBounds(nr, nc) && gameState.grid[nr][nc] === opponent + 1) {
          collisionDetected = true;
          break;
        }
      }
      if (collisionDetected) break;
    }
    
    if (collisionDetected) {
      gameState.hasCollided = true;
      showAngryEffect(opponent);
    }
  }

  // 检查是否首次相邻碰撞
  function checkFirstCollision(expandedPositions) {
    if (gameState.hasCollided) return;
    
    const currentPlayer = gameState.currentPlayer;
    const opponent = 1 - currentPlayer;
    let collisionDetected = false;
    
    for (const pos of expandedPositions) {
      // 检查新扩展的格子四周是否有对方玩家
      for (const [dr, dc] of DIRECTIONS) {
        const nr = pos.row + dr;
        const nc = pos.col + dc;
        if (isInBounds(nr, nc) && gameState.grid[nr][nc] === opponent + 1) {
          collisionDetected = true;
          break;
        }
      }
      if (collisionDetected) break;
    }
    
    if (collisionDetected) {
      gameState.hasCollided = true;
      showAngryEffect(opponent);
    }
  }

  // 显示生气特效
  function showAngryEffect(playerIdx) {
    const avatarEl = dom['headerAvatar' + playerIdx];
    const playerInfo = dom['playerInfo' + playerIdx];
    
    // 添加抖动效果
    avatarEl.classList.add('shake-angry');
    playerInfo.classList.add('shake-angry');
    
    // 添加生气表情
    let angryEmoji = document.getElementById('angry-emoji-' + playerIdx);
    if (!angryEmoji) {
      angryEmoji = document.createElement('div');
      angryEmoji.id = 'angry-emoji-' + playerIdx;
      angryEmoji.className = 'angry-emoji';
      angryEmoji.textContent = '😠';
      playerInfo.appendChild(angryEmoji);
    }
    angryEmoji.classList.add('show');
    
    // 2秒后移除效果
    setTimeout(() => {
      avatarEl.classList.remove('shake-angry');
      playerInfo.classList.remove('shake-angry');
      if (angryEmoji) angryEmoji.classList.remove('show');
    }, 2000);
  }

  function isInBounds(r, c) {
    return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  }

  function recountCells() {
    let count0 = 0, count1 = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (gameState.grid[r][c] === 1) count0++;
        else if (gameState.grid[r][c] === 2) count1++;
      }
    }
    gameState.players[0].cellCount = count0;
    gameState.players[1].cellCount = count1;
  }

  function canPlayerMove(playerIdx) {
    const val = playerIdx + 1;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (gameState.grid[r][c] !== val) continue;
        for (const [dr, dc] of DIRECTIONS) {
          const nr = r + dr;
          const nc = c + dc;
          // 可以移动到空格或对方格子，但不能是弹坑
          if (isInBounds(nr, nc) && gameState.grid[nr][nc] !== -1 && 
              (gameState.grid[nr][nc] === 0 || gameState.grid[nr][nc] !== val)) return true;
        }
      }
    }
    return false;
  }

  // ========== 回合与计时器 ==========
  function switchTurn() {
    gameState.currentPlayer = 1 - gameState.currentPlayer;
    
    // 在位置选择阶段切换玩家
    if (gameState.placementPhase) {
      gameState.placementPlayer = gameState.currentPlayer;
      updatePlacementUI();
      return;
    }
    
    updateHeader();

    // 检查新的当前玩家能否操作
    if (!canPlayerMove(gameState.currentPlayer)) {
      gameState.skipCount++;
      if (gameState.skipCount >= 2 || !canPlayerMove(1 - gameState.currentPlayer)) {
        endGame();
        return;
      }
      // 跳过并切换到对方
      gameState.currentPlayer = 1 - gameState.currentPlayer;
      updateHeader();
    }

    startTimer();
  }

  function startTimer() {
    stopTimer();
    gameState.timerStart = Date.now();
    updateTimerUI(TIMER_DURATION);

    gameState.timerInterval = setInterval(() => {
      const elapsed = (Date.now() - gameState.timerStart) / 1000;
      const remaining = Math.max(0, TIMER_DURATION - elapsed);
      updateTimerUI(remaining);

      if (remaining <= 0) {
        stopTimer();
        // 超时，跳过回合
        gameState.skipCount++;
        if (gameState.skipCount >= 2) {
          endGame();
          return;
        }
        switchTurn();
      }
    }, 100);
  }

  function stopTimer() {
    if (gameState.timerInterval) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
    }
  }

  function updateTimerUI(remaining) {
    const pct = (remaining / TIMER_DURATION) * 100;
    dom.timerBar.style.width = pct + '%';
    dom.timerText.textContent = remaining.toFixed(1);

    dom.timerBar.classList.remove('warning', 'danger');
    dom.timerText.classList.remove('danger');

    if (remaining <= 3) {
      dom.timerBar.classList.add('danger');
      dom.timerText.classList.add('danger');
    } else if (remaining <= 5) {
      dom.timerBar.classList.add('warning');
    }
  }

  // ========== 顶部信息栏 ==========
  function updateHeader() {
    for (let i = 0; i < 2; i++) {
      const player = gameState.players[i];
      dom['headerName' + i].textContent = player.name;

      const avatarEl = dom['headerAvatar' + i];
      if (player.avatarType === 'emoji') {
        avatarEl.innerHTML = player.avatar;
      } else {
        avatarEl.innerHTML = `<img src="${player.avatar}" alt="">`;
      }

      dom['playerInfo' + i].classList.toggle('active-turn', i === gameState.currentPlayer);
    }
    updateScoreboard();

    const currentName = gameState.players[gameState.currentPlayer].name;
    dom.turnIndicator.textContent = currentName + ' 的回合';
  }

  function updateScoreboard() {
    dom.headerScore0.textContent = gameState.players[0].cellCount;
    dom.headerScore1.textContent = gameState.players[1].cellCount;
  }

  // ========== 游戏结束 ==========
  function checkGameEnd() {
    // 计算弹坑数量
    let craterCount = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (gameState.grid[r][c] === -1) craterCount++;
      }
    }
    
    const total = gameState.players[0].cellCount + gameState.players[1].cellCount + craterCount;
    if (total >= GRID_SIZE * GRID_SIZE) {
      endGame();
      return true;
    }

    // 双方都无法操作
    if (!canPlayerMove(0) && !canPlayerMove(1)) {
      endGame();
      return true;
    }
    return false;
  }

  function endGame() {
    gameState.phase = 'ended';
    stopTimer();

    const p0 = gameState.players[0];
    const p1 = gameState.players[1];
    const isDraw = p0.cellCount === p1.cellCount;
    const winnerIdx = p0.cellCount > p1.cellCount ? 0 : 1;
    const loserIdx = 1 - winnerIdx;

    if (isDraw) {
      dom.resultTitle.textContent = '平局！';
      dom.resultTitle.className = 'result-title draw';
      dom.resultScore.textContent = `${p0.cellCount} : ${p1.cellCount}`;
      // 平局时不播敲击动画
      dom.winnerAvatar.style.animation = 'none';
      dom.loserAvatar.style.animation = 'none';
      dom.bonkEffect.style.display = 'none';
      renderResultAvatar(dom.winnerAvatar, gameState.players[0]);
      renderResultAvatar(dom.loserAvatar, gameState.players[1]);
    } else {
      const winner = gameState.players[winnerIdx];
      const loser = gameState.players[loserIdx];

      dom.resultTitle.textContent = winner.name + ' 获胜！';
      dom.resultTitle.className = 'result-title';
      dom.resultScore.textContent = `${winner.cellCount} : ${loser.cellCount}`;

      // 胜者头像
      renderResultAvatar(dom.winnerAvatar, winner);
      dom.winnerAvatar.style.animation = '';

      // 败者头像 + 哭泣
      renderResultAvatar(dom.loserAvatar, loser);
      dom.loserAvatar.style.animation = '';
      const cryOverlay = document.createElement('div');
      cryOverlay.className = 'cry-overlay';
      cryOverlay.textContent = '😭';
      dom.loserAvatar.appendChild(cryOverlay);

      // 碰撞特效
      dom.bonkEffect.style.display = '';
      dom.bonkEffect.textContent = '💥';
    }

    showScreen('result');
    startFireworks();
  }

  function renderResultAvatar(container, player) {
    container.innerHTML = '';
    if (player.avatarType === 'emoji') {
      container.textContent = player.avatar;
    } else {
      container.innerHTML = `<img src="${player.avatar}" alt="">`;
    }
  }

  // ========== 烟花粒子系统 ==========
  let fireworksAnimationId = null;

  function startFireworks() {
    const canvas = dom.fireworksCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const particles = [];
    const startTime = Date.now();
    const FIREWORKS_DURATION = 8000;
    let lastFireworkTime = 0;

    function createFirework(x, y) {
      const hue = Math.random() * 360;
      const count = 30 + Math.floor(Math.random() * 30);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 2 + Math.random() * 4;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.01 + Math.random() * 0.015,
          color: `hsl(${hue + Math.random() * 40 - 20}, 100%, ${60 + Math.random() * 20}%)`,
          size: 2 + Math.random() * 2
        });
      }
    }

    function animate() {
      const now = Date.now();
      const elapsed = now - startTime;

      ctx.fillStyle = 'rgba(15, 15, 26, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 限制粒子数量
      if (elapsed < FIREWORKS_DURATION && now - lastFireworkTime > 400 + Math.random() * 400 && particles.length < 500) {
        createFirework(
          Math.random() * canvas.width * 0.8 + canvas.width * 0.1,
          Math.random() * canvas.height * 0.5 + canvas.height * 0.1
        );
        lastFireworkTime = now;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // 重力
        p.vx *= 0.99;
        p.life -= p.decay;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (elapsed < FIREWORKS_DURATION || particles.length > 0) {
        fireworksAnimationId = requestAnimationFrame(animate);
      }
    }

    animate();
  }

  function stopFireworks() {
    if (fireworksAnimationId) {
      cancelAnimationFrame(fireworksAnimationId);
      fireworksAnimationId = null;
    }
    const ctx = dom.fireworksCanvas.getContext('2d');
    ctx.clearRect(0, 0, dom.fireworksCanvas.width, dom.fireworksCanvas.height);
  }

  // ========== 重新开始 ==========
  function resetGame() {
    stopFireworks();
    stopTimer();
    
    // 清除位置选择定时器
    if (gameState.placementTimer) {
      clearTimeout(gameState.placementTimer);
      gameState.placementTimer = null;
    }
    
    gameState.phase = 'setup';
    gameState.currentPlayer = 0;
    gameState.skipCount = 0;
    gameState.placementPhase = false;
    gameState.placementPlayer = 0;
    gameState.placedPositions = [null, null];
    gameState.hasCollided = false;
    gameState.players[0] = { name: '', avatar: '', avatarType: '', cellCount: 0 };
    gameState.players[1] = { name: '', avatar: '', avatarType: '', cellCount: 0 };
    
    // 移除确认按钮和倒计时
    const confirmBtn = document.getElementById('placement-confirm-btn');
    if (confirmBtn) confirmBtn.remove();
    const countdownEl = document.getElementById('placement-countdown');
    if (countdownEl) countdownEl.remove();
    
    // 移除生气表情
    for (let i = 0; i < 2; i++) {
      const angryEmoji = document.getElementById('angry-emoji-' + i);
      if (angryEmoji) angryEmoji.remove();
    }

    // 重置设置界面
    for (let i = 0; i < 2; i++) {
      dom['avatarPreview' + i].innerHTML = '?';
      dom['avatarPreview' + i].classList.remove('has-avatar');
      dom['nameInput' + i].value = '';
      dom['emojiGrid' + i].querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
      // 重置 file input
      const fileInput = document.querySelector(`.file-input[data-player="${i}"]`);
      fileInput.value = '';
    }
    dom.startBtn.disabled = true;

    // 清除网格事件监听
    dom.grid.replaceWith(dom.grid.cloneNode(false));
    dom.grid = document.getElementById('grid');

    showScreen('setup');
  }

  // ========== 初始化 ==========
  function init() {
    cacheDom();
    initSetupScreen();
    dom.restartBtn.addEventListener('click', resetGame);

    // 窗口大小变化时更新烟花 canvas 尺寸
    window.addEventListener('resize', () => {
      if (gameState.phase === 'ended') {
        dom.fireworksCanvas.width = window.innerWidth;
        dom.fireworksCanvas.height = window.innerHeight;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
