# AI PDF Parser

로컬 및 클라우드 LLM 모델을 활용하여 민감한 PDF 문서의 텍스트를 파싱하고 데이터를 안전하게 추출하는 데스크톱 애플리케이션입니다. 외부 서버로 데이터를 전송하지 않고 로컬 환경에서 GGUF 모델을 직접 구동할 수 있어 보안이 중요한 문서 처리에 적합합니다.

## ✨ 주요 기능

*   **강력한 PDF 데이터 추출**: 내장된 Rust 엔진을 활용해 PDF 텍스트를 안정적으로 파싱합니다.
*   **다양한 추론 환경 지원**:
    *   **로컬 모델 실행 (Built-in)**: `llama_cpp_2`를 통해 앱 내부에서 GGUF 모델을 직접 구동 (오프라인/보안 환경)
    *   **외부 로컬 서버 연결**: Ollama, LM Studio 등 서드파티 로컬 LLM 서버 연동
    *   **클라우드 API 연결**: OpenAI, Anthropic (Claude), Google (Gemini) API 지원
*   **시스템 리소스 모니터링**: 
    *   실시간 RAM 및 VRAM(GPU 메모리) 사용량 추적
    *   추론 성능 메트릭 (TPS: Tokens Per Second, TTFT: Time To First Token) 모니터링
*   **다중 GPU 런타임 최적화**: 
    *   하드웨어에 맞게 CPU, CUDA, Vulkan 런타임을 선택하여 빌드 및 실행 가능
*   **편리한 모델 관리**: 앱 내에서 허깅페이스(Hugging Face) 등을 통해 GGUF 모델을 다운로드하고 관리할 수 있습니다.

## 🛠 기술 스택

*   **Frontend**: React (Vite), TypeScript, TailwindCSS, Shadcn UI, Zustand
*   **Backend**: Tauri, Rust
*   **AI/LLM**: `llama_cpp_2` (Rust 래핑 기반), `@tauri-apps/api`

## 🚀 시작하기

### 사전 요구 사항

*   Node.js (v18 이상 권장)
*   Rust 및 Cargo
*   *(선택 사항)* NVIDIA GPU가 있는 경우 CUDA Toolkit (CUDA 가속 사용 시)

### 설치 및 로컬 실행

1. 의존성 설치:
   ```bash
   npm install
   ```

2. 개발 모드 실행 (프론트엔드 및 Tauri 윈도우 동시 실행):
   ```bash
   npm run tauri dev
   ```

### 프로덕션 빌드

실행 가능한 데스크톱 애플리케이션으로 빌드하려면 아래 명령어를 사용합니다.

```bash
# 기본 빌드 (CPU 및 디폴트 런타임)
npm run tauri build

# CUDA 지원을 포함한 빌드 (Cargo feature 활성화 필요)
npm run tauri build -- --features cuda
```

## 📂 프로젝트 구조 가이드

자세한 시스템 구조 및 API 명세는 `docs/` 폴더 내의 개발 문서를 참고해 주십시오.

*   `docs/architecture.md`: 전체 소프트웨어 아키텍처 및 폴더 구조 명세
*   `docs/prd.md`: 제품 요구사항 정의서 (기획 의도 및 사용자 시나리오)
*   `docs/api_spec.md`: 프론트엔드-백엔드(Tauri IPC) 간의 통신 API 명세서
