import { create } from 'zustand';

interface AppState {
  currentPdfPath: string | null;
  setCurrentPdfPath: (path: string | null) => void;
  extractedData: any[] | null;
  setExtractedData: (data: any[] | null) => void;
  
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
}

export const useAppStore = create<AppState>((set) => ({
  currentPdfPath: null,
  setCurrentPdfPath: (path) => set({ currentPdfPath: path }),
  extractedData: null,
  setExtractedData: (data) => set({ extractedData: data }),
  
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
}));
