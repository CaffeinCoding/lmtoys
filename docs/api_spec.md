# 통신 API 명세서 (API Specification)

본 문서는 프론트엔드(React)와 백엔드(Rust) 간의 **Tauri Command (IPC 통신)** 명세를 정리합니다.

## 1. 시스템 및 환경 모니터링 API

### `get_system_memory`
- **설명**: 시스템의 RAM 용량을 바이트 단위로 반환합니다.
- **반환값**: `{ "total": number, "used": number }`

### `get_system_vram`
- **설명**: NVIDIA GPU 환경에서 VRAM 정보를 반환합니다.
- **반환값**: `{ "total": number, "used": number }` 또는 `null`

### `get_supported_runtimes`
- **설명**: 사용 가능한 GPU 런타임 목록을 반환합니다.
- **반환값**: `["cpu", "vulkan", "cuda12"]`

## 2. 파일 처리 API

### `extract_pdf_text`
- **설명**: PDF 파일에서 텍스트를 추출합니다.
- **인자**: `file_path` (String)
- **반환값**: 추출된 텍스트 (String)

## 3. 모델 관리 API

### `download_model`
- **설명**: 모델 파일을 다운로드하여 계층적 구조로 저장합니다.
- **인자**:
  - `url` (String): 다운로드 주소
  - `path` (String): 저장 경로
  - `filename` (String): 저장될 파일 이름
  - `repo` (String): 저장될 레포지토리 폴더명 (예: "unsloth/gemma-2-2b")
  - `token` (Option<String>): Bearer 토큰
- **특이사항**: 파일명에 "mmproj"가 포함될 경우 자동으로 `mmproj.gguf`로 이름을 변경하여 비전 기능을 표준화합니다.

### `get_downloaded_models`
- **설명**: 저장 경로 내의 모든 GGUF 모델을 재귀적으로 스캔하여 반환합니다.
- **인자**: `path` (String)
- **반환값**: `Vec<ModelInfo>`
  ```json
  [
    {
      "name": "owner/repo/model.gguf",
      "repo": "owner/repo",
      "has_vision": true
    }
  ]
  ```

### `delete_model`
- **설명**: 모델 파일과 연관된 설정 파일을 함께 삭제합니다.
- **인자**: `path` (String), `filename` (String - 모델의 상대 경로)

## 4. LLM 서버 제어 API (Runner)

### `start_llama_server`
- **설명**: `llama-server.exe`를 서브 프로세스로 구동합니다.
- **인자**:
  - `runtime` (String): "cpu", "vulkan", "cuda12" 중 선택
  - `port` (u16): 바인딩할 포트 번호
  - `model` (String): 모델의 절대 경로
  - `ctx_size` (u32): 컨텍스트 크기
  - `ngl` (u32): GPU 오프로드 레이어 수
- **특이사항**: 모델 폴더 내 `mmproj.gguf`가 존재할 경우 자동으로 `--mmproj` 옵션을 추가합니다.

### `stop_llama_server`
- **설명**: 실행 중인 `llama-server.exe`를 강제 종료하고 Job Object를 해제합니다.
