import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/useAppStore";
import { Download, Trash2, FolderOpen, Eye, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface ModelInfo {
  name: string;
  repo: string;
  has_vision: boolean;
}

export default function Settings() {
  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [lmStudioUrl, setLmStudioUrl] = useState("http://localhost:1234/v1");

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const { 
    modelDownloadPath, setModelDownloadPath, 
    hfToken, setHfToken, 
    selectedRuntime, setSelectedRuntime, 
    serverPort, setServerPort,
    updateDownloadProgress,
    temperature, setTemperature,
    maxTokens, setMaxTokens,
    topP, setTopP,
    topK, setTopK,
    systemPrompt, setSystemPrompt,
    promptText, setPromptText,
    visionResolution, setVisionResolution,
    maxImages, setMaxImages
  } = useAppStore();
  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [isDownloading, setIsDownloading] = useState<{ [key: string]: boolean }>({});
  const [localHfToken, setLocalHfToken] = useState("");
  const [supportedRuntimes, setSupportedRuntimes] = useState<string[]>(["cpu"]);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  useEffect(() => {
    invoke<string[]>("get_supported_runtimes").then(setSupportedRuntimes).catch(console.error);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedModelId(null);
    try {
      const res = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(searchQuery)}&filter=gguf&sort=downloads&direction=-1&limit=20&full=true`);
      const data = await res.json();
      
      // Process data to flag vision support early based on tags or library names
      const processedResults = data.map((model: any) => {
        const tags = model.tags || [];
        const hasVisionTag = tags.some((t: string) => 
          t.toLowerCase().includes('vision') || 
          t.toLowerCase().includes('multimodal') || 
          t.toLowerCase().includes('llava') ||
          t.toLowerCase().includes('moondream') ||
          t.toLowerCase().includes('qwen2-vl')
        );
        return { ...model, has_vision_projector: hasVisionTag };
      });
      
      setSearchResults(processedResults);
    } catch (err) {
      console.error("Failed to search Hugging Face", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModelId(modelId);
    setIsLoadingFiles(true);
    try {
      const headers: Record<string, string> = hfToken ? { "Authorization": `Bearer ${hfToken}` } : {};
      const res = await fetch(`https://huggingface.co/api/models/${modelId}`, { headers });
      const data = await res.json();
      const allFiles = data.siblings || [];
      const ggufFiles = allFiles.filter((s: any) => s.rfilename.endsWith('.gguf'));
      
      // Determine if this repo likely contains a vision model by checking for mmproj files
      const hasVisionProjector = allFiles.some((s: any) => s.rfilename.toLowerCase().includes('mmproj'));
      
      // Update search results to include this info if not already there
      setSearchResults(prev => prev.map(m => m.id === modelId ? { ...m, has_vision_projector: hasVisionProjector } : m));
      
      setModelFiles(ggufFiles);
    } catch (err) {
      console.error("Failed to fetch model files", err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await load("settings.json");
        
        const gKey = await store.get<string>("geminiKey");
        if (gKey) setGeminiKey(gKey);
        
        const oKey = await store.get<string>("openAiKey");
        if (oKey) setOpenAiKey(oKey);
        
        const cKey = await store.get<string>("claudeKey");
        if (cKey) setClaudeKey(cKey);
        
        const ollama = await store.get<string>("ollamaUrl");
        if (ollama) setOllamaUrl(ollama);
        
        const lmStudio = await store.get<string>("lmStudioUrl");
        if (lmStudio) setLmStudioUrl(lmStudio);
        
        const hf = await store.get<string>("hfToken");
        if (hf) {
          setHfToken(hf);
          setLocalHfToken(hf);
        }

        const port = await store.get<number>("serverPort");
        if (port) {
          setServerPort(port);
        }
        
        const downloadPath = await store.get<string>("modelDownloadPath");
        if (downloadPath) {
          setModelDownloadPath(downloadPath);
          refreshDownloadedModels(downloadPath);
        } else {
          const path = await appDataDir();
          setModelDownloadPath(`${path}\\models`);
          refreshDownloadedModels(`${path}\\models`);
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    loadSettings();
  }, [setModelDownloadPath]);

  const refreshDownloadedModels = async (path: string) => {
    try {
      const models = await invoke<ModelInfo[]>("get_downloaded_models", { path });
      setDownloadedModels(models);
    } catch (err) {
      console.error("Failed to fetch downloaded models", err);
    }
  };

  useEffect(() => {
    // We only need to listen for completion to refresh the local model list
    const unlisten = listen<{ filename: string, downloaded: number, total: number }>("download_progress", (event) => {
      const { filename, downloaded, total } = event.payload;
      const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
      setDownloadProgress(prev => ({ ...prev, [filename]: progress }));
      
      if (progress >= 100) {
        setIsDownloading(prev => ({ ...prev, [filename]: false }));
        if (modelDownloadPath) refreshDownloadedModels(modelDownloadPath);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [modelDownloadPath]);

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
      const store = await load("settings.json");
      await store.set("geminiKey", geminiKey);
      await store.set("openAiKey", openAiKey);
      await store.set("claudeKey", claudeKey);
      await store.set("ollamaUrl", ollamaUrl);
      await store.set("lmStudioUrl", lmStudioUrl);
      await store.set("hfToken", localHfToken);
      await store.set("serverPort", serverPort);
      await store.set("selectedRuntime", selectedRuntime);
      setHfToken(localHfToken);
      if (modelDownloadPath) await store.set("modelDownloadPath", modelDownloadPath);
      await store.save();
      setSaveMessage("Settings saved successfully.");
    } catch (err) {
      console.error("Failed to save settings", err);
      setSaveMessage("Failed to save settings.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  };

  const handleSelectDownloadDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: modelDownloadPath || undefined
      });
      if (selected && typeof selected === 'string') {
        setModelDownloadPath(selected);
        refreshDownloadedModels(selected);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure API keys for Cloud LLMs and endpoints for Local Models.
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="cloud" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
          <TabsTrigger value="cloud">Cloud Models</TabsTrigger>
          <TabsTrigger value="local">Local Models</TabsTrigger>
          <TabsTrigger value="config">Model Config</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Default Extraction Parameters</CardTitle>
              <CardDescription>
                These values will be used as defaults for all extraction tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defTemp">Default Temperature</Label>
                  <Input 
                    id="defTemp" 
                    type="number" 
                    step="0.1"
                    value={temperature}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemperature(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defMaxTokens">Default Max Tokens</Label>
                  <Input 
                    id="defMaxTokens" 
                    type="number" 
                    value={maxTokens}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxTokens(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defTopP">Default Top P</Label>
                  <Input 
                    id="defTopP" 
                    type="number" 
                    step="0.05"
                    value={topP}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopP(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defTopK">Default Top K</Label>
                  <Input 
                    id="defTopK" 
                    type="number" 
                    value={topK}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopK(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defSystemPrompt">Default System Prompt</Label>
                <Textarea 
                  id="defSystemPrompt" 
                  value={systemPrompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSystemPrompt(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="defPromptText">Default User Instruction</Label>
                <Textarea 
                  id="defPromptText" 
                  value={promptText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPromptText(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <Separator className="my-4" />
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" /> Vision Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="visionRes">Vision Resolution (px)</Label>
                  <Input 
                    id="visionRes" 
                    type="number" 
                    value={visionResolution}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVisionResolution(Number(e.target.value))}
                  />
                  <p className="text-[10px] text-muted-foreground">Higher resolution improves OCR but uses more VRAM/RAM.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxImg">Max Images per Extraction</Label>
                  <Input 
                    id="maxImg" 
                    type="number" 
                    value={maxImages}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxImages(Number(e.target.value))}
                  />
                  <p className="text-[10px] text-muted-foreground">Number of PDF pages to process as images at once.</p>
                </div>
              </div>
              </CardContent>          </Card>
        </TabsContent>

        <TabsContent value="cloud" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Cloud API Keys</CardTitle>
              <CardDescription>
                Keys are stored securely in your local environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gemini">Google Gemini API Key</Label>
                <Input 
                  id="gemini" 
                  type="password" 
                  placeholder="AIzaSy..." 
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openai">OpenAI API Key</Label>
                <Input 
                  id="openai" 
                  type="password" 
                  placeholder="sk-..." 
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claude">Anthropic Claude API Key</Label>
                <Input 
                  id="claude" 
                  type="password" 
                  placeholder="sk-ant-..." 
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="local" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Local Model Endpoints</CardTitle>
              <CardDescription>
                Configure connection URLs for local LLM servers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ollama">Ollama URL</Label>
                <Input 
                  id="ollama" 
                  placeholder="http://localhost:11434" 
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lmstudio">LM Studio Local Server URL</Label>
                <Input 
                  id="lmstudio" 
                  placeholder="http://localhost:1234/v1" 
                  value={lmStudioUrl}
                  onChange={(e) => setLmStudioUrl(e.target.value)}
                />
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label htmlFor="hftoken">HuggingFace API Token (Optional)</Label>
                <CardDescription className="mb-2">
                  Required for gated models like Gemma 4. Get one at <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-primary hover:underline">hf.co/settings/tokens</a>
                </CardDescription>
                <Input 
                  id="hftoken" 
                  type="password"
                  placeholder="hf_..." 
                  value={localHfToken}
                  onChange={(e) => setLocalHfToken(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Built-in Models (llama-server)</CardTitle>
              <CardDescription>
                Download and manage models directly within the application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GPU Runtime</Label>
                  <div className="flex gap-2 items-center">
                    <select 
                      value={selectedRuntime}
                      onChange={(e) => setSelectedRuntime(e.target.value as any)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      {supportedRuntimes.map((rt) => (
                        <option key={rt} value={rt}>
                          {{ cpu: "CPU Only (Default)", vulkan: "Vulkan (AMD/Intel/NVIDIA)", cuda: "CUDA (NVIDIA)", cuda12: "CUDA 12 (NVIDIA)" }[rt] ?? rt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serverPort">Local Server Port</Label>
                  <Input 
                    id="serverPort" 
                    type="number"
                    placeholder="8080" 
                    value={serverPort}
                    onChange={(e) => setServerPort(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Download Directory</Label>
                <div className="flex gap-2">
                  <Input readOnly value={modelDownloadPath || ""} placeholder="Select a folder..." />
                  <Button variant="outline" onClick={handleSelectDownloadDir}>
                    <FolderOpen className="w-4 h-4 mr-2" /> Browse
                  </Button>
                </div>
              </div>

              {modelDownloadPath && (
                <>
                  <div className="space-y-4">
                    <Label>Hugging Face GGUF Search</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="e.g. Llama-3" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                      <Button onClick={handleSearch} disabled={isSearching}>
                        {isSearching ? "Searching..." : "Search"}
                      </Button>
                    </div>
                    
                    {searchResults.length > 0 && !selectedModelId && (
                      <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                        {searchResults.map(model => (
                          <div 
                            key={model.id} 
                            className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleSelectModel(model.id)}
                          >
                            <div className="flex items-center gap-2 truncate mr-4">
                              <span className="text-sm font-medium truncate">{model.id}</span>
                              {(
                                model.has_vision_projector || 
                                model.id.toLowerCase().includes('vision') || 
                                model.id.toLowerCase().includes('llava') || 
                                model.id.toLowerCase().includes('qwen-vl') ||
                                model.tags?.some((t: string) => t.toLowerCase().includes('vision') || t.toLowerCase().includes('multimodal'))
                              ) && (
                                <Eye className="w-3.5 h-3.5 text-blue-500" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{model.downloads?.toLocaleString()} downloads</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedModelId && (
                      <div className="space-y-4 p-4 border rounded-md bg-muted/10">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{selectedModelId}</h4>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedModelId(null); setModelFiles([]); }}>
                            Back to results
                          </Button>
                        </div>
                        
                        {isLoadingFiles ? (
                          <div className="text-sm text-muted-foreground">Loading files...</div>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {modelFiles.map(file => {
                                const fileName = file.rfilename;
                                const isDownloaded = downloadedModels.some(m => m.name.endsWith(fileName));
                                return (
                                    <div key={fileName} className="flex items-center justify-between p-2 border rounded-md bg-background">
                                        <span className="text-sm truncate mr-4" title={fileName}>{fileName}</span>
                                        <div className="flex items-center gap-4 shrink-0">
                                            {downloadProgress[fileName] !== undefined && isDownloading[fileName] && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">{downloadProgress[fileName]}%</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                        onClick={async () => {
                                                            try {
                                                                await invoke("cancel_download", { filename: fileName });
                                                            } catch (err) {
                                                                console.error(err);
                                                            }
                                                        }}
                                                    >
                                                        <Square className="w-3 h-3 fill-current" />
                                                    </Button>
                                                </div>
                                            )}
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                disabled={isDownloading[fileName] || isDownloaded}
                                                onClick={async () => {
                                                    setIsDownloading(prev => ({ ...prev, [fileName]: true }));
                                                    setDownloadProgress(prev => ({ ...prev, [fileName]: 0 }));
                                                    updateDownloadProgress(fileName, 0, 'downloading');
                                                    try {
                                                        const url = `https://huggingface.co/${selectedModelId}/resolve/main/${fileName}?download=true`;
                                                        await invoke("download_model", { 
                                                            url, 
                                                            path: modelDownloadPath, 
                                                            filename: fileName,
                                                            repo: selectedModelId,
                                                            token: hfToken
                                                        });
                                                        const { emit } = await import("@tauri-apps/api/event");
                                                        await emit("models-changed");
                                                        } catch (err) {
                                                        console.error(err);
                                                        setIsDownloading(prev => ({ ...prev, [fileName]: false }));
                                                        updateDownloadProgress(fileName, 0, 'error');
                                                    }
                                                }}
                                            >
                                                <Download className="w-4 h-4 mr-2" /> 
                                                {isDownloaded ? "Downloaded" : "Download"}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                            {modelFiles.length === 0 && <div className="text-sm text-muted-foreground">No GGUF files found in this repository.</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <Label>Downloaded Models</Label>
                    {downloadedModels.length > 0 ? (
                      <div className="space-y-2">
                        {downloadedModels.map(model => (
                          <div key={model.name} className="flex flex-col gap-2 p-3 border rounded-md bg-muted/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate mr-4">
                                <span className="text-sm truncate font-medium" title={model.name}>{model.name}</span>
                                {model.has_vision && (
                                  <Badge variant="secondary" className="h-5 px-1.5 gap-1 bg-blue-500/10 text-blue-600 border-blue-200 shrink-0">
                                    <Eye className="w-3 h-3" />
                                    <span className="text-[10px]">VISION</span>
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={async () => {
                                    try {
                                      await invoke("delete_model", { path: modelDownloadPath, filename: model.name });
                                      if (modelDownloadPath) refreshDownloadedModels(modelDownloadPath);
                                      const { emit } = await import("@tauri-apps/api/event");
                                      await emit("models-changed");
                                    } catch (err) {
                                      console.error("Failed to delete", err);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/10 text-center">
                        No models downloaded yet. Search and download a model above.
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-4 border-t pt-6">
        <Button variant="default" onClick={saveSettings} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        {saveMessage && (
          <span className="text-sm text-muted-foreground">{saveMessage}</span>
        )}
      </div>
    </div>
  );
}
