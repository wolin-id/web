# Wolin (月印千江) Sovereign Pod Cloud 운영 및 자동 프로비저닝 사양서

## 1. 개요
**Wolin (月印千江) Pod Cloud**는 개별 사용자, 크리에이터 및 조직에게 독립적인 W3C Solid 0.11 Pod를 온디맨드로 제공하는 멀티테넌트 클라우드 인프라(`https://pod.wolin.id` & `https://{pod_id}.wolin.id`)입니다. 인증 및 컨트롤 플레인은 Cloudflare Workers + D1 기반 **`https://auth.wolin.id`**가 담당하며, 데이터 플레인은 단일 `<30MB` Rust 바이너리(`wolin-server`)로 구동됩니다.

---

## 2. 멀티테넌시 라우팅 및 핸들 보안 정책

### 2.1 라우팅 모델
* **서브도메인 기반 오리진 격리 (Subdomain Origin Isolation · 기본 권장)**:
  * 엔드포인트: `https://{pod_id}.wolin.id/*`
  * 브라우저 Same-Origin Policy 수준에서 테넌트 간 쿠키·스토리지·스크립트를 완벽히 격리합니다.
* **경로 기반 라우팅 (Path-based Routing)**:
  * 엔드포인트: `https://pod.wolin.id/pods/{pod_id}/*`
  * 단일 인증서 리버스 프록시 및 관리/백엔드 프로비저닝 파이프라인에서 동일한 정규 리소스로 매핑됩니다.

### 2.2 핸들(`pod_id`) 제약 · ~180개 예약어 · 영구 Tombstone
* **구문 규칙**: `3~32`자 소문자 영문(`a-z`), 숫자(`0-9`), 단일 내부 하이픈(`-`)만 허용합니다(`$0` Free Tier는 `4~32`자, Pro/Creator 유료 티어는 `3`자 허용; 선행/후행 `-`, 연속 `--`, Punycode `xn--` 전면 차단).
* **이중 예약어 차단 (~180개)**: RFC 2142 시스템 계정, DNS/OAuth/Solid/MCP 예약 경로, 인프라 서브도메인(`pod`, `pods`, `api`, `auth`, `login`, `id`, `www`, `mcp`) 및 주요 브랜드 핸들 약 180개를 `wolin-cloud`와 `wolin-server` 양쪽에서 기본 차단하며 `--reserved-pods`(`WOLIN_RESERVED_PODS`)로 추가 지정할 수 있습니다.
* **영구 Tombstone 동결 (`410 Gone`)**: 삭제·은퇴 처리된 `pod_id`(`DELETE /api/pods/{pod_id}`)는 물리 데이터가 즉시 파기된 후 영구 Tombstone 상태로 전환되어 타인의 재가입(Identity Hijacking)을 영구 차단하고 `410 Gone`을 응답합니다.

---

## 3. Pod 자동 프로비저닝 (Zero-Config Seeding)
`https://auth.wolin.id`(AWS SES 매직링크, GitHub OAuth 라이브 + 5대 소셜 프로바이더 연동) 온보딩 또는 관리자 API(`POST /api/pods`) 호출 시 즉시 시딩되는 시맨틱 구조:

```text
/{pod_id}/
├── profile/
│   ├── card                 # W3C WebID Profile (foaf:Person, pim:storage, solid:oidcIssuer <https://auth.wolin.id>)
│   └── card.acl             # 공개 읽기, 소유자 전체 제어 권한
├── inbox/                   # LDP Inbox (Linked Data Notifications)
│   └── .acl                 # 소유자 전체 권한, 인증된 외부 에이전트 Append 권한
├── public/                  # 퍼블릭 오픈 데이터 및 메타버스 공개 에셋 컨테이너
│   └── .acl                 # 전 세계 읽기 가능, 소유자 쓰기/제어
├── private/                 # 소유자 및 인가된 앱/에이전트 전용 컨테이너
│   └── .acl                 # 소유자 단독 접근 (WAC/ACP 위임 가능)
└── .well-known/
    └── wolin                # Pod 런타임 메타데이터 및 Native MCP 디스커버리
```

---

## 4. 물리 스토리지 격리 · 쿼터 · 서명 에셋 오프로딩

### 4.1 Per-Pod 물리 RocksDB 격리 & Bounded LRU (`256`)
* **독립 그래프 스토어**: 공유 단일 DB 대신 `graph/pods/{pod_id}/` 경로에 테넌트별 독립 Oxigraph(RocksDB) 인스턴스를 생성하여 교차 테넌트 쿼리 누출을 물리적으로 원천 차단합니다.
* **Bounded LRU 핸들 캐시**: `WOLIN_MAX_OPEN_PODS=256`(기본값) 상한 내에서 활성 Hot Pod 핸들만 메모리에 유지하고 비활성 Pod 핸들은 자동 축출(Eviction)합니다.
* **스토리지 쿼터**: Pod당 기본 **`1 GiB` (`WOLIN_DEFAULT_POD_QUOTA_BYTES=1073741824`, `$0` Free Tier 포함)** 쿼터를 원자적으로 추적·적용하며 한도 초과 시 `413`/`507`로 거부합니다.

### 4.2 단기 HMAC-SHA256 서명 에셋 오프로딩 (`302 Found` → Cloudflare R2)
* `NonRDFSource` 바이너리(`>= 256 KiB`, `WOLIN_ASSET_OFFLOAD_MIN_BYTES`) `GET` 요청 시 `wolin-server`가 먼저 `JwksSignatureVerifier` + DPoP(`typ: "at+jwt"`) 및 WAC/ACP 인가를 검증합니다.
* 인가가 승인되면 `wolin-asset-v1` 도메인 분리된 **60초 만료 `HMAC-SHA256` 서명 리다이렉트(`302 Found`)**를 발급해 `https://auth.wolin.id/assets/{pod_id}/{path}?exp=...&sig=...`에서 Cloudflare R2 블롭을 송신료 `$0`으로 직접 스트리밍합니다.

---

## 5. 개발 및 샌드박스 환경 (No Public Devnet)
* **로컬 에페메랄 모드**: `wolin-server --in-memory` 명령 하나로 외부 인프라 없이 로컬에서 즉시(`~15.3 MiB RSS`) 전체 프로비저닝·LDP·MCP 파이프라인을 검증할 수 있습니다.
* **매니지드 `$0` Free Tier**: 별도의 공용 테스트넷 도메인 없이 `https://auth.wolin.id` 및 `https://pod.wolin.id`의 무료 `1 GiB` Pod로 5대 공식 SDK(`@wolin-id/client`, `wolin-id`, `id.wolin.unity`, `WolinKit`, `id.wolin:sdk-kotlin`)와 `wolin-id/metaverse-starter`를 즉시 연동합니다.
