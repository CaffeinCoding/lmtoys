# 소프트웨어 아키텍처 명세서 (Architecture Specification)

본 문서는 AI PDF Parser 데스크톱 애플리케이션의 소프트웨어 아키텍처 및 디렉터리 구조를 설명합니다.

## 1. 시스템 아키텍처 개요 (2-Layer 아키텍처)

AI PDF Parser는 **Tauri 프레임워크**를 사용하여 프론트엔드(React)와 백엔드(Rust)가 결합된 구조를 가지며, 로컬 LLM 추론을 위해 **Subprocess(llama-server.exe)**를 직접 관리하는 **2-Layer 아키텍처**를 채택하고 있습니다.

```mermaid
graph TD
    subgraph Frontend (React 19 / Vite)
        UI[UI Components / Shadcn]
        State[Zustand Store]
        TauriAPI[Tauri API / invoke, listen]
    end

    subgraph Backend (Rust / Tauri v2)
        Runner[LLM Runner / Subprocess Manager]
        Sys[System Monitor / sysinfo, nvidia-smi]
        PDF[PDF Extractor / pdf_extract]
        FS[Persistence / settings.json]
    end

    subgraph "External Engine"
        Server["llama-server.exe (Child Process)"]
    end

    UI <--> State
    State <--> TauriAPI
    TauriAPI <-->|IPC| Runner
    Runner -->|spawn / stdin,stdout| Server
    TauriAPI <-->|HTTP / fetch| Server
    Runner --> Sys
    Runner --> PDF
    Runner --> FS
```

## 2. 프론트엔드 아키텍처 (Frontend)

### 핵심 레이어
1. **상태 관리 (Zustand)**: `src/store/useAppStore.ts`
   - 앱의 모든 설정(모드, 파라미터, 모델 경로)과 데이터 추출 이력(`extractionHistory`)을 관리합니다.
   - `isInitializing` 가드를 통해 앱 시작 시 설정 유실을 방지합니다.

2. **UI 엔진**: React 19 + TailwindCSS + Shadcn/UI
   - **Main Panel**: PDF 뷰어 및 실시간 텍스트 추출 스트리밍 표시.
   - **Control Panel**: 런타임 설정, 모델 선택, 파라미터(Temp, P, K, NGL) 제어.
   - **Data Viewer**: TanStack Table을 이용한 추출 결과 시각화 및 히스토리 사이드바.

## 3. 백엔드 아키텍처 (Backend)

### 핵심 모듈
1. **LLM Runner (`src-tauri/src/llm_runner.rs`)**:
   - `llama-server.exe`의 생명주기를 관리합니다.
   - **Windows Job Object**: 부모 프로세스 종료 시 자식 프로세스를 자동 정리하여 VRAM 누수를 방지합니다.
   - **Health Polling**: 서버 구동 시 네트워크 포트를 감시하여 즉각적인 'Running' 상태 전환을 지원합니다.

2. **모델 스캔 및 관리 (`src-tauri/src/lib.rs`)**:
   - **계층적 구조**: `{다운로드 경로}/{owner}/{repo}/{filename}` 구조의 재귀적 스캔을 지원합니다.
   - **멀티모달 자동 감지**: 모델 폴더 내 `mmproj.gguf` 파일 존재 여부로 Vision 기능을 식별합니다.

3. **시스템 모니터링**:
   - `sysinfo`를 통한 RAM 모니터링 및 `nvidia-smi` 쿼리를 통한 GPU VRAM 실시간 추적.

## 4. 모델 저장 구조 (Storage Structure)

```text
{model_download_path}/
├── unsloth/
│   └── gemma-4-E2B-it-GGUF/
│       ├── gemma-4-E2B-it-Q4_K_M.gguf          # 메인 모델 파일
│       ├── gemma-4-E2B-it-Q4_K_M.gguf_setting.json # 모델별 맞춤 설정
│       └── mmproj.gguf                         # (있을 경우) 시각 프로젝터
└── settings.json                               # 전역 환경설정 및 추출 이력
```

## 5. 실행 환경 (Subprocess Binaries)

```text
src-tauri/resources/bin/
├── cpu/       # CPU 전용 llama-server 및 필수 DLL
├── vulkan/    # Vulkan 가속용 바이너리
└── cuda12/    # CUDA 12 전용 바이너리 (cuBLAS 포함)
```
