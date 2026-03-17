/* ===== Derivatives Sense — 페이오프 계산 엔진 + Canvas 렌더링 ===== */
/* Reference: Hull, "Options, Futures, and Other Derivatives" 11th ed. */

'use strict';

// ─────────────────────────────────────────────
// 1. 핵심 계산 함수
// ─────────────────────────────────────────────

/**
 * 단일 spot price에서의 P&L 계산.
 * 만기 시 손익(Terminal P&L)만 계산 — 시간가치 미포함.
 *
 * @param {string} type   포지션 유형 (아래 목록 참조)
 * @param {Object} params 포지션 파라미터
 * @param {number} spotPrice 기초자산 만기 가격 S_T
 * @returns {number} P&L
 */
function calcPayoff(type, params, spotPrice) {
  const S = spotPrice;

  switch (type) {

    // ── 선물 ──────────────────────────────────────────────────────────
    // Hull Ch.2: Futures P&L = S_T - F_0 (long) or F_0 - S_T (short)
    case 'futures-long':
      // Hull Ch.2, p.38: Long futures profit = S_T - F_0
      return S - params.entry;

    case 'futures-short':
      // Hull Ch.2, p.38: Short futures profit = F_0 - S_T
      return params.entry - S;

    // ── 바닐라 옵션 ───────────────────────────────────────────────────
    // Hull Ch.9, p.205-210

    case 'call-long':
      // Hull Ch.9, p.206: Long call profit = max(S_T - K, 0) - c
      return Math.max(S - params.strike, 0) - params.premium;

    case 'call-short':
      // Hull Ch.9, p.207: Short call profit = c - max(S_T - K, 0)
      return params.premium - Math.max(S - params.strike, 0);

    case 'put-long':
      // Hull Ch.9, p.208: Long put profit = max(K - S_T, 0) - p
      return Math.max(params.strike - S, 0) - params.premium;

    case 'put-short':
      // Hull Ch.9, p.209: Short put profit = p - max(K - S_T, 0)
      return params.premium - Math.max(params.strike - S, 0);

    // ── 조합 전략 ─────────────────────────────────────────────────────
    // Hull Ch.10

    case 'covered-call':
      // Hull Ch.10, p.234: Covered Call = Long Stock + Short Call
      // P&L = (S_T - S_0) + c - max(S_T - K, 0)
      return (S - params.entry_stock) + params.premium_received - Math.max(S - params.strike, 0);

    case 'protective-put':
      // Hull Ch.10, p.234: Protective Put = Long Stock + Long Put
      // P&L = (S_T - S_0) - p + max(K - S_T, 0)
      return (S - params.entry_stock) - params.premium_paid + Math.max(params.strike - S, 0);

    case 'bull-call-spread':
      // Hull Ch.10, p.236: Bull Spread = Long Call(K1) + Short Call(K2), K1 < K2
      // P&L = max(S_T - K1, 0) - c1 - max(S_T - K2, 0) + c2
      return (
        Math.max(S - params.strike1, 0) - params.premium1
        - Math.max(S - params.strike2, 0) + params.premium2
      );

    case 'bear-put-spread':
      // Hull Ch.10, p.238: Bear Spread = Long Put(K2) + Short Put(K1), K1 < K2
      // P&L = max(K2 - S_T, 0) - p2 - max(K1 - S_T, 0) + p1
      return (
        Math.max(params.strike2 - S, 0) - params.premium2
        - Math.max(params.strike1 - S, 0) + params.premium1
      );

    case 'straddle-long':
      // Hull Ch.10, p.244: Long Straddle = Long Call(K) + Long Put(K)
      // P&L = max(S_T - K, 0) - c + max(K - S_T, 0) - p
      return (
        Math.max(S - params.strike, 0) - params.call_premium
        + Math.max(params.strike - S, 0) - params.put_premium
      );

    default:
      throw new Error('calcPayoff: 알 수 없는 type = ' + type);
  }
}

// ─────────────────────────────────────────────
// 2. 손익분기점(BEP) 계산
// ─────────────────────────────────────────────

/**
 * 손익분기점 계산.
 *
 * @param {string} type
 * @param {Object} params
 * @returns {number[]} BEP 가격 배열 (예: [105] 또는 [90, 110])
 */
function calcBEP(type, params) {
  switch (type) {

    // ── 선물 ──────────────────────────────────────────────────────────
    // Hull Ch.2: BEP = F_0 (P&L = 0 when S_T = F_0)
    case 'futures-long':
    case 'futures-short':
      // Futures P&L = 0 ⟺ S_T = F_0
      return [params.entry];

    // ── 바닐라 옵션 ───────────────────────────────────────────────────
    // Hull Ch.9, p.206-209

    case 'call-long':
    case 'call-short':
      // Hull Ch.9, p.206-207: BEP = K + c (profit/loss is zero here for both sides)
      return [params.strike + params.premium];

    case 'put-long':
    case 'put-short':
      // Hull Ch.9, p.208-209: BEP = K - p
      return [params.strike - params.premium];

    // ── 조합 전략 ─────────────────────────────────────────────────────
    // Hull Ch.10

    case 'covered-call':
      // Hull Ch.10, p.234: BEP = S_0 - c
      // P&L = 0: (S_T - S_0) + c - max(S_T - K, 0) = 0
      // When S_T <= K: S_T - S_0 + c = 0 → S_T = S_0 - c
      return [params.entry_stock - params.premium_received];

    case 'protective-put':
      // Hull Ch.10, p.235: BEP = S_0 + p
      // P&L = 0: (S_T - S_0) - p + max(K - S_T, 0) = 0
      // When S_T >= K: S_T - S_0 - p = 0 → S_T = S_0 + p
      return [params.entry_stock + params.premium_paid];

    case 'bull-call-spread': {
      // Hull Ch.10, p.236: BEP = K1 + (c1 - c2)
      // P&L = 0 in region K1 < S_T < K2:
      // (S_T - K1) - c1 + c2 = 0 → S_T = K1 + (c1 - c2)
      const bep = params.strike1 + (params.premium1 - params.premium2);
      return [bep];
    }

    case 'bear-put-spread': {
      // Hull Ch.10, p.238: BEP = K2 - (p2 - p1)
      // P&L = 0 in region K1 < S_T < K2:
      // (K2 - S_T) - p2 + p1 = 0 → S_T = K2 - (p2 - p1)
      const bep = params.strike2 - (params.premium2 - params.premium1);
      return [bep];
    }

    case 'straddle-long':
      // Hull Ch.10, p.244: BEP_upper = K + c + p, BEP_lower = K - c - p
      // P&L = 0: 두 교점
      // Upper: S_T - K - c - p = 0 → S_T = K + c + p
      // Lower: K - S_T - c - p = 0 → S_T = K - c - p
      return [
        params.strike - params.call_premium - params.put_premium,
        params.strike + params.call_premium + params.put_premium,
      ];

    default:
      throw new Error('calcBEP: 알 수 없는 type = ' + type);
  }
}

// ─────────────────────────────────────────────
// 3. 페이오프 곡선 생성
// ─────────────────────────────────────────────

/**
 * spot_min ~ spot_max 구간을 numPoints로 나눠 페이오프 배열 생성.
 *
 * @param {string} type
 * @param {Object} params  spot_min, spot_max 포함
 * @param {number} numPoints 분할 수 (기본 100)
 * @returns {{x: number, y: number}[]}
 */
function generatePayoffCurve(type, params, numPoints) {
  numPoints = numPoints || 100;
  const { spot_min, spot_max } = params;
  const step = (spot_max - spot_min) / (numPoints - 1);
  const curve = [];
  for (let i = 0; i < numPoints; i++) {
    const x = spot_min + step * i;
    const y = calcPayoff(type, params, x);
    curve.push({ x: x, y: y });
  }
  return curve;
}

// ─────────────────────────────────────────────
// 4. Distractor 관련
// ─────────────────────────────────────────────

/**
 * 유형별 혼동하기 쉬운 distractor 유형 목록.
 * 같은 형태의 차트와 혼동될 수 있는 항목들로 구성.
 */
var DISTRACTOR_MAP = {
  'futures-long':    ['futures-short', 'call-long',      'put-long'],
  'futures-short':   ['futures-long',  'call-short',     'put-short'],
  'call-long':       ['call-short',    'put-long',       'put-short'],
  'call-short':      ['call-long',     'put-long',       'put-short'],
  'put-long':        ['put-short',     'call-long',      'call-short'],
  'put-short':       ['put-long',      'call-long',      'call-short'],
  'covered-call':    ['protective-put', 'bull-call-spread', 'straddle-long'],
  'protective-put':  ['covered-call',  'bear-put-spread', 'straddle-long'],
  'bull-call-spread':['bear-put-spread','covered-call',  'straddle-long'],
  'bear-put-spread': ['bull-call-spread','protective-put','straddle-long'],
  'straddle-long':   ['covered-call',  'bull-call-spread','bear-put-spread'],
};

/**
 * 해당 type의 distractor 유형 배열 반환 (3개).
 *
 * @param {string} type
 * @returns {string[]}
 */
function getDistractors(type) {
  var distractors = DISTRACTOR_MAP[type];
  if (!distractors) throw new Error('getDistractors: 알 수 없는 type = ' + type);
  return distractors.slice(); // 복사본 반환
}

/**
 * distractor 렌더링용 params 생성.
 * 같은 strike/premium 값을 재사용하고, type만 변경한 형태로 반환.
 *
 * 전략: answer params에서 공통 수치(strike, premium 등)를 최대한 재사용.
 * 없는 키는 spot_min/spot_max에서 합리적으로 채움.
 *
 * @param {string} distractorType   렌더링할 distractor 유형
 * @param {Object} baseParams       정답(answer)의 params
 * @returns {Object}
 */
function makeDistractorParams(distractorType, baseParams) {
  var p = baseParams;
  var mid = (p.spot_min + p.spot_max) / 2;

  // 기본 공유 값 추출 헬퍼
  var strike  = p.strike  !== undefined ? p.strike  : (p.strike1 !== undefined ? p.strike1 : mid);
  var premium = p.premium !== undefined ? p.premium : (p.call_premium !== undefined ? p.call_premium : 5);
  var entry   = p.entry   !== undefined ? p.entry   : (p.entry_stock !== undefined ? p.entry_stock : mid);

  var base = { spot_min: p.spot_min, spot_max: p.spot_max };

  switch (distractorType) {
    case 'futures-long':
    case 'futures-short':
      return Object.assign({}, base, { entry: entry });

    case 'call-long':
    case 'call-short':
    case 'put-long':
    case 'put-short':
      return Object.assign({}, base, { strike: strike, premium: premium });

    case 'covered-call':
      return Object.assign({}, base, {
        entry_stock:      p.entry_stock      !== undefined ? p.entry_stock      : entry,
        strike:           strike,
        premium_received: p.premium_received !== undefined ? p.premium_received : premium,
      });

    case 'protective-put':
      return Object.assign({}, base, {
        entry_stock:  p.entry_stock  !== undefined ? p.entry_stock  : entry,
        strike:       strike,
        premium_paid: p.premium_paid !== undefined ? p.premium_paid : premium,
      });

    case 'bull-call-spread': {
      var k1 = p.strike1 !== undefined ? p.strike1 : strike;
      var k2 = p.strike2 !== undefined ? p.strike2 : strike + 10;
      var pr1 = p.premium1 !== undefined ? p.premium1 : premium;
      var pr2 = p.premium2 !== undefined ? p.premium2 : Math.max(1, premium - 3);
      return Object.assign({}, base, { strike1: k1, strike2: k2, premium1: pr1, premium2: pr2 });
    }

    case 'bear-put-spread': {
      var k1 = p.strike1 !== undefined ? p.strike1 : strike;
      var k2 = p.strike2 !== undefined ? p.strike2 : strike + 10;
      var pr1 = p.premium1 !== undefined ? p.premium1 : Math.max(1, premium - 3);
      var pr2 = p.premium2 !== undefined ? p.premium2 : premium;
      return Object.assign({}, base, { strike1: k1, strike2: k2, premium1: pr1, premium2: pr2 });
    }

    case 'straddle-long':
      return Object.assign({}, base, {
        strike:        strike,
        call_premium:  p.call_premium !== undefined ? p.call_premium : premium,
        put_premium:   p.put_premium  !== undefined ? p.put_premium  : premium,
      });

    default:
      throw new Error('makeDistractorParams: 알 수 없는 type = ' + distractorType);
  }
}

// ─────────────────────────────────────────────
// 5. Canvas 렌더링
// ─────────────────────────────────────────────

/**
 * Canvas에 페이오프 다이어그램을 렌더링.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string}  type
 * @param {Object}  params
 * @param {Object}  [options]
 * @param {number}  [options.width]        canvas 너비 (px), 기본 canvas.width
 * @param {number}  [options.height]       canvas 높이 (px), 기본 canvas.height
 * @param {boolean} [options.showLabels]   축 레이블 표시 (기본 true)
 * @param {boolean} [options.showBEP]      BEP 마커 표시 (기본 true)
 * @param {boolean} [options.highlighted]  정답 강조 — 굵은 선 + 그림자 (기본 false)
 */
function renderPayoffChart(canvas, type, params, options) {
  options = options || {};
  var showLabels  = options.showLabels  !== false;
  var showBEP     = options.showBEP     !== false;
  var highlighted = options.highlighted === true;

  var W = options.width  || canvas.width;
  var H = options.height || canvas.height;
  canvas.width  = W;
  canvas.height = H;

  var ctx = canvas.getContext('2d');

  // ── 마진 계산 ───────────────────────────────
  var marginLeft   = showLabels ? 46 : 10;
  var marginRight  = 14;
  var marginTop    = 14;
  var marginBottom = showLabels ? 34 : 10;
  var plotW = W - marginLeft - marginRight;
  var plotH = H - marginTop  - marginBottom;

  // ── 데이터 생성 ─────────────────────────────
  var curve = generatePayoffCurve(type, params, 120);
  var yValues = curve.map(function(pt) { return pt.y; });
  var yMin = Math.min.apply(null, yValues);
  var yMax = Math.max.apply(null, yValues);

  // y 축 여유 (빈 공간이 없도록 최소 ±1 확보)
  var yPad = Math.max((yMax - yMin) * 0.12, 1);
  yMin -= yPad;
  yMax += yPad;

  var xMin = params.spot_min;
  var xMax = params.spot_max;

  // ── 좌표 변환 헬퍼 ──────────────────────────
  function toCanvasX(x) {
    return marginLeft + (x - xMin) / (xMax - xMin) * plotW;
  }
  function toCanvasY(y) {
    return marginTop + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  }

  // ── 배경 ────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── 이익/손실 영역 채우기 ────────────────────
  // 0선의 canvas y 좌표
  var zeroY = toCanvasY(0);

  // 각 구간을 순회하며 이익(녹)/손실(적) fill
  ctx.save();
  ctx.beginPath();
  ctx.rect(marginLeft, marginTop, plotW, plotH);
  ctx.clip();

  _fillPayoffRegions(ctx, curve, toCanvasX, toCanvasY, zeroY, marginTop, plotH);

  ctx.restore();

  // ── 그리드 + 0선 ────────────────────────────
  _drawGrid(ctx, marginLeft, marginTop, plotW, plotH, xMin, xMax, yMin, yMax, toCanvasX, toCanvasY, showLabels);

  // ── 손익 곡선 ────────────────────────────────
  _drawPayoffLine(ctx, curve, toCanvasX, toCanvasY, highlighted);

  // ── BEP 마커 ────────────────────────────────
  if (showBEP) {
    try {
      var beps = calcBEP(type, params);
      beps.forEach(function(bepX) {
        if (bepX >= xMin && bepX <= xMax) {
          var cx = toCanvasX(bepX);
          var cy = toCanvasY(0);

          // BEP 수직 점선
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(cx, marginTop);
          ctx.lineTo(cx, marginTop + plotH);
          ctx.stroke();
          ctx.restore();

          // BEP 원형 마커
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#1d4ed8';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    } catch (e) {
      // BEP 계산 실패 시 무시 (렌더링은 계속)
    }
  }

  // ── 축 레이블 ────────────────────────────────
  if (showLabels) {
    _drawAxisLabels(ctx, marginLeft, marginTop, plotW, plotH, xMin, xMax, yMin, yMax, W, H);
  }
}

// ─── 내부 헬퍼: 이익/손실 영역 fill ────────────
function _fillPayoffRegions(ctx, curve, toCanvasX, toCanvasY, zeroY, marginTop, plotH) {
  var clippedZeroY = Math.max(marginTop, Math.min(marginTop + plotH, zeroY));

  for (var i = 0; i < curve.length - 1; i++) {
    var p0 = curve[i];
    var p1 = curve[i + 1];
    var x0 = toCanvasX(p0.x);
    var x1 = toCanvasX(p1.x);
    var y0 = toCanvasY(p0.y);
    var y1 = toCanvasY(p1.y);

    // 부호 전환점 처리: 선형 보간으로 0교점 찾기
    var segments = [];
    if ((p0.y >= 0 && p1.y >= 0) || (p0.y < 0 && p1.y < 0)) {
      // 부호 변환 없음
      segments.push({ x0: x0, y0: y0, x1: x1, y1: y1, sign: p0.y >= 0 });
    } else {
      // 부호 전환: 0교점 계산
      var t = p0.y / (p0.y - p1.y); // 0 ~ 1
      var midX = x0 + t * (x1 - x0);
      segments.push({ x0: x0, y0: y0, x1: midX, y1: clippedZeroY, sign: p0.y >= 0 });
      segments.push({ x0: midX, y0: clippedZeroY, x1: x1, y1: y1, sign: p1.y >= 0 });
    }

    segments.forEach(function(seg) {
      ctx.beginPath();
      ctx.moveTo(seg.x0, clippedZeroY);
      ctx.lineTo(seg.x0, seg.y0);
      ctx.lineTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x1, clippedZeroY);
      ctx.closePath();
      ctx.fillStyle = seg.sign ? '#dcfce7' : '#fee2e2';
      ctx.fill();
    });
  }
}

// ─── 내부 헬퍼: 그리드 + 0선 ────────────────────
function _drawGrid(ctx, ml, mt, pw, ph, xMin, xMax, yMin, yMax, toCanvasX, toCanvasY, showLabels) {
  ctx.save();

  // 플롯 영역 경계선
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(ml, mt, pw, ph);

  // 0선 (회색 점선)
  var zeroY = toCanvasY(0);
  if (zeroY >= mt && zeroY <= mt + ph) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ml, zeroY);
    ctx.lineTo(ml + pw, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Y축 그리드 선 (가이드)
  var yTicks = _niceTickValues(yMin, yMax, 4);
  yTicks.forEach(function(v) {
    var cy = toCanvasY(v);
    if (cy < mt || cy > mt + ph) return;
    if (Math.abs(v) < 1e-9) return; // 0선은 위에서 별도 처리
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ml, cy);
    ctx.lineTo(ml + pw, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  ctx.restore();
}

// ─── 내부 헬퍼: 손익 곡선 ──────────────────────
function _drawPayoffLine(ctx, curve, toCanvasX, toCanvasY, highlighted) {
  if (curve.length < 2) return;

  ctx.save();

  if (highlighted) {
    // 외곽 그림자
    ctx.shadowColor = 'rgba(0,0,0,0.20)';
    ctx.shadowBlur  = 6;
  }

  // 이익(녹) / 손실(적) 구간을 나눠서 색상 적용
  var lineWidth = highlighted ? 3.5 : 2.5;

  // 전체 경로를 세그먼트별로 색 분리
  for (var i = 0; i < curve.length - 1; i++) {
    var p0 = curve[i];
    var p1 = curve[i + 1];
    var midY = (p0.y + p1.y) / 2;

    ctx.beginPath();
    ctx.moveTo(toCanvasX(p0.x), toCanvasY(p0.y));
    ctx.lineTo(toCanvasX(p1.x), toCanvasY(p1.y));
    ctx.strokeStyle = midY >= 0 ? '#16a34a' : '#dc2626';
    ctx.lineWidth   = lineWidth;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
  }

  ctx.restore();
}

// ─── 내부 헬퍼: 축 레이블 ──────────────────────
function _drawAxisLabels(ctx, ml, mt, pw, ph, xMin, xMax, yMin, yMax, W, H) {
  ctx.save();
  ctx.fillStyle  = '#6b7280';
  ctx.font       = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';

  // X축 레이블 (하단)
  var xTicks = _niceTickValues(xMin, xMax, 4);
  xTicks.forEach(function(v) {
    var cx = ml + (v - xMin) / (xMax - xMin) * pw;
    ctx.textAlign = 'center';
    ctx.fillText(_fmtNum(v), cx, mt + ph + 5);
  });

  // Y축 레이블 (좌측)
  var yTicks = _niceTickValues(yMin, yMax, 4);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  yTicks.forEach(function(v) {
    var cy = mt + (1 - (v - yMin) / (yMax - yMin)) * ph;
    if (cy < mt || cy > mt + ph) return;
    ctx.fillText(_fmtNum(v), ml - 4, cy);
  });

  // 축 이름
  ctx.save();
  ctx.fillStyle = '#9ca3af';
  ctx.font      = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('S_T', ml + pw / 2, mt + ph + 20);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(10, mt + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('P&L', 0, 0);
  ctx.restore();
  ctx.restore();

  ctx.restore();
}

// ─── 내부 헬퍼: 눈금 값 계산 (nice round numbers) ──
function _niceTickValues(min, max, targetCount) {
  var range  = max - min;
  if (range === 0) return [min];
  var rough  = range / targetCount;
  var mag    = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
  var norm   = rough / mag;
  var nice;
  if      (norm < 1.5) nice = 1;
  else if (norm < 3)   nice = 2;
  else if (norm < 7)   nice = 5;
  else                  nice = 10;
  var step   = nice * mag;
  var start  = Math.ceil(min / step) * step;
  var ticks  = [];
  for (var v = start; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v / step) * step); // 부동소수점 보정
  }
  return ticks;
}

// ─── 내부 헬퍼: 숫자 포매팅 ────────────────────
function _fmtNum(v) {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}
