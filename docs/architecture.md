# 소프트웨어 아키텍처 명세서 (Architecture Specification)

본 문서는 AI PDF Parser 데스크톱 애플리케이션의 소프트웨어 아키텍처 및 디렉터리 구조를 설명합니다.

## 1. 시스템 아키텍처 개요

AI PDF Parser는 **Tauri 프레임워크**를 사용하여 프론트엔드(React)와 백엔드(Rust)가 결합된 크로스 플랫폼 데스크톱 애플리케이션입니다. 사용자 인터페이스는 웹 기술로 렌더링되며, 무거운 연산(PDF 텍스트 추출, 로컬 LLM 추론, 파일 I/O 및 시스템 모니터링)은 Rust 백엔드 프로세스에서 처리됩니다. 프론트엔드와 백엔드는 Tauri의 IPC(Inter-Process Communication) 시스템을 통해 명령과 이벤트를 주고받습니다.

```mermaid
graph TD
    subgraph Frontend (React / Vite)
        UI[UI Components / Shadcn]
        State[Zustand Store]
        TauriAPI[Tauri API bindings]
    end

    subgraph Backend (Rust / Tauri)
        Cmd[Tauri Commands]
        Llama[llama_cpp_2 / GGUF]
        Sys[System Monitor / sysinfo, nvidia-smi]
        PDF[PDF Extractor / pdf_extract]
        FS[File System & Network]
    end

    UI <--> State
    State <--> TauriAPI
    TauriAPI <-->|IPC Communication| Cmd
    Cmd --> Llama
    Cmd --> Sys
    Cmd --> PDF
    Cmd --> FS
```

## 2. 프론트엔드 아키텍처 (Frontend)

프론트엔드는 React 19, TypeScript, Vite 환경에서 동작하며, `shadcn/ui`와 TailwindCSS를 통해 현대적이고 반응형 UI를 구성합니다.

### 핵심 레이어

1. **상태 관리 (Zustand)**
   - `src/store/useAppStore.ts`: 애플리케이션의 단일 진실 공급원(Single Source of Truth)으로 작동.
   - 관리 영역: PDF 파일 경로 및 추출된 텍스트, 설정된 LLM 제공자(Ollama, Cloud, Built-in) 및 모델 메타데이터, 추론 설정(Temperature, Max Tokens, Top-P 등), 실시간 시스템 리소스 상태(RAM, VRAM, TPS, TTFT).

2. **라우팅 (React Router)**
   - `App.tsx`에서 정의된 `BrowserRouter`를 사용.
   - `Home`: 메인 대시보드 및 PDF 업로드/처리.
   - `DataViewer`: 추출된 데이터를 검토하고 내보내는 화면.
   - `Settings`: LLM 제공자 설정, 모델 다운로드, 시스템 환경설정 화면.

3. **컴포넌트 구조 (FSD-lite 유사 아키텍처)**
   - 페이지별 독립성을 강화하기 위해 `src/pages` 하위에 기능별 컴포넌트들을 위치시키는 구조 지향.
   - 공통 UI 요소들은 `src/components`에 위치.

## 3. 백엔드 아키텍처 (Backend)

Rust로 작성된 백엔드는 데스크톱 OS 레벨의 자원에 접근하고, 무거운 연산을 처리하여 UI 스레드의 블로킹을 방지합니다.

### 핵심 모듈 및 컴포넌트

1. **PDF 파싱 모듈**
   - `pdf_extract` 크레이트를 활용하여 로컬 파일 시스템에 저장된 PDF 문서를 읽고 텍스트 데이터를 반환합니다.
   - 데이터는 서버로 전송되지 않고 완전히 오프라인 상태에서 처리됩니다.

2. **로컬 LLM 엔진 (llama_cpp_2)**
   - `llama.cpp`의 Rust 바인딩을 활용하여 GGUF 포맷의 모델을 로컬 메모리에 적재하여 추론을 수행합니다.
   - 프롬프트 구성, 토큰화, 컨텍스트 관리, 샘플링(Temperature, Top-P, Penalty) 로직을 처리.
   - 생성되는 토큰은 Tauri의 `Event` 시스템(`app.emit`)을 통해 프론트엔드로 스트리밍됩니다.

3. **시스템 리소스 모니터링**
   - **RAM**: `sysinfo` 라이브러리를 통해 전체 및 사용 중인 시스템 메모리를 실시간으로 가져옵니다.
   - **VRAM**: `nvidia-smi` 커맨드를 서브프로세스로 호출하여 GPU의 VRAM 사용량을 캡처합니다.

4. **네트워크 및 파일 다운로더**
   - `reqwest` 클라이언트를 사용하여 Hugging Face 등의 저장소로부터 GGUF 모델을 로컬로 스트리밍 다운로드합니다.
   - 인증 토큰을 지원하며 청크 단위 다운로드로 메모리 낭비를 줄이고 진행 상황을 UI로 실시간 전송합니다.

## 4. 폴더 구조 상세 (Directory Structure)

```text
/
├── src/                    # 프론트엔드 소스코드 (React)
│   ├── assets/             # 정적 리소스 파일
│   ├── components/         # 공용 UI 컴포넌트 (Shadcn, 레이아웃 등)
│   ├── lib/                # 유틸리티 함수 및 설정 파일 (tailwind merge 등)
│   ├── pages/              # 라우트 별 페이지 컴포넌트 (Home, DataViewer, Settings)
│   ├── store/              # Zustand 상태 관리 (useAppStore.ts)
│   ├── App.tsx             # 루트 컴포넌트 및 라우팅 설정
│   └── main.tsx            # 프론트엔드 진입점
│
├── src-tauri/              # 백엔드 소스코드 (Rust/Tauri)
│   ├── Cargo.toml          # Rust 의존성 및 빌드 설정 (Feature flags 포함)
│   ├── tauri.conf.json     # Tauri 앱 설정 (번들, 권한, 플러그인 등)
│   └── src/
│       ├── main.rs         # 앱 진입점
│       └── lib.rs          # Tauri Command 로직 및 핵심 백엔드 기능 정의
│
├── docs/                   # 프로젝트 개발 문서
└── package.json            # NPM 스크립트 및 프론트엔드 패키지 정보
```
