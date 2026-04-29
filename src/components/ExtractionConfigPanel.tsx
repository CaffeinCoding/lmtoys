import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Settings2,
    Eye,
    Zap,
    CheckCircle2,
    XCircle,
    Loader2,
    Square,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export interface ModelInfo {
    name: string;
    repo: string;
    has_vision: boolean;
}

interface ExtractionConfigPanelProps {
    handleExtract: () => void;
    handleStopExtraction: () => void;
    isExtracting: boolean;
    extractionProgress: {
        current: number;
        total: number;
        message: string;
    } | null;
    isExtractDisabled?: boolean;
    extractButtonText?: string;
    hideTextMode?: boolean;
    feature: "pdf" | "image";
}

export function ExtractionConfigPanel({
    handleExtract,
    handleStopExtraction,
    isExtracting,
    extractionProgress,
    isExtractDisabled = false,
    extractButtonText = "Extract with LLM",
    hideTextMode = false,
    feature,
}: ExtractionConfigPanelProps) {
    const {
        llmMode,
        setLlmMode,
        extractionMode,
        setExtractionMode,
        pdfPromptText,
        setPdfPromptText,
        imagePromptText,
        setImagePromptText,
        provider,
        setProvider,
        modelName,
        setModelName,
        builtInModel,
        setBuiltInModel,
        modelDownloadPath,
        temperature,
        setTemperature,
        topK,
        setTopK,
        topP,
        setTopP,
        cloudProvider,
        setCloudProvider,
        pdfSystemPrompt,
        setPdfSystemPrompt,
        imageSystemPrompt,
        setImageSystemPrompt,
        pdfJsonFormat,
        setPdfJsonFormat,
        imageJsonFormat,
        setImageJsonFormat,
        repeatPenalty,
        setRepeatPenalty,
        nGpuLayers,
        setNGpuLayers,
        isStreaming,
        extractedText,
        suggestNgl,
    } = useAppStore();

    const systemPrompt = feature === "pdf" ? pdfSystemPrompt : imageSystemPrompt;
    const setSystemPrompt = feature === "pdf" ? setPdfSystemPrompt : setImageSystemPrompt;
    
    const promptText = feature === "pdf" ? pdfPromptText : imagePromptText;
    const setPromptText = feature === "pdf" ? setPdfPromptText : setImagePromptText;

    const jsonFormat = feature === "pdf" ? pdfJsonFormat : imageJsonFormat;
    const setJsonFormat = feature === "pdf" ? setPdfJsonFormat : setImageJsonFormat;

    const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
    const [isJsonValid, setIsJsonValid] = useState(true);

    useEffect(() => {
        if (hideTextMode) {
            setExtractionMode("vision");
        }
    }, [hideTextMode, setExtractionMode]);

    useEffect(() => {
        try {
            JSON.parse(jsonFormat);
            setIsJsonValid(true);
        } catch {
            setIsJsonValid(false);
        }
    }, [jsonFormat]);

    useEffect(() => {
        const refresh = () => {
            if (provider === "builtin" && modelDownloadPath) {
                invoke<ModelInfo[]>("get_downloaded_models", {
                    path: modelDownloadPath,
                })
                    .then((models) => {
                        setDownloadedModels(models);
                        if (
                            models.length > 0 &&
                            (!builtInModel ||
                                !models.find((m) => m.name === builtInModel))
                        ) {
                            const firstModel = models[0];
                            setBuiltInModel(firstModel.name);
                        }
                    })
                    .catch(console.error);
            }
        };
        refresh();

        import("@tauri-apps/api/event").then((m) => {
            let unlistenFn: (() => void) | undefined;
            m.listen("models-changed", refresh).then((f) => {
                unlistenFn = f;
            });
            return () => {
                if (unlistenFn) unlistenFn();
            };
        });
    }, [provider, modelDownloadPath, builtInModel, setBuiltInModel]);

    return (
        <Card className="shrink-0 border-primary/20">
            <CardHeader className="py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-primary" />
                    Extraction Configuration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Tabs
                    value={llmMode}
                    onValueChange={(v) => setLlmMode(v as "cloud" | "local")}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="cloud">Cloud</TabsTrigger>
                        <TabsTrigger value="local">Local</TabsTrigger>
                    </TabsList>

                    <TabsContent value="cloud" className="pt-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <select
                                value={cloudProvider}
                                onChange={(e) =>
                                    setCloudProvider(e.target.value as any)
                                }
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                <option value="openai">OpenAI</option>
                                <option value="gemini">Gemini</option>
                                <option value="claude">Claude</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Model Name</Label>
                            <Input
                                placeholder="e.g. gpt-4o, gemini-1.5-pro"
                                value={modelName}
                                onChange={(e) => setModelName(e.target.value)}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="local" className="pt-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Backend</Label>
                            <select
                                value={provider}
                                onChange={(e) =>
                                    setProvider(e.target.value as any)
                                }
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                <option value="ollama">Ollama</option>
                                <option value="lmstudio">LM Studio</option>
                                <option value="builtin">Built-in</option>
                            </select>
                        </div>

                        {provider === "builtin" ? (
                            <div className="space-y-2">
                                <Label>Built-in Model</Label>
                                {downloadedModels.length > 0 ? (
                                    <div className="relative">
                                        <select
                                            value={builtInModel || ""}
                                            onChange={(e) =>
                                                setBuiltInModel(e.target.value)
                                            }
                                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 pr-10"
                                        >
                                            <option value="" disabled>
                                                Select a model...
                                            </option>
                                            {downloadedModels.map((m) => (
                                                <option
                                                    key={m.name}
                                                    value={m.name}
                                                >
                                                    {m.name}{" "}
                                                    {m.has_vision
                                                        ? " (👁️ Vision)"
                                                        : ""}
                                                </option>
                                            ))}
                                        </select>
                                        {downloadedModels.find(
                                            (m) => m.name === builtInModel,
                                        )?.has_vision && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                                                <Eye className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-sm text-destructive border rounded-md p-2 bg-destructive/10">
                                        No models downloaded. Please visit
                                        Settings to download a model.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Model Name</Label>
                                <Input
                                    value={modelName}
                                    onChange={(e) =>
                                        setModelName(e.target.value)
                                    }
                                />
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <div className="space-y-4 py-2 border-t">
                    <div className="flex items-center justify-between">
                        <Label className="font-semibold">Extraction Mode</Label>
                        <div className="flex bg-muted p-1 rounded-md border border-border">
                            {hideTextMode ? null : (
                                <Button
                                    variant={
                                        extractionMode === "text"
                                            ? "default"
                                            : "ghost"
                                    }
                                    size="sm"
                                    className={cn(
                                        "h-7 text-xs px-4 transition-all",
                                        extractionMode === "text"
                                            ? "shadow-sm bg-background text-foreground hover:bg-background"
                                            : "text-muted-foreground",
                                    )}
                                    onClick={() => setExtractionMode("text")}
                                >
                                    Text
                                </Button>
                            )}
                            <Button
                                variant={
                                    extractionMode === "vision"
                                        ? "default"
                                        : "ghost"
                                }
                                size="sm"
                                className={cn(
                                    "h-7 text-xs px-4 gap-1.5 transition-all",
                                    extractionMode === "vision"
                                        ? "shadow-sm bg-background text-foreground hover:bg-background"
                                        : "text-muted-foreground",
                                )}
                                onClick={() => setExtractionMode("vision")}
                                disabled={
                                    provider === "builtin" &&
                                    !downloadedModels.find(
                                        (m) => m.name === builtInModel,
                                    )?.has_vision
                                }
                            >
                                <Eye className="w-3 h-3" /> Vision
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                                Temp ({temperature})
                            </Label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={temperature}
                                onChange={(e) =>
                                    setTemperature(parseFloat(e.target.value))
                                }
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                                Top-P ({topP})
                            </Label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={topP}
                                onChange={(e) =>
                                    setTopP(parseFloat(e.target.value))
                                }
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                            Repeat Penalty ({repeatPenalty})
                        </Label>
                        <input
                            type="range"
                            min="1"
                            max="2"
                            step="0.05"
                            value={repeatPenalty}
                            onChange={(e) =>
                                setRepeatPenalty(parseFloat(e.target.value))
                            }
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                Top-K
                            </Label>
                            <Input
                                type="number"
                                value={topK}
                                onChange={(e) =>
                                    setTopK(parseInt(e.target.value))
                                }
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {provider === "builtin" && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs text-muted-foreground">
                                    GPU Layers (NGL)
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 text-[10px] px-1 gap-1 text-primary hover:bg-primary/10"
                                    onClick={suggestNgl}
                                >
                                    <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />{" "}
                                    Auto Optimize
                                </Button>
                            </div>
                            <Input
                                type="number"
                                value={nGpuLayers}
                                onChange={(e) =>
                                    setNGpuLayers(parseInt(e.target.value))
                                }
                                className="h-8 text-xs border-primary/20"
                            />
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <Label>Extraction Prompts</Label>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                                System Context
                            </div>
                            <Textarea
                                placeholder="Define the model's behavior..."
                                value={systemPrompt}
                                onChange={(e) =>
                                    setSystemPrompt(e.target.value)
                                }
                                className="min-h-[80px] text-xs resize-none bg-muted/10"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                                Extraction Instruction
                            </div>
                            <Textarea
                                placeholder="What should the model extract?"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                className="min-h-[100px] text-xs resize-none bg-muted/10"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                        <Label>Output JSON Format</Label>
                        {isJsonValid ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
                                <CheckCircle2 className="w-3 h-3" /> Valid JSON
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                                <XCircle className="w-3 h-3" /> Invalid JSON
                            </span>
                        )}
                    </div>
                    <Textarea
                        placeholder='[{"key": "value"}]'
                        value={jsonFormat}
                        onChange={(e) => setJsonFormat(e.target.value)}
                        className="font-mono text-[11px] min-h-[120px] bg-muted/30 border-primary/10"
                    />
                </div>

                <div className="flex gap-2 mt-2">
                    <Button
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                        size="lg"
                        onClick={handleExtract}
                        disabled={isExtracting || isExtractDisabled}
                    >
                        {isExtracting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Extracting...
                            </>
                        ) : (
                            extractButtonText
                        )}
                    </Button>

                    {isExtracting && (
                        <Button
                            variant="destructive"
                            size="lg"
                            onClick={handleStopExtraction}
                            className="px-4"
                        >
                            <Square className="w-4 h-4" />
                        </Button>
                    )}
                </div>

                {extractionProgress && (
                    <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                            <span>{extractionProgress.message}</span>
                            <span>
                                {Math.round(
                                    (extractionProgress.current /
                                        extractionProgress.total) *
                                        100,
                                )}
                                %
                            </span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                            <div
                                className="h-full bg-primary transition-all duration-300 ease-in-out"
                                style={{
                                    width: `${Math.round((extractionProgress.current / extractionProgress.total) * 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                )}

                {isStreaming && (
                    <div className="p-3 border rounded-md bg-primary/5 text-[10px] font-mono animate-pulse max-h-[150px] overflow-y-auto whitespace-pre-wrap border-primary/20 mt-2">
                        {extractedText || "Model is generating response..."}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
