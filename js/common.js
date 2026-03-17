/* ===== Derivatives Sense — 공통 엔진 ===== */

// ─── 메시지 풀 ───
const MSGS = {
  perfect: ['완벽해요! 🎯', '정확해요! 🌟', '대단해요! 👏', '최고예요! 🏆'],
  good:    ['거의 맞았어요! 😊', '잘했어요! 👍', '훌륭해요!', '좋아요!'],
  ok:      ['계속 도전! 💪', '다음엔 맞출 수 있어요!', '조금만 더!'],
  correct: ['정답! ✅', '맞았어요! 🎉', '완벽! 🌟', '대단해요! 👏'],
  wrong:   ['아깝다! 😅', '다시 도전! 💪', '힌트를 참고하세요!'],
};

function pickMsg(key) {
  const arr = MSGS[key] || MSGS.ok;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── 온보딩 (모드별 최초 1회) ───
const _shownOnboarding = new Set();

function showOnboarding(key, { icon, title, text }) {
  if (_shownOnboarding.has(key)) return Promise.resolve();
  _shownOnboarding.add(key);
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-icon">${icon}</div>
        <div class="onboarding-title">${title}</div>
        <div class="onboarding-text">${text}</div>
        <button class="onboarding-btn">시작하기!</button>
      </div>`;
    overlay.querySelector('.onboarding-btn').onclick = () => { overlay.remove(); resolve(); };
    document.body.appendChild(overlay);
  });
}

// ─── 화면 전환 ───
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── URL 파라미터 ───
function getLevelFromURL() {
  return parseInt(new URLSearchParams(location.search).get('level') || '0');
}

function goHome() { location.href = '../index.html'; }

// ─── QuestionLoader ───
class QuestionLoader {
  constructor(jsonPath) {
    this.jsonPath = jsonPath;
    this.allQuestions = [];
    this.pool = [];
  }

  async load(difficulty) {
    // difficulty: 0=쉬움, 1=보통, 2=도전 (undefined = 전체)
    const data = await fetch(this.jsonPath).then(r => r.json());
    this.allQuestions = (difficulty !== undefined)
      ? data.filter(q => q.difficulty === difficulty + 1)
      : data;
    this._refill();
    return this;
  }

  _refill() {
    this.pool = [...this.allQuestions];
    this._shuffle(this.pool);
  }

  next() {
    if (this.pool.length === 0) this._refill();
    return this.pool.pop();
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  get total() { return this.allQuestions.length; }
}

// ─── GameEngine ───
class GameEngine {
  /**
   * @param {Object} cfg
   * @param {number}  cfg.totalRounds       라운드 수 (기본 10)
   * @param {number[]} [cfg.starsThresholds] 이진 게임: 사용 안 함
   */
  constructor({ totalRounds = 10 } = {}) {
    this.totalRounds = totalRounds;
    this.round = 0;
    this.score = 0;
    this.history = [];
  }

  get isComplete() { return this.round >= this.totalRounds; }
  get currentRoundDisplay() { return this.round + 1; }

  /** 이진 라운드 기록 (정답/오답) */
  recordRound({ correct, data = {} }) {
    const stars  = correct ? 3 : 1;
    const points = correct ? 10 : 0;
    this.score += points;
    this.history.push({ stars, points, correct, ...data });
    this.round++;
    return { stars, points };
  }

  /** 진행 히스토리 바 렌더링 */
  renderHistoryBar(el) {
    el.innerHTML = '';
    for (let i = 0; i < this.totalRounds; i++) {
      const dot = document.createElement('div');
      dot.className = 'history-dot';
      if (i < this.history.length) {
        const { stars } = this.history[i];
        dot.classList.add(`done${stars}`);
        dot.textContent = stars === 3 ? '✓' : '✗';
      } else if (i === this.round) {
        dot.classList.add('current');
        dot.textContent = i + 1;
      } else {
        dot.textContent = i + 1;
      }
      el.appendChild(dot);
    }
  }

  /** 피드백 표시 */
  showFeedback({ stars, message, detail, formula }) {
    const fb = document.getElementById('feedback');
    if (!fb) return;
    document.getElementById('feedbackStars').textContent   = stars === 3 ? '⭐⭐⭐' : stars === 2 ? '⭐⭐' : '⭐';
    document.getElementById('feedbackMessage').textContent = message;
    document.getElementById('feedbackDetail').textContent  = detail || '';
    const fEl = document.getElementById('feedbackFormula');
    if (fEl) {
      fEl.textContent = formula || '';
      fEl.style.display = formula ? 'block' : 'none';
    }
    fb.classList.add('show');
  }

  hideFeedback() {
    const fb = document.getElementById('feedback');
    if (fb) fb.classList.remove('show');
  }

  /** 결과 화면 렌더링 */
  renderResultScreen({ onRetry, onHome }) {
    const maxScore     = this.totalRounds * 10;
    const displayScore = Math.min(this.score, maxScore);
    const pct          = displayScore / maxScore;

    let tier, message, detail;
    if (pct >= 0.85) {
      tier = 3; message = '파생상품 마스터!'; detail = '훌륭한 감각이에요! 🎉';
    } else if (pct >= 0.6) {
      tier = 2; message = '아주 잘했어요!';   detail = '조금만 더 연습하면 완벽해요!';
    } else {
      tier = 1; message = '좋은 시작이에요!'; detail = '다시 도전하면 더 잘할 수 있어요!';
    }

    const dotsHtml = this.history.map((h, i) =>
      `<div class="round-dot star${h.stars}" title="${i+1}번: ${h.correct ? '정답' : '오답'}">${i+1}</div>`
    ).join('');

    const el = document.getElementById('resultScreen');
    el.innerHTML = `
      <div class="page-title">결과 🎊</div>
      <div class="result-card">
        <div class="result-label">총 점수</div>
        <div class="result-score">${displayScore} / ${maxScore}</div>
        <div class="result-stars">${'⭐'.repeat(tier)}</div>
        <div class="result-message">${message}</div>
        <div class="result-detail">${detail}</div>
        <div class="result-rounds">${dotsHtml}</div>
      </div>
      <div class="result-buttons">
        <button class="home-btn"  id="btnHome">처음으로</button>
        <button class="retry-btn" id="btnRetry">다시 하기</button>
      </div>`;
    document.getElementById('btnHome').onclick  = onHome;
    document.getElementById('btnRetry').onclick = onRetry;
    showScreen('resultScreen');
  }
}
