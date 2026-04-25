# 프로젝트 리팩토링 명세서: 2-Layer 로컬 LLM 아키텍처 도입 (Tauri + React + llama-server)

## 1. 프로젝트 개요 및 목표

현재 Rust 백엔드에서 `llama-cpp-2` 바인딩을 통해 단일 프로세스(정적 빌드)로 구동 중인 로컬 LLM 환경을, **Tauri Main 프로세스와 `llama-server` Subprocess로 완전히 분리하는 2-Layer 아키텍처로 개편**한다.

- **프론트엔드:** React 19
- **백엔드:** Tauri (Rust)
- **추론 엔진:** `llama-server.exe` (Subprocess)

---

## 2. 배포 및 런타임 폴더 구조 (필수 구성)

Tauri 프로젝트의 `src-tauri/resources/bin/` 하위에 런타임별로 폴더를 구성한다.
AI는 아래 구조를 가정하고 `tauri.conf.json`의 `resources` 번들링 설정과 Rust의 `path_resolver` 로직을 작성해야 한다.

```text
src-tauri/
└── resources/
    └── bin/
        ├── cpu/
        │   └── llama-server.exe
        ├── vulkan/
        │   └── llama-server.exe
        └── cuda12/
            ├── llama-server.exe
            ├── cudart64_12.dll
            ├── cublas64_12.dll
            └── cublasLt64_12.dll
```

## 3. Rust 백엔드 핵심 구현 요구사항

### 3.1 서브 프로세스 실행 및 관리 (std::process::Command)

- 프론트엔드에서 전달받은 runtime 설정값(cpu, vulkan, cuda12)에 따라 올바른 경로의 llama-server.exe를 실행한다.
- stdout과 stderr를 파이프(Stdio::piped())로 연결하여 로딩 상태 및 에러 로그를 캡처하고, Tauri의 emit을 통해 프론트엔드로 전달한다.

### 3.2 🚨 좀비 프로세스 방지 (매우 중요)

Tauri 메인 앱이 비정상 종료되거나 사용자가 'X' 버튼으로 종료할 때, llama-server.exe가 백그라운드에 남아 VRAM을 점유하는 것을 완벽히 차단해야 한다.

- Windows 환경: windows 또는 winapi 크레이트를 사용하여 Job Object를 생성하고, 서브 프로세스를 Job에 할당하여 부모 프로세스 종료 시 OS 레벨에서 자식 프로세스를 자동 정리하도록 구현한다.
- Tauri의 RunEvent::Exit 이벤트를 훅(Hook)하여 명시적으로 child.kill()을 호출하는 안전장치를 추가한다.

### 3.3 에러 처리 및 Fallback

- 서브 프로세스 실행 실패 또는 실행 중 크래시 발생 시, Rust 백엔드에서 이를 감지하고 프론트엔드에 명확한 에러 이벤트(llm-crash)를 전달한다.
- HTTP 포트가 이미 사용 중인 경우의 에러를 핸들링한다.

## 4. React 프론트엔드 구현 요구사항

### 4.1 설정 페이지 (Settings Page)

- 런타임 선택: Dropdown 또는 Radio 버튼으로 구성 (CPU, Vulkan, CUDA 12). 변경 시 Rust 백엔드의 설정 파일에 저장.
- 포트 설정: llama-server가 바인딩할 로컬 포트 번호를 입력받음 (기본값: 8080).

### 4.2 헤더 영역 (Header UI)

- 모델 선택기: models/ 디렉토리에 있는 .gguf 파일 목록을 불러와 선택할 수 있는 Dropdown.

- 모델 파라미터 설정:
    - Context Size (-c)
    - GPU Offload Layers (-ngl)
    - 기타 옵션(Threads 등)
    - 자세한 옵션의 경우 [link](https://github.com/johndpope/llama-cpp-turboquant/tree/master/tools/server#common-params)를 참고

- [서버 시작/중지] 버튼: 위 설정값들을 모아 Tauri 커맨드를 호출하여 llama-server를 실행하거나 종료한다.

### 4.3 하단 상태표시줄 (Footer Status Bar)

- 현재 상태 표시: 오프라인, 로딩 중..., 실행 중 (🟢) 상태를 시각적으로 구분하여 표시.
- 로드된 모델 정보: 현재 실행 중인 모델 이름, 선택된 런타임, 점유 중인 포트 번호를 표시 (예: Gemma-2B (Vulkan) | Port: 8080).

## 5. 실행 인자 매핑 (Tauri Command -> llama-server)

헤더 및 설정 페이지에서 입력된 값들은 아래와 같이 llama-server의 CLI 인자로 맵핑되어 실행되어야 한다.

```bash
llama-server.exe --port {설정_포트} --model {선택된_모델_경로} -c {컨텍스트_사이즈} -ngl {GPU_오프로드_수}
```

## 6. 개발 진행 가이드라인 (프롬프트 지시)

1. 먼저 src-tauri/src/main.rs와 서브 프로세스 관리를 담당할 모듈(예: llm_runner.rs)을 분리하여 작성해라. 특히 Job Object 구현부를 꼼꼼하게 주석과 함께 작성해라.

2. React의 헤더와 설정 페이지 UI 컴포넌트의 초안을 작성하고, Tauri 연동(invoke, listen) 코드를 작성해라.

3. 에러 발생 시 사용자에게 Alert이나 Toast를 띄울 수 있는 전역 에러 핸들링 로직을 포함해라.
