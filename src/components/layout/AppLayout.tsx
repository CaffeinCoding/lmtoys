import { Outlet, Link, useLocation } from "react-router-dom";
import { FileText, Database, Settings as SettingsIcon, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { GlobalStatusBar } from "../GlobalStatusBar";
import { Header } from "./Header";
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { invoke } from "@tauri-apps/api/core";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  
  const { 
    setModelDownloadPath, 
    setHfToken, 
    setServerPort, 
    setSelectedRuntime, 
    setExtractionHistory,
    setLlmMode,
    setCloudProvider,
    setProvider,
    setBuiltInModel,
    setModelName,
    setTemperature,
    setMaxTokens,
    setTopP,
    setTopK,
    setRepeatPenalty,
    setNGpuLayers,
    setSystemPrompt,
    setPromptText,
    setIsInitializing,
    setExtractionMode,
    setServerStatus,
    updateDownloadProgress,
    setVisionResolution
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
        
        // 0. Sync Llama Server Status
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

        // 2. Load Parameters
        const temp = await store.get<number>("temperature");
        if (temp !== undefined && temp !== null) setTemperature(temp);
        const tokens = await store.get<number>("maxTokens");
        if (tokens !== undefined && tokens !== null) setMaxTokens(tokens);
        const p = await store.get<number>("topP");
        if (p !== undefined && p !== null) setTopP(p);
        const k = await store.get<number>("topK");
        if (k !== undefined && k !== null) setTopK(k);
        const rep = await store.get<number>("repeatPenalty");
        if (rep !== undefined && rep !== null) setRepeatPenalty(rep);
        const ngl = await store.get<number>("nGpuLayers");
        if (ngl !== undefined && ngl !== null) setNGpuLayers(ngl);
        const sys = await store.get<string>("systemPrompt");
        if (sys) setSystemPrompt(sys);
        const prompt = await store.get<string>("promptText");
        if (prompt) setPromptText(prompt);

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
                if (settings.systemPrompt !== undefined) setSystemPrompt(settings.systemPrompt);
                if (settings.promptText !== undefined) setPromptText(settings.promptText);
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

  const navItems = [
    { name: "Home", path: "/", icon: <FileText size={20} /> },
    { name: "Data", path: "/data", icon: <Database size={20} /> },
    { name: "Settings", path: "/settings", icon: <SettingsIcon size={20} /> },
  ];

  return (
    // 전체 뷰포트를 column flex로 구성하여 StatusBar가 항상 맨 아래에 위치하도록 합니다.
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top area: sidebar + main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card flex flex-col shrink-0">
          <div className="p-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="text-primary" />
              PDF Parser
            </h2>
          </div>

          <nav className="flex-1 px-4 space-y-2">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}>
                <Button
                  variant={pathname === item.path ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3 mb-1"
                >
                  {item.icon}
                  {item.name}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="p-4 flex flex-col gap-4 border-t">
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
