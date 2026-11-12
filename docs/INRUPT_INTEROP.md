# Wolin - Inrupt 및 W3C Solid 상호운용성(Interoperability) 규격서

## 1. 개요
Wolin은 독자적인 데이터 사일로를 지양하고, Sir Tim Berners-Lee가 주도하는 W3C Solid 생태계 및 Inrupt(Enterprise Solid Server, ESS)와 완전한 데이터 및 신원 양방향 호환을 목표로 합니다.

## 2. 4대 상호운용 프로토콜 규격

### 2.1 Solid-OIDC & DPoP 신뢰 체인 (Authentication)
* **W3C Solid-OIDC 명세 준수**: 클라이언트가 제시하는 Bearer/DPoP JWT 토큰에서 `webid` 클레임을 추출.
* **외부 WebID 역참조 (Dereferencing)**:
  * 토큰의 발급자(`iss`)가 Wolin 자체 IdP가 아니더라도(예: `https://login.inrupt.com`), 토큰에 담긴 `webid` URI(예: `https://id.inrupt.com/alice#me`)의 RDF 문서를 HTTP GET(Turtle/JSON-LD)으로 역참조.
  * 역참조된 RDF 그래프 내에서 `<#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> ?issuer` 트리플을 조회하여 서명된 JWT의 `iss`와 일치하는지 신뢰 체인 검증.
* **DPoP (RFC 9449) Proof of Possession**:
  * 리플레이 및 토큰 탈취 방지를 위한 DPoP 헤더(`DPoP: <jwt>`)의 HTTP 메서드, URI 바인딩 검증.

### 2.2 스토리지 탐색 및 W3C Workspace Ontology (Discovery)
* **`pim:storage` 규격**:
  * 사용자의 WebID Profile 카드(`/profile/card#me`)에 `<#me> <http://www.w3.org/ns/pim/space#storage> </pods/{pod_id}/>` 트리플 발행.
  * Inrupt `@inrupt/solid-client` SDK가 사용자의 WebID를 질의할 때 자동으로 Wolin의 Pod 루트를 탐색할 수 있도록 보장.
* **`ldp:inbox` 규격**:
  * `<#me> <http://www.w3.org/ns/ldp#inbox> </pods/{pod_id}/inbox/>` 제공.
  * 외부 Solid Pod 사용자가 에이전트 간 비동기 알림(ActivityPub / Linked Data Notifications) 및 자원 공유 요청을 Wolin Pod의 수신함으로 전달 가능.

### 2.3 WAC & Inrupt ACP 듀얼 인가 호환 (Authorization)
* **Inrupt ACP (Access Control Policy)**:
  * Inrupt ESS의 기본 인가 모델인 ACP 규격(`acl:accessControl`, `acl:policy`, `acl:matcher`, `acl:all`, `acl:none`) 네이티브 수용.
* **WAC (Web Access Control)**:
  * Community Solid Server(CSS) 및 Node Solid Server가 채택하는 `.acl` 파일 규격 네이티브 수용.
* Wolin PDP 엔진은 요청된 리소스의 접근 제어 메타데이터가 WAC이든 ACP이든 투명하게 판정.

### 2.4 LDP HTTP 통신 및 클라이언트 라이브러리 지원
* `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser`, `rdflib.js` 등 표준 클라이언트 완벽 호환.
* 필수 HTTP 헤더:
  * `Link: <http://www.w3.org/ns/ldp#BasicContainer>; rel="type"`
  * `Link: <http://www.w3.org/ns/ldp#Resource>; rel="type"`
  * `Link: <./resource.acl>; rel="acl"`
  * `WAC-Allow: user="read write",public="read"`
