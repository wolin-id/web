# Wolin (月印) SaaS · Self-Hosting & Multi-Tenant Isolation Strategy

> **Status**: Approved Strategy · **Kanban Backlog**: `t_a9fe24f9`, `t_7a1e0e91`, `t_962a0f95`
> **Last Updated**: 2026-11-15

---

## 1. Open-Core 3-Repo 전략 (단일 엔진, 역할 분리)

엔진 코드를 셀프호스팅용과 SaaS용으로 복제·분리하면 보안 패치와 W3C Solid 스펙 동기화 비용이 두 배로 불어난다. 대신 **공통 데이터 플레인(`wolin-engine`)을 단일 코어로 유지**하고, **상용 SaaS 관제탑(`wolin-cloud`)만 별도 레포로 분리**하는 Open-Core 전략을 채택한다.

1. **`wolin-engine` (`/projects/wolin/engine` · Open Core / Apache-2.0)**
   * **역할**: 홈서버 셀프호스팅 본체이자 Wolin Cloud의 데이터 플레인(Data Plane).
   * **포함**: Solid LDP, WAC/ACP PDP, Oxigraph 시맨틱 스토어, OpenDAL 스토리지 어댑터, `export/import`, `Dockerfile` / `docker-compose.yml`.
   * **원칙**: 결제·마케팅·어드민 UI 등 SaaS 전용 비즈니스 로직을 배제하고, 단일 Rust 바이너리(`<30MB`)로 어디서나 10초 안에 구동되도록 유지한다.

2. **`wolin-cloud` (추후 신설 · 비공개 상용 Control Plane)**
   * **역할**: `wolin.id` 매니지드 SaaS 전용 관제탑(Control Plane).
   * **포함**: ZITADEL(`auth.wolin.id`) 온보딩·대시보드, 요금제/결제(Stripe·토스페이먼츠), 스토리지 쿼터 관리, Cloudflare R2/서브도메인 자동 프로비저닝, 운영 모니터링.
   * **동작**: `wolin-engine`을 컨테이너 이미지 또는 Cargo 크레이트 의존성으로 그대로 가져다 쓴다.

3. **`wolin-web` (`/projects/wolin-web` · `https://wolin.id`)**
   * **역할**: 공식 브랜드 포털 및 RFC/아키텍처 문서 허브.

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

### 2.2 Wolin SaaS 4계층 격리 아키텍처
1. **Origin 격리 (브라우저 보안)**: `{pod_id}.wolin.id` 유저별 독립 서브도메인 라우팅(구현 완료). 타인 Pod의 HTML/JS에 의한 Same-Origin XSS를 원천 차단한다.
2. **DB 격리 (Database-per-Tenant, `t_962a0f95`)**: `data/pods/{pod_id}/oxigraph/` 형태로 유저마다 독립된 Oxigraph(RocksDB) 인스턴스를 분리하고 LRU 캐시로 핸들을 관리한다.
   * *장점*: 교차 테넌트 유출 원천 불가, 탈퇴/이사 시 폴더 단위 O(1) 처리, Noisy Neighbor 차단.
3. **물리 스토리지 & 암호화 격리 (`t_962a0f95`)**: OpenDAL 백엔드를 Cloudflare R2 / S3 `pods/{pod_id}/...` 경로로 분리하고, 비공개 데이터에 대한 유저별 DEK(Envelope Encryption) 적용을 지원한다.
4. **쿼터 & Rate Limit (`t_962a0f95`)**: 플랜별 스토리지 용량 제한(`413`/`507`) 및 Cloudflare WAF + 서버 미들웨어 기반 요청률 제한.

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
* **Cloudflare Pages / Workers / D1 (`wolin.id`, `app.wolin.id`, `auth.wolin.id`)**:
  * 랜딩·문서·SaaS 관제탑·**자체 Passwordless Solid-OIDC Auth** (비밀번호 DB 없이 Google · Apple · Kakao · Naver · GitHub · Discord Verified-Email 1:N 자동 병합 + 매직링크 + Passkey + 통합 Consent UI).
* **Cloudflare R2 (송신료 Egress $0)**:
  * 3D 아바타(`.glb`), 텍스처, 이미지, 바이너리 블롭 전량 저장. 메타버스 앱이 에셋을 대량 조회해도 AWS 송신료 폭탄이 발생하지 않는다.
* **AWS EC2 (서울 `ap-northeast-2` Graviton ARM64 + EBS `gp3`)**:
  * `wolin-engine` + Per-Pod Oxigraph(RocksDB) 메타데이터만 구동. 무거운 바이너리는 R2로 빠지므로 서버 디스크는 경량 RDF + `.acl`만 점유한다.

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

### 4.3 바이럴 & 개발자 온보딩 플라이휠
1. **Wolin Passport (`{pod_id}.wolin.id`)**: 브라우저 접속 시 링크트리형 3D 아바타·소셜 명함을 렌더링하고, 소유자 로그인 시 연결된 앱 목록과 1클릭 차단 스위치를 제공한다(`Accept: text/turtle` 시엔 표준 RDF 응답 유지).
2. **무심사 5분 개발자 연동**: Solid-OIDC `Client ID Document (JSON-LD)`를 통해 API 키 발급·앱 심사 없이 메타버스/웹 앱이 즉시 Wolin 로그인을 연동한다.

### 4.4 공식 RDF 스키마 표준(`https://wolin.id/ns#`) & 비공개 R2 권한 제어
1. **Wolin Metaverse & Passport Vocabulary (`https://wolin.id/ns#`)**:
   * `foaf`, `vcard`, `schema.org` 표준 어휘 위에 **`avatarGlbUrl`, `avatarVrmUrl`, `passportTheme`, `worldLinks`, `wearableItem`** 등 메타버스·여권 공통 스키마를 공식 정의한다.
   * 5개 언어 SDK(`sdk-{js,unity,swift,kotlin,python}`)에 표준 타입/메서드로 내장하여, 서로 다른 앱 간 아바타·프로필 100% 상호운용성을 보장한다.
2. **비공개 R2 에셋 권한 제어 (권한은 엔진, 전송은 R2/Worker)**:
   * 공개 에셋은 R2 + Cloudflare CDN(`cdn.wolin.id`)에서 엣지 직결 서빙한다.
   * 비공개 에셋은 `wolin-engine`이 DPoP + `.acl`/ACP 권한을 1차 검증한 뒤 **단기(30초) R2 Presigned URL 또는 HMAC 서명된 Worker URL**로 넘겨, 보안 SSOT를 유지하면서도 EC2 대역폭·송신료 소모를 0으로 만든다.

### 4.5 AI 코딩 에이전트 친화 문서 인프라 (Zero-Hallucination DevEx)
* 메인 랜딩 UI는 순수 브랜드 톤을 유지하면서, 뒷단 개발자 인프라로 Claude/ChatGPT/Cursor 등 AI 에이전트가 Wolin을 즉시 이해하도록 구성한다:
  1. **`https://wolin.id/llms.txt` & `/llms-full.txt`**: 5개 언어 SDK 10줄 예제, `Client ID Document`, `wolin.id/ns#` 스키마, DPoP/Trailing-slash 규칙을 단일 마크다운으로 제공.
  2. **Context7 & `wolin-id/skills`**: 오픈소스 공개 시 Context7 인덱싱 및 `SKILL.md` / `AGENTS.md` 배포.
  3. **`https://docs.wolin.id/mcp`**: Cloudflare Workers 기반 경량 읽기 전용 Docs MCP 서버 제공.

### 4.6 서브도메인(`{pod_id}.wolin.id`) 보안 제약 · 사전 잠금 · 커스텀 도메인 정책
* `wolin-engine`과 `wolin-cloud` 양쪽에서 Fail-Closed 이중 검증을 강제한다:
  1. **형식**:
     * **무료 기본**: **4~32자** 소문자 영문(`a-z`), 숫자(`0-9`), 하이픈(`-`)만 허용 (`-` 시작/끝, `--`, Punycode `xn--` 금지).
     * **3자 핸들 (`kim`, `cyc`, `leo` 등)**: **유료(Pro/Creator) 플랜 전용** (단, 시스템/브랜드 예약어 잠금 유지).
     * **1~2자 핸들**: **영구 시스템/공식 파트너 전용** 잠금.
  2. **2계층 사전 잠금 (Static + Dynamic)**:
     * **정적 코퍼스 (`reserved_handles.json`)**: RFC 2142 시스템 예약어(~400개) + **Tranco/Cloudflare Radar 활성 트래픽 Top 브랜드**(단순 `.com` 등록 여부는 일반 이름 차단 오탐 방지를 위해 배제) + 한국 주요 기업/금융/대학/공공기관 + 피싱 접사(`-support`, `-verify`, `-official`) + Leetspeak 정규화 대조. (일반 개인 핸들은 즉시 1초 자동 발급)
     * **동적 DB (`D1 reserved_handles`)**: 운영 중 신규 브랜드/피싱 제보를 무중단 즉시 잠금(`system` / `brand_locked` / `tombstone`).
  3. **브랜드 소유권 검증 승인**: `brand_locked` 핸들은 공식 도메인 DNS TXT(`_wolin-verify.<domain>`) 또는 공식 도메인 이메일 매직링크 검증 + 운영자 승인을 거쳐 공식 인증 배지(✓)와 함께 해제·발급한다.
  4. **Tombstone 영구 보류**: 탈퇴·삭제된 `pod_id`는 타인의 Identity Hijacking을 막기 위해 영구 재사용 금지 처리한다.
  5. **개인·기업 커스텀 도메인 연동 (Cloudflare for SaaS)**:
     * 기업뿐 아니라 일반 유저(Pro/Creator 등)도 CNAME(`cname.wolin.id`) + TXT 검증만으로 자기 도메인(`id.alice.dev`, `id.brand.com`)을 Pod에 연결할 수 있다(자동 SSL 발급).

### 4.7 레어 핸들 단계적 수익화 · 미디어 전송 경계
1. **레어 핸들 수익화 2단계**:
   * **1단계(초기~성장기)**: 3자 레어 핸들(예약어 제외)은 규제·투기성 오해를 피하기 위해 법정화폐(Pro 구독/카드·토스) 기반으로만 제공한다.
   * **2단계(생태계 성숙 후)**: 필요 시 프리미엄 핸들 경매 및 결제 옵션 중 하나로 USDC 등을 선택적으로 개방한다.
2. **메타버스 미디어/스트리밍 역할 분리 & 과금**:
   * **실시간 화상·음성**: 1:1~4인 소규모는 WebRTC P2P(+무료 STUN, 서버 원가 $0)로 무료 제공하고, 5인+ 다중 공간·라이브 영상 송출은 **Cloudflare Realtime SFU** ($0.05/GB, 월 1TB 무료) 또는 LiveKit을 사용한다. Wolin은 WebID/권한 기반 토큰 브릿지만 담당한다.
   * **SFU 트래픽 과금(적자 방지)**: 시청자 수에 비례해 Egress 원가가 발생하므로, ① 방송자 Pro/Creator 구독+선불 크레딧 차감(Hard Cap) 또는 ② 메타버스 앱사의 BYOK(자체 Realtime 키) / B2B 종량제로 분리한다.
   * **대용량 VOD/3D 에셋**: 기본은 R2 + CDN(송신료 $0)으로 서빙하고, 대규모 동시 접속 이벤트 시 R2를 `WebSeed`로 둔 WebTorrent P2P 오프로딩을 선택 적용한다.
