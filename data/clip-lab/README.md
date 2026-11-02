# 참고 영상 관찰 1,000개

`reference-catalog-1000.json.gz`에는 공개 Shorts URL 1,000개와 구조 검증을 통과한 AI 관찰, 장면 연결 조건, 편집 가설과 수집 당시 메타데이터가 들어 있다. 기존 30개 시험과 겹치는 URL은 없다. 원본 영상과 서비스의 비공개 제품 자료, API 키, 공급사 요청 ID는 포함하지 않는다.

44개 채널의 후보 1,800개에서 성공 관찰 1,000개를 확보했다. 채널 간 순환 표집이며 성과 순위나 무작위 표본이 아니다. 표시 조회수 100만 회 이상은 285개, 1,000만 회 이상은 81개다. 조회수는 수집 당시 표시값이어서 반올림과 게시 시점 차이가 있다.

669개는 Gemini 직접 API에서 0~30초·1fps 입력으로 분석했다. 331개는 fal/OpenRouter를 통해 Gemini에 공개 URL을 전달하고 첫 30초를 관찰하도록 지시했다. 후자의 실제 입력 범위와 샘플링은 공급사 기본값이므로 `inputClipping`, `samplingFps`, `provider`, `model`, `version`을 함께 확인한다. 모델 가중치를 재학습한 데이터가 아니며 원본 대조와 성과 검증 전 후보 자산이다.

```powershell
npm run clip-lab:catalog -- import 'data/clip-lab/reference-catalog-1000.json.gz' 'output/clip-lab-library'
$env:CLIP_LAB_DATA_DIR = 'output/clip-lab-library'
npm run clip-lab
```

카탈로그를 가져오면 키 없이 열람·검색·검토할 수 있다. 기존 검토 기록은 덮어쓰지 않는다. 공급사 사용량 원본은 공유 카탈로그에서 제외했으므로 가져온 화면의 비용은 미확인으로 표시한다. 상세 결과와 구현 범위는 [결과 보고서](../../docs/clip-lab-results-1000.md)와 [실행 문서](../../docs/clip-lab-production.md)에 있다.

SHA-256: `91906d188a948dcd596e9a68bf6e368037497a91f3842609c6b892dd98e48c02`
