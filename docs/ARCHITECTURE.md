# Wolin (月印千江) System Architecture
> **One Identity. Infinite Reflections. — Sovereign Identity, Per-Pod Persistence & AI Agent Semantic Fabric**

---

## 1. Production Topology Overview

Wolin은 **단일 Open-Core Rust 데이터 플레인(`wolin-id/wolin`)**과 **글로벌 엣지 컨트롤 플레인(`wolin-id/cloud`)**을 결합한 하이브리드 아키텍처로 운영됩니다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Web / 3D Metaverse Worlds / Mobile Apps / AI Agents                         │
│  (@wolin-id/client, wolin-id, id.wolin.unity, WolinKit, id.wolin:sdk-kotlin) │
└──────────────────┬───────────────────────────────────────┬───────────────────┘
                   │ 1. Solid-OIDC + PKCE (S256) + DPoP    │ 2. LDP / SPARQL / MCP
                   │    + Signed R2 Asset Stream           │    (DPoP + at+jwt)
┌──────────────────▼───────────────────────┐ ┌─────────────▼───────────────────┐
│  Control & Identity Plane                │ │  Sovereign Data Plane           │
│  https://auth.wolin.id (Cloudflare Edge) │ │  https://pod.wolin.id &         │
│  • Workers + Hono + Cloudflare D1        │ │  https://{handle}.wolin.id      │
│  • AWS SES v2 SigV4 Magic Link (Live)    │ │  • Single Rust Binary (<30 MiB) │
│  • GitHub OAuth Live + 5 Providers Ready │ │  • Per-Pod Oxigraph RocksDB     │
│    (Google/Kakao/Apple/Naver/Discord)    │ │    (Bounded LRU 256, 1 GiB Cap) │
│  • 1:N Verified-Email Account Linking    │ │  • ~180 Reserved Handles +      │
│  • 6-Lang i18n (en/zh/es/pt/ja/ko)       │ │    Permanent Tombstone (410)    │
│  • Rybbit + Zero-PII D1 Error/Feedback   │ │  • JWKS Signature Verifier +    │
│  • /assets/:pod_id/* HMAC R2 Streaming   │ │    DPoP at+jwt typ Guard        │
│  • Wolin Passport (/passport/:pod_id)    │ │  • 302 HMAC-SHA256 Asset Offload│
└──────────────────────────────────────────┘ └─────────────────────────────────┘
```

---

## 2. Live Production Capabilities

### 2.1 Identity & Control Plane (`https://auth.wolin.id`)
* **Passwordless Solid-OIDC Provider (`Cloudflare Workers + D1`)**:
  * 비밀번호 해시 DB를 원천 배제하고 `/.well-known/openid-configuration`, `/.well-known/jwks.json`(`ES256`), `/authorize`(통합 Consent UI), `/token`(PKCE `S256` + RFC 9449 `DPoP` `cnf.jkt` 바인딩 + `at+jwt` 발급), `/userinfo`를 제공합니다.
* **AWS SES Magic Link & 1:N OAuth Registry**:
  * **AWS SES v2** (WebCrypto SigV4 네이티브 서명, SHA-256 해시 일회용 토큰) 이메일 매직링크 및 **GitHub OAuth**가 라이브 가동 중입니다.
  * **Google · Kakao · Apple(`RS256` JWKS) · Naver · Discord** 5개 프로바이더 어댑터가 코드 내장 완료되어 클라이언트 자격증명 주입 즉시 활성화되며, 검증된 이메일(`verified === true`) 기준으로 `1:N` 자동 계정 병합을 수행합니다.
* **6개 국어 i18n (`en` / `zh` / `es` / `pt` / `ja` / `ko`)**:
  * 로그인, 동의(Consent), 매직링크 안내, Wolin Passport(`/passport/:pod_id`), 피드백 UI 전반을 글로벌 인터넷 사용 인구순 6개 국어로 현지화했습니다.
* **관측성 & 무-PII 피드백 루프 (`Rybbit + D1`)**:
  * 프론트엔드 퍼널 분석(**Rybbit**)과 함께 `/api/report-error`, `/api/feedback` 수집 전 이메일·JWT·DPoP·쿠키·시크릿을 자동 마스킹(`scrubPii`)하여 **Cloudflare D1**(`error_logs`, `user_feedback`)에 기록하고 중복 제거된 운영 알림을 전송합니다.

### 2.2 Sovereign Pod Data Plane (`https://pod.wolin.id` & `*.wolin.id`)
* **Per-Pod 물리 격리 + Bounded LRU + 쿼터**:
  * 유저마다 독립된 물리 디렉터리(`graph/pods/{pod_id}/` Oxigraph RocksDB + `blobs/pods/{pod_id}/` OpenDAL)를 분리합니다.
  * `PodStoreManager`가 동시 오픈 RocksDB 핸들을 **최대 `256`개 Bounded LRU 캐시**로 관리하고, Pod당 기본 **`1 GiB` 스토리지 쿼터**(`$0` Free Tier 기본 제공, 초과 시 `413`/`507`)를 강제합니다.
* **핸들 보안 제약 (~180개 예약어 + 영구 Tombstone)**:
  * `3~32`자 소문자 영숫자·하이픈 규칙(무료 `4~32`자, 유료 `3`자, Punycode `xn--` 및 연속 `--` 차단)을 검증합니다.
  * RFC 2142·DNS·OAuth·핵심 브랜드·인프라 서브도메인 등 **약 180개 예약 핸들**을 엔진과 컨트롤 플레인 양쪽에서 이중 차단하며, 삭제/은퇴 처리된 Pod는 **영구 Tombstone(`410 Gone`)**으로 동결해 신원 하이재킹을 원천 방지합니다.
* **단기 HMAC-SHA256 서명 에셋 오프로딩 (`302 Found` → R2 `$0` Egress)**:
  * 비공개/대용량 바이너리(`NonRDFSource`, 기본 `>= 256 KiB`) `GET` 요청 시 `wolin-server`가 먼저 DPoP + WAC/ACP 권한을 검증한 뒤, `wolin-asset-v1` 도메인 분리된 **60초 만료 `HMAC-SHA256` 서명 URL**(`https://auth.wolin.id/assets/{pod_id}/{path}?exp=...&sig=...`)로 `302 Found` 리다이렉트하여 Cloudflare R2에서 직접 스트리밍합니다.
* **암호학적 JWKS 서명 검증 & `at+jwt` 혼동 방어**:
  * `JwksSignatureVerifier`(`--oidc-jwks-json` / `WOLIN_OIDC_JWKS_JSON`)가 `ES256`, `ES384`, `RS256`, `PS256`, `EdDSA` 서명을 상수 시간 검증합니다.
  * DPoP 바인딩 액세스 토큰 검증 시 JWT 헤더 `typ: "at+jwt"`(또는 `application/at+jwt`)를 강제하여 `id_token` 재사용 공격을 차단하고, `jti` 리플레이 캐시와 RFC 7638 `cnf.jkt` 지문을 대조합니다.

---

## 3. Multi-Crate Rust Engine (`wolin-id/wolin` · `v0.1.0`)

```text
wolin/
├── Cargo.toml                  # Workspace Root (Rust 2024, v0.1.0, 85/85 passing tests)
├── docs/SELF_HOSTING.md        # Docker, Caddy, Cloudflare Tunnel, systemd & --in-memory Guide
└── crates/
    ├── wolin-core/             # Domain primitives: WebId, Principal, ResourceUri, WolinError
    ├── wolin-storage/          # OpenDAL (Blob/FS/R2) + Per-Pod Oxigraph RocksDB (LRU 256 + 1 GiB Quota)
    ├── wolin-identity/         # WebID discovery, W3C DID, Solid-OIDC, JwksSignatureVerifier, DPoP (at+jwt)
    ├── wolin-policy/           # W3C WAC (.acl) & Inrupt ACP Dual PDP/PEP + Dynamic DelegationGrant
    ├── wolin-mcp/              # Native MCP (/mcp, /mcp/sse) Scoped Semantic Projection Gateway
    └── wolin-server/           # Axum 0.8 + Tokio HTTP LDP, Multi-Tenant Host Router & 302 Asset Offload
```

---

## 4. Core Execution Flows

### 4.1 Solid-OIDC + DPoP + Signed Asset Read Flow
1. **Zero-Review App Discovery**: 앱이 정적 `<origin>/client-id.jsonld`만으로 `https://auth.wolin.id/authorize`에 PKCE(`S256`) 인증을 시작합니다.
2. **Token Minting**: 유저가 매직링크 또는 GitHub/소셜 로그인 후 동의하면 `auth.wolin.id`가 클라이언트 P-256 공개키 지문(`cnf.jkt`)이 바인딩된 `at+jwt` 액세스 토큰을 발급합니다.
3. **Fail-Closed Policy Check**: 클라이언트가 `Authorization: DPoP <at+jwt>` + `DPoP: <dpop+jwt>` 헤더로 `https://{handle}.wolin.id/private/avatar.glb`를 요청하면 `wolin-server`가 JWKS 서명, `typ == "at+jwt"`, `ath`, `htu`, `jti` 및 WAC/ACP 정책을 검증합니다.
4. **Edge Offload**: 인가 통과 시 `256 KiB` 이상 바이너리는 60초 유효 `HMAC-SHA256` 서명 URL로 `302 Found` 응답하여 EC2 대역폭 소모 없이 Cloudflare R2에서 직접 전송합니다.

### 4.2 AI Agent Scoped MCP Projection Flow
1. **Handshake**: AI 에이전트가 `/mcp` 또는 `/mcp/sse`를 통해 작업 세션을 연결합니다.
2. **Delegation Check (`wolin-policy`)**: 에이전트가 제시한 위임 토큰(`act.sub` + `DelegationGrant`)의 허용 리소스·시간 범위를 PDP가 검증합니다.
3. **Zero-PII Subgraph Projection**: 전체 DB 노출 없이 요청 스코프에 해당하는 최소 RDF 서브그래프만 Oxigraph에서 투영해 구조화된 MCP 결과로 반환합니다.

---

## 5. Official 5-Language SDKs & Developer Sandbox

### 5.1 Official SDKs & Starter Matrix
| 플랫폼 / 언어 | 패키지 식별자 | 저장소 | 핵심 특징 |
| :--- | :--- | :--- | :--- |
| **TypeScript / React** | `@wolin-id/client`, `@wolin-id/react` | `wolin-id/sdk-js` | 무의존성 Web Crypto `ES256` DPoP, PKCE, WebID 파서, React 18/19 훅 |
| **Python 3.11+** | `wolin-id` | `wolin-id/sdk-python` | 엄격 타입 `httpx` 비동기 LDP CRUD, `DpopSigner`, Pod 프로비저닝 |
| **Unity C#** | `id.wolin.unity` | `wolin-id/sdk-unity` | Unity 2022.3+ (`.NET Standard 2.1`) UPM 패키지, `WolinClient`, `DPoPSigner` |
| **Swift 6** | `WolinKit` | `wolin-id/sdk-swift` | Apple `CryptoKit`(`P256`) + `actor` 동시성 안전 클라이언트 (iOS/macOS/visionOS) |
| **Kotlin / Android / JVM** | `id.wolin:sdk-kotlin` | `wolin-id/sdk-kotlin` | Kotlin 2.1+ / JVM 17+ 무의존성 NIST P-256 DPoP 및 `If-Match` 동시성 제어 |
| **3D World Starter** | `@wolin-id/metaverse-starter` | `wolin-id/metaverse-starter` | React 19 + R3F 4대 메타버스 레고 블록 (`Auth+Avatar`, `LiveStage`, `AdSlot`, `client-id.jsonld`) |

### 5.2 Local Development vs. Cloud `$0` Free Tier
별도의 공용 Devnet 도메인을 운영하지 않으며, 모든 개발·테스트는 아래 두 경로를 사용합니다:
* **로컬 에페메랄 테스트**: `wolin-server --in-memory` 실행 시 디스크 상태 없이 `http://127.0.0.1:4000`에서 ~6ms 만에 깨끗한 Solid 0.11 + MCP 샌드박스가 기동됩니다.
* **클라우드 실환경 테스트**: `https://auth.wolin.id` 및 `https://pod.wolin.id`의 **`$0` Free Tier (`1 GiB` 쿼터)** Pod를 즉시 생성해 프로덕션과 동일한 HTTPS/DPoP/서브도메인 환경에서 검증합니다.
