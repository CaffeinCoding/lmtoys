import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Play, Square, Loader2, Settings as SettingsIcon, Zap, Eye, DownloadCloud } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { writeFile, readTextFile, exists } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { Progress } from "@/components/ui/progress";
import { cn, removeLeadingZeros } from "@/lib/utils";

interface ModelInfo {
  name: string;
  repo: string;
  has_vision: boolean;
}

export function Header() {
  const { 
    builtInModel, setBuiltInModel,
    modelDownloadPath,
    selectedRuntime,
    serverPort,
    serverStatus, setServerStatus,
    addServerLog, clearServerLogs,
    maxTokens, setMaxTokens,
    nGpuLayers, setNGpuLayers,
    temperature, setTemperature,
    topP, setTopP,
    topK, setTopK,
    repeatPenalty, setRepeatPenalty,
    pdfSystemPrompt, setPdfSystemPrompt,
    imageSystemPrompt, setImageSystemPrompt,
    pdfPromptText, setPdfPromptText,
    imagePromptText, setImagePromptText,
    pdfJsonFormat, setPdfJsonFormat,
    imageJsonFormat, setImageJsonFormat,
    visionResolution, setVisionResolution,
    provider, llmMode, cloudProvider,
    suggestNgl,
    isInitializing,
    downloadQueue
  } = useAppStore();

  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const isFirstLoad = useRef(true);
  const lastLoadedPath = useRef<string | null>(null);

  // Helper to get setting file path
  const getSettingFilePath = useCallback(async () => {
    if (llmMode === "local") {
      if (provider === "builtin" && builtInModel && modelDownloadPath) {
        // builtInModel is "owner/repo/model.gguf"
        return `${modelDownloadPath}\\${builtInModel}_setting.json`;
      } else if (provider === "ollama") {
        const dataDir = await appDataDir();
        return `${dataDir}\\ollama_setting.json`;
      } else if (provider === "lmstudio") {
        const dataDir = await appDataDir();
        return `${dataDir}\\lmstudio_setting.json`;
      }
    } else {
      const dataDir = await appDataDir();
      return `${dataDir}\\${cloudProvider}_setting.json`;
    }
    return null;
  }, [llmMode, provider, builtInModel, modelDownloadPath, cloudProvider]);

  // Load settings when model/provider changes
  useEffect(() => {
    if (isInitializing) return;

    async function loadModelSettings() {
      const path = await getSettingFilePath();
      if (!path) return;

      try {
        if (await exists(path)) {
          const content = await readTextFile(path);
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
          if (settings.pdfJsonFormat !== undefined) setPdfJsonFormat(settings.pdfJsonFormat);
          if (settings.imageJsonFormat !== undefined) setImageJsonFormat(settings.imageJsonFormat);
          if (settings.visionResolution !== undefined) setVisionResolution(settings.visionResolution);
        }
        // Mark this path as loaded to allow saving
        lastLoadedPath.current = path;
      } catch (e) {
        console.error("Failed to load model settings", e);
      }
    }
    loadModelSettings();
  }, [getSettingFilePath, isInitializing, setTemperature, setMaxTokens, setTopP, setTopK, setRepeatPenalty, setNGpuLayers, setPdfSystemPrompt, setImageSystemPrompt, setPdfPromptText, setImagePromptText, setPdfJsonFormat, setImageJsonFormat, setVisionResolution]);

  // Save settings when parameters change
  useEffect(() => {
    if (isInitializing) return;

    async function saveModelSettings() {
      const path = await getSettingFilePath();
      if (!path) return;

      // Prevent saving if we haven't finished loading the settings for the current path
      if (lastLoadedPath.current !== path) {
        return;
      }

      const settings = {
        temperature,
        maxTokens,
        topP,
        topK,
        repeatPenalty,
        nGpuLayers,
        pdfSystemPrompt,
        imageSystemPrompt,
        pdfPromptText,
        imagePromptText,
        pdfJsonFormat,
        imageJsonFormat,
        visionResolution
      };

      try {
        await writeFile(path, new TextEncoder().encode(JSON.stringify(settings, null, 2)));
      } catch (e) {
        console.error("Failed to save model settings", e);
      }
    }
    
    if (isFirstLoad.current) {
        isFirstLoad.current = false;
        return;
    }

    const timer = setTimeout(saveModelSettings, 500);
    return () => clearTimeout(timer);
  }, [getSettingFilePath, isInitializing, temperature, maxTokens, topP, topK, repeatPenalty, nGpuLayers, pdfSystemPrompt, imageSystemPrompt, pdfPromptText, imagePromptText, pdfJsonFormat, imageJsonFormat, visionResolution]);

  useEffect(() => {
    const refresh = () => {
      if (modelDownloadPath) {
        invoke<ModelInfo[]>("get_downloaded_models", { path: modelDownloadPath })
          .then(setDownloadedModels)
          .catch(console.error);
      }
    };
    refresh();

    const unlisten = listen("models-changed", refresh);
    return () => {
      unlisten.then(f => f());
    };
  }, [modelDownloadPath]);

  useEffect(() => {
    const unlistenLog = listen<{ status: string, message: string }>("llm-log", (event) => {
      const msg = event.payload.message;
      addServerLog(msg);
      
      const currentStatus = useAppStore.getState().serverStatus;
      const lowerMsg = msg.toLowerCase();
      if (currentStatus === "loading" && (lowerMsg.includes("http server listening") || lowerMsg.includes("llama server listening") || lowerMsg.includes("server listening"))) {
        useAppStore.getState().setServerStatus("running");
      }
    });

    const unlistenCrash = listen<{ status: string, message: string }>("llm-crash", (event) => {
      addServerLog(`[CRASH] ${event.payload.message}`);
      useAppStore.getState().setServerStatus("offline");
      alert(`Llama Server Error: ${event.payload.message}`);
    });

    return () => {
      unlistenLog.then(f => f());
      unlistenCrash.then(f => f());
    };
  }, [addServerLog]);

  const handleStart = async () => {
    if (!builtInModel) {
      alert("Please select a model first.");
      return;
    }
    setServerStatus("loading");
    clearServerLogs();
    
    const currentModelInfo = downloadedModels.find(m => m.name === builtInModel);
    const isVision = currentModelInfo?.has_vision || false;

    try {
      await invoke("start_llama_server", {
        runtime: selectedRuntime,
        port: serverPort,
        model: `${modelDownloadPath}\\${builtInModel}`,
        ctxSize: maxTokens,
        ngl: nGpuLayers,
        isVision,
        grammar: null
      });
      
      const pollInterval = setInterval(async () => {
        const currentStatus = useAppStore.getState().serverStatus;
        if (currentStatus !== "loading") {
          clearInterval(pollInterval);
          return;
        }
        try {
          await fetch(`http://127.0.0.1:${serverPort}/health`, { mode: 'no-cors' });
          useAppStore.getState().setServerStatus("running");
          clearInterval(pollInterval);
        } catch (e) {
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(pollInterval);
      }, 5 * 60 * 1000);

    } catch (err: any) {
      console.error(err);
      alert(`Failed to start server: ${err}`);
      setServerStatus("offline");
    }
  };

  const handleStop = async () => {
    try {
      await invoke("stop_llama_server");
    } catch (err: any) {
      console.error(err);
    } finally {
      setServerStatus("offline");
    }
  };

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground whitespace-nowrap">Local Model</Label>
          <div className="relative">
            <select
                className="flex h-9 w-64 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pr-8"
                value={builtInModel || ""}
                onChange={(e) => setBuiltInModel(e.target.value)}
                disabled={serverStatus !== "offline"}
            >
                <option value="" disabled>Select a downloaded model</option>
                {downloadedModels.map(m => {
                    const name = m.name;
                    return (
                        <option key={name} value={name}>
                            {name} {m.has_vision ? " (👁️ Vision)" : ""}
                        </option>
                    );
                })}
            </select>
            {downloadedModels.find(m => m.name === builtInModel)?.has_vision && (
                <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                    <Eye className="w-4 h-4" />
                </div>
            )}
          </div>
        </div>

        {serverStatus === "offline" && (
          <Button size="sm" variant="default" onClick={handleStart} className="gap-2">
            <Play className="w-4 h-4" /> Start Server
          </Button>
        )}
        {serverStatus === "loading" && (
          <Button size="sm" variant="secondary" disabled className="gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Starting...
          </Button>
        )}
        {serverStatus === "running" && (
          <Button size="sm" variant="destructive" onClick={handleStop} className="gap-2">
            <Square className="w-4 h-4" /> Stop Server
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Download Status Popover */}
        <Popover>
          <PopoverTrigger className={cn(
            "inline-flex items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 h-9 w-9 relative hover:bg-muted",
            (downloadQueue?.length ?? 0) > 0 && "text-primary"
          )}>
              <DownloadCloud className={cn(
                "h-5 w-5",
                (downloadQueue?.length ?? 0) > 0 && "animate-pulse"
              )} />
              {(downloadQueue?.length ?? 0) > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              )}
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-4 border-b">
              <h4 className="font-semibold text-sm">Active Downloads</h4>
              <p className="text-xs text-muted-foreground mt-1">Model files being downloaded to your local machine.</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {!downloadQueue || downloadQueue.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground italic">
                  No active downloads
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {downloadQueue.map((item: { name: string; progress: number; status: string }) => (
                    <div key={item.name} className="p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium truncate max-w-[150px]" title={item.name}>{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full",
                            item.status === 'completed' ? "bg-green-500/10 text-green-600" : 
                            item.status === 'error' ? "bg-destructive/10 text-destructive" :
                            "bg-blue-500/10 text-blue-600"
                          )}>
                            {item.status.toUpperCase()}
                          </span>
                          {item.status === 'downloading' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                try {
                                  await invoke("cancel_download", { filename: item.name });
                                } catch (err) {
                                  console.error("Failed to cancel download", err);
                                }
                              }}
                            >
                              <Square className="w-2.5 h-2.5 fill-current" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Progress value={item.progress} className="h-1" />
                        <div className="flex justify-end">
                          <span className="text-[10px] text-muted-foreground">{item.progress}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-2 px-3">
              <SettingsIcon className="w-4 h-4" />
              <span>Params</span>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium leading-none">Server Parameters</h4>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => suggestNgl()}>
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                    Auto NGL
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Adjust inference settings for the llama-server.
                </p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="ctxSize">Context Size (-c)</Label>
                  <Input
                    id="ctxSize"
                    type="number"
                    value={maxTokens}
                    onChange={(e) => {
                      const cleaned = removeLeadingZeros(e.target.value);
                      e.target.value = cleaned;
                      setMaxTokens(Number(cleaned));
                    }}
                    className="col-span-2 h-8"
                    disabled={serverStatus !== "offline"}
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="ngl">GPU Layers (-ngl)</Label>
                  <Input
                    id="ngl"
                    type="number"
                    value={nGpuLayers}
                    onChange={(e) => {
                      const cleaned = removeLeadingZeros(e.target.value);
                      e.target.value = cleaned;
                      setNGpuLayers(Number(cleaned));
                    }}
                    className="col-span-2 h-8"
                    disabled={serverStatus !== "offline"}
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="temp">Temp</Label>
                  <Input
                    id="temp"
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || val === "0" || val === "0.") {
                        setTemperature(Number(val));
                      } else {
                        const cleaned = removeLeadingZeros(val);
                        e.target.value = cleaned;
                        setTemperature(Number(cleaned));
                      }
                    }}
                    className="col-span-2 h-8"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="topP">Top P</Label>
                  <Input
                    id="topP"
                    type="number"
                    step="0.1"
                    value={topP}
                    onChange={(e) => {
                      const cleaned = removeLeadingZeros(e.target.value);
                      e.target.value = cleaned;
                      setTopP(Number(cleaned));
                    }}
                    className="col-span-2 h-8"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="topK">Top K</Label>
                  <Input
                    id="topK"
                    type="number"
                    value={topK}
                    onChange={(e) => {
                      const cleaned = removeLeadingZeros(e.target.value);
                      e.target.value = cleaned;
                      setTopK(Number(cleaned));
                    }}
                    className="col-span-2 h-8"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="repPen">Repeat Penalty</Label>
                  <Input
                    id="repPen"
                    type="number"
                    step="0.1"
                    value={repeatPenalty}
                    onChange={(e) => {
                      const cleaned = removeLeadingZeros(e.target.value);
                      e.target.value = cleaned;
                      setRepeatPenalty(Number(cleaned));
                    }}
                    className="col-span-2 h-8"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
