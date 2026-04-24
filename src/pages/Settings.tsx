import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/useAppStore";
import { Download, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [lmStudioUrl, setLmStudioUrl] = useState("http://localhost:1234/v1");

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const { modelDownloadPath, setModelDownloadPath, hfToken, setHfToken } = useAppStore();
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [isDownloading, setIsDownloading] = useState<{ [key: string]: boolean }>({});
  const [localHfToken, setLocalHfToken] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedModelId(null);
    try {
      const res = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(searchQuery)}&filter=gguf&sort=downloads&direction=-1&limit=20`);
      const data = await res.json();
      setSearchResults(data);
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
      const files = data.siblings?.filter((s: any) => s.rfilename.endsWith('.gguf')) || [];
      setModelFiles(files);
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
        
        const downloadPath = await store.get<string>("modelDownloadPath");
        if (downloadPath) {
          setModelDownloadPath(downloadPath);
        } else {
          try {
            const defaultPath = await appDataDir();
            setModelDownloadPath(`${defaultPath}\\models`);
          } catch (e) {
            console.error("Failed to get appDataDir", e);
          }
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    loadSettings();
  }, [setModelDownloadPath]);

  const refreshDownloadedModels = async (path: string) => {
    try {
      const models = await invoke<string[]>("get_downloaded_models", { path });
      setDownloadedModels(models);
    } catch (err) {
      console.error("Failed to fetch downloaded models", err);
    }
  };

  useEffect(() => {
    if (modelDownloadPath) {
      refreshDownloadedModels(modelDownloadPath);
    }
  }, [modelDownloadPath]);

  useEffect(() => {
    const unlisten = listen<{ filename: string, downloaded: number, total: number | null }>("download_progress", (event) => {
      const { filename, downloaded, total } = event.payload;
      if (total) {
        const percent = Math.round((downloaded / total) * 100);
        setDownloadProgress(prev => ({ ...prev, [filename]: percent }));
        if (percent >= 100) {
           setTimeout(() => {
             setIsDownloading(prev => ({ ...prev, [filename]: false }));
             if (modelDownloadPath) refreshDownloadedModels(modelDownloadPath);
           }, 1000);
        }
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
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="cloud">Cloud Models</TabsTrigger>
          <TabsTrigger value="local">Local Models</TabsTrigger>
        </TabsList>
        
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
              <CardTitle>Built-in Models (Candle)</CardTitle>
              <CardDescription>
                Download and manage models directly within the application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Download Directory</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly
                    placeholder="Select a folder..." 
                    value={modelDownloadPath || ""}
                  />
                  <Button variant="outline" onClick={async () => {
                    const selected = await open({ directory: true });
                    if (selected && typeof selected === 'string') {
                      setModelDownloadPath(selected);
                    }
                  }}>
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
                            <span className="text-sm font-medium">{model.id}</span>
                            <span className="text-xs text-muted-foreground">{model.downloads?.toLocaleString()} downloads</span>
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
                            {modelFiles.map(file => (
                              <div key={file.rfilename} className="flex items-center justify-between p-2 border rounded-md bg-background">
                                <span className="text-sm truncate mr-4" title={file.rfilename}>{file.rfilename}</span>
                                <div className="flex items-center gap-4 shrink-0">
                                  {downloadProgress[file.rfilename] !== undefined && isDownloading[file.rfilename] && (
                                    <span className="text-xs text-muted-foreground">{downloadProgress[file.rfilename]}%</span>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant="secondary" 
                                    disabled={isDownloading[file.rfilename] || downloadedModels.includes(file.rfilename)}
                                    onClick={async () => {
                                      setIsDownloading(prev => ({ ...prev, [file.rfilename]: true }));
                                      setDownloadProgress(prev => ({ ...prev, [file.rfilename]: 0 }));
                                      try {
                                        const url = `https://huggingface.co/${selectedModelId}/resolve/main/${file.rfilename}?download=true`;
                                        await invoke("download_model", { 
                                          url, 
                                          path: modelDownloadPath, 
                                          filename: file.rfilename,
                                          token: hfToken
                                        });

                                      } catch (err) {
                                        console.error(err);
                                        setIsDownloading(prev => ({ ...prev, [file.rfilename]: false }));
                                      }
                                    }}
                                  >
                                    <Download className="w-4 h-4 mr-2" /> 
                                    {downloadedModels.includes(file.rfilename) ? "Downloaded" : "Download"}
                                  </Button>
                                </div>
                              </div>
                            ))}
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
                        {downloadedModels.map(name => (
                          <div key={name} className="flex flex-col gap-2 p-3 border rounded-md bg-muted/20">
                            <div className="flex items-center justify-between">
                              <span className="text-sm truncate mr-4" title={name}>{name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={async () => {
                                    try {
                                      await invoke("delete_model", { path: modelDownloadPath, filename: name });
                                      refreshDownloadedModels(modelDownloadPath!);
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

      <div className="flex items-center gap-4">
        <Button onClick={saveSettings} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        {saveMessage && (
          <span className="text-sm text-muted-foreground">{saveMessage}</span>
        )}
      </div>
    </div>
  );
}
