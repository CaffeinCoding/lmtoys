import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { appDataDir } from "@tauri-apps/api/path";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/useAppStore";
import { Loader2, Upload, FileText, Settings2, Search, Trash2, ChevronDown, ChevronUp } from "lucide-react";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker to use CDN to prevent Vite bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function highlightPattern(text: string, pattern: string) {
    if (!pattern) return text;
    const splitText = text.split(new RegExp(`(${pattern})`, 'gi'));
    return (
        <>
            {splitText.map((piece, index) =>
                piece.toLowerCase() === pattern.toLowerCase() ? (
                    <mark key={index} className="bg-yellow-400 text-black font-bold px-0.5 rounded-sm">
                        {piece}
                    </mark>
                ) : (
                    piece
                )
            )}
        </>
    );
}

export default function Home() {
    const navigate = useNavigate();
    const { 
        currentPdfPath, setCurrentPdfPath, setExtractedData,
        llmMode, setLlmMode,
        promptText, setPromptText,
        provider, setProvider,
        modelName, setModelName,
        builtInModel, setBuiltInModel,
        modelDownloadPath,
        temperature, setTemperature,
        maxTokens, setMaxTokens,
        topK, setTopK,
        topP, setTopP,
        cloudProvider, setCloudProvider,
        systemPrompt, setSystemPrompt,
        repeatPenalty, setRepeatPenalty,
        nGpuLayers, setNGpuLayers,
        isStreaming, setIsStreaming,
        tokensPerSecond, setTokensPerSecond,
        timeToFirstToken, setTimeToFirstToken,
        parsedPdfText, setParsedPdfText
    } = useAppStore();
    const [pdfFile, setPdfFile] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>();
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [searchText, setSearchText] = useState("");
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedText, setExtractedText] = useState("");
    const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
    const [builtInMetadata, setBuiltInMetadata] = useState<any | null>(null);
    const [isTextParseOpen, setIsTextParseOpen] = useState(false);
    const { setModelDownloadPath } = useAppStore();

    useEffect(() => {
        async function initPath() {
            if (modelDownloadPath) return; // Already initialized
            try {
                const store = await load("settings.json");
                const downloadPath = await store.get<string>("modelDownloadPath");
                if (downloadPath) {
                    setModelDownloadPath(downloadPath);
                } else {
                    const defaultPath = await appDataDir();
                    setModelDownloadPath(`${defaultPath}\\models`);
                }
            } catch (err) {
                console.error("Failed to load model download path", err);
            }
        }
        initPath();
    }, [modelDownloadPath, setModelDownloadPath]);

    useEffect(() => {
        if (provider === "builtin" && modelDownloadPath && builtInModel) {
            invoke("get_gguf_metadata", { path: modelDownloadPath, filename: builtInModel })
                .then(setBuiltInMetadata)
                .catch(err => {
                    console.error("Failed to parse GGUF metadata", err);
                    setBuiltInMetadata(null);
                });
        } else {
            setBuiltInMetadata(null);
        }
    }, [provider, modelDownloadPath, builtInModel]);

    useEffect(() => {
        if (provider === "builtin" && modelDownloadPath) {
            invoke<string[]>("get_downloaded_models", { path: modelDownloadPath })
                .then((models) => {
                    setDownloadedModels(models);
                    // 자동 선택: builtInModel이 null이거나 목록에 없으면 첫 번째 모델 자동 선택
                    if (models.length > 0 && (!builtInModel || !models.includes(builtInModel))) {
                        setBuiltInModel(models[0]);
                    }
                })
                .catch(console.error);
        }
    }, [provider, modelDownloadPath]);

    // When path changes, read the file and create a Blob URL to prevent ArrayBuffer detachment issues
    useEffect(() => {
        let objectUrl: string | null = null;

        if (currentPdfPath) {
            readFile(currentPdfPath)
                .then((data) => {
                    const blob = new Blob([data], { type: "application/pdf" });
                    objectUrl = URL.createObjectURL(blob);
                    setPdfFile(objectUrl);
                })
                .catch((err) => console.error("Failed to read PDF file", err));
        } else {
            setPdfFile(null);
        }

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [currentPdfPath]);

    const handleUpload = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [
                    {
                        name: "PDF",
                        extensions: ["pdf"],
                    },
                ],
            });
            if (selected && typeof selected === "string") {
                setCurrentPdfPath(selected);
                setPageNumber(1);
                setExtractedText("");
            }
        } catch (err) {
            console.error("Failed to open dialog", err);
        }
    };

    const handleExtractText = async () => {
        if (!currentPdfPath) return;
        setIsExtracting(true);
        try {
            let text = parsedPdfText;
            if (!text) {
                // 1. Rust 백엔드를 통해 PDF에서 순수 텍스트 파싱
                text = await invoke<string>("extract_pdf_text", {
                    filePath: currentPdfPath,
                });
                setParsedPdfText(text);
            }
            
            // Temporary Raw Text Viewer will use extractedText to show LLM output now, 
            // but previously it showed parsed PDF text. Let's keep it empty until LLM returns, or just use it for LLM raw output.
            // setExtractedText(text); // Remove this to only show LLM output in extractedText

            // 2. 스토어에서 로컬 모델 주소 로드
            const store = await load("settings.json");
            const ollamaUrl =
                (await store.get<string>("ollamaUrl")) ||
                "http://localhost:11434";
            const lmStudioUrl =
                (await store.get<string>("lmStudioUrl")) ||
                "http://localhost:1234/v1";

            const systemPrompt = `You are a data extraction assistant. Follow the user's instructions carefully. 
You MUST respond ONLY with a valid JSON array containing objects. Do not wrap the JSON in markdown code blocks. Just output raw JSON.
Here is the document text:
---
${text}
---`;

            let response;
            if (llmMode === "cloud") {
                const gKey = await store.get<string>("geminiKey");
                const oKey = await store.get<string>("openAiKey");
                const cKey = await store.get<string>("claudeKey");

                if (cloudProvider === "openai") {
                    if (!oKey) throw new Error("OpenAI API key is missing. Please configure it in Settings.");
                    response = await fetch("https://api.openai.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${oKey}`
                        },
                        body: JSON.stringify({
                            model: "gpt-4o",
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: promptText }
                            ],
                            temperature,
                            top_p: topP
                        })
                    });
                } else if (cloudProvider === "gemini") {
                    if (!gKey) throw new Error("Gemini API key is missing. Please configure it in Settings.");
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${gKey}`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            system_instruction: {
                                parts: { text: systemPrompt }
                            },
                            contents: [{
                                parts: [{ text: promptText }]
                            }],
                            generationConfig: {
                                temperature,
                                topP,
                                topK,
                                responseMimeType: "application/json"
                            }
                        })
                    });
                } else if (cloudProvider === "claude") {
                    if (!cKey) throw new Error("Claude API key is missing. Please configure it in Settings.");
                    response = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": cKey,
                            "anthropic-version": "2023-06-01",
                            "anthropic-dangerous-direct-browser-access": "true"
                        },
                        body: JSON.stringify({
                            model: "claude-3-5-sonnet-20241022",
                            system: systemPrompt,
                            messages: [
                                { role: "user", content: promptText }
                            ],
                            temperature,
                            top_p: topP,
                            max_tokens: 4096 // Claude requires max_tokens
                        })
                    });
                } else {
                    throw new Error("Unknown cloud provider selected.");
                }
            } else if (provider === "builtin") {
                // 3. Llama.cpp Built-in 로컬 추론 실행
                if (!builtInModel) throw new Error("Please select a built-in model.");
                if (!modelDownloadPath) throw new Error("Model download path is not configured.");

                setIsStreaming(true);
                setExtractedText("");
                
                // Tauri Event Listener for Token Stream
                const unlisten = await listen<string>("token_stream", (event) => {
                    setExtractedText((prev) => prev + event.payload);
                });

                const builtinResultString = await invoke<string>("run_builtin_model", {
                    path: modelDownloadPath,
                    filename: builtInModel,
                    prompt: promptText, // System prompt is now handled by backend
                    systemPrompt,
                    temperature,
                    topP,
                    repeatPenalty,
                    nGpuLayers,
                    maxTokens,
                });

                unlisten(); // Stop listening
                setIsStreaming(false);

                // Built-in returns a JSON string containing text, ttft_ms, tps
                let resultObj;
                try {
                    resultObj = JSON.parse(builtinResultString);
                    setTimeToFirstToken(resultObj.ttft_ms);
                    setTokensPerSecond(resultObj.tps);
                } catch (e) {
                    throw new Error(`Failed to parse stats from built-in model:\n${builtinResultString}`);
                }

                const cleanedBuiltin = resultObj.text
                    .replace(/```json/gi, "")
                    .replace(/```/g, "")
                    .trim();
                let parsedData;
                try {
                    parsedData = JSON.parse(cleanedBuiltin);
                } catch (e) {
                    throw new Error(`Failed to parse JSON array from built-in model:\n${resultObj.text}`);
                }
                setExtractedData(
                    Array.isArray(parsedData) ? parsedData : [parsedData],
                );
                setIsExtracting(false);
                return; // 여기서 종료 — fetch 기반 흐름을 건너뜀
            } else if (provider === "ollama") {
                // 3a. Ollama API로 전송
                response = await fetch(`${ollamaUrl}/api/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: modelName,
                        prompt: promptText,
                        system: systemPrompt,
                        stream: false,
                        format: "json",
                        options: {
                            temperature,
                            num_predict: maxTokens,
                            top_k: topK,
                            top_p: topP
                        }
                    }),
                });
            } else {
                // 3b. LM Studio API로 전송 (OpenAI Compatible)
                // Note: Some models (like Gemma) do NOT support 'system' roles.
                // To maximize compatibility, we combine system and user prompts into a single 'user' message.
                response = await fetch(`${lmStudioUrl}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: modelName || "local-model",
                        messages: [
                            {
                                role: "user",
                                content: `${systemPrompt}\n\nUser Request: ${promptText}`,
                            },
                        ],
                        stream: false,
                        temperature,
                        max_tokens: maxTokens,
                        top_p: topP
                    }),
                });
            }

            if (!response.ok) {
                throw new Error(`LLM API returned ${response.status}`);
            }

            const result = await response.json();

            // 4. JSON 파싱 및 스토어 저장
            let rawResponseText = "";
            if (llmMode === "cloud") {
                if (cloudProvider === "openai") {
                    rawResponseText = result.choices[0].message.content;
                } else if (cloudProvider === "gemini") {
                    rawResponseText = result.candidates[0].content.parts[0].text;
                } else if (cloudProvider === "claude") {
                    rawResponseText = result.content[0].text;
                }
            } else {
                rawResponseText = provider === "ollama"
                    ? result.response
                    : result.choices[0].message.content;
            }

            let parsedData;
            try {
                // Remove markdown blocks (e.g., ```json ... ```)
                const cleanedText = rawResponseText
                    .replace(/```json/gi, "")
                    .replace(/```/g, "")
                    .trim();
                parsedData = JSON.parse(cleanedText);
            } catch (e) {
                throw new Error(
                    `Failed to parse JSON response: \n${rawResponseText}`,
                );
            }

            if (!Array.isArray(parsedData)) {
                parsedData = [parsedData]; // 배열이 아니면 배열로 감싸기
            }

            setExtractedData(parsedData);

            // 5. Data Viewer 화면으로 이동
            navigate("/data");
        } catch (err: any) {
            console.error("Failed to extract data:", err);
            const errorMsg = typeof err === "string" ? err : (err?.message || String(err));
            
            let hint = "";
            if (llmMode === "local") {
                if (provider === "builtin") {
                    hint = "\n\nBuilt-in 모델 추론 중 오류가 발생했습니다. 모델 파일이 손상되었거나 지원되지 않는 아키텍처일 수 있습니다.";
                } else if (provider === "ollama") {
                    hint = `\n\nOllama 서버가 실행 중인지, 모델 '${modelName}'이(가) 설치되어 있는지 확인해 주세요.`;
                } else {
                    hint = `\n\nLM Studio 서버가 실행 중인지, 모델이 로드되어 있는지 확인해 주세요.`;
                }
            } else {
                hint = "\n\nAPI 키가 올바르게 설정되어 있는지 Settings에서 확인해 주세요.";
            }
            
            setExtractedText(`Error during extraction: ${errorMsg}${hint}`);
        } finally {
            setIsExtracting(false);
        }
    };

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const textRenderer = useCallback(
        (textItem: any) => highlightPattern(textItem.str, searchText),
        [searchText]
    );

    const maxTokensLimit = llmMode === "local" ? (provider === "builtin" ? (builtInMetadata?.context_length || 131072) : 262144) : 8192;

    return (
        <div className="p-4 sm:p-6 flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Panel: Viewer & Parsed Text */}
            <div className="flex-1 flex flex-col w-full gap-6 lg:min-h-[calc(100vh-3rem)] lg:sticky lg:top-6">
                <Card className="flex flex-col w-full flex-1 overflow-hidden min-h-[60vh]">
                    <CardHeader className="py-4 border-b">
                    <CardTitle className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-lg w-full">
                        <span>PDF Viewer</span>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            {currentPdfPath && pdfFile && (
                                <div className="relative w-full sm:w-48">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search text..."
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        className="pl-8 h-9"
                                    />
                                </div>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleUpload}
                                className="shrink-0"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                Open PDF
                            </Button>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto bg-muted/20 p-0 relative flex justify-center">
                    {currentPdfPath && pdfFile ? (
                        <div className="py-4">
                            <Document
                                file={pdfFile}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={
                                    <div className="flex items-center justify-center h-64">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                    </div>
                                }
                            >
                                <Page
                                    pageNumber={pageNumber}
                                    width={600}
                                    scale={scale}
                                    // @ts-ignore - react-pdf typings for customTextRenderer are sometimes too strict
                                    customTextRenderer={textRenderer}
                                    className="shadow-md transition-transform duration-200"
                                />
                            </Document>
                            {numPages && (
                <>
                  <div className="flex justify-between items-center mt-4 px-4 pb-4">
                      <Button
                          variant="outline"
                          disabled={pageNumber <= 1}
                          onClick={() =>
                              setPageNumber((p) => p - 1)
                          }
                      >
                          Previous
                      </Button>
                      <span className="text-sm">
                          Page {pageNumber} of {numPages}
                      </span>
                      <Button
                          variant="outline"
                          disabled={pageNumber >= numPages}
                          onClick={() =>
                              setPageNumber((p) => p + 1)
                          }
                      >
                          Next
                      </Button>
                  </div>
                  <div className="flex justify-center items-center gap-2 pb-4">
                      <Button variant="secondary" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>
                          Zoom Out
                      </Button>
                      <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                      <Button variant="secondary" size="sm" onClick={() => setScale(s => Math.min(3.0, s + 0.2))}>
                          Zoom In
                      </Button>
                  </div>
                </>
              )}
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                            <FileText className="w-16 h-16 mb-4 opacity-20" />
                            <p>No PDF selected</p>
                            <Button
                                variant="secondary"
                                className="mt-4"
                                onClick={handleUpload}
                            >
                                Select a file
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Parsed Text Collapsible Area */}
            {currentPdfPath && (
                <Card className="shrink-0">
                    <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsTextParseOpen(!isTextParseOpen)}>
                        <CardTitle className="text-md flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Parsed Text Data (Cache)
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            {parsedPdfText && (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setParsedPdfText(null);
                                    }}
                                    title="Clear Parsed Text"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                            {isTextParseOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                    </CardHeader>
                    {isTextParseOpen && (
                        <CardContent className="p-0 border-t relative">
                            <div className="p-4 max-h-[300px] overflow-y-auto text-xs font-mono bg-muted/10 whitespace-pre-wrap">
                                {parsedPdfText ? parsedPdfText : <span className="text-muted-foreground italic">No parsed data yet. Click "Extract with LLM" to parse.</span>}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}
            </div>

            {/* Right Panel: Controls & Extraction */}
            <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6 lg:h-[calc(100vh-3rem)] lg:sticky lg:top-6 overflow-y-auto pb-4 pr-1">
                <Card className="shrink-0">
                    <CardHeader className="py-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Settings2 className="w-5 h-5" />
                            Extraction Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Tabs defaultValue="text">
                            <TabsList className="w-full">
                                <TabsTrigger value="text" className="flex-1">
                                    Text Extraction
                                </TabsTrigger>
                                <TabsTrigger value="vision" className="flex-1">
                                    Vision Extraction
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent
                                value="text"
                                className="space-y-4 mt-4"
                            >
                                <Tabs value={llmMode} onValueChange={(v: any) => setLlmMode(v)} className="w-full">
                                    <TabsList className="w-full">
                                        <TabsTrigger value="cloud" className="flex-1">Cloud</TabsTrigger>
                                        <TabsTrigger value="local" className="flex-1">Local</TabsTrigger>
                                    </TabsList>
                                </Tabs>

                                {llmMode === "local" ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Local Provider</Label>
                                            <select
                                                value={provider}
                                                onChange={(e) =>
                                                    setProvider(
                                                        e.target.value as "ollama" | "lmstudio" | "builtin"
                                                    )
                                                }
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                            >
                                                <option value="ollama">Ollama</option>
                                                <option value="lmstudio">LM Studio</option>
                                                <option value="builtin">Built-in (Candle)</option>
                                            </select>
                                        </div>
                                        
                                        {provider === "builtin" ? (
                                            <div className="space-y-2">
                                                <Label>Built-in Model</Label>
                                                {downloadedModels.length > 0 ? (
                                                    <select
                                                        value={builtInModel || ""}
                                                        onChange={(e) => setBuiltInModel(e.target.value)}
                                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                    >
                                                        <option value="" disabled>Select a model...</option>
                                                        {downloadedModels.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                ) : (
                                                    <div className="text-sm text-destructive border rounded-md p-2 bg-destructive/10">
                                                        No models downloaded. Please visit Settings to download a model.
                                                    </div>
                                                )}
                                                {builtInMetadata && (() => {
                                                    const supportedArchs = ["llama", "gemma", "gemma2", "gemma3", "gemma4", "phi", "phi2", "phi3", "qwen", "qwen2", "qwen2moe", "starcoder2", "internlm2"];
                                                    const isSupported = supportedArchs.includes(builtInMetadata.architecture.toLowerCase());
                                                    return (
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            <span className={`text-xs px-2 py-1 rounded-md border ${isSupported ? "bg-green-500/20 text-green-500 border-green-500/50" : "bg-orange-500/20 text-orange-500 border-orange-500/50"}`}>
                                                                {isSupported ? "✓" : "⚠"} {builtInMetadata.architecture}
                                                            </span>
                                                            <span className="text-xs bg-muted px-2 py-1 rounded-md border">Ctx: {(builtInMetadata.context_length / 1024).toFixed(0)}k</span>
                                                            {builtInMetadata.has_vision && (
                                                                <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded-md border border-blue-500/50">Vision</span>
                                                            )}
                                                            {!isSupported && (
                                                                <p className="text-xs text-orange-500 w-full">이 아키텍처는 Candle 내장 엔진에서 직접 지원되지 않습니다. Ollama 또는 LM Studio를 사용해 주세요.</p>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label>Model Name</Label>
                                                <Input
                                                    value={modelName}
                                                    onChange={(e) => setModelName(e.target.value)}
                                                    placeholder={provider === "ollama" ? "e.g. llama3" : "e.g. local-model"}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <Label>Cloud Provider</Label>
                                        <select 
                                            value={cloudProvider}
                                            onChange={e => setCloudProvider(e.target.value as any)}
                                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                        >
                                            <option value="openai">OpenAI (GPT-4o)</option>
                                            <option value="gemini">Google (Gemini 1.5 Pro)</option>
                                            <option value="claude">Anthropic (Claude 3.5 Sonnet)</option>
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-2 pt-2 border-t">
                                    <Label>System Prompt</Label>
                                    <Textarea
                                        value={systemPrompt}
                                        onChange={(e) => setSystemPrompt(e.target.value)}
                                        placeholder="e.g. You are a helpful assistant..."
                                        className="min-h-[60px] resize-y text-xs"
                                    />
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label>User Prompt / Keywords</Label>
                                    <Textarea
                                        value={promptText}
                                        onChange={(e) => setPromptText(e.target.value)}
                                        placeholder="e.g. Extract invoice total and date..."
                                        className="min-h-[120px] resize-y"
                                    />
                                </div>

                                <div className="space-y-4 pt-4 border-t">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Temperature</Label>
                                            <Input 
                                                type="number" min="0" max="2" step="0.1" 
                                                value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))}
                                                className="w-16 h-7 text-xs px-2"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="0" max="2" step="0.1" 
                                            value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Top-P</Label>
                                            <Input 
                                                type="number" min="0" max="1" step="0.01" 
                                                value={topP} onChange={e => setTopP(parseFloat(e.target.value))}
                                                className="w-16 h-7 text-xs px-2"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={topP} onChange={e => setTopP(parseFloat(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Top-K</Label>
                                            <Input 
                                                type="number" min="1" max="100" step="1" 
                                                value={topK} onChange={e => setTopK(parseInt(e.target.value))}
                                                className="w-16 h-7 text-xs px-2"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="1" max="100" step="1" 
                                            value={topK} onChange={e => setTopK(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Repeat Penalty</Label>
                                            <Input 
                                                type="number" min="1.0" max="2.0" step="0.05" 
                                                value={repeatPenalty} onChange={e => setRepeatPenalty(parseFloat(e.target.value))}
                                                className="w-16 h-7 text-xs px-2"
                                            />
                                        </div>
                                        <input 
                                            type="range" min="1.0" max="2.0" step="0.05" 
                                            value={repeatPenalty} onChange={e => setRepeatPenalty(parseFloat(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>

                                    {llmMode !== "cloud" && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <Label>Max Tokens</Label>
                                                <Input 
                                                    type="number" min="256" max={maxTokensLimit} step="256" 
                                                    value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))}
                                                    className="w-24 h-7 text-xs px-2"
                                                />
                                            </div>
                                            <input 
                                                type="range" min="256" max={maxTokensLimit} step="256" 
                                                value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))}
                                                className="w-full"
                                            />
                                        </div>
                                    )}

                                    {llmMode === "local" && provider === "builtin" && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <Label>GPU Offload (Layers)</Label>
                                                <Input 
                                                    type="number" min="0" max="99" step="1" 
                                                    value={nGpuLayers} onChange={e => setNGpuLayers(parseInt(e.target.value))}
                                                    className="w-16 h-7 text-xs px-2"
                                                />
                                            </div>
                                            <input 
                                                type="range" min="0" max="99" step="1" 
                                                value={nGpuLayers} onChange={e => setNGpuLayers(parseInt(e.target.value))}
                                                className="w-full"
                                            />
                                            <p className="text-[10px] text-muted-foreground">VRAM 사용을 최적화하기 위해 조절하세요 (0 = CPU only).</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2 pt-2 border-t">
                                    <Label>Output Format</Label>
                                    <select className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:opacity-50">
                                        <option value="json">JSON (Auto-parsed to Table)</option>
                                    </select>
                                </div>
                                <Button
                                    className="w-full"
                                    disabled={!currentPdfPath || isExtracting}
                                    onClick={handleExtractText}
                                >
                                    {isExtracting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                                            Processing with LLM...
                                        </>
                                    ) : (
                                        "Extract with LLM"
                                    )}
                                </Button>
                            </TabsContent>

                            <TabsContent value="vision" className="mt-4">
                                <p className="text-sm text-muted-foreground">
                                    Vision extraction sends page images to the
                                    model. Requires a vision-capable LLM (e.g.
                                    GPT-4o, Gemini 1.5 Pro).
                                </p>
                                {/* To be implemented */}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {/* Temporary Raw Text Viewer for Debugging Phase 3 */}
                {(extractedText || isStreaming) && (
                    <Card className="shrink-0 flex flex-col mb-4">
                        <CardHeader className="py-4">
                            <CardTitle className="text-lg flex justify-between items-center">
                                <span>Generation Output</span>
                                {isStreaming && (
                                    <span className="flex items-center text-xs text-blue-500 font-normal">
                                        <span className="relative flex h-2 w-2 mr-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                        </span>
                                        Streaming...
                                    </span>
                                )}
                            </CardTitle>
                            <CardDescription>
                                Live text generation from local model
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 relative min-h-[200px]">
                            <div className="absolute inset-0 p-4 overflow-y-auto text-xs font-mono bg-muted/30 whitespace-pre-wrap">
                                {extractedText}
                                {isStreaming && <span className="animate-pulse font-bold">_</span>}
                            </div>
                        </CardContent>
                        {(timeToFirstToken !== null || tokensPerSecond !== null) && (
                            <div className="px-4 py-2 border-t bg-muted/10 flex justify-between text-[10px] text-muted-foreground">
                                <div>
                                    <span className="font-semibold">TTFT:</span> {timeToFirstToken ? `${timeToFirstToken}ms` : '-'}
                                </div>
                                <div>
                                    <span className="font-semibold">Speed:</span> {tokensPerSecond ? `${tokensPerSecond.toFixed(2)} t/s` : '-'}
                                </div>
                            </div>
                        )}
                    </Card>
                )}
            </div>
        </div>
    );
}
