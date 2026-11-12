# Wolin Web (월인 공식 포털 및 문서 저장소)
> **One Identity. Infinite Reflections. / 月印千江** — Official Portal & Documentation Hub

Wolin의 독자적 *Lunar Obsidian & Specular Mercury* 브랜딩 기반 공식 웹 포털 및 인터랙티브 프로토콜 시뮬레이터, W3C Solid/Inrupt 상호운용성 공식 문서 허브입니다.

---

## 1. Directory Structure

```
wolin-web/
├── index.html              # 공식 랜딩 페이지 & 듀얼 오라클 인터랙티브 시뮬레이터
├── docs/                   # Wolin 공식 프로토콜 및 아키텍처 문서
│   ├── VISION.md           # 월인천강(月印千江) 비전 백서
│   ├── ARCHITECTURE.md     # 5대 계층 아키텍처 명세
│   ├── INRUPT_INTEROP.md   # Inrupt ESS & Solid-OIDC 상호운용 규격서
│   └── POD_CLOUD_SPEC.md   # 소버린 팟 클라우드 멀티테넌시 사양서
├── screenshot-desktop.png  # 데스크톱 검증 스크린샷 (1440px)
└── screenshot-mobile.png   # 모바일 검증 스크린샷 (390px)
```

## 2. Key Highlights

* **Lunar Astrolabe Canvas**: 수은 반사광 광학 렌더링 캔버스
* **Dual-Oracle Interactive Console**:
  * Positive Oracle: 인가된 에이전트의 SPARQL 질의 및 PII 제로 스크러빙 시뮬레이션
  * Negative Oracle: 미인가 에이전트 월권 및 프롬프트 인젝션 즉시 차단
* **Verified Dogfood Standards**:
  * 390px 모바일 가로 스크롤 `0px`, 터치 타깃 `≥ 44px`
  * WCAG 2.1 AA 명암비(5.98:1 이상) 및 ARIA 탭 네비게이션 준수

## 3. Local Preview

```bash
# Preview via Python HTTP server
python3 -m http.server 8080 --directory .
```
