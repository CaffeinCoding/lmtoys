# 프로젝트 테스트 중 발생한 이슈사항 모음

- data dashboard에 표시되는 table이 이상함.
    - 예를들어 데이터가
        ```json
        {
            "name": "1",
            "name": "2",
            "name": "3",
            "name": "4",
            "name": "5",
            "name": "6",
            "name": "7",
            "name": "8",
            "name": "9",
            "name": "10"
        }
        ```
        일 경우 table은
        |name|
        |---|
        |1|
        만 표시하고 있음.

- data dashboard의 data 추출 모델, 파라미터, 옵션 정보를 collapsible되게 표시할 필요가 있음.
    - 해당 정보들로 인해 table의 표시되는 영역이 작음.
    - 접었을때는 system prompt, user prompt, json format을 숨기고 열었을때 표시되도록 할 필요가 있음.
- 추출 완료될 시 llm response 출력을 유지했으면 좋겠음.
    - data 페이지로 이동되면서 llm response 출력이 사라져서 llm 어떤 출력을 했는지 확인할 수 없음.
- mmproj 파일을 같이 로드한 이후 text 추론 기능이 이상해짐.
    - 정확히 데이터를 1개만 추출하고 llm response가 종료됨.
    - data dashboard에도 1개의 데이터만 표시됨.
- 다운로드 중인 모델이 무엇인지 확인이 필요함.
    - 상단바 우측에 다운로드 아이콘 버튼을 배치한 후 해당 버튼을 누를 경우 현재 다운로드가 진행 중인 모델들을 popover 형태로 확인할 수 있으면 좋겠음.
- vision 추출 기능이 제대로 동작하지 않음.
    - data dashboard에도 'Error: 제공해주신 이미지/텍스트 데이터가 비어 있거나, 금지 약물 성분명 정보를 포함하고 있지 않아 추출할 수 없습니다.' 라는 데이터가 표시됨.
- '{모델명}\_setting.json'에 json format 데이터가 저장되지 않음.
    - 앱을 재시작하거나 모델을 교체할 시 json format이 마지막으로 설정했던 json format이 아님.
    - json.stringify로 저장했다가 다시 재사용할 수 있었으면 좋겠음.
