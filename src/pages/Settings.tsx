import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
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
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    loadSettings();
  }, []);

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
