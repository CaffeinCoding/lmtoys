# 프로젝트 테스트 중 발생한 이슈사항 모음

- data dashboard에 history 접기/펴기 아이콘 버튼과 삭제 아이콘 버튼의 위치를 변경해줘.
    - export csv 버튼 우측에 배치해줘.
    - 버튼 순서는 (삭제 아이콘 버튼, history 접기/펴기 아이콘 버튼)이야.
- export excel, csv 처리를 할때 raw response에서 json key가 같은 value를 묶어서 데이터 누락되는 문제가 발생했어.
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
        일 경우 export된 데이터는
        |name|
        |---|
        |1|
        만 표시하고 있어.
        - 목표형태
          |name|
          |---|
          |1|
          |2|
          |3|
          |4|
          |5|
          |6|
          |7|
          |8|
          |9|
          |10|
- 다양한 성능의 pc를 지원하고 정확성을 높이기 위해 이미지 batch 처리를 제거하고 한번에 1장의 이미지를 request하도록 수정하는게 좋겠어.
    - 한번에 처리 가능한 이미지 갯수 옵션을 삭제하는게 좋겠어.
    - 각각의 request의 response를 모아서 하나의 결과처럼 보이도록 했으면 좋겠어.
- llama-server와 통신에 부분에 최적화와 리펙토링이 필요해.
    - 기존 home.tsx에 구현되어있는 llama-server 통신 부분을 src/api 폴더에 별도의 파일로 분리가 필요해.
    - openai api의 표준 멀티모달(multimodal) 형식을 따르도록 수정이 필요해.
    - openai의 Node.js/Browser SDK 라이브러리를 설치해서 type 안전성과 통신 규격의 일관성을 확보하는게 좋겠어.
        - openai를 사용할때 api key를 설정하지 않으면 동작하지 않는 문제가 있긴 한데 어차피 llama-server는 로컬/내부망에서 동작하기 때문에 dangerouslyAllowBrowser 옵션을 true로 해당 문제를 해결하는게 좋겠어.
