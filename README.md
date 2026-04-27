# AI PDF Parser

로컬 및 클라우드 LLM 모델을 활용하여 민감한 PDF 문서의 데이터를 안전하게 추출하는 데스크톱 애플리케이션입니다. **2-Layer 아키텍처**와 **Vision 멀티모달 기술**을 결합하여 텍스트뿐만 아니라 표, 레이아웃 등 시각적 정보까지 완벽하게 추출하는 것을 목표로 합니다.

## ✨ 주요 기능

- **지능형 멀티모달 추출 (Vision Mode)**:
    - PDF 페이지를 실시간 이미지로 변환하여 시각적 맥락을 반영한 데이터 추출.
    - GBNF(Grammar-Based Native Formats)를 통한 정교한 JSON 구조 강제.
- **다양한 추론 환경 지원**:
    - **로컬 모델 실행 (Built-in)**: `llama-server` 서브프로세스를 통해 GGUF 모델을 직접 구동 (오프라인/보안 환경).
    - **외부 로컬 서버 연결**: Ollama, LM Studio 등 서드파티 서버 연동.
    - **클라우드 API 연결**: OpenAI, Anthropic, Google Gemini 지원.
- **안정적인 프로세스 관리**:
    - **Windows Job Object**: 부모 프로세스 종료 시 자식 프로세스를 즉시 강제 종료하여 VRAM 누수 방지.
    - **Health Polling**: 서버 구동 상태 실시간 감지 및 자동 복구 시도.
- **시스템 리소스 모니터링**:
    - 실시간 RAM 및 VRAM(NVIDIA) 사용량 추적.
    - 추론 성능 메트릭 (TPS: Tokens Per Second, TTFT: Time To First Token) 모니터링.
- **지능형 환경설정**:
    - **모델별 개별 설정**: 각 모델마다 최적의 파라미터를 `.json` 스냅샷으로 자동 저장 및 복원.
    - **자동 NGL 최적화**: 시스템 VRAM을 감지하여 최적의 GPU 레이어(NGL) 자동 제안.

## 🛠 기술 스택

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn UI, Zustand 5, React Router 7
- **Backend**: Tauri v2, Rust
- **Engine**: `llama-server` (GGUF inference)
- **Libraries**: `pdfjs-dist`(Vision), `windows-rs`(Job Objects), `sysinfo`(Resource monitoring), `reqwest`(Model download)

## 🚀 시작하기

### 사전 요구 사항

- Node.js (v20 이상 권장)
- Rust 및 Cargo (Tauri v2 환경)
- NVIDIA GPU (CUDA 가속 사용 시 CUDA 12 Toolkit 권장)
- llama-server Resource 다운로드 (cpu, vulkan, cuda12)
    - [Resources](https://drive.google.com/file/d/1g2MYf1-Z2kQTNpSb0M4eWwWhIHATlO_2/view?usp=sharing)
    - 파일 다운로드 후 `src-tauri/resources` 폴더에 압축 해제

### 설치 및 로컬 실행

1. 의존성 설치:

    ```bash
    npm install
    ```

2. 개발 모드 실행:
    ```bash
    npm run tauri dev
    ```

### 빌드 및 배포

```bash
# 기본 빌드
npm run tauri build
```

## 📂 프로젝트 가이드

- `docs/architecture.md`: 2-Layer 아키텍처 및 프로세스 관리 설계
- `docs/api_spec.md`: 프론트엔드-백엔드 IPC 통신 및 이벤트 명세
- `docs/prd.md`: 제품 요구사항 및 사용자 시나리오
