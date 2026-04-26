# 프로젝트 테스트 중 발생한 이슈사항 모음

- vision 추출 과정에서 전체 추출이 완료된 후 각각의 추출 결과들을 하나로 합치는 기능이 필요해.
    - 현재

        ```
        {"error": "제공된 이미지/텍스트 데이터가 비어 있거나, 요청하신 '2026 금지약물' 정보를 포함하고 있지 않아 성분명을 추출할 수 없습니다."}

        --- Next Page ---

        {"error": "제공된 이미지에는 2026년 금지 약물 목록의 성분명이 포함되어 있지 않습니다. 이미지에는 'World Anti-Doping Code International Standard Prohibited List 2026'이라는 제목만 나와 있습니다."}

        --- Next Page ---

        {"error": "제공된 텍스트 데이터는 목차(Table of Contents)이며, 2026년 금지 약물에 대한 구체적인 성분명 정보가 포함되어 있지 않습니다. 따라서 성분명을 추출할 수 없습니다."}

        --- Next Page ---

        {"name": "N/A"}

        --- Next Page ---

        {"name": "BPC-157, 2,4-dinitrofenol (DNP), ryanidine receptor-1 calistabin complex stabilizers (e.g., S-107, S48168 (ARM210)) and tropin activators (e.g., riledesemiv and tirasemtiv)"}

        --- Next Page ---

        {"name": "Anabolic agents"}

        --- Next Page ---

        {"name": ["Testosterone", "Nandrolone", "Methandrostenolone", "Oxymetholone", "Anavar", "Trenbolone", "Masteron", "Dianabol", "Winstrol", "Stanozolol", "Drostanolone", "Flutamide", "Clomiphene", "Tamoxifen", "Bremelanotide"]}

        --- Next Page ---

        {"name": "Erythropoietin"}

        ...생략
        ```

        - 목표

        ```
        {
            "name": [
                "BPC-157, 2,4-dinitrofenol (DNP), ryanidine receptor-1 calistabin complex stabilizers (e.g., S-107, S48168 (ARM210)) and tropin activators (e.g., riledesemiv and tirasemtiv)",
                "Testosterone", "Nandrolone", "Methandrostenolone", "Oxymetholone", "Anavar", "Trenbolone", "Masteron", "Dianabol", "Winstrol", "Stanozolol", "Drostanolone", "Flutamide", "Clomiphene", "Tamoxifen", "Bremelanotide", "Erythropoietin", ...
            ]
        }
        ```

    - vision api에서 error message는 제거하는게 좋겠어.

- llama-server를 실행할때 --jinja 옵션을 활성화하는게 좋겠어.
    - --jinja 옵션 활성화를 기본 설정으로 하고 llama-server를 실행하기 전에 gguf 파일의 헤더 부분만 읽어서 'tokenizer.chat_template'이 존재하지 않으면 --jinja 옵션을 제거하는게 좋겠어.
