# 연구 결과를 영상 제작에 연결하는 방법

## 이번에 구현한 연결

기존 Seedance 생성기를 유지한다. 짧은 클립마다 시작 상태, 종료 상태, 다음 장면과 맞출 조건을 정하고 승인한 다음 생성한다. 영상 모델은 제품의 움직임만 만들고, 화면 문구와 음악·더빙은 HyperFrames에서 별도 트랙으로 조립한다.

기존 운영 코드에는 `MediaBrief.scenes`의 `startState`, `endState`, `continuityConstraint`를 선택 필드로 추가했다. 브리핑 생성기가 이를 제안하고 운영자가 기존 검수 화면에서 수정할 수 있다. 승인 시 `briefingPrompt`가 해당 내용을 최종 생성 프롬프트에 포함한다. 이전 브리핑은 그대로 읽을 수 있다.

여러 생성 영상을 연결하는 실험은 독립 로컬 제작 도구다. `storyboard.mjs`가 검증된 JSON 계획을 장면별 HTML, 타임라인, 영상·음성 트랙으로 컴파일한다. `pizza-examples.mjs`는 같은 원본 클립 3개를 다른 순서와 화면 구성으로 묶은 예시 3개를 만든다. 실제 파일 생성과 편집 엔진의 동작을 시험한 것이며, 고객용 서비스에 다중 클립 자동 생성 버튼을 배포했다는 뜻은 아니다.

## 도구의 역할

- Gemini API: 공개 영상의 첫 30초를 1fps로 관찰하고 대표 구간과 실험할 규칙을 구조화한다. 공식 문서가 복수 영상 입력을 지원하므로 5개씩 보내고 원본 ID를 엄격하게 대조한다. 접근 불가 영상 하나 때문에 다른 관찰을 버리지 않는다.
- yt-dlp: 공개 채널의 Shorts 탭에서 URL·제목·표시 조회수를 수집한다. 이번 수집에서는 참고 영상의 미디어를 내려받지 않는다.
- Seedance / fal: 승인된 기준 이미지에서 실제로 움직이는 클립을 만든다. 입력 해시와 요청 ID를 보관하고 재실행 시 기존 결과를 수거한다.
- HyperFrames: HTML·GSAP 타임라인에서 클립을 배열하고 한국어 제목, 더빙, 음악을 조립한다. 세로 화면, 글자·겹침·대비, 런타임과 오디오를 검사한 뒤 MP4로 렌더링한다.
- Playwright나 브라우저 제어: 미리보기와 화면 검증에 쓴다. 영상 내용 분석이나 모델 학습을 대신하지 않는다.
- vidIQ: 이번 실험에서는 호출하지 않는다. 향후 실제 게시 성과 비교가 필요할 때 별도로 검토한다.

## 대규모 분석 실행

Node.js 22 이상과 비공개 `GEMINI_API_KEY` 환경변수가 필요하다. 키를 명령줄 인수·URL·저장소에 넣지 않는다.

```powershell
$env:CLIP_LAB_DATA_DIR = '분석 데이터 폴더'
# 수집: YTDLP_PATH에 공식 yt-dlp 실행 파일 경로를 지정한다.
npm run clip-lab:collect
# 기존 결과를 재사용하며 성공 관찰 1,000개까지 진행한다.
npm run clip-lab:research:group
```

분당 15회 제한을 확인한 키에서는 요청 시작 간격을 4.3초 이상 두고, HTTP 429가 오면 공급사의 대기 시간을 반영한다. 429·503만 한 차례 다시 시도한다. 전송 불확실, 중단된 전송, 잘린 응답은 자동 재전송하지 않는다. 같은 데이터 폴더에서는 실행기를 하나만 실행한다. 재시작 시 공급사 응답을 확인하지 못한 기록을 완료로 간주하지 않으며, 다른 후보로 목표 수를 채운다.

단일 영상 방식 `clip-lab:research`도 남겨 두었다. 대규모 분석에는 묶음 방식을 사용한다. 묶음 요청의 실제 사용량은 `batches`에 한 번 기록하고, 영상별 비용 표시는 해당 요청의 추정 비용을 균등 배분한 값이다. 영상별 실제 토큰이나 실제 청구액을 뜻하지 않는다.

직접 API가 장시간 대기를 반환할 때 사용할 대체 경로도 구현했다. 비공개 `FAL_KEY`가 설정된 프로세스에서 `npm run clip-lab:research:fal`을 실행한다. `openrouter/router/video`를 통해 `google/gemini-3.5-flash-lite`에 공개 URL을 전달하며, 필수 추론을 켜고 웹 검색은 끈다. 이 경로는 유료이며 요청 ID로 기존 결과를 이어 수거한다. 같은 폴더의 직접 API 실행기는 먼저 종료해야 한다. 연속 3개 묶음에서 유효한 결과를 얻지 못하면 신규 제출을 중지한다.

이 대체 경로는 명시적인 프레임 간격과 입력 구간 설정을 제공하지 않는다. 첫 30초만 관찰하라는 프롬프트를 사용하지만 전체 영상이 입력될 수 있어 `samplingFps: null`, `inputClipping: provider-default`로 구분한다. 직접 API의 `0~30초·1fps` 설정과 동일한 입력 조건으로 간주하지 않는다. 공급사가 응답한 비용은 `providerReportedUsd`이며 실제 청구서와 별도로 표시한다.

## 지식을 저장하고 다시 열기

`research`의 관찰에는 원본 URL, 범위, 샘플링 간격, 모델과 프롬프트 버전, 시작·끝 상태, 연결 조건과 근거 구간이 남는다. `knowledge.json`은 원본 관찰에서 규칙 후보를 모은다. 키워드 빈도는 적용 가능한 관찰을 찾기 위한 분류이며 성공 원인을 증명하지 않는다.

```powershell
# 성공 1,000개가 있어야 내보내기 성공
npm run clip-lab:catalog -- export '분석 폴더' '관찰 카탈로그.json'
# 검토용 로컬 폴더로 가져오기. 기존 기록·검토를 덮어쓰지 않는다.
npm run clip-lab:catalog -- import '관찰 카탈로그.json' 'output/clip-lab-library'
$env:CLIP_LAB_DATA_DIR = 'output/clip-lab-library'
npm run clip-lab
```

로컬 연구소에서 분야·조회수·내용을 검색하고 원본 구간을 대조할 수 있다. 근거 영상 링크를 제공하며 검토 기록은 버전 충돌을 확인한다. 카탈로그를 가져온 폴더는 키 없이 열 수 있다. 공급사 요청 ID와 비밀 키는 공유용 카탈로그에서 제외한다.

## 편집 프로젝트 만들기

`npm ci`로 고정된 `hyperframes@0.9.5`를 설치한다. FFmpeg와 ffprobe, Chrome이 필요하다. 이 컴퓨터에서는 `HYPERFRAMES_BROWSER_PATH`, `HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH`로 실행 경로를 지정했다.

```powershell
# 계획 파일, 편집 프로젝트, 영상·음성 폴더, 한국어 폰트 순서
npm run clip-lab:storyboard -- 'plan.json' 'work/video-project' '자료 폴더' '한국어 폰트.ttf'
npx hyperframes check 'work/video-project' --json
npx hyperframes preview 'work/video-project' --background
npx hyperframes snapshot 'work/video-project' --review
# 프레임을 검토한 다음 실행
npx hyperframes render 'work/video-project' --quality delivery --fps 30 --workers 1 --low-memory-mode --output 'output/final.mp4'
# 별도 파일로 오디오 레벨을 보정한다. 영상은 재인코딩하지 않는다.
npm run clip-lab:master -- 'output/final.mp4' 'output/final-master.mp4'
```

계획은 `clip-storyboard-v1`이다. 2~8개 장면이 빈 구간 없이 이어져야 하고, 장면마다 1~5초의 길이, 파일, 제목, 시작·끝 상태와 연결 조건이 필요하다. 실제 영상 길이와 오디오 가독성은 HyperFrames 검사에서 다시 확인한다. 짧은 예시의 화면 문구는 장면 제목이며 단어 단위 더빙 자막이 아니다.

## 운영 서비스로 확장할 경계

Next.js 요청에서는 브리핑 승인과 제작 작업 등록까지만 처리하고, 영상 생성·다운로드·Chrome 렌더는 별도 작업자가 맡는 구조가 적합하다. 생성 요청 ID, 계획 해시, 단계별 산출물과 검수 결과를 작업 기록에 연결한다. 운영 DB에 이 흐름을 연결하기 전에는 작업 lease, 공급사 비용 예약, 재시작 복구와 프로젝트 권한 검사를 추가해야 한다. 로컬 JSON 실행기는 다중 서버 작업 큐가 아니다.

관찰만으로 규칙을 자동 승격하지 않는다. 원본 대조 → 동일한 제품·대본으로 구성 비교 → 제품 형태·글자·컷 연결 검수 → 게시 성과 측정 순서로 채택한다. 조회수는 수집 시점의 공개 표시값이고 영상 게시 후 경과 시간·유료 노출을 보정하지 않았다. 좋아요·댓글·유지율·구매 전환은 이번 분석의 측정 대상이 아니다. 모델 가중치 학습이나 미세 조정도 수행하지 않았다.

## 공식 자료

- [Gemini 영상 입력과 복수 영상 지원](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Gemini 요청 한도](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini 공식 단가](https://ai.google.dev/gemini-api/docs/pricing)
- [HyperFrames 공식 저장소](https://github.com/heygen-com/hyperframes)
- [Seedance 2.5 이미지 기반 영상](https://fal.ai/models/bytedance/seedance-2.5/image-to-video)
- [MiniMax Speech 2.8 HD](https://fal.ai/models/fal-ai/minimax/speech-2.8-hd)
- [Stable Audio 2.5](https://fal.ai/models/fal-ai/stable-audio-25/text-to-audio)
- [fal의 OpenRouter 영상 분석 API](https://fal.ai/models/openrouter/router/video/api)
- [FFmpeg 오디오 레벨 보정](https://ffmpeg.org/ffmpeg-filters.html#loudnorm)
