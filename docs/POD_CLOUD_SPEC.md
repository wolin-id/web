# Wolin Sovereign Pod Cloud 운영 및 자동 프로비저닝 사양서

## 1. 개요
Wolin Pod Cloud는 개별 사용자 및 조직에게 독립적인 W3C Solid Pod을 온디맨드로 제공하는 멀티테넌트 분산 클라우드 인프라입니다.

## 2. 멀티테넌시 아키텍처

### 2.1 라우팅 모델
* **경로 기반 격리 (Path-based Routing)**:
  * 엔드포인트: `https://pod.wolin.cloud/{username}/*` 또는 `https://api.wolin.id/pods/{username}/*`
  * 인프라 프록시(MOS Edge / Cloudflare)에서 단일 와일드카드 인증서로 처리 용이.
* **서브도메인 기반 격리 (Subdomain-based Routing)**:
  * 엔드포인트: `https://{username}.wolin.cloud/*`
  * 완전한 쿠키 및 오리진 격리(Origin Isolation) 제공.

### 2.2 Pod 자동 프로비저닝 (Zero-Config Seeding)
신규 사용자 등록(OIDC 가입 또는 관리자 API) 시 자동으로 프로비저닝되는 시맨틱 구조:

```
/{pod_id}/
├── profile/
│   ├── card                 # W3C WebID Profile (foaf:Person, pim:storage, solid:oidcIssuer)
│   └── card.acl             # 공개 읽기 권한
├── inbox/                   # LDP Inbox (Linked Data Notifications)
│   └── .acl                 # 소유자 전체 권한, 인증된 외부 에이전트 Append 권한
├── public/                  # 퍼블릭 오픈 데이터 그래프
│   └── .acl                 # 전 세계 누구나 읽기 가능
├── private/                 # 암호화된 개인 볼트
│   └── .acl                 # 소유자 단독 접근
└── .well-known/
    └── wolin.json           # Pod 메타데이터 및 AI Agent MCP 디스커버리 엔드포인트
```

### 2.3 스토리지 계층 샤딩 (OpenDAL 멀티테넌트)
* **스토리지 풀 격리**:
  * Pod ID를 파티션 키로 하여 S3/R2 버킷의 개별 접두사(`s3://wolin-pod-vault/{pod_id}/`) 또는 NVMe 디렉토리(`/var/data/wolin/pods/{pod_id}/`)로 물리 격리.
* **Oxigraph 네임드 그래프 격리**:
  * RDF 트리플은 Pod별로 고유 네임드 그래프(`urn:wolin:pod:{pod_id}`)로 분리 인덱싱되어 크로스 테넌트 데이터 유출을 원천 방지.
