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
