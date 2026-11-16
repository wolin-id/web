# Wolin (月印千江) — Inrupt 및 W3C Solid 상호운용성(Interoperability) 규격서

## 1. 개요
**Wolin (月印千江)**은 독자적인 데이터 사일로를 지양하고, Sir Tim Berners-Lee가 주도하는 W3C Solid 0.11 생태계 및 Inrupt(Enterprise Solid Server, ESS)와 완전한 데이터·신원 양방향 호환을 제공합니다.

---

## 2. 4대 상호운용 프로토콜 규격

### 2.1 Solid-OIDC · JWKS 검증 · DPoP (`at+jwt`) 신뢰 체인
* **W3C Solid-OIDC 명세 준수**: 정규 발급자 **`https://auth.wolin.id`**는 물론 외부 Solid-OIDC IdP(예: `https://login.inrupt.com`)가 발급한 토큰에서 `webid` 클레임을 추출·검증합니다.
* **암호학적 JWKS 서명 검증 및 `at+jwt` 혼동 차단**:
  * `wolin-identity`의 `JwksSignatureVerifier`가 `ES256`, `ES384`, `RS256`, `PS256`, `EdDSA` JWS 서명을 검증합니다.
  * DPoP 바인딩 액세스 토큰에 대해 JWT 헤더 `typ: "at+jwt"`(또는 `application/at+jwt`)를 강제하여 `id_token` 오용 공격을 차단합니다.
* **외부 WebID 역참조 (Dereferencing)**:
  * 토큰 발급자(`iss`)가 외부 IdP인 경우 `webid` URI(예: `https://id.inrupt.com/alice#me`)의 RDF 문서를 HTTP `GET`(Turtle/JSON-LD)으로 역참조하여 `<#me> solid:oidcIssuer ?issuer` 트리플과 JWT `iss`의 일치를 검증합니다.
* **DPoP (RFC 9449) Proof of Possession**:
  * `dpop+jwt` 서명, 정규화된 `htu`(쿼리·프래그먼트 제거), `htm`, `ath`(액세스 토큰 SHA-256 Base64URL 해시), `cnf.jkt` 지문 바인딩 및 `jti` 리플레이 방지를 검증합니다.

### 2.2 스토리지 탐색 및 W3C Workspace Ontology (Discovery)
* **`pim:storage` 규격**:
  * 사용자의 WebID Profile 카드(`https://{pod_id}.wolin.id/profile/card#me`)에 `<#me> <http://www.w3.org/ns/pim/space#storage> <https://{pod_id}.wolin.id/>` (또는 경로 기반 `https://pod.wolin.id/pods/{pod_id}/`) 트리플을 발행합니다.
  * Inrupt `@inrupt/solid-client` 및 Wolin 공식 5대 SDK가 WebID만으로 Pod 루트를 자동 탐색합니다.
* **`ldp:inbox` 규격**:
  * `<#me> <http://www.w3.org/ns/ldp#inbox> <https://{pod_id}.wolin.id/inbox/>`를 제공하여 Linked Data Notifications 및 에이전트 간 비동기 알림 수신을 지원합니다.

### 2.3 WAC & Inrupt ACP 듀얼 인가 호환 (Authorization)
* **Inrupt ACP (Access Control Policy)**:
  * Inrupt ESS의 인가 모델인 ACP 규격(`acp:AccessControl`, `acp:Policy`, `acp:Matcher`, `acp:allOf`, `acp:anyOf`, `acp:noneOf`)을 네이티브 수용합니다.
* **WAC (Web Access Control)**:
  * Community Solid Server(CSS) 등이 채택하는 `.acl` 리소스 규격(`acl:Authorization`, `acl:agent`, `acl:agentClass`, `acl:default`)을 네이티브 수용합니다.
* `wolin-policy` PDP 엔진은 대상 리소스의 메타데이터가 WAC이든 ACP이든 명시적 거부 우선(Deny-Overrides) 원칙으로 결정론적 판정을 수행합니다.

### 2.4 LDP HTTP 통신 및 클라이언트 SDK 호환성
* **외부 표준 클라이언트 호환**: `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser`, `rdflib.js` 완벽 호환.
* **Wolin 5대 공식 SDK & 스타터**:
  * TypeScript / React: `@wolin-id/client`, `@wolin-id/react` (`wolin-id/sdk-js`)
  * Python: `wolin-id` (`wolin-id/sdk-python`)
  * Unity C#: `id.wolin.unity` (`wolin-id/sdk-unity`)
  * Swift 6: `WolinKit` (`wolin-id/sdk-swift`)
  * Kotlin / Android / JVM: `id.wolin:sdk-kotlin` (`wolin-id/sdk-kotlin`)
  * 3D Metaverse Starter: `wolin-id/metaverse-starter`
* **필수 HTTP 헤더 및 최적화**:
  * `Link: <http://www.w3.org/ns/ldp#BasicContainer>; rel="type"` / `<http://www.w3.org/ns/ldp#Resource>; rel="type"`
  * `Link: <./resource.acl>; rel="acl"`
  * `WAC-Allow: user="read write append control",public="read"`
  * 강한 `ETag` 기반 `If-Match` / `If-None-Match` 낙관적 동시성 제어 및 대용량 바이너리(`>= 256 KiB`) 인가 후 단기 `HMAC-SHA256` 서명 `302 Found` R2 리다이렉트 호환.
