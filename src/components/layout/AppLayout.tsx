import { Outlet, Link, useLocation } from "react-router-dom";
import { FileText, Database, Settings as SettingsIcon, Moon, Sun, Monitor, Image as ImageIcon, ChevronDown, ChevronUp, Home as HomeIcon, LayoutDashboard } from "lucide-react";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { GlobalStatusBar } from "../GlobalStatusBar";
import { Header } from "./Header";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { invoke } from "@tauri-apps/api/core";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(true);
  
  const { 
    setSelectedRuntime, 
    setExtractionHistory,
    setLlmMode,
    setCloudProvider,
    setProvider,
    setBuiltInModel,
    setModelName,
    setDefaultTemperature, setTemperature,
    setDefaultMaxTokens, setMaxTokens,
    setDefaultTopP, setTopP,
    setDefaultTopK, setTopK,
    setDefaultRepeatPenalty, setRepeatPenalty,
    setNGpuLayers,
    setDefaultPdfSystemPrompt, setPdfSystemPrompt,
    setDefaultImageSystemPrompt, setImageSystemPrompt,
    setDefaultPdfPromptText, setPdfPromptText,
    setDefaultImagePromptText, setImagePromptText,
    setIsInitializing,
    setExtractionMode,
    setServerStatus,
    updateDownloadProgress,
    setVisionResolution,
    setIsCudaAvailable,
    setHfToken,
    setServerPort,
    setModelDownloadPath
  } = useAppStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    async function setupListener() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ filename: string, downloaded: number, total: number }>("download_progress", (event) => {
        const { filename, downloaded, total } = event.payload;
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        updateDownloadProgress(filename, progress, progress >= 100 ? 'completed' : 'downloading');
      });
    }

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [updateDownloadProgress]);

  useEffect(() => {
    async function initGlobalSettings() {
      setIsInitializing(true);
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        
        // 0. Sync Llama Server Status and Cuda availability
        try {
          const isCuda = await invoke<boolean>("check_cuda_availability");
          setIsCudaAvailable(isCuda);
        } catch (e) {
          console.error("Failed to check cuda availability", e);
          setIsCudaAvailable(false);
        }

        try {
          const status = await invoke<string>("get_llama_server_status");
          if (status === "running") {
            setServerStatus("running");
          } else {
            setServerStatus("offline");
          }
        } catch (e) {
          console.error("Failed to sync server status", e);
          setServerStatus("offline");
        }

        // 1. Load basic settings
        const llm_mode = await store.get<string>("llmMode");
        if (llm_mode) setLlmMode(llm_mode as any);

        const extMode = await store.get<string>("extractionMode");
        if (extMode) setExtractionMode(extMode as any);

        const vRes = await store.get<number>("visionResolution");
        if (vRes) setVisionResolution(vRes);

        const hf = await store.get<string>("hfToken");
        if (hf) setHfToken(hf);

        const port = await store.get<number>("serverPort");
        if (port) setServerPort(port);
        
        const runtime = await store.get<string>("selectedRuntime");
        if (runtime) setSelectedRuntime(runtime as any);

        const mode = await store.get<string>("llmMode");
        if (mode) setLlmMode(mode as any);

        const cProv = await store.get<string>("cloudProvider");
        if (cProv) setCloudProvider(cProv as any);

        const prov = await store.get<string>("provider");
        if (prov) setProvider(prov as any);

        const bModel = await store.get<any>("builtInModel");
        if (bModel) {
          const sanitizedModel = typeof bModel === 'string' ? bModel : bModel.name;
          if (sanitizedModel) setBuiltInModel(sanitizedModel);
        }

        const mName = await store.get<string>("modelName");
        if (mName) setModelName(mName);

        const history = await store.get<any[]>("extractionHistory");
        if (history) setExtractionHistory(history);

        // 2. Load Parameters into both Default and Active state
        const temp = await store.get<number>("temperature");
        if (temp !== undefined && temp !== null) {
          setDefaultTemperature(temp);
          setTemperature(temp);
        }
        const tokens = await store.get<number>("maxTokens");
        if (tokens !== undefined && tokens !== null) {
          setDefaultMaxTokens(tokens);
          setMaxTokens(tokens);
        }
        const p = await store.get<number>("topP");
        if (p !== undefined && p !== null) {
          setDefaultTopP(p);
          setTopP(p);
        }
        const k = await store.get<number>("topK");
        if (k !== undefined && k !== null) {
          setDefaultTopK(k);
          setTopK(k);
        }
        const rep = await store.get<number>("repeatPenalty");
        if (rep !== undefined && rep !== null) {
          setDefaultRepeatPenalty(rep);
          setRepeatPenalty(rep);
        }
        const ngl = await store.get<number>("nGpuLayers");
        if (ngl !== undefined && ngl !== null) setNGpuLayers(ngl);
        
        const pdfSys = await store.get<string>("pdfSystemPrompt");
        if (pdfSys) {
          setDefaultPdfSystemPrompt(pdfSys);
          setPdfSystemPrompt(pdfSys);
        }
        const imgSys = await store.get<string>("imageSystemPrompt");
        if (imgSys) {
          setDefaultImageSystemPrompt(imgSys);
          setImageSystemPrompt(imgSys);
        }
        
        const pdfPrompt = await store.get<string>("pdfPromptText");
        if (pdfPrompt) {
          setDefaultPdfPromptText(pdfPrompt);
          setPdfPromptText(pdfPrompt);
        }
        const imgPrompt = await store.get<string>("imagePromptText");
        if (imgPrompt) {
          setDefaultImagePromptText(imgPrompt);
          setImagePromptText(imgPrompt);
        }

        const downloadPath = await store.get<string>("modelDownloadPath");
        if (downloadPath) {
          setModelDownloadPath(downloadPath);
          
          // 3. If built-in model is selected, try to load its specific settings to override
          if (bModel && mode === "local" && prov === "builtin") {
            try {
              const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
              const settingPath = `${downloadPath}\\${bModel}_setting.json`;
              if (await exists(settingPath)) {
                const content = await readTextFile(settingPath);
                const settings = JSON.parse(content);
                if (settings.temperature !== undefined) setTemperature(settings.temperature);
                if (settings.maxTokens !== undefined) setMaxTokens(settings.maxTokens);
                if (settings.topP !== undefined) setTopP(settings.topP);
                if (settings.topK !== undefined) setTopK(settings.topK);
                if (settings.repeatPenalty !== undefined) setRepeatPenalty(settings.repeatPenalty);
                if (settings.nGpuLayers !== undefined) setNGpuLayers(settings.nGpuLayers);
                if (settings.pdfSystemPrompt !== undefined) setPdfSystemPrompt(settings.pdfSystemPrompt);
                if (settings.imageSystemPrompt !== undefined) setImageSystemPrompt(settings.imageSystemPrompt);
                if (settings.pdfPromptText !== undefined) setPdfPromptText(settings.pdfPromptText);
                if (settings.imagePromptText !== undefined) setImagePromptText(settings.imagePromptText);
              }
            } catch (e) {
              console.error("Failed to load model-specific settings during init", e);
            }
          }
        } else {
          const { appDataDir } = await import("@tauri-apps/api/path");
          const defaultPath = await appDataDir();
          setModelDownloadPath(`${defaultPath}\\models`);
        }
      } catch (err) {
        console.error("Failed to load global settings", err);
      } finally {
        setIsInitializing(false);
      }
    }
    initGlobalSettings();
  }, [setModelDownloadPath, setHfToken, setServerPort, setSelectedRuntime, setIsInitializing]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top area: sidebar + main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card flex flex-col shrink-0">
          <div className="p-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <LayoutDashboard className="text-primary" />
              LLM Toys
            </h2>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <Link to="/">
              <Button
                variant={pathname === "/" ? "secondary" : "ghost"}
                className="w-full justify-start gap-3"
              >
                <HomeIcon size={20} />
                Home
              </Button>
            </Link>

            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full justify-between hover:bg-transparent px-3 py-2 text-sm font-semibold text-muted-foreground"
                onClick={() => setIsAnalysisOpen(!isAnalysisOpen)}
              >
                <span>ANALYSIS</span>
                {isAnalysisOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
              
              {isAnalysisOpen && (
                <div className="pl-3 pr-0 space-y-1 mt-1 border-l-2 border-muted ml-2">
                  <Link to="/pdf-analysis">
                    <Button
                      variant={pathname === "/pdf-analysis" ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 h-9 text-sm"
                    >
                      <FileText size={18} />
                      PDF Analysis
                    </Button>
                  </Link>
                  <Link to="/image-analysis">
                    <Button
                      variant={pathname === "/image-analysis" ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 h-9 text-sm"
                    >
                      <ImageIcon size={18} />
                      Image Analysis
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="pt-4">
              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground">SYSTEM</div>
              <div className="space-y-1">
                <Link to="/data">
                  <Button
                    variant={pathname === "/data" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3"
                  >
                    <Database size={20} />
                    Data Viewer
                  </Button>
                </Link>
                <Link to="/settings">
                  <Button
                    variant={pathname === "/settings" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3"
                  >
                    <SettingsIcon size={20} />
                    Settings
                  </Button>
                </Link>
              </div>
            </div>
          </nav>

          <div className="p-4 flex flex-col gap-4 border-t shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">Theme</span>
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                <Button variant={theme === 'light' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('light')}>
                  <Sun size={16} />
                </Button>
                <Button variant={theme === 'dark' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('dark')}>
                  <Moon size={16} />
                </Button>
                <Button variant={theme === 'system' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('system')}>
                  <Monitor size={16} />
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content — overflow-auto here so content scrolls, not the whole page */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-auto relative">
            <div className="absolute inset-0 bg-linear-to-br from-background to-muted/20 -z-10" />
            <Outlet />
          </main>
        </div>
      </div>

      {/* Global Status Bar — always at the very bottom, never overlaps content */}
      <GlobalStatusBar />
    </div>
  );
}
