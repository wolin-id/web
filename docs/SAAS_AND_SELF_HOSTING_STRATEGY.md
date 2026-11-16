# Wolin (月印千江) SaaS · Self-Hosting & Multi-Tenant Isolation Strategy

> **Status**: Live in Production (`auth.wolin.id` · `pod.wolin.id` · `*.wolin.id`)
> **Last Updated**: 2026-11-16

---

## 1. Open-Core 3-Repo 전략 (단일 엔진, 역할 분리)

엔진 코드를 셀프호스팅용과 SaaS용으로 복제·분리하면 보안 패치와 W3C Solid 스펙 동기화 비용이 두 배로 불어난다. 대신 **공통 데이터 플레인(`wolin-engine`)을 단일 코어로 유지**하고, **상용 SaaS 관제탑(`wolin-cloud`)만 별도 레포로 분리**하는 Open-Core 전략을 채택한다.

1. **`wolin-engine` (`wolin-id/wolin` · Open Core / MIT OR Apache-2.0 · `https://pod.wolin.id`)**
   * **역할**: 홈서버 셀프호스팅 본체이자 Wolin Cloud의 멀티테넌트 데이터 플레인(Data Plane).
   * **포함 (구현 및 프로덕션 가동 완료)**: Solid 0.11 LDP, WAC/ACP 듀얼 PDP, Per-Pod Oxigraph RocksDB(`LRU 256` + `1 GiB` 기본 쿼터), ~180개 예약 핸들 차단 + 영구 Tombstone(`409 Conflict` 재가입 차단), 단기(60초) `HMAC-SHA256` 서명 `302` 에셋 오프로딩, `JwksSignatureVerifier` + DPoP `at+jwt` 검증, `Dockerfile` / `deploy/docker-compose.yml` / `docs/SELF_HOSTING.md`.
   * **원칙**: 결제·마케팅·어드민 UI 등 SaaS 전용 비즈니스 로직을 배제하고, 단일 Rust 바이너리(`<30MB`)로 어디서나 즉시(`--in-memory` 기준 ~6ms) 구동되도록 유지한다.

2. **`wolin-cloud` (`wolin-id/cloud` · 비공개 상용 Control Plane · `https://auth.wolin.id`)**
   * **역할**: `wolin.id` 매니지드 SaaS 전용 인증 및 관제탑(Control Plane).
   * **포함 (구현 및 프로덕션 가동 완료)**: Cloudflare Workers + Hono + **D1(`wolin-cloud-db`)** 기반 자체 Passwordless Solid-OIDC Provider, **AWS SES v2(SigV4) 이메일 매직링크**, **GitHub OAuth 라이브** + **5개 소셜 프로바이더(Google · Kakao · Apple · Naver · Discord) 자격증명 주입 즉시 가동 준비 완료**, 1:N 검증 이메일 자동 병합, Wolin Passport(`/passport/:pod_id`), **6개 국어 i18n(`en/zh/es/pt/ja/ko`)**, **Rybbit 분석 + D1 무-PII 에러/피드백 루프**(`/api/report-error`, `/api/feedback`), Cloudflare R2 서명 에셋 스트리밍(`/assets/:pod_id/*`).
   * **동작**: `wolin-engine`(`https://pod.wolin.id`)과 표준 Solid-OIDC JWKS 및 관리/서명 시크릿으로 연동된다.

3. **`wolin-web` (`wolin-id/web` · `https://wolin.id`)**
   * **역할**: 6개 국어 공식 브랜드 포털, `/llms.txt` · `/llms-full.txt` AI 개발자 레퍼런스 및 아키텍처 문서 허브.
   * **로컬 개발 & `$0` Free Tier 원칙 (No Public Devnet)**: 별도 공용 개발망(Devnet)을 중복 운영하지 않고, 로컬에서는 `wolin-server --in-memory`로 즉시 테스트하며 실환경 연동은 `https://auth.wolin.id` / `https://pod.wolin.id`의 **`$0` Free Tier(`1 GiB` 쿼터)**를 직접 사용한다.

---

## 2. SaaS 테넌트 격리: 왜 유저별 VM 격리(MicroVM)가 불필요한가?

### 2.1 결론
매니지드 SaaS에서 **유저별 VM 격리(Firecracker / MicroVM per user)는 채택하지 않는다.** 이는 SEAH 멘탈모델(1순위 안정성 > 2순위 편의성·속도/비용 > 3순위 미학) 및 PONYTAIL(YAGNI) 원칙에 위배되는 오버엔지니어링이다.

1. **임의 코드 실행(Untrusted Code Execution) 플랫폼이 아님**
   * MicroVM 격리는 유저가 서버에서 Python/Node.js 등 임의의 코드를 직접 실행할 때 커널 탈출을 막기 위한 수단이다.
   * Wolin Pod는 **정적 파일 및 RDF 데이터 읽기/쓰기·SPARQL 질의**만 처리하므로 VM 수준 격리가 불필요하다.
2. **비용과 마진 폭탄 (Scale Margin Bomb)**
   * 유저 1명당 MicroVM 1개를 유지하면 최소 64~128MB RAM이 고정 점유된다(1만 명 기준 ~1TB RAM). 무료·저가 티어 마진이 즉시 붕괴된다.
   * 반면 Wolin Rust 엔진은 단일 프로세스(`30MB` 미만) + Per-Pod DB 핸들 LRU 캐시로 수천~수만 테넌트를 수용할 수 있다.
3. **B2B 엔터프라이즈 예외**
   * 물리적·네트워크 수준 분리를 요구하며 비용을 지불하는 대기업/공공기관 B2B 고객에 한해 **Dedicated Single-Tenant(고객사당 독립 컨테이너/VM 1식)**를 별도 배포한다.

### 2.2 Wolin SaaS 4계층 격리 아키텍처 (프로덕션 적용 완료)
1. **Origin 격리 (브라우저 보안)**: `{pod_id}.wolin.id` 유저별 독립 서브도메인 라우팅(`https://pod.wolin.id` 및 `*.wolin.id` 가동 중). 타인 Pod의 HTML/JS에 의한 Same-Origin XSS를 원천 차단한다.
2. **DB 격리 (Database-per-Tenant · 구현 완료)**: `pods/{pod_id}/graph/` 형태로 유저마다 독립된 물리 Oxigraph(RocksDB) 인스턴스를 분리하고 **Bounded LRU 캐시(기본 `256`개 오픈 상한)**로 파일 디스크립터와 메모리를 정밀 제어한다.
   * *장점*: 교차 테넌트 유출 원천 불가, 탈퇴/은퇴 시 폴더 단위 O(1) 정리 + 영구 Tombstone(`409 Conflict` 재점유 차단) 처리, Noisy Neighbor 차단.
3. **물리 스토리지 & 서명 에셋 격리 (구현 완료)**: OpenDAL 백엔드 및 Cloudflare R2 `blobs/pods/{pod_id}/...` 경로로 분리하고, `256 KiB` 이상 비공개/바이너리 에셋은 엔진 인가 후 60초 만료 `HMAC-SHA256`(`wolin-asset-v1`) 서명 URL로 `302` 리다이렉트해 R2에서 직접 스트리밍하며 유저별 DEK(Envelope Encryption) 확장을 지원한다.
4. **쿼터 & Rate Limit (구현 완료)**: 기본 **`1 GiB` (`$0` Free Tier)** 등 플랜별 스토리지 용량 제한(`413`/`507`) 및 Cloudflare WAF + 서버 요청 본문/속도 제한.

---

## 3. 홈서버 셀프호스팅 & 무손실 Pod 이주 (Inrupt 한계 극복)

### 3.1 Inrupt의 한계와 교훈
* Inrupt는 2025년 `inrupt.net` ➔ `PodSpaces` 이주 과정에서 도메인 변경에 따른 앱 링크 단절, `.acl` 권한 유실, RDF 내부 절대 URI 미치환 문제를 겪었다.
* Wolin은 처음부터 **진짜 무손실 이사(Zero-Breakage Exit)**를 내장해 신뢰와 차별화를 확보한다.

### 3.2 구현 목표
1. **홈서버 셀프호스팅 패키지 (`t_a9fe24f9`)**
   * `WOLIN_BASE_URL`, `WOLIN_POD_CLOUD_DOMAIN`, `WOLIN_STORAGE_DIR` 등 환경변수 파싱 지원.
   * `Dockerfile`, `docker-compose.yml` 및 공유기 포트포워딩 없이 홈서버 도메인을 연결하는 `cloudflared` / `Caddy` HTTPS 가이드 제공.
2. **무손실 Pod 번들 이주 (`t_7a1e0e91`)**
   * `wolin export` / `wolin import`: RDF 그래프 + OpenDAL 블롭 + `.acl` 권한 규칙을 단일 압축 번들(`.tar.zst`)로 내보내고, 새 홈서버 `--base-url`에 맞춰 RDF 내부 절대 URL을 자동 치환(Relocation)하여 복원한다.
   * `pim:storage` 포인터 전환: 기존 `alice.wolin.id` WebID를 유지한 채 `pim:storage` 포인터만 집 홈서버(`pod.myhome.kr`)로 전환해 기존 메타버스 앱 연결을 끊지 않고 저장소를 이전한다.

---

## 4. 클라우드 인프라 배치 · 용량 산정 · 생태계 플라이휠 (2026-11-15 확정)

### 4.1 하이브리드 인프라 아키텍처 (Cloudflare 90% + AWS EC2 10%)
* **Cloudflare Pages / Workers / D1 (`wolin.id`, `auth.wolin.id`)**:
  * 6개 국어(`en/zh/es/pt/ja/ko`) 공식 포털·문서·**자체 Passwordless Solid-OIDC Auth** (Cloudflare D1 기반, AWS SES v2 매직링크 + **GitHub OAuth 라이브** + Google · Kakao · Apple · Naver · Discord 5개 프로바이더 어댑터 내장 완료, Verified-Email 1:N 자동 병합, 통합 Consent UI, **Rybbit 분석 + D1 무-PII 에러/피드백 루프**).
* **Cloudflare R2 (송신료 Egress $0)**:
  * 3D 아바타(`.glb`), 텍스처, 이미지, 바이너리 블롭 전량 저장. `wolin-server`가 `302` 단기 HMAC-SHA256 서명 리다이렉트로 R2 스트리밍(`/assets/:pod_id/*`)을 위임하므로 메타버스 앱이 에셋을 대량 조회해도 AWS 송신료 폭탄이 발생하지 않는다.
* **AWS EC2 (서울 `ap-northeast-2` · `https://pod.wolin.id` & `*.wolin.id`)**:
  * `wolin-server` + Per-Pod Oxigraph(RocksDB, `LRU 256`, `1 GiB` 쿼터) + `JwksSignatureVerifier`(`at+jwt` 강제) 구동. 무거운 바이너리는 R2로 오프로딩되므로 서버 디스크와 대역폭은 경량 RDF + `.acl`에 집중된다.

### 4.2 EC2 · DB · 스토리지 수용량 산정 시나리오
> 가정: `wolin-server` 상주 RAM ~30MB / 활성 Hot Pod(LRU 캐시) ~3MB / DAU 10%, 동시 Hot Pod 1~2%

| 단계 | 추천 EC2 (서울) | 월 예상 비용 | 동시 Hot Pod (LRU) | 총 가입자 수용 규모 |
| :--- | :--- | :---: | :---: | :---: |
| **Phase 1 (초기)** | `t4g.medium` (2 vCPU · 4GB) | ~$28 | ~800개 | **3만 ~ 5만 명** |
| **Phase 2 (성장)** | `m7g.large` (2 vCPU · 8GB) | ~$65 | ~2,000개 | **10만 ~ 15만 명** |
| **Phase 3 (확장)** | `m7g.xlarge` × N대 (4 vCPU · 16GB) | ~$130/대 | 대당 ~4,500개 | **대당 25만 ~ 30만 명** (Pod ID 샤딩) |

* **Auth/Control D1**: 유저당 ~1~2KB (10만 명 기준 100~200MB, D1 기본 한도 내 무료)
* **Oxigraph RDF DB (`gp3`)**: 유저당 0.2~1MB (1만 명 2~10GB / 10만 명 20~100GB, 월 ~$12)
* **R2 바이너리**: 유저당 평균 30MB 가정 시 1만 명 300GB(월 $4.5) / 10만 명 3TB(월 $45), **송신료 $0**
* **Cold-Tier R2 스냅샷 확장(후속)**: 수십만 명 이상 확장 시 30일 이상 미접속 휴면 Pod의 Oxigraph 폴더만 `.tar.zst`로 R2에 내려보냈다가 접속 시 복원해 EC2 디스크를 사실상 무제한 경량화한다.

### 4.3 바이럴 · Easy UX · 개발자 온보딩 플라이휠
1. **Wolin Passport (`{pod_id}.wolin.id` · 링크트리형 메타버스 쇼케이스)**:
   * 브라우저 접속 시 링크트리형 3D 아바타·소셜 명함 및 **"내가 활동 중인 메타버스 / 내 월드 바로가기" 딥링크 카드**를 렌더링해 유저의 공간과 연동 앱의 자연 유입(Organic Discovery)을 동시에 홍보한다.
   * 소유자 로그인 시 연결된 앱 목록과 1클릭 차단 스위치를 제공하며(`Accept: text/turtle` 시엔 표준 RDF 응답 유지), **일반 유저 화면에는 `DPoP/JWK/ETag/RDF` 등 프로토콜 은어를 100% 배제(Easy UX)**한다.
2. **무심사 5분 개발자 연동**: Solid-OIDC `Client ID Document (JSON-LD)`를 통해 API 키 발급·앱 심사 없이 메타버스/웹 앱이 즉시 Wolin 로그인을 연동한다.

### 4.4 공식 RDF 스키마 표준(`https://wolin.id/ns#`) & 비공개 R2 권한 제어
1. **Wolin Metaverse & Passport Vocabulary (`https://wolin.id/ns#`)**:
   * `foaf`, `vcard`, `schema.org` 표준 어휘 위에 **`avatarGlbUrl`, `avatarVrmUrl`, `passportTheme`, `worldLinks`, `wearableItem`** 등 메타버스·여권 공통 스키마를 공식 정의한다.
   * **5개 공식 SDK**(`@wolin-id/client` · `wolin-id` Python · `id.wolin.unity` · `WolinKit` Swift · `id.wolin:sdk-kotlin`)와 **`wolin-id/metaverse-starter`**에 표준 타입/패턴으로 내장하여, 서로 다른 앱 간 아바타·프로필 100% 상호운용성을 보장한다.
2. **비공개 R2 에셋 권한 제어 (권한은 엔진, 전송은 R2/Worker · 구현 완료)**:
   * 공개 에셋은 R2 + Cloudflare CDN에서 엣지 직결 서빙한다.
   * 비공개/대용량 에셋(`NonRDFSource >= 256 KiB`)은 `wolin-server`가 DPoP(`at+jwt`) + `.acl`/ACP 권한을 1차 검증한 뒤 **단기(60초) `HMAC-SHA256`(`wolin-asset-v1`) 서명된 Worker URL(`302 Found` → `/assets/:pod_id/*`)**로 넘겨, 보안 SSOT를 유지하면서도 EC2 대역폭·송신료 소모를 0으로 만든다.

### 4.5 AI 코딩 에이전트 친화 문서 인프라 (Zero-Hallucination DevEx)
* 메인 랜딩 UI는 순수 브랜드 톤을 유지하면서, 뒷단 개발자 인프라로 Claude/ChatGPT/Cursor 등 AI 에이전트가 Wolin을 즉시 이해하도록 구성한다:
  1. **`https://wolin.id/llms.txt` & `/llms-full.txt`**: 5개 언어 SDK 10줄 예제, `Client ID Document`, `wolin.id/ns#` 스키마, DPoP/Trailing-slash 규칙, 로컬 `wolin-server --in-memory` 및 `$0` Free Tier 가이드를 단일 마크다운으로 제공.
  2. **Context7 & `wolin-id/skills`**: `SKILL.md` 및 레퍼런스(`ns-schema.md`, `lego-blocks.md`) 배포 완료.
  3. **`https://docs.wolin.id/mcp`**: Cloudflare Workers 기반 경량 읽기 전용 Docs MCP 서버 제공.

### 4.6 서브도메인(`{pod_id}.wolin.id`) 보안 제약 · 사전 잠금 · 커스텀 도메인 정책
* `wolin-engine`과 `wolin-cloud` 양쪽에서 Fail-Closed 이중 검증을 강제한다:
  1. **형식**:
     * **무료 기본 (`$0` Free Tier, `1 GiB`)**: **4~32자** 소문자 영문(`a-z`), 숫자(`0-9`), 하이픈(`-`)만 허용 (`-` 시작/끝, `--`, Punycode `xn--` 금지).
     * **3자 핸들 (`kim`, `cyc`, `leo` 등)**: **유료(Pro/Creator) 플랜 전용** (엔진 레벨 `3~32`자 검증 및 예약어 잠금 유지).
     * **1~2자 핸들**: **영구 시스템/공식 파트너 전용** 잠금.
  2. **2계층 사전 잠금 (~180개 기본 예약 핸들 + Dynamic DB)**:
     * **엔진/클라우드 공통 정적 블록리스트 (~180개 프로덕션 적용 완료)**: RFC 2142 시스템 예약어, DNS/메일/OAuth/Solid/MCP 프로토콜 경로, 인프라 서브도메인(`pod`, `pods`, `api`, `auth`, `login`, `id`, `www`, `mcp`) 및 주요 글로벌·국내 브랜드 핸들을 즉시 차단하며 `--reserved-pods`(`WOLIN_RESERVED_PODS`) 확장을 지원한다. (일반 개인 핸들은 즉시 1초 자동 발급)
     * **동적 DB (`D1`)**: 운영 중 신규 브랜드 보호 대상 및 은퇴/탈퇴 계정을 무중단 즉시 잠금(`pod_tombstones`).
  3. **브랜드 소유권 검증 승인**: 보호 핸들은 공식 도메인 DNS TXT(`_wolin-verify.<domain>`) 또는 공식 도메인 이메일 매직링크 검증 + 운영자 승인을 거쳐 공식 인증 배지(✓)와 함께 해제·발급한다.
  4. **Tombstone 영구 보류 (`409 Conflict` · 구현 완료)**: 탈퇴·삭제된 `pod_id`는 물리 데이터와 ACL이 즉시 파기된 뒤 D1 `pod_tombstones`와 엔진 Tombstone 카탈로그에 영구 기록되어 재가입/재점유 시 `409 Conflict`로 차단함으로써 Identity Hijacking을 원천 방지한다.
  5. **개인·기업 커스텀 도메인 연동 (Cloudflare for SaaS)**:
     * 기업뿐 아니라 일반 유저(Pro/Creator 등)도 CNAME(`cname.wolin.id`) + TXT 검증만으로 자기 도메인(`id.alice.dev`, `id.brand.com`)을 Pod에 연결할 수 있다(자동 SSL 발급).

### 4.7 레어 핸들 단계적 수익화 · 미디어 전송 경계
1. **레어 핸들 수익화 2단계**:
   * **1단계(초기~성장기)**: 3자 레어 핸들(예약어 제외)은 규제·투기성 오해를 피하기 위해 법정화폐(Pro 구독/카드·토스) 기반으로만 제공한다.
   * **2단계(생태계 성숙 후)**: 필요 시 프리미엄 핸들 경매 및 결제 옵션 중 하나로 USDC 등을 선택적으로 개방한다.
2. **메타버스 미디어/스트리밍 3단 비용 최적화 & 역할 분리**:
   * **① 일방향 대형 방송·공연·강의 ($0)**: 유튜브 라이브 / 치지직 / 트위치 URL을 Pod에 연결해 `CSS3DRenderer` IFrame(웹) 또는 WebView(네이티브)로 임베딩한다(트래픽 비용 전액 외부 플랫폼 부담).
   * **② 소규모 양방향 화상·음성 ($0)**: 1:1~4인 소규모는 WebRTC P2P(+무료 STUN)로 제공한다.
   * **③ 대규모·비공개 초저지연 양방향/유료 방송**: 5인+ 다중 공간·비공개 스트리밍은 **Cloudflare Realtime SFU** ($0.05/GB, 월 1TB 무료) 또는 LiveKit을 사용한다. Wolin은 WebID/권한 기반 토큰 브릿지만 담당하며, 적자 방지를 위해 방송자 구독+선불 크레딧(Hard Cap) 또는 메타버스 앱사 BYOK/B2B 종량제로 분리한다.
   * **④ 대용량 VOD/3D 에셋**: 기본은 R2 + CDN(송신료 $0)으로 서빙하고, 대규모 동시 접속 이벤트 시 R2를 `WebSeed`로 둔 WebTorrent P2P 오프로딩을 선택 적용한다.

### 4.8 Wolin Pay · 스트림 연장 후원(Stream Boost) & 도네이션
1. **1단계 (규제 0% · Stream Boost)**: 시청자가 **Airwallex** 간편 카드/Apple Pay/Google Pay 결제로 방송자에게 현금을 송금하는 대신 **"해당 방송 방의 SFU 스트리밍 대역폭/시간 크레딧을 직접 결제해 연장"**해 주는 Discord Boost형 모델. (선불업·현금 정산 중개 규제 회피)
2. **2단계 (크리에이터 정산 확장)**: 시청자 도네이션 수익 정산 시 플랫폼이 자금을 직접 보유하지 않고 **Airwallex Payouts / Stripe Connect / 토스페이먼츠 지급대행**을 연동해 PG사가 정산·세무 처리를 대행한다.

### 4.9 Wolin Spatial AdSense (메타버스 광고 네트워크 & 3D 시선 측정)
1. **Zero-PII 소버린 광고 원칙**: 유저 개인정보를 팔지 않고, **① 공간 맥락(월드 테마)**과 **② 유저 자발적 익명 관심사(Opt-in)** 기반으로 `<WolinAdSlot />` 3D 전광판·방송 배너·스폰서 `.glb` 오브젝트를 송출한다(R2+CDN 서빙, 호스트 60~70% / 유저 크레딧 15~20% / 플랫폼 15~20%).
2. **3D 정밀 시선·가시성 측정 (2D MRC Viewability의 3D 확장)**:
   * **Frustum + Occlusion Check**: 아바타 카메라 시야각 안쪽이면서 벽·오브젝트에 가려지지 않은(Raycast 통과) 상태만 유효 판정.
   * **화면 점유율 & 거리 + 체류시간(Dwell Time)**: 화면 내 최소 면적(예: 5%+) 및 가독 거리 이내에서 **1.5초 이상 연속 응시** 시에만 유효 노출(`Viewable vCPM`)로 집계.
3. **Ad Fraud(가짜 노출) 방어 4원칙 (레드팀/블루팀 검증 반영)**:
   * **1단계 신뢰 경계**: 초기에는 **Verified World + 상호작용(CPC/CPA) 중심**으로 열고, vCPM은 아래 방어선 적용 후 개방한다.
   * **Smart Pricing (구글 애드센스형 단가 자동 보정)**: 노출 대비 실제 클릭·상호작용률이 0%에 수렴하는 월드는 vCPM 단가를 자동 삭감하고 정산을 보류한다.
   * **1회성 `impression_token` + 서버 타임스탬프**: `now - issued_at >= 1.5s` 및 최근 30초 입력(Idle Check)을 검증해 AFK/리플레이 파밍을 차단한다.
   * **Turnstile + WebID Trust Score + Privacy-by-Design**: 신규 깡통 계정 노출 가중치를 `0x`로 막고, 1.5초 시선 판정은 로컬 메모리에서만 처리 후 폐기(서버엔 `(슬롯, 광고, +1)`만 익명 전송)한다.
4. **2D 애드테크 검증 기법의 3D 적용**: 개인 추적 리타겟팅 대신 **리텐션·몰입도 기반 페이싱**, **소재 A/B 로테이션**, **익명 동선 히트맵(Hot Zone)**을 제공한다.
5. **광고주 모집 GTM (3단계)**:
   * **0단계 (빈 슬롯 0% 백필)**: House Ads(Wolin Pro·여권 홍보) + 제휴 마케팅(CPA: 게이밍 기어·3D 에셋·AI SaaS)으로 초기 소규모 트래픽부터 즉시 수익화.
   * **1단계 (첫 유료 광고주)**: 인디 게임·버튜버·3D 크리에이터·AI/개발자 SaaS 대상 **10만 원 소액 선불 CPC/CPA 테스트** 유치.
   * **2단계 (스케일업)**: 엔트로피패러독스 기존 브랜드 파트너 파일럿 레퍼런스(전환 리포트) 확보 후 **`ads.wolin.id` 셀프서브 포털**(Airwallex 카드 결제 + 5분 캠페인 집행) 오픈.

### 4.10 2계층 스토리지 암호화 (`/private/*` 편의성 vs `/vault/*` 종단간 E2EE)
1. **계층 A — `/profile/`, `/public/`, `/private/*` (Envelope Encryption · 기본 제공)**:
   * 일반 앱 비공개 데이터(`/private/*`), 프로필, `.acl`은 저장 시 암호화(EBS/R2 기본 암호화 + Pod별 DEK 래핑)로 보호하되 서버가 SPARQL 투영·권한 판정·멀티 디바이스 소셜 로그인 즉시 복원을 지원한다. (일반 유저에게 백업키를 강제해 이탈·복구 CS가 폭발하는 문제를 원천 차단)
2. **계층 B — `/vault/*` 개인 금고 (Zero-Knowledge 클라이언트 E2EE · Opt-in)**:
   * 신분증·계약서·비밀키 등 민감 자산은 SDK가 업로드 전 클라이언트에서 **`AES-256-GCM` (또는 `XChaCha20-Poly1305`)**으로 암호화해 서버·R2에는 암호문만 저장한다.
   * **해제 & 백업키 게이트**: Passwordless UX를 위해 **WebAuthn Passkey `PRF` 확장**으로 생체인증 1회 잠금해제를 지원하며, **운영자도 복호화 불가 고지 + Recovery Key 1회 저장/복사 확인을 완료해야만 `/vault/*` 활성화**를 허용한다.
   * **후속 확장 (Embedded Hot Wallet)**: `/vault/wallet.enc`에 EVM(`secp256k1`)·Solana(`ed25519`) 키를 E2EE 보관하고 Passkey 생체인증 시 클라이언트 메모리에서만 트랜잭션 서명을 수행하는 소액/게임용 임베디드 지갑 플러그인을 지원한다(1단계 브랜드는 무코인·무가스비 유지).

### 4.11 게임 · 메타버스 데이터 무결성 3단 분리 (치트/세이브 에딧 방어)
1. **실시간 · 경제 데이터 (각 게임 서버 Authoritative DB)**:
   * 실시간 위치/HP, PvP 판정, 랭킹, 거래 가능한 골드·소모품은 Pod 백업 복원(Double-Spend) 및 임의 수정을 막기 위해 각 게임 서버 DB가 직접 권위를 가진다.
2. **교차 메타버스 아이템 · 업적 증명 (발행사 `Ed25519` 서명 + Pod 보관)**:
   * 다른 메타버스에서도 호환되는 트로피·스킨·한정판 뱃지는 게임 서버의 비공개키(`Ed25519`)로 서명한 Verifiable Credential/JSON-LD를 유저 Pod(`/badges/*.jsonld`)에 저장한다. 유저가 수치를 수정하면 서명이 깨져 즉시 거부(`INVALID_SIGNATURE`)된다.
3. **유저 자유 데이터 (유저 `Write`)**:
   * 프로필, 아바타 선택(`.glb`/VRM), 친구 목록, SNS 글, Wolin Passport 링크트리는 유저가 자유롭게 수정한다.
