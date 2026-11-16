# Wolin (月印千江) Documentation
> **One Identity. Infinite Reflections. — Sovereign Pod Cloud, Solid-OIDC Identity & Cross-World Metaverse Specifications**

이 저장소는 **Wolin(월인천강 · 月印千江)** 프로젝트의 철학적 비전, 프로덕션 시스템 아키텍처, 멀티테넌트 SaaS 및 셀프호스팅 전략, 그리고 W3C Solid 0.11 / Inrupt(ESS) 상호운용성 명세를 관리하는 공식 문서 허브입니다.

---

## 1. Document Index

* [`VISION.md`](./VISION.md): Wolin 비전 백서 (*"월인천강(月印千江) — One Identity. Infinite Reflections."*)
* [`ARCHITECTURE.md`](./ARCHITECTURE.md): 프로덕션 아키텍처 명세 (`auth.wolin.id` Control Plane, `pod.wolin.id` 6-Crate Rust Data Plane, 5대 공식 SDK)
* [`SAAS_AND_SELF_HOSTING_STRATEGY.md`](./SAAS_AND_SELF_HOSTING_STRATEGY.md): Open-Core SaaS · 4계층 테넌트 격리 · 홈서버 셀프호스팅 및 공간 생태계 전략
* [`POD_CLOUD_SPEC.md`](./POD_CLOUD_SPEC.md): 멀티테넌트 소버린 팟 클라우드(`pod.wolin.id` / `*.wolin.id`) 프로비저닝·격리·보안 사양서
* [`INRUPT_INTEROP.md`](./INRUPT_INTEROP.md): Inrupt Enterprise Solid Server(ESS) 및 W3C Solid Protocol 양방향 상호운용 규격서

---

## 2. Live Production Endpoints

| 구성 요소 | 정규 엔드포인트 | 핵심 역할 |
| :--- | :--- | :--- |
| **Brand & Dev Hub** | `https://wolin.id` | 공식 포털, 6개 국어(`en/zh/es/pt/ja/ko`), `/llms.txt`, `/llms-full.txt` |
| **Solid-OIDC & Passport** | `https://auth.wolin.id` | D1 기반 Passwordless Auth (AWS SES 매직링크, GitHub OAuth 라이브 + 5개 소셜 프로바이더 준비 완료), 6개 국어 UI, Rybbit + D1 무-PII 에러/피드백 루프, 서명 에셋 엣지 스트리밍(`/assets/:pod_id/*`) |
| **Pod Cloud Data Plane** | `https://pod.wolin.id` | Rust 단일 바이너리 Solid 0.11 LDP + WAC/ACP + Native MCP, Per-Pod RocksDB(`LRU 256`, `1 GiB` 쿼터), ~180개 예약 핸들 + Tombstone(`410`), HMAC-SHA256 `302` 에셋 오프로딩, JWKS `at+jwt` 검증 |
| **User Sovereign Pod** | `https://{handle}.wolin.id/` | 서브도메인 오리진 격리 Pod 루트 및 Wolin Passport(`/profile/card#me`) |

---

## 3. Zero-Cost Development & Testing (`--in-memory` & `$0` Free Tier)

Wolin은 별도의 공용 Devnet 서버를 두지 않고(YAGNI), 아래 두 가지 **무비용($0) 표준 경로**로 로컬 개발과 실환경 검증을 지원합니다:

1. **로컬 초경량 인메모리 샌드박스 (`wolin-server --in-memory`)**:
   ```bash
   # 외부 DB·스토리지 설치 없이 ~6ms 내 로컬 Solid 0.11 + MCP 서버 기동 (~15.3 MiB RSS)
   wolin-server --in-memory --port 4000
   ```
2. **매니지드 클라우드 `$0` Free Tier (`1 GiB`)**:
   * `https://auth.wolin.id`에서 즉시 무료 Pod(`https://{handle}.wolin.id/`, 기본 `1 GiB` 쿼터, `4~32`자 핸들)을 발급받아 5대 공식 SDK 및 정적 3D 월드(`client-id.jsonld`)와 실환경 E2E 연동을 수행할 수 있습니다.

---

## 4. Official Ecosystem Repositories

* **Core Rust Engine & Self-Hosting Guide**: [`wolin-id/wolin`](https://github.com/wolin-id/wolin) (`docs/SELF_HOSTING.md`)
* **AI Coding Agent Skills**: [`wolin-id/skills`](https://github.com/wolin-id/skills) (`SKILL.md`, `https://wolin.id/ns#`, 4 Lego Blocks)
* **3D Metaverse World Starter**: [`wolin-id/metaverse-starter`](https://github.com/wolin-id/metaverse-starter)
* **5 Official SDKs**:
  * TypeScript / React: [`wolin-id/sdk-js`](https://github.com/wolin-id/sdk-js) (`@wolin-id/client`, `@wolin-id/react`)
  * Python: [`wolin-id/sdk-python`](https://github.com/wolin-id/sdk-python) (`wolin-id`)
  * Unity C#: [`wolin-id/sdk-unity`](https://github.com/wolin-id/sdk-unity) (`id.wolin.unity`)
  * Swift 6: [`wolin-id/sdk-swift`](https://github.com/wolin-id/sdk-swift) (`WolinKit`)
  * Kotlin / Android / JVM: [`wolin-id/sdk-kotlin`](https://github.com/wolin-id/sdk-kotlin) (`id.wolin:sdk-kotlin`)
