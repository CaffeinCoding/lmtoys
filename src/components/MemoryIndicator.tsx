import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu } from "lucide-react";

interface MemoryData {
  total: number;
  used: number;
}

export function MemoryIndicator() {
  const [memory, setMemory] = useState<MemoryData | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const fetchMemory = async () => {
      try {
        const data = await invoke<MemoryData>("get_system_memory");
        setMemory(data);
      } catch (err) {
        console.error("Failed to fetch memory", err);
      }
    };

    fetchMemory();
    // Poll every 3 seconds
    interval = setInterval(fetchMemory, 3000);

    return () => clearInterval(interval);
  }, []);

  if (!memory) return null;

  // sysinfo returns memory in bytes. Convert to GB.
  const usedGb = (memory.used / 1024 / 1024 / 1024).toFixed(1);
  const totalGb = (memory.total / 1024 / 1024 / 1024).toFixed(1);
  
  // Calculate percentage
  const percent = (memory.used / memory.total) * 100;
  
  // Determine color based on usage
  let colorClass = "text-green-500 bg-green-500/10 border-green-500/20";
  if (percent > 85) {
    colorClass = "text-destructive bg-destructive/10 border-destructive/20";
  } else if (percent > 60) {
    colorClass = "text-amber-500 bg-amber-500/10 border-amber-500/20";
  }

  return (
    <div className={`flex items-center gap-2 p-2 rounded-md border text-xs font-medium ${colorClass}`}>
      <Cpu size={14} />
      <span>RAM: {usedGb}GB / {totalGb}GB</span>
    </div>
  );
}
