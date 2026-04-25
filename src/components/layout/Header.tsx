import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Play, Square, Loader2, Settings as SettingsIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

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
  } = useAppStore();

  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  useEffect(() => {
    if (modelDownloadPath) {
      invoke<string[]>("get_downloaded_models", { path: modelDownloadPath })
        .then(setDownloadedModels)
        .catch(console.error);
    }
  }, [modelDownloadPath]);

  useEffect(() => {
    // Listen for stdout
    const unlistenLog = listen<{ status: string, message: string }>("llm-log", (event) => {
      const msg = event.payload.message;
      addServerLog(msg);
      
      // Use useAppStore.getState() to check current status without adding to dependency array
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
    
    try {
      await invoke("start_llama_server", {
        runtime: selectedRuntime,
        port: serverPort,
        model: `${modelDownloadPath}\\${builtInModel}`,
        ctxSize: maxTokens,
        ngl: nGpuLayers
      });
      
      // Start polling the server to detect when it's ready, bypassing stdout buffer issues
      const pollInterval = setInterval(async () => {
        const currentStatus = useAppStore.getState().serverStatus;
        if (currentStatus !== "loading") {
          clearInterval(pollInterval);
          return;
        }
        try {
          // llama-server typically exposes /health or /props. Even if it returns 404, the connection succeeds.
          await fetch(`http://127.0.0.1:${serverPort}/health`, { mode: 'no-cors' });
          useAppStore.getState().setServerStatus("running");
          clearInterval(pollInterval);
        } catch (e) {
          // Still loading, connection refused
        }
      }, 1000);

      // Timeout for polling (e.g. 5 minutes)
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
        {/* Model Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground whitespace-nowrap">Local Model</Label>
          <select
            className="flex h-9 w-64 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={builtInModel || ""}
            onChange={(e) => setBuiltInModel(e.target.value)}
            disabled={serverStatus !== "offline"}
          >
            <option value="" disabled>Select a downloaded model</option>
            {downloadedModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Server Controls */}
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
        <Popover>
          <PopoverTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-2">
            <SettingsIcon className="w-4 h-4" />
            Params
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Server Parameters</h4>
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
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
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
                    onChange={(e) => setNGpuLayers(Number(e.target.value))}
                    className="col-span-2 h-8"
                    disabled={serverStatus !== "offline"}
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
