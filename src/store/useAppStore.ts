import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';

interface ExtractionConfig {
  modelName: string;
  llmMode: "cloud" | "local";
  provider: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  nGpuLayers: number;
  systemPrompt: string;
  promptText: string;
  customJsonFormat?: string;
  rawResponse?: string;
  runtime?: string;
  ttft?: number | null;
  speed?: number | null;
}

interface AppState {
  currentPdfPath: string | null;
  setCurrentPdfPath: (path: string | null) => void;
  extractedData: any[] | null;
  setExtractedData: (data: any[] | null) => void;
  
  parsedPdfText: string | null;
  setParsedPdfText: (text: string | null) => void;
  
  isInitializing: boolean;
  setIsInitializing: (val: boolean) => void;

  extractionMode: "text" | "vision";
  setExtractionMode: (mode: "text" | "vision") => void;

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
  setBuiltInModel: (model: any) => void;
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
  customJsonFormat: string;
  setCustomJsonFormat: (format: string) => void;
  repeatPenalty: number;
  setRepeatPenalty: (penalty: number) => void;
  nGpuLayers: number;
  setNGpuLayers: (layers: number) => void;
  selectedRuntime: "cpu" | "vulkan" | "cuda" | "cuda12";
  setSelectedRuntime: (runtime: "cpu" | "vulkan" | "cuda" | "cuda12") => void;

  // Vision Settings
  visionResolution: number;
  setVisionResolution: (res: number) => void;

  // Llama Server State
  serverStatus: "offline" | "loading" | "running";
  setServerStatus: (status: "offline" | "loading" | "running") => void;
  serverPort: number;
  setServerPort: (port: number) => void;
  serverLogs: string[];
  addServerLog: (log: string) => void;
  clearServerLogs: () => void;

  // Inference Telemetry & Streaming State
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  extractedText: string;
  setExtractedText: (text: string | ((prev: string) => string)) => void;
  tokensPerSecond: number | null;
  setTokensPerSecond: (tps: number | null) => void;
  timeToFirstToken: number | null;
  setTimeToFirstToken: (ttft: number | null) => void;

  // System Resource Monitoring
  sysMemory: { total: number; used: number } | null;
  setSysMemory: (mem: { total: number; used: number } | null) => void;
  sysVram: { total: number; used: number } | null;
  setSysVram: (vram: { total: number; used: number } | null) => void;

  // Download State
  downloadQueue: { name: string; progress: number; status: string }[];
  setDownloadQueue: (queue: { name: string; progress: number; status: string }[]) => void;
  updateDownloadProgress: (name: string, progress: number, status: string) => void;

  // Data History
  extractionHistory: { id: string; name: string; data: any[]; timestamp: number; config?: ExtractionConfig }[];
  setExtractionHistory: (history: { id: string; name: string; data: any[]; timestamp: number; config?: ExtractionConfig }[]) => void;
  addHistoryItem: (item: { id: string; name: string; data: any[]; timestamp: number; config?: ExtractionConfig }) => void;
  removeHistoryItem: (id: string) => void;

  // Persistence & Lifecycle
  saveToStore: () => Promise<void>;
  
  // Intelligence
  suggestNgl: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPdfPath: null,
  setCurrentPdfPath: (path) => set({ currentPdfPath: path, parsedPdfText: null }),
  extractedData: null,
  setExtractedData: (data) => set({ extractedData: data }),
  parsedPdfText: null,
  setParsedPdfText: (text) => set({ parsedPdfText: text }),
  
  isInitializing: true,
  setIsInitializing: (val) => set({ isInitializing: val }),

  extractionMode: "text",
  setExtractionMode: (mode) => { set({ extractionMode: mode }); get().saveToStore(); },

  llmMode: "local",
  setLlmMode: (mode) => { set({ llmMode: mode }); get().saveToStore(); },
  cloudProvider: "openai",
  setCloudProvider: (provider) => { set({ cloudProvider: provider }); get().saveToStore(); },
  promptText: "Extract all key entities and present them as a JSON array.",
  setPromptText: (text) => { set({ promptText: text }); get().saveToStore(); },
  provider: "ollama",
  setProvider: (provider) => { set({ provider }); get().saveToStore(); },
  modelName: "llama3",
  setModelName: (name) => { set({ modelName: name }); get().saveToStore(); },
  
  builtInModel: null,
  setBuiltInModel: (model) => { 
    const name = typeof model === 'string' ? model : model?.name;
    if (typeof name === 'string' || name === null) {
      set({ builtInModel: name }); 
      get().saveToStore(); 
    }
  },

  modelDownloadPath: null,
  setModelDownloadPath: (path) => { set({ modelDownloadPath: path }); get().saveToStore(); },
  hfToken: null,
  setHfToken: (token) => { set({ hfToken: token }); get().saveToStore(); },
  
  temperature: 0.1,
  setTemperature: (temp) => { set({ temperature: temp }); get().saveToStore(); },
  maxTokens: 4096,
  setMaxTokens: (tokens) => { set({ maxTokens: tokens }); get().saveToStore(); },
  topK: 40,
  setTopK: (k) => { set({ topK: k }); get().saveToStore(); },
  topP: 0.9,
  setTopP: (p) => { set({ topP: p }); get().saveToStore(); },
  
  systemPrompt: "You are a helpful and precise assistant. Extract information accurately and return ONLY the JSON data without any conversational filler or explanation.",
  setSystemPrompt: (prompt) => { set({ systemPrompt: prompt }); get().saveToStore(); },
  customJsonFormat: "[\n  {\n    \"key\": \"value\"\n  }\n]",
  setCustomJsonFormat: (format) => { set({ customJsonFormat: format }); get().saveToStore(); },
  repeatPenalty: 1.1,
  setRepeatPenalty: (penalty) => { set({ repeatPenalty: penalty }); get().saveToStore(); },
  nGpuLayers: 0, // Default to 0 (CPU)
  setNGpuLayers: (layers) => { set({ nGpuLayers: layers }); get().saveToStore(); },
  selectedRuntime: "cpu",
  setSelectedRuntime: (runtime) => { set({ selectedRuntime: runtime }); get().saveToStore(); },

  visionResolution: 768,
  setVisionResolution: (res) => { set({ visionResolution: res }); get().saveToStore(); },

  serverStatus: "offline",
  setServerStatus: (status) => set({ serverStatus: status }),
  serverPort: 8080,
  setServerPort: (port) => { set({ serverPort: port }); get().saveToStore(); },
  serverLogs: [],
  addServerLog: (log) => set((state) => ({ serverLogs: [...state.serverLogs, log].slice(-1000) })), // keep last 1000 logs
  clearServerLogs: () => set({ serverLogs: [] }),

  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  extractedText: "",
  setExtractedText: (text) => set((state) => ({ 
    extractedText: typeof text === 'function' ? text(state.extractedText) : text 
  })),
  tokensPerSecond: null,
  setTokensPerSecond: (tps) => set({ tokensPerSecond: tps }),
  timeToFirstToken: null,
  setTimeToFirstToken: (ttft) => set({ timeToFirstToken: ttft }),

  sysMemory: null,
  setSysMemory: (mem) => set({ sysMemory: mem }),
  sysVram: null,
  setSysVram: (vram) => set({ sysVram: vram }),

  downloadQueue: [],
  setDownloadQueue: (queue: { name: string; progress: number; status: string }[]) => set({ downloadQueue: queue }),
  updateDownloadProgress: (name: string, progress: number, status: string) => set((state) => {
    const existing = state.downloadQueue.find(d => d.name === name);
    if (existing) {
      if (status === 'completed' || status === 'error') {
        // Remove after 5 seconds if completed or error
        setTimeout(() => {
          set((s) => ({ downloadQueue: s.downloadQueue.filter(d => d.name !== name) }));
        }, 5000);
      }
      return {
        downloadQueue: state.downloadQueue.map(d => 
          d.name === name ? { ...d, progress, status } : d
        )
      };
    } else {
      return {
        downloadQueue: [...state.downloadQueue, { name, progress, status }]
      };
    }
  }),

  extractionHistory: [],
  setExtractionHistory: (history) => set({ extractionHistory: history }),
  addHistoryItem: (item) => {
    set((state) => ({ extractionHistory: [item, ...state.extractionHistory] }));
    get().saveToStore();
  },
  removeHistoryItem: (id) => {
    set((state) => ({ extractionHistory: state.extractionHistory.filter(h => h.id !== id) }));
    get().saveToStore();
  },

  saveToStore: async () => {
    if (get().isInitializing) return; // Prevent overwriting during initialization

    try {
      const store = await load("settings.json");
      const state = get();
      await store.set("extractionHistory", state.extractionHistory);
      await store.set("temperature", state.temperature);
      await store.set("maxTokens", state.maxTokens);
      await store.set("topP", state.topP);
      await store.set("topK", state.topK);
      await store.set("repeatPenalty", state.repeatPenalty);
      await store.set("nGpuLayers", state.nGpuLayers);
      await store.set("systemPrompt", state.systemPrompt);
      await store.set("promptText", state.promptText);
      await store.set("customJsonFormat", state.customJsonFormat);
      await store.set("llmMode", state.llmMode);
      await store.set("cloudProvider", state.cloudProvider);
      await store.set("provider", state.provider);
      await store.set("builtInModel", state.builtInModel);
      await store.set("modelName", state.modelName);
      await store.set("serverPort", state.serverPort);
      await store.set("selectedRuntime", state.selectedRuntime);
      await store.set("modelDownloadPath", state.modelDownloadPath);
      await store.set("hfToken", state.hfToken);
      await store.set("extractionMode", state.extractionMode);
      await store.set("visionResolution", state.visionResolution);
      await store.save();
    } catch (e) {
      console.error("Failed to persist state", e);
    }
  },

  suggestNgl: () => {
    const vram = get().sysVram;
    if (!vram) {
      set({ nGpuLayers: 0 });
      return;
    }
    
    const totalGB = vram.total / (1024 ** 3);
    if (totalGB >= 8) {
      set({ nGpuLayers: 99 }); // Full offload
    } else if (totalGB >= 4) {
      set({ nGpuLayers: 33 }); // Partial offload
    } else {
      set({ nGpuLayers: 16 }); // Low offload
    }
    get().saveToStore();
  }
}));
