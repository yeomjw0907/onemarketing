# 원케이션 MCP·OAuth 연결

관리자 전용 도구 연결이다. AI 모델을 원케이션 안에서 새로 호출하지 않으며 ChatGPT·Codex가 기존 업무 함수를 제한된 MCP 도구로 호출한다. 자체 챗봇이나 대화 위젯은 추가하지 않는다.

## 연결 주소

- MCP: `https://www.onemarketing.kr/api/mcp`
- 연결 관리: `https://www.onemarketing.kr/connect/onecation` (운영 설정에서도 접근)
- 보호 리소스 메타데이터: `/.well-known/oauth-protected-resource/api/mcp`
- 인증 서버 메타데이터: `/.well-known/oauth-authorization-server`

Codex CLI에서는 다음 명령으로 등록한다. 기존 OpenAI API 키나 관리자 비밀번호를 설정 파일에 적지 않는다.

```powershell
codex mcp add onecation --url https://www.onemarketing.kr/api/mcp
codex mcp login onecation --scopes catalog:read,catalog:write,campaigns:draft
```

브라우저에서 기존 원케이션 관리자 계정으로 로그인하고 권한을 확인한 뒤 연결을 허용한다. 클라이언트가 연결된 도구를 다시 불러와야 하므로 새 대화 또는 앱 새로고침이 필요할 수 있다. ChatGPT에서는 해당 계정·워크스페이스에서 지원하는 커스텀 MCP 연결 설정에 위 주소와 OAuth 인증을 사용한다.

## 도구와 범위

| 도구 | 동작 | 권한 |
|---|---|---|
| `search` | 삭제되지 않은 고객·제품 검색 | `catalog:read` |
| `fetch` | 선택한 고객·제품의 허용된 업무 필드 조회 | `catalog:read` |
| `list_campaign_options` | 블로그·클립 상품, 공급 단가와 규격 조회 | `catalog:read` |
| `create_customer` | 고객 신규 등록, 같은 이름이면 기존 항목 반환 | `catalog:write` |
| `create_product` | 고객 하위 제품 신규 등록, 같은 이름이면 기존 항목 반환 | `catalog:write` |
| `create_campaign_draft` | 기존 견적 초안 저장, 주차별 수량·공급가 계산 | `campaigns:draft` |

등록과 초안 저장은 정확한 내용을 사용자에게 보여주고 승인받은 뒤 `confirmed: true`와 UUID `requestId`를 전달한다. 같은 요청은 같은 결과를 반환하며, 같은 요청 번호로 내용을 바꾸면 거부한다. 고객·제품의 기존 데이터를 덮어쓰는 도구는 없다.

초안을 생성하려면 고객·제품, 게시 수량, 시작일·마감일, 적용 상품을 확인해야 한다. 날짜·상품·가격을 임의로 추측하지 않는다. 초안은 **캠페인 운영**의 기존 견적·문서 검토 화면에 나타난다. 운영자가 문서를 확인하고 직접 확정해야 계약·프로젝트가 만들어진다.

계약 확정, 프로젝트 생성, 유료 AI 생성, 참여자 제안, 카카오톡 발송, 지급 도구는 제공하지 않는다. 기존 화면에서 운영자가 확인하여 진행한다. 참가자 개인정보, 내부 메모, 인증 토큰, 운영 API 키를 조회하는 도구도 없다. 저장된 업무 데이터의 문구는 지시가 아닌 참고 자료로 취급한다.

## OAuth 구현

- 공식 MCP TypeScript SDK의 상태 없는 Streamable HTTP 전송 사용. 세션 쿠키만으로 MCP를 호출할 수 없다.
- 공개 클라이언트 DCR, Authorization Code + PKCE S256, 고정 리소스 대상·등록 redirect URI 검증.
- 일부 Codex CLI가 `resource`를 생략하면 원케이션 MCP를 유일한 기본 대상으로 사용한다. 다른 `resource`를 명시하면 거부하며 발급 토큰도 고정된 원케이션 MCP 대상에만 유효하다.
- 등록 callback은 ChatGPT의 connector callback과 Codex의 loopback `/callback`만 허용한다. 원격 URL을 가져오는 CIMD는 구현하지 않고 DCR을 사용한다.
- 관리자 목록은 기존 `ADMIN_USERS_JSON`을 사용하고 요청마다 관리자 자격을 재확인한다.
- 권한 허용 POST는 관리자 세션, 같은 출처 검사, 브라우저에 묶인 일회용 요청을 모두 요구한다.
- 연결 요청 10분, 인증 코드 5분, access token 1시간, refresh token 30일, grant 최대 90일. 만료 시 다시 연결한다.
- 토큰은 원문 대신 해시로 저장한다. Refresh는 회전하며 사용한 refresh를 재사용하면 전체 연결을 취소한다. 연결 관리에서 수동 해제도 가능하다.
- 인증 데이터는 `mcp_oauth`, 요청 제한은 `mcp_rate_limits`에 저장한다. 일반 `records`·`/api/data`와 분리하며 두 테이블 모두 RLS 및 브라우저 역할 권한 철회를 적용한다.
- 서버 `APP_URL`은 실제 HTTPS 운영 주소여야 한다. 새 모델 API 키나 OAuth client secret은 필요하지 않다. `MCP_ENABLED=false`로 인증·호출을 중단할 수 있다.

배포 전 `npm run db:migrate`로 인증 테이블을 적용한다. 만료된 OAuth 행과 rate-limit 행은 보관 필요에 따라 만료 시각 기준으로 정리할 수 있다. 활성 grant나 사용한 refresh 기록을 임의로 삭제하지 않는다.

## 검증

전체 215개 테스트 통과. OAuth의 대상·redirect·PKCE·브라우저 바인딩 오류, 코드 재사용, refresh 재사용과 취소, 관리자 제거·만료, 읽기 전용 권한, 금지 도구, 중복 등록·재시도, 초안 생성 후 계약·작업·발송이 생기지 않는 경계, 실제 MCP initialize/list/call을 검증했다.

격리 QA에서 실제 브라우저 로그인→권한 허용→토큰 교환→고객·제품 등록→연결 해제→토큰 거부를 확인했다. 1440/768/390/360px에서 가로 넘침·브라우저 실행 오류가 없었다. 실제 고객 캠페인·카톡 발송·유료 생성·지급은 실행하지 않았다.

공식 문서: [MCP 서버](https://developers.openai.com/plugins/build/mcp-server), [OAuth 인증](https://developers.openai.com/plugins/build/auth), [도구 설계](https://developers.openai.com/plugins/plan/tools), [Codex MCP](https://learn.chatgpt.com/docs/mcp).
