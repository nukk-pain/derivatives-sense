# 📈 파생상품 감각 훈련 (Derivatives Sense)

선물·옵션·헷지 개념을 **인터랙티브 퀴즈**로 직관적으로 익히는 학습 도구.

## 🎯 특징

- **자료 정확성 최우선**: Hull *Options, Futures, and Other Derivatives* 11th ed. 기반
- **인터랙티브**: 페이오프 다이어그램을 직접 눈으로 보고 선택
- **모바일 최적화**: 스마트폰에서도 편하게 학습
- **빌드 불필요**: 순수 HTML/CSS/JavaScript

## 📚 커리큘럼

| Phase | 영역 | 상태 |
|-------|------|------|
| 1 | 선물 기초 (페이오프 다이어그램) | ✅ 구현 완료 |
| 2 | 선물 가격 결정 | 🚧 준비 중 |
| 3 | 옵션 기초 | 🚧 준비 중 |
| 4 | 그릭스 (Greeks) | 🚧 준비 중 |
| 5 | 전략 & 헷지 | 🚧 준비 중 |

## 🚀 사용 방법

### 온라인 (GitHub Pages)

→ [GitHub Pages URL]

### 로컬 실행

```bash
# Python 내장 서버 (권장 — fetch() 동작을 위해 필요)
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

> ⚠️ `file://` 프로토콜로 직접 열면 JSON fetch가 차단됩니다. 반드시 HTTP 서버를 통해 실행하세요.

## 🧮 다루는 포지션 유형 (Phase 1)

| 포지션 | 기호 | 출처 |
|--------|------|------|
| 선물 매수 | Long Futures | Hull Ch.2 |
| 선물 매도 | Short Futures | Hull Ch.2 |
| 콜옵션 매수 | Long Call | Hull Ch.9 |
| 콜옵션 매도 (매도) | Short Call | Hull Ch.9 |
| 풋옵션 매수 | Long Put | Hull Ch.9 |
| 풋옵션 매도 | Short Put | Hull Ch.9 |
| 커버드콜 | Covered Call | Hull Ch.10 |
| 보호적 풋 | Protective Put | Hull Ch.10 |
| 강세 콜 스프레드 | Bull Call Spread | Hull Ch.10 |
| 약세 풋 스프레드 | Bear Put Spread | Hull Ch.10 |
| 스트래들 매수 | Long Straddle | Hull Ch.10 |

## 📁 프로젝트 구조

```
derivatives-sense/
├── index.html              # 메인 화면
├── css/style.css           # 공통 스타일
├── js/
│   ├── common.js           # GameEngine + QuestionLoader
│   └── payoff.js           # 페이오프 계산 + Canvas 렌더링
├── modes/
│   └── payoff-diagram.html # 페이오프 다이어그램 모드
├── questions/
│   └── payoff-diagram.json # 문제은행 (30문제)
└── tools/                  # 개발 도구 (배포 미포함)
    ├── validate-questions.py   # 문제 검증
    └── verify-payoff-engine.py # 엔진 교차검증
```

## 🔍 자료 출처

- Hull, John C. *Options, Futures, and Other Derivatives*, 11th ed. Pearson, 2021.
- 문제은행 수치는 교과서 예제 기반으로 작성.

## ✅ 정확성 검증

```bash
# 페이오프 계산 엔진 교차검증 (Python 독립 구현과 대조)
python3 tools/verify-payoff-engine.py

# 문제은행 필드 + BEP 검증
python3 tools/validate-questions.py
```
