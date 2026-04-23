# PDF Parser - LLM 기능 테스트 가이드

본 문서는 PDF Parser 프로젝트의 LLM(대규모 언어 모델) 연동 기능을 테스트하기 위한 설정 및 실행 절차를 안내합니다.

## 1. 개요
현재 PDF Parser 앱은 로컬 모델(Ollama, LM Studio)과 클라우드 API 모델(Gemini, OpenAI, Claude)을 통한 PDF 텍스트 분석 및 정형화(JSON/Excel) 추출 기능을 제공할 예정입니다. 이 가이드를 따라 LLM 환경을 구축하고 테스트할 수 있습니다.

---

## 2. 사전 준비 (로컬 모델 구동 시)
로컬에서 오프라인으로 LLM을 구동하여 문서를 분석하고 싶다면, 아래 프로그램 중 하나를 설치해야 합니다.

### 옵션 A: Ollama 사용 (권장)
1. [Ollama 공식 홈페이지](https://ollama.com/)에서 설치 파일을 다운로드 및 설치합니다.
2. 터미널(명령 프롬프트)을 열고 모델을 다운로드 및 실행합니다.
   ```bash
   ollama run llama3
   # 또는 더 작고 빠른 모델
   ollama run qwen2.5:3b
   ```
3. 기본적으로 `http://localhost:11434` 포트에서 API 서버가 백그라운드로 작동하게 됩니다.

### 옵션 B: LM Studio 사용
1. [LM Studio 홈페이지](https://lmstudio.ai/)에서 설치 파일을 다운로드 및 설치합니다.
2. 원하는 모델(예: Llama-3-8B-Instruct GGUF 등)을 검색하여 다운로드합니다.
3. 좌측의 'Local Server' 탭(↔ 모양 아이콘)으로 이동하여 서버를 Start 합니다.
4. 기본 엔드포인트는 `http://localhost:1234/v1` 입니다.

---

## 3. 앱 내 설정 (Settings) 연동
앱을 실행한 뒤, 좌측 네비게이션 바에서 **Settings** 메뉴로 이동합니다.

### 3.1. 로컬 모델 설정
- **Local Models 탭**을 클릭합니다.
- 위에서 구성한 로컬 서버의 주소를 확인하고 입력합니다.
  - Ollama URL: `http://localhost:11434`
  - LM Studio URL: `http://localhost:1234/v1`
- **Save Settings** 버튼을 눌러 안전한 로컬 저장소(`tauri-plugin-store`)에 저장합니다.

### 3.2. 클라우드 모델 설정 (선택 사항)
- **Cloud Models 탭**을 클릭합니다.
- 발급받은 Google Gemini, OpenAI, Anthropic Claude API 키를 입력합니다.
- **Save Settings** 버튼을 눌러 저장합니다. (API 키는 사용자 기기 외부에 유출되지 않습니다.)

---

## 4. LLM 추출 기능 테스트 진행 (Home)
1. **앱 실행 및 PDF 로드**:
   - 좌측 네비게이션에서 **Home** 메뉴로 이동합니다.
   - 뷰어 상단의 **Open PDF** 버튼을 눌러 분석할 로컬 PDF 파일(예: 영수증, 계약서, 논문 등)을 선택합니다.
   - PDF가 화면 좌측에 정상적으로 렌더링되는지 확인합니다.

2. **LLM 텍스트 추출 확인 및 정형화 (현재 연동 완료!)**:
   - 우측 패널의 **Extraction Configuration**에서 **Text Extraction** 탭이 선택되었는지 확인합니다.
   - **Local Provider** 드롭다운에서 현재 백그라운드에 켜져 있는 로컬 서버(`Ollama` 또는 `LM Studio`)를 선택합니다.
   - **Model Name** 칸에 모델 이름을 입력합니다. (Ollama의 경우 `llama3`, LM Studio는 자동으로 로드된 모델을 사용하므로 임의로 적어도 됩니다.)
   - 프롬프트 입력칸에 추출하고 싶은 핵심 정보(예: "Extract all items, prices, and dates")를 입력합니다.
   - **Extract with Local Model** 버튼을 클릭합니다.
   - Rust 백엔드가 네이티브 환경에서 즉시 텍스트를 파싱하고, 이 텍스트와 프롬프트가 설정된 로컬 LLM 서버(Ollama/LM Studio)로 전송되어 백그라운드 분석이 진행됩니다.
   - 분석이 완료되면 결과값이 JSON으로 파싱되어 **Data Dashboard (테이블 뷰)**로 자동 전환됩니다.

---

## 5. 트러블슈팅 (문제 해결)
- **로컬 서버 연결 실패 (Connection Refused)**: Ollama나 LM Studio 서버가 백그라운드에서 정상적으로 켜져 있는지 확인하세요. 브라우저에서 `http://localhost:11434`를 입력했을 때 "Ollama is running" 메시지가 보이면 정상입니다.
- **메모리(RAM) 경고 표시**: 앱 좌측 하단(사이드바)의 메모리 인디케이터가 빨간색으로 점등될 경우, 현재 실행 중인 로컬 모델이 VRAM/RAM을 과도하게 점유하고 있는 것입니다. 더 작은 파라미터(예: 3B ~ 7B) 모델로 변경해 보세요.
- **PDF가 로드되지 않음**: 프로젝트 경로에 한글이 포함되어 있는지 확인하거나, 파일 탐색기 권한이 허용되었는지 확인하세요. 

---
> **oh-my-agent 팀의 안내사항**
> 본격적인 LLM 파이프라인 연동(Phase 4)이 진행되면, 위 4번 항목의 추출 결과가 Raw Text에서 "구조화된 표 또는 JSON 트리" 형태로 UI에 나타나게 됩니다. 테스트 시 이 문서의 절차를 참고해 주세요!
