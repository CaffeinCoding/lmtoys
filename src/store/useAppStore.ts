import { create } from 'zustand';

interface AppState {
  currentPdfPath: string | null;
  setCurrentPdfPath: (path: string | null) => void;
  extractedData: any[] | null;
  setExtractedData: (data: any[] | null) => void;
  
  parsedPdfText: string | null;
  setParsedPdfText: (text: string | null) => void;
  
  // Extraction Configuration State
  llmMode: "cloud" | "local";
  setLlmMode: (mode: "cloud" | "local") => void;
  cloudProvider: "openai" | "gemini" | "claude";
  setCloudProvider: (provider: "openai" | "gemini" | "claude") => void;
  promptText: string;
  setPromptText: (text: string) => void;
  provider: "ollama" | "lmstudio" | "builtin";
  setProvider: (provider: "ollama" | "lmstudio" | "builtin") => void;
  modelName: string;
  setModelName: (name: string) => void;
  builtInModel: string | null;
  setBuiltInModel: (model: string | null) => void;
  modelDownloadPath: string | null;
  setModelDownloadPath: (path: string | null) => void;
  hfToken: string | null;
  setHfToken: (token: string | null) => void;
  
  // Model Parameters
  temperature: number;
  setTemperature: (temp: number) => void;
  maxTokens: number;
  setMaxTokens: (tokens: number) => void;
  topK: number;
  setTopK: (k: number) => void;
  topP: number;
  setTopP: (p: number) => void;
  
  // Advanced Settings
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  repeatPenalty: number;
  setRepeatPenalty: (penalty: number) => void;
  nGpuLayers: number;
  setNGpuLayers: (layers: number) => void;
  selectedRuntime: "cpu" | "vulkan" | "cuda" | "cuda12";
  setSelectedRuntime: (runtime: "cpu" | "vulkan" | "cuda" | "cuda12") => void;

  // Inference Telemetry & Streaming State
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  tokensPerSecond: number | null;
  setTokensPerSecond: (tps: number | null) => void;
  timeToFirstToken: number | null;
  setTimeToFirstToken: (ttft: number | null) => void;

  // System Resource Monitoring
  sysMemory: { total: number; used: number } | null;
  setSysMemory: (mem: { total: number; used: number } | null) => void;
  sysVram: { total: number; used: number } | null;
  setSysVram: (vram: { total: number; used: number } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPdfPath: null,
  setCurrentPdfPath: (path) => set({ currentPdfPath: path, parsedPdfText: null }),
  extractedData: null,
  setExtractedData: (data) => set({ extractedData: data }),
  parsedPdfText: null,
  setParsedPdfText: (text) => set({ parsedPdfText: text }),
  
  llmMode: "local",
  setLlmMode: (mode) => set({ llmMode: mode }),
  cloudProvider: "openai",
  setCloudProvider: (provider) => set({ cloudProvider: provider }),
  promptText: "Extract all key entities and present them as a JSON array.",
  setPromptText: (text) => set({ promptText: text }),
  provider: "ollama",
  setProvider: (provider) => set({ provider }),
  modelName: "llama3",
  setModelName: (name) => set({ modelName: name }),
  builtInModel: null,
  setBuiltInModel: (model) => set({ builtInModel: model }),
  modelDownloadPath: null,
  setModelDownloadPath: (path) => set({ modelDownloadPath: path }),
  hfToken: null,
  setHfToken: (token) => set({ hfToken: token }),
  
  temperature: 0.1,
  setTemperature: (temp) => set({ temperature: temp }),
  maxTokens: 1024,
  setMaxTokens: (tokens) => set({ maxTokens: tokens }),
  topK: 40,
  setTopK: (k) => set({ topK: k }),
  topP: 0.9,
  setTopP: (p) => set({ topP: p }),
  
  systemPrompt: "You are a helpful and precise assistant. Extract information accurately.",
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  repeatPenalty: 1.1,
  setRepeatPenalty: (penalty) => set({ repeatPenalty: penalty }),
  nGpuLayers: 0, // Default to 0 (CPU)
  setNGpuLayers: (layers) => set({ nGpuLayers: layers }),
  selectedRuntime: "cpu",
  setSelectedRuntime: (runtime) => set({ selectedRuntime: runtime }),

  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  tokensPerSecond: null,
  setTokensPerSecond: (tps) => set({ tokensPerSecond: tps }),
  timeToFirstToken: null,
  setTimeToFirstToken: (ttft) => set({ timeToFirstToken: ttft }),

  sysMemory: null,
  setSysMemory: (mem) => set({ sysMemory: mem }),
  sysVram: null,
  setSysVram: (vram) => set({ sysVram: vram }),
}));
