# 빌드 및 배포 가이드 (Build & Deployment Guide)

이 문서는 AI PDF Parser 프로젝트의 빌드 프로세스와 배포 방법을 상세히 설명합니다. 이 프로젝트는 **Tauri v2** 프레임워크를 기반으로 하며, 프론트엔드(React/Vite)와 백엔드(Rust)가 결합된 구조입니다.

## 1. 사전 요구 사항 (Prerequisites)

빌드를 시작하기 전에 다음 도구들이 설치되어 있어야 합니다:

- **Node.js**: v20.x 이상 (npm 포함)
- **Rust**: 최신 안정 버전 (rustup을 통해 설치)
- **Visual Studio Build Tools**: C++ 빌드 도구 및 Windows 10/11 SDK 필요
- **NVIDIA CUDA Toolkit (선택 사항)**: GPU 가속 기능을 포함하여 빌드하려는 경우 CUDA 12.x 버전이 필요합니다.

## 2. 프로젝트 구조 분석

빌드에 영향을 미치는 주요 디렉토리 및 파일은 다음과 같습니다:

- `src/`: 프론트엔드 React 소스 코드
- `src-tauri/`: 백엔드 Rust 소스 코드 및 Tauri 설정
- `src-tauri/tauri.conf.json`: 빌드 설정, 식별자(identifier), 아이콘, 리소스 정의
- `src-tauri/resources/bin/`: LLM 추론을 위한 하드웨어별(CPU, CUDA, Vulkan) 외부 바이너리 저장소
- `dist/`: 프론트엔드 빌드 결과물이 저장되는 곳 (Vite 빌드 후 생성)

## 3. 상세 빌드 프로세스

### 단계 1: 의존성 설치
```bash
npm install
```

### 단계 2: 외부 바이너리 준비
이 프로젝트는 `llama-server`와 같은 외부 바이너리를 사용합니다. 빌드 시 이 파일들이 `src-tauri/resources/bin/` 내의 적절한 폴더(`cpu`, `cuda12`, `vulkan`)에 위치해야 합니다. 
> [!IMPORTANT]
> `tauri.conf.json`의 `bundle.resources` 설정에 의해 이 폴더의 내용이 최종 설치 파일에 포함됩니다.

### 단계 3: 프로덕션 빌드 실행
```bash
npm run tauri build
```
이 명령은 내부적으로 다음 작업을 수행합니다:
1. `npm run build` 실행: `tsc` 체크 및 Vite를 통한 프론트엔드 번들링 (`dist/` 생성)
2. `cargo build --release` 실행: Rust 백엔드 컴파일
3. 번들링: 실행 파일, 리소스, 라이브러리를 하나로 묶어 설치 관리자(MSI, EXE) 생성

## 4. 빌드 결과물 확인

빌드가 완료되면 다음 경로에서 결과물을 확인할 수 있습니다:
`src-tauri/target/release/bundle/`

- **MSI 설치 프로그램**: `msi/tauri-app_0.1.0_x64_en-US.msi`
- **단일 실행 파일 (NSIS)**: `nsis/tauri-app_0.1.0_x64-setup.exe` (설정된 경우)

## 5. 배포 및 최적화 팁

### 아이콘 변경
`src-tauri/icons/` 폴더 내의 아이콘들을 교체한 후 빌드하면 애플리케이션 아이콘이 변경됩니다.

### 버전 관리
`package.json`과 `src-tauri/tauri.conf.json`의 `version` 필드를 동기화하여 관리하세요.

### 환경 변수 (.env)
보안이 필요한 API 키나 설정은 `.env` 파일에 저장되어 있지만, 클라이언트 사이드 빌드 시 포함되므로 민감한 정보 노출에 주의해야 합니다. 이 프로젝트는 로컬 LLM을 지향하므로 주로 로컬 경로 설정에 사용됩니다.

### 코드 서명 (Code Signing)
Windows에서 "Windows Defender SmartScreen" 경고를 피하려면 배포 전 EV 인증서 또는 표준 코드 서명 인증서로 `.exe` 및 `.msi` 파일을 서명하는 것이 좋습니다.
