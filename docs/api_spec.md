# 통신 API 명세서 (API Specification)

본 문서는 프론트엔드(React)와 백엔드(Rust) 간의 **Tauri Command (IPC 통신)** 명세를 정리합니다. 데이터 교환은 JSON 형식을 사용합니다.

## 1. 시스템 및 환경 모니터링 API

### `get_system_memory`
- **설명**: 시스템의 전체 RAM 및 사용 중인 RAM 용량을 바이트 단위로 반환합니다.
- **인자**: 없음
- **반환값**:
  ```json
  {
    "total": 34359738368,
    "used": 15032385536
  }
  ```

### `get_system_vram`
- **설명**: NVIDIA GPU 환경에서 VRAM 정보를 반환합니다. (`nvidia-smi` 의존성)
- **인자**: 없음
- **반환값**: 지원하지 않거나 실패할 경우 `null`을 반환.
  ```json
  {
    "total": 12884901888,
    "used": 4294967296
  }
  ```

### `get_supported_runtimes`
- **설명**: 현재 빌드된 바이너리에서 지원하는 GPU 런타임 목록을 반환합니다.
- **인자**: 없음
- **반환값**: `["cpu"]`, `["cpu", "cuda"]`, `["cpu", "vulkan"]` 등 (String 배열)

## 2. 파일 처리 API

### `extract_pdf_text`
- **설명**: 주어진 경로의 PDF 파일에서 텍스트를 추출합니다.
- **인자**:
  - `file_path` (String): PDF 파일의 절대 경로
- **반환값**: 추출된 텍스트 (String)
- **오류**: 파일이 존재하지 않거나 추출에 실패할 경우 에러 메시지(String) 반환.

### `get_all_files_in_dir`
- **설명**: 주어진 디렉터리 경로 내의 파일 이름 목록을 반환합니다.
- **인자**:
  - `path` (String): 디렉터리 절대 경로
- **반환값**: 파일명 배열 (Array of Strings)

## 3. 모델 관리 API

### `download_model`
- **설명**: 지정된 URL에서 모델 파일을 다운로드하여 로컬 스토리지에 저장합니다. 다운로드 과정 중 UI로 `download_progress` 이벤트를 스트리밍합니다.
- **인자**:
  - `url` (String): 다운로드 URL
  - `path` (String): 저장할 디렉터리 경로
  - `filename` (String): 저장할 파일명
  - `token` (Option<String>): 필요한 경우 HTTP Bearer 토큰
- **반환값**: 성공 시 `()` (에러 시 String)

### `get_downloaded_models`
- **설명**: 모델 저장 경로에서 `.gguf` 또는 `.bin` 확장자를 가진 파일 목록을 반환합니다.
- **인자**:
  - `path` (String): 모델이 저장된 디렉터리 경로
- **반환값**: 모델 파일명 배열 (Array of Strings)

### `delete_model`
- **설명**: 로컬 스토리지에 저장된 모델 파일을 삭제합니다.
- **인자**:
  - `path` (String): 모델이 저장된 디렉터리 경로
  - `filename` (String): 삭제할 파일명
- **반환값**: 성공 시 `()` (에러 시 String)

### `get_gguf_metadata`
- **설명**: GGUF 모델 파일의 메타데이터(아키텍처, 컨텍스트 길이 등)를 로드하여 반환합니다.
- **인자**:
  - `path` (String): 모델이 저장된 디렉터리 경로
  - `filename` (String): 모델 파일명
- **반환값**:
  ```json
  {
    "architecture": "llama",
    "context_length": 4096,
    "has_vision": false
  }
  ```

## 4. 로컬 모델 추론 API

### `run_builtin_model`
- **설명**: 내장된 `llama_cpp_2` 엔진을 이용해 텍스트 생성을 수행합니다. 생성되는 텍스트 청크는 `token_stream` 이벤트로 프론트엔드에 실시간 전송됩니다.
- **인자**:
  - `path` (String): 모델 디렉터리 경로
  - `filename` (String): GGUF 모델 파일명
  - `prompt` (String): 사용자 입력 텍스트
  - `system_prompt` (String): 시스템 프롬프트
  - `temperature` (Float): 샘플링 온도
  - `top_p` (Float): 샘플링 Top P
  - `repeat_penalty` (Float): 반복 페널티
  - `n_gpu_layers` (Integer): GPU에 적재할 레이어 수 (0이면 CPU만 사용)
  - `max_tokens` (Integer): 생성할 최대 토큰 수
- **반환값**:
  ```json
  {
    "text": "생성된 전체 텍스트...",
    "ttft_ms": 1245,
    "tps": 23.45
  }
  ```

---

## 5. Tauri Events (Backend -> Frontend)

백엔드에서 프론트엔드로 실시간 상태를 전달하기 위해 사용되는 이벤트들입니다.

- **`download_progress`**: 
  - 모델 다운로드 진행률 전송
  - Payload: `{ "filename": "model.gguf", "downloaded": 10240, "total": 1048576 }`
  
- **`token_stream`**: 
  - `run_builtin_model` 실행 중 생성된 새로운 토큰(단어 조각) 전송
  - Payload: `String` (텍스트 청크)
