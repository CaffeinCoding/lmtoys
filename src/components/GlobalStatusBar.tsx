import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";

/**
 * GlobalStatusBar
 * - 모든 페이지 하단에 고정으로 표시되는 상태표시줄
 * - AppLayout에서 렌더링되어 라우트와 무관하게 항상 존재
 * - RAM / VRAM 폴링, 선택 런타임, TTFT & TPS 표시
 */
export function GlobalStatusBar() {
  const {
    selectedRuntime,
    timeToFirstToken,
    tokensPerSecond,
    sysMemory, setSysMemory,
    sysVram, setSysVram,
  } = useAppStore();

  useEffect(() => {
    const poll = async () => {
      try {
        const mem = await invoke<{ total: number; used: number }>("get_system_memory");
        setSysMemory(mem);
        const vram = await invoke<{ total: number; used: number } | null>("get_system_vram");
        if (vram) setSysVram(vram);
      } catch (err) {
        console.error("Failed to poll system resources", err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
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
      {/* Left: Runtime + Memory */}
      <div className="flex items-center gap-4">
        {/* Runtime badge */}
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {runtimeLabel[selectedRuntime] ?? selectedRuntime.toUpperCase()}
        </div>

        {/* RAM bar */}
        {ramText && (
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
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
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(vramPercent)}`}
                style={{ width: `${Math.min(vramPercent, 100)}%` }}
              />
            </div>
            <span>{vramText}</span>
          </div>
        )}
      </div>

      {/* Right: Inference telemetry */}
      <div className="flex items-center gap-4">
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
