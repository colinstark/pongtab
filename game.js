const CHANNEL_NAME = 'tab-pong-game';
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 12;
const PADDLE_SPEED = 8;
const BALL_SPEED_INITIAL = 5;
const WIN_SCORE = 5;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const infoEl = document.getElementById('info');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');

const tabId = crypto.randomUUID();
let playerRole = null;
let isGameActive = false;
let isPaused = false;
let pauseReason = null;
let connectedTabs = new Set([tabId]);
let previousZone = null;

const channel = new BroadcastChannel(CHANNEL_NAME);

const gameState = {
  ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 },
  paddles: { p1: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, p2: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
  scores: { p1: 0, p2: 0 },
  lastUpdate: Date.now()
};

const keys = { up: false, down: false };

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function broadcast(type, data = {}) {
  console.log('[BROADCAST] Sending:', type, 'playerRole:', playerRole);
  channel.postMessage({ type, tabId, playerRole, data, timestamp: Date.now() });
}

function broadcastFullState() {
  broadcast('state-sync', { gameState: JSON.parse(JSON.stringify(gameState)) });
}

function resetBall(direction = 1, toSide = null) {
  if (toSide === 1) {
    gameState.ball.x = CANVAS_WIDTH / 4;
    gameState.ball.y = CANVAS_HEIGHT / 2;
  } else if (toSide === 2) {
    gameState.ball.x = CANVAS_WIDTH * 3 / 4;
    gameState.ball.y = CANVAS_HEIGHT / 2;
  } else {
    gameState.ball.x = CANVAS_WIDTH / 2;
    gameState.ball.y = CANVAS_HEIGHT / 2;
  }
  const angle = (Math.random() - 0.5) * Math.PI / 3;
  gameState.ball.vx = Math.cos(angle) * BALL_SPEED_INITIAL * direction;
  gameState.ball.vy = Math.sin(angle) * BALL_SPEED_INITIAL;
}

function assignRole() {
  console.log('[ROLE] assignRole called - current role:', playerRole, 'tabs:', Array.from(connectedTabs));
  if (playerRole !== null) return;
  if (connectedTabs.size < 2) {
    console.log('[ROLE] Not enough tabs yet, waiting...');
    return;
  }

  const allTabs = Array.from(connectedTabs).sort();
  const otherId = allTabs.find(id => id !== tabId);
  console.log('[ROLE] allTabs:', allTabs, 'myId:', tabId, 'otherId:', otherId);

  if (tabId < otherId) {
    playerRole = 1;
    console.log('[ROLE] I have smaller ID, assigning Player 1');
  } else {
    playerRole = 2;
    console.log('[ROLE] I have larger ID, assigning Player 2');
  }

  console.log('[ROLE] Final assigned role:', playerRole);

  if (playerRole === 1) {
    infoEl.textContent = 'You are Player 1 (LEFT) - Mouse or W/S / Arrow keys';
    document.querySelector('.player1').classList.add('active');
  } else if (playerRole === 2) {
    infoEl.textContent = 'You are Player 2 (RIGHT) - Mouse or W/S / Arrow keys';
    document.querySelector('.player2').classList.add('active');
  } else {
    infoEl.textContent = 'Spectator mode - Game is full';
  }
}

function checkGameState() {
  console.log('[CHECK] connectedTabs:', connectedTabs.size, 'isGameActive:', isGameActive);
  if (connectedTabs.size >= 2 && !isGameActive) {
    console.log('[CHECK] Starting game!');
    startGame();
  } else if (connectedTabs.size < 2 && isGameActive) {
    console.log('[CHECK] Pausing - opponent left');
    pauseGame('waiting');
  }
}

function startGame() {
  console.log('[START] startGame called - isGameActive:', isGameActive);
  if (isGameActive) return;

  isGameActive = true;
  isPaused = false;
  previousZone = null;
  hideOverlay();
  assignRole();

  console.log('[START] Role after assignRole:', playerRole);
  if (playerRole === 1) {
    console.log('[START] P1: Resetting ball and broadcasting state');
    resetBall(Math.random() > 0.5 ? 1 : -1);
    setTimeout(() => broadcastFullState(), 50);
  }

  setStatus('Game ON!', 'ready');
  console.log('[START] Game started! Ball:', gameState.ball);
}

function pauseGame(reason) {
  isPaused = true;
  pauseReason = reason;

  if (reason === 'waiting') {
    setStatus('Waiting for opponent...', 'waiting');
    showOverlay('WAITING', 'Open another tab to play');
  } else if (reason === 'p2-zone') {
    setStatus('Switch to Player 2 tab!', 'paused');
    showOverlay('SWITCH TAB!', 'Ball is in Player 2\'s zone');
  } else if (reason === 'p1-zone') {
    setStatus('Switch to Player 1 tab!', 'paused');
    showOverlay('SWITCH TAB!', 'Ball is in Player 1\'s zone');
  } else if (reason === 'serve-p1') {
    setStatus('Player 1 scored! Switch to P1 tab to serve', 'paused');
    showOverlay('GOAL!', 'Player 1 serves');
  } else if (reason === 'serve-p2') {
    setStatus('Player 2 scored! Switch to P2 tab to serve', 'paused');
    showOverlay('GOAL!', 'Player 2 serves');
  }
}

function resumeGame(fromNetwork = false) {
  console.log('[RESUME] Called, isPaused:', isPaused, 'fromNetwork:', fromNetwork);
  if (!isPaused) return;
  isPaused = false;
  pauseReason = null;
  previousZone = gameState.ball.x <= CANVAS_WIDTH / 2 ? 1 : 2;
  hideOverlay();
  setStatus('Game ON!', 'ready');
  if (!fromNetwork) {
    broadcast('resume');
  }
}

function handleVisibilityChange() {
  console.log('[VIS] Visibility changed, hidden:', document.hidden, 'isGameActive:', isGameActive, 'playerRole:', playerRole, 'isPaused:', isPaused);
  if (!isGameActive || !playerRole || playerRole === 'spectator') return;

  const isVisible = !document.hidden;

  if (isVisible && isPaused) {
    console.log('[VIS] Tab visible and paused, checking local resume. pauseReason:', pauseReason, 'myRole:', playerRole);

    const canResume =
      (pauseReason === 'p2-zone' && playerRole === 2) ||
      (pauseReason === 'p1-zone' && playerRole === 1) ||
      (pauseReason === 'serve-p1' && playerRole === 1) ||
      (pauseReason === 'serve-p2' && playerRole === 2);

    console.log('[VIS] Can resume locally?', canResume);
    if (canResume) {
      console.log('[VIS] Resuming locally');
      resumeGame();
    }
  }
}

function validateResumeRequest(requestingPlayer, reason) {
  if (reason === 'p2-zone' && requestingPlayer === 2) return true;
  if (reason === 'p1-zone' && requestingPlayer === 1) return true;
  if (reason === 'serve-p1' && requestingPlayer === 1) return true;
  if (reason === 'serve-p2' && requestingPlayer === 2) return true;
  return false;
}

function updatePaddle() {
  if (!isGameActive || isPaused || !playerRole || playerRole === 'spectator') return;

  const paddleKey = playerRole === 1 ? 'p1' : 'p2';
  let newY = gameState.paddles[paddleKey];

  if (keys.up) newY -= PADDLE_SPEED;
  if (keys.down) newY += PADDLE_SPEED;

  newY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, newY));

  if (newY !== gameState.paddles[paddleKey]) {
    gameState.paddles[paddleKey] = newY;
    broadcast('paddle', { player: playerRole, y: newY });
  }
}

function updateBall() {
  const ball = gameState.ball;
  const physicsOwner = ball.x <= CANVAS_WIDTH / 2 ? 1 : 2;

  if (!isGameActive || isPaused || playerRole !== physicsOwner) return;

  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y <= 0 || ball.y >= CANVAS_HEIGHT - BALL_SIZE) {
    ball.vy *= -1;
    ball.y = Math.max(0, Math.min(CANVAS_HEIGHT - BALL_SIZE, ball.y));
  }

  const p1PaddleRight = 30 + PADDLE_WIDTH;
  const p2PaddleLeft = CANVAS_WIDTH - 30 - PADDLE_WIDTH;

  if (ball.x <= p1PaddleRight && ball.x > 30) {
    if (ball.y + BALL_SIZE >= gameState.paddles.p1 && ball.y <= gameState.paddles.p1 + PADDLE_HEIGHT) {
      ball.vx = Math.abs(ball.vx) * 1.05;
      ball.x = p1PaddleRight;
      const hitPos = (ball.y + BALL_SIZE / 2 - gameState.paddles.p1) / PADDLE_HEIGHT;
      ball.vy += (hitPos - 0.5) * 3;
    }
  }

  if (ball.x + BALL_SIZE >= p2PaddleLeft && ball.x < CANVAS_WIDTH - 30) {
    if (ball.y + BALL_SIZE >= gameState.paddles.p2 && ball.y <= gameState.paddles.p2 + PADDLE_HEIGHT) {
      ball.vx = -Math.abs(ball.vx) * 1.05;
      ball.x = p2PaddleLeft - BALL_SIZE;
      const hitPos = (ball.y + BALL_SIZE / 2 - gameState.paddles.p2) / PADDLE_HEIGHT;
      ball.vy += (hitPos - 0.5) * 3;
    }
  }

  ball.vx = Math.max(-15, Math.min(15, ball.vx));
  ball.vy = Math.max(-10, Math.min(10, ball.vy));

  if (ball.x < 0) {
    gameState.scores.p2++;
    updateScoreDisplay();
    broadcast('score', gameState.scores);

    if (gameState.scores.p2 >= WIN_SCORE) {
      broadcast('game-over', { winner: 2 });
      handleGameOver(2);
    } else {
      resetBall(-1, 2);
      previousZone = 2;
      broadcastFullState();
      pauseGame('serve-p2');
      broadcast('pause', { reason: 'serve-p2' });
    }
    return;
  }

  if (ball.x > CANVAS_WIDTH) {
    gameState.scores.p1++;
    updateScoreDisplay();
    broadcast('score', gameState.scores);

    if (gameState.scores.p1 >= WIN_SCORE) {
      broadcast('game-over', { winner: 1 });
      handleGameOver(1);
    } else {
      resetBall(1, 1);
      previousZone = 1;
      broadcastFullState();
      pauseGame('serve-p1');
      broadcast('pause', { reason: 'serve-p1' });
    }
    return;
  }

  const currentZone = ball.x <= CANVAS_WIDTH / 2 ? 1 : 2;

  if (previousZone !== null && currentZone !== previousZone) {
    broadcast('ball', { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy });
    if (currentZone === 2) {
      pauseGame('p2-zone');
      broadcast('pause', { reason: 'p2-zone' });
      return;
    } else if (currentZone === 1) {
      pauseGame('p1-zone');
      broadcast('pause', { reason: 'p1-zone' });
      return;
    }
  }

  previousZone = currentZone;

  broadcast('ball', { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy });
}

function handleGameOver(winner) {
  isGameActive = false;
  showOverlay('GAME OVER!', `Player ${winner} wins! Refresh to play again`);
  setStatus(`Player ${winner} wins!`, winner === 1 ? 'ready' : 'paused');
}

function updateScoreDisplay() {
  score1El.textContent = gameState.scores.p1;
  score2El.textContent = gameState.scores.p2;
}

function draw() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = '#222';
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  const ballInP1Zone = gameState.ball.x <= CANVAS_WIDTH / 2;
  const ballInP2Zone = gameState.ball.x > CANVAS_WIDTH / 2;

  if (ballInP1Zone && isPaused && (pauseReason === 'p1-zone' || pauseReason === 'serve-p1')) {
    ctx.fillStyle = 'rgba(68, 170, 255, 0.1)';
    ctx.fillRect(0, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  }
  if (ballInP2Zone && isPaused && (pauseReason === 'p2-zone' || pauseReason === 'serve-p2')) {
    ctx.fillStyle = 'rgba(255, 68, 170, 0.1)';
    ctx.fillRect(CANVAS_WIDTH / 2, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  }

  ctx.fillStyle = '#4af';
  ctx.shadowColor = '#4af';
  ctx.shadowBlur = 20;
  ctx.fillRect(30, gameState.paddles.p1, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#f4a';
  ctx.shadowColor = '#f4a';
  ctx.shadowBlur = 20;
  ctx.fillRect(CANVAS_WIDTH - 30 - PADDLE_WIDTH, gameState.paddles.p2, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(gameState.ball.x + BALL_SIZE / 2, gameState.ball.y + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function gameLoop() {
  updatePaddle();
  updateBall();
  draw();
  requestAnimationFrame(gameLoop);
}

channel.onmessage = (event) => {
  const msg = event.data;
  console.log('[MSG] Received:', msg.type, 'from:', msg.tabId?.slice(0, 8), 'myId:', tabId?.slice(0, 8));

  switch (msg.type) {
    case 'join':
      console.log('[JOIN] From other tab, current connectedTabs:', connectedTabs.size);
      if (msg.tabId === tabId) {
        console.log('[JOIN] Ignoring own join message');
        break;
      }
      connectedTabs.add(msg.tabId);
      console.log('[JOIN] Added tab, now connectedTabs:', connectedTabs.size);

      assignRole();
      console.log('[JOIN] After assignRole, playerRole:', playerRole);

      if (playerRole === 1 || playerRole === 2) {
        console.log('[JOIN] Sending ack');
        broadcast('ack', { connectedTabs: Array.from(connectedTabs) });
      }
      checkGameState();
      break;

    case 'ack':
      console.log('[ACK] Received ack, tabs in message:', msg.data.connectedTabs);
      msg.data.connectedTabs.forEach(id => connectedTabs.add(id));
      console.log('[ACK] After merge, connectedTabs:', connectedTabs.size);
      assignRole();
      checkGameState();
      break;

    case 'state-sync':
      Object.assign(gameState, msg.data.gameState);
      updateScoreDisplay();
      break;

    case 'ball':
      gameState.ball.x = msg.data.x;
      gameState.ball.y = msg.data.y;
      gameState.ball.vx = msg.data.vx;
      gameState.ball.vy = msg.data.vy;
      break;

    case 'paddle':
      const key = msg.data.player === 1 ? 'p1' : 'p2';
      gameState.paddles[key] = msg.data.y;
      break;

    case 'score':
      gameState.scores = msg.data;
      updateScoreDisplay();
      break;

    case 'pause':
      pauseGame(msg.data.reason);
      break;

    case 'resume':
      resumeGame(true);
      break;

    case 'leave':
      console.log('[LEAVE] Player left:', msg.tabId?.slice(0, 8));
      connectedTabs.delete(msg.tabId);

      if (isGameActive) {
        console.log('[LEAVE] Game was active, doing full reset');
        isGameActive = false;
        isPaused = false;
        pauseReason = null;
        playerRole = null;
        previousZone = null;
        keys.up = false;
        keys.down = false;

        gameState.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 };
        gameState.paddles = { p1: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, p2: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 };
        gameState.scores = { p1: 0, p2: 0 };

        updateScoreDisplay();
        document.querySelector('.player1').classList.remove('active');
        document.querySelector('.player2').classList.remove('active');

        setStatus('Player left - waiting for opponent', 'waiting');
        showOverlay('PLAYER LEFT', 'Waiting for new opponent');

        setTimeout(() => {
          broadcast('join');
        }, 100);
      }
      break;

    case 'game-over':
      handleGameOver(msg.data.winner);
      break;

    case 'resume-request':
      console.log('[RESUME-REQ] Received from player:', msg.data.player, 'reason:', msg.data.pauseReason, 'I am P1:', playerRole === 1);
      if (playerRole === 1) {
        const valid = validateResumeRequest(msg.data.player, msg.data.pauseReason);
        console.log('[RESUME-REQ] Validation result:', valid);
        if (valid) {
          console.log('[RESUME-REQ] Broadcasting resume');
          broadcast('resume');
        }
      }
      break;

    case 'restart-request':
      console.log('[RESTART] Received restart request from other tab');
      isGameActive = false;
      isPaused = false;
      pauseReason = null;
      playerRole = null;
      previousZone = null;
      keys.up = false;
      keys.down = false;

      gameState.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 };
      gameState.paddles = { p1: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, p2: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 };
      gameState.scores = { p1: 0, p2: 0 };

      updateScoreDisplay();
      document.querySelector('.player1').classList.remove('active');
      document.querySelector('.player2').classList.remove('active');

      setTimeout(() => {
        assignRole();
        checkGameState();
      }, 100);
      break;
  }
};

document.addEventListener('keydown', (e) => {
  if (!isGameActive || isPaused || !playerRole || playerRole === 'spectator') return;

  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
    keys.up = true;
    e.preventDefault();
  }
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
    keys.down = true;
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.up = false;
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.down = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isGameActive || isPaused || !playerRole || playerRole === 'spectator') return;

  const rect = canvas.getBoundingClientRect();
  const mouseY = e.clientY - rect.top;
  const paddleKey = playerRole === 1 ? 'p1' : 'p2';
  const newY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, mouseY - PADDLE_HEIGHT / 2));

  if (newY !== gameState.paddles[paddleKey]) {
    gameState.paddles[paddleKey] = newY;
    broadcast('paddle', { player: playerRole, y: newY });
  }
});

document.addEventListener('visibilitychange', handleVisibilityChange);

window.addEventListener('focus', () => {
  console.log('[FOCUS] Window focused');
  if (isGameActive && playerRole && playerRole !== 'spectator' && isPaused) {
    console.log('[FOCUS] Checking local resume. pauseReason:', pauseReason, 'myRole:', playerRole);

    const canResume =
      (pauseReason === 'p2-zone' && playerRole === 2) ||
      (pauseReason === 'p1-zone' && playerRole === 1) ||
      (pauseReason === 'serve-p1' && playerRole === 1) ||
      (pauseReason === 'serve-p2' && playerRole === 2);

    if (canResume) {
      console.log('[FOCUS] Resuming locally');
      resumeGame();
    }
  }
});

window.addEventListener('beforeunload', () => {
  broadcast('leave');
});

function restartGame() {
  console.log('[RESTART] Resetting game state');

  isGameActive = false;
  isPaused = false;
  pauseReason = null;
  playerRole = null;
  previousZone = null;
  keys.up = false;
  keys.down = false;

  gameState.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 };
  gameState.paddles = { p1: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, p2: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 };
  gameState.scores = { p1: 0, p2: 0 };

  updateScoreDisplay();
  document.querySelector('.player1').classList.remove('active');
  document.querySelector('.player2').classList.remove('active');

  setStatus('Waiting for another player...', 'waiting');
  showOverlay('WAITING', 'Open another tab to play');

  broadcast('restart-request');

  setTimeout(() => {
    broadcast('join');
    checkGameState();
  }, 100);
}

document.getElementById('restartBtn').addEventListener('click', restartGame);

function init() {
  console.log('[INIT] Tab starting, ID:', tabId);
  console.log('[INIT] BroadcastChannel supported:', typeof BroadcastChannel !== 'undefined');
  setStatus('Waiting for another player...', 'waiting');
  showOverlay('WAITING', 'Open another tab to play');
  console.log('[INIT] Broadcasting join message');
  broadcast('join');
  gameLoop();
}

init();
