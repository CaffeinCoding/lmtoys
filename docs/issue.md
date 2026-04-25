# 프로젝트 테스트 중 발생한 이슈사항 모음

- 새로고침(f5)에 대한 핸들링 부족
    - llama-server가 동작 중인 상태에서 새로고침(f5) 시 UI에 '실행 중' 상태가 유지되지 않음.
- pdf previewer의 preview, next, page nums, zoom in-out의 위치를 card 콘텐츠 상단으로 고정필요.
- pdf에서 데이터 추출 시 설정한 json format에 맞게 데이터를 추출하지 않음.
    - llm 모델의 output을 json format에 맞게 출력하는 방법에 대한 현재 최신 자료를 깊이 조사한 후 문제 해결 진행 필요.
- 모델 파라미터 및 추출 옵션을 저장할때 json format에 대한 데이터를 함께 저장 필요.
- data dashboard에 해당 data를 추출할때 설정한 json format에 대한 정보를 표시 필요.
