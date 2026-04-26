# 통신 API 명세서 (API Specification)

본 문서는 프론트엔드(React)와 백엔드(Rust) 간의 **Tauri Command (IPC 통신)** 및 **이벤트(Event)** 명세를 정리합니다.

## 1. 시스템 및 환경 모니터링 API

### `get_system_memory`
- **설명**: 시스템의 RAM 용량 정보를 반환합니다.
- **반환값**: `{ "total": number, "used": number }` (바이트 단위)

### `get_system_vram`
- **설명**: NVIDIA GPU 환경에서 `nvidia-smi`를 쿼리하여 VRAM 정보를 반환합니다.
- **반환값**: `{ "total": number, "used": number }` (바이트 단위) 또는 `null`

### `get_supported_runtimes`
- **설명**: 현재 빌드 환경에서 구동 가능한 GPU 런타임 목록을 반환합니다.
- **반환값**: `["cpu", "vulkan", "cuda12"]`

## 2. 모델 관리 및 파일 API

### `download_model`
- **설명**: 모델 파일을 다운로드하여 `{path}/{owner}/{repo}/{filename}` 구조로 저장합니다.
- **인자**:
  - `url` (String): 다운로드 주소
  - `path` (String): 베이스 저장 경로
  - `filename` (String): 파일 이름
  - `repo` (String): 레포지토리 식별자 (예: "unsloth/gemma-2-2b")
  - `token` (Option<String>): HF 토큰 (비공개 모델용)
- **이벤트**: `download_progress` 발생

### `cancel_download`
- **설명**: 진행 중인 특정 모델의 다운로드를 즉시 취소하고 임시 파일을 정리합니다.
- **인자**: `filename` (String)

### `get_downloaded_models`
- **설명**: 저장 경로 내의 GGUF 모델을 재귀적으로 스캔합니다.
- **인자**: `path` (String)
- **반환값**: `Vec<ModelInfo>`
  ```json
  [
    {
      "name": "owner/repo/model.gguf",
      "repo": "owner/repo",
      "has_vision": boolean // mmproj.gguf 존재 여부
    }
  ]
  ```

### `delete_model`
- **설명**: 모델 파일 및 관련 설정(`.json`), Vision 프로젝터(`mmproj`)를 함께 삭제합니다.
- **인자**: `path` (String), `filename` (String)

### `get_all_files_in_dir`
- **설명**: 특정 디렉터리 내의 파일 목록을 반환합니다.
- **인자**: `path` (String)

## 3. LLM 서버 제어 API (Runner)

### `start_llama_server`
- **설명**: 하드웨어 가속 런타임을 선택하여 `llama-server`를 서브 프로세스로 구동합니다.
- **인자**:
  - `runtime` (String): "cpu", "vulkan", "cuda12"
  - `port` (u16): 바인딩 포트
  - `model` (String): 모델의 절대 경로
  - `ctx_size` (u32): 컨텍스트 크기
  - `ngl` (u32): GPU 오프로드 레이어 수
  - `is_vision` (bool): Vision 기능 활성화 여부
  - `grammar` (Option<String>): GBNF 문법 파일 경로 또는 문자열
- **특이사항**: `is_vision`이 true이고 모델 폴더에 `mmproj.gguf`가 있으면 `--mmproj` 인자를 자동 추가합니다.

### `get_llama_server_status`
- **설명**: 현재 서버의 동작 상태를 확인합니다.
- **반환값**: `"running"`, `"offline"`, `"offline (exited with code ...)"`

### `stop_llama_server`
- **설명**: `llama-server`를 종료하고 할당된 Job Object 리소스를 해제합니다.

## 4. 실시간 이벤트 (Events)

### `download_progress`
- **설명**: 모델 다운로드 진행률을 전달합니다.
- **페이로드**: `{ "filename": string, "downloaded": number, "total": number }`

### `llm-log`
- **설명**: `llama-server`의 stdout/stderr 로그를 스트리밍합니다.
- **페이로드**: `{ "status": "stdout" | "stderr", "message": string }`

### `llm-crash`
- **설명**: 서버 비정상 종료 또는 오류 발생 시 알림을 보냅니다.
- **페이로드**: `{ "status": "crash" | "offline", "message": string }`
