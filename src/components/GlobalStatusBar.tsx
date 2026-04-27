import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import { Loader2 } from "lucide-react";

/**
 * GlobalStatusBar
 * - 모든 페이지 하단에 고정으로 표시되는 상태표시줄
 * - AppLayout에서 렌더링되어 라우트와 무관하게 항상 존재
 * - RAM / VRAM 폴링, 선택 런타임, TTFT & TPS 표시
 */
export function GlobalStatusBar() {
  // 개별 셀렉터를 사용하여 불필요한 리렌더링 방지
  const builtInModel = useAppStore(state => state.builtInModel);
  const selectedRuntime = useAppStore(state => state.selectedRuntime);
  const serverStatus = useAppStore(state => state.serverStatus);
  const serverPort = useAppStore(state => state.serverPort);
  const timeToFirstToken = useAppStore(state => state.timeToFirstToken);
  const tokensPerSecond = useAppStore(state => state.tokensPerSecond);
  const sysMemory = useAppStore(state => state.sysMemory);
  const setSysMemory = useAppStore(state => state.setSysMemory);
  const sysVram = useAppStore(state => state.sysVram);
  const setSysVram = useAppStore(state => state.setSysVram);

  const errorCount = useRef(0);
  const MAX_ERRORS = 5;

  useEffect(() => {
    let intervalId: any;

    const poll = async () => {
      try {
        const mem = await invoke<{ total: number; used: number }>("get_system_memory");
        setSysMemory(mem);
        
        const vram = await invoke<{ total: number; used: number } | null>("get_system_vram");
        if (vram) setSysVram(vram);
        
        errorCount.current = 0; // 성공 시 카운트 초기화
      } catch (err) {
        errorCount.current += 1;
        console.error(`Failed to poll system resources (Attempt ${errorCount.current}/${MAX_ERRORS})`, err);
        
        if (errorCount.current >= MAX_ERRORS) {
          console.error("Stopping resource polling due to repeated failures. Please check the backend.");
          if (intervalId) clearInterval(intervalId);
        }
      }
    };

    poll();
    intervalId = setInterval(poll, 3000);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [setSysMemory, setSysVram]);

  const runtimeLabel: Record<string, string> = {
    cpu: "CPU",
    vulkan: "Vulkan",
    cuda: "CUDA",
    cuda12: "CUDA 12",
  };

  const ramText = sysMemory
    ? `RAM ${(sysMemory.used / 1024 ** 3).toFixed(1)} / ${(sysMemory.total / 1024 ** 3).toFixed(1)} GB`
    : null;

  const vramText = sysVram
    ? `VRAM ${(sysVram.used / 1024 ** 3).toFixed(1)} / ${(sysVram.total / 1024 ** 3).toFixed(1)} GB`
    : null;

  const ramPercent = sysMemory ? (sysMemory.used / sysMemory.total) * 100 : 0;
  const vramPercent = sysVram ? (sysVram.used / sysVram.total) * 100 : 0;

  const barColor = (pct: number) =>
    pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="h-7 bg-background border-t flex items-center justify-between px-4 text-[10px] text-muted-foreground shrink-0 gap-6">
      {/* Left: Server Status & Model Info */}
      <div className="flex items-center gap-4">
        {/* Server Status */}
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          {serverStatus === "offline" && <span className="w-2 h-2 rounded-full bg-muted-foreground" title="Offline" />}
          {serverStatus === "loading" && <Loader2 className="w-3 h-3 animate-spin text-amber-500" />}
          {serverStatus === "running" && <span className="w-2 h-2 rounded-full bg-green-500" title="Running" />}
          
          <span className="capitalize">{serverStatus}</span>
        </div>

        {/* Model Info if running or loading */}
        {serverStatus !== "offline" && builtInModel && (
          <div className="flex items-center gap-2">
            <span className="truncate max-w-[200px]" title={typeof builtInModel === 'string' ? builtInModel : (builtInModel as any).name}>
              {typeof builtInModel === 'string' ? builtInModel : (builtInModel as any).name} ({runtimeLabel[selectedRuntime] ?? selectedRuntime.toUpperCase()})
            </span>
            <span className="opacity-50">|</span>
            <span>Port: {serverPort}</span>
          </div>
        )}
      </div>

      {/* Right: Resources & Telemetry */}
      <div className="flex items-center gap-4">
        {/* RAM bar */}
        {ramText && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(ramPercent)}`}
                style={{ width: `${Math.min(ramPercent, 100)}%` }}
              />
            </div>
            <span>{ramText}</span>
          </div>
        )}

        {/* VRAM bar */}
        {vramText && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(vramPercent)}`}
                style={{ width: `${Math.min(vramPercent, 100)}%` }}
              />
            </div>
            <span>{vramText}</span>
          </div>
        )}

        <div className="w-[1px] h-3 bg-border opacity-50 mx-1" />

        <span>
          <span className="font-semibold text-foreground">TTFT</span>{" "}
          {timeToFirstToken != null ? `${timeToFirstToken} ms` : "—"}
        </span>
        <span>
          <span className="font-semibold text-foreground">Speed</span>{" "}
          {tokensPerSecond != null ? `${tokensPerSecond.toFixed(1)} t/s` : "—"}
        </span>
      </div>
    </div>
  );
}
