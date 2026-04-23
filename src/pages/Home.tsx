import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function Home() {
  const [greetMsg, setGreetMsg] = useState("");

  async function testTauri() {
    setGreetMsg(await invoke("greet", { name: "Tauri" }));
  }

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6">
      <h1 className="text-4xl font-bold tracking-tight">PDF Parser & LLM Extractor</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Upload a PDF file to extract text, tables, and structured data using local or cloud LLM models.
      </p>
      
      <div className="flex gap-4">
        <Button size="lg">Upload PDF</Button>
        <Button variant="outline" onClick={testTauri} size="lg">Test Rust Backend</Button>
      </div>

      {greetMsg && (
        <p className="text-sm text-green-500 mt-4 p-4 border border-green-500/20 rounded-md bg-green-500/10">
          Backend says: {greetMsg}
        </p>
      )}
    </div>
  );
}
