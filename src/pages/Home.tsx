import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/useAppStore";
import { Loader2, Upload, FileText, Settings2, Search } from "lucide-react";

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
        topP, setTopP
    } = useAppStore();
    const [pdfFile, setPdfFile] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>();
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [searchText, setSearchText] = useState("");
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedText, setExtractedText] = useState("");
    const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

    useEffect(() => {
        if (provider === "builtin" && modelDownloadPath) {
            invoke<string[]>("get_downloaded_models", { path: modelDownloadPath })
                .then(setDownloadedModels)
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
            // 1. Rust 백엔드를 통해 PDF에서 순수 텍스트 파싱
            const text = await invoke<string>("extract_pdf_text", {
                filePath: currentPdfPath,
            });
            setExtractedText(text);

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
                // Placeholder for Cloud LLM (e.g. OpenAI)
                throw new Error("Cloud LLM integration is not yet implemented.");
            } else if (provider === "builtin") {
                // Placeholder for Candle Built-in execution
                if (!builtInModel) throw new Error("Please select a built-in model.");
                throw new Error("Built-in model execution with Candle is pending implementation.");
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
            const rawResponseText =
                provider === "ollama"
                    ? result.response
                    : result.choices[0].message.content;

            let parsedData;
            try {
                // LM Studio might wrap JSON in markdown block, so we strip it if present
                const cleanedText = rawResponseText
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim();
                parsedData = JSON.parse(cleanedText);
            } catch (e) {
                throw new Error(
                    `Failed to parse JSON response: ${rawResponseText}`,
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
            setExtractedText(
                `Error during extraction: ${err.message}\n\nPlease check if your local Ollama server is running and the model '${modelName}' is installed.`,
            );
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

    const maxTokensLimit = llmMode === "local" ? (provider === "builtin" ? 131072 : 262144) : 8192;

    return (
        <div className="p-6 h-full flex gap-6">
            {/* Left Panel: Viewer */}
            <Card className="flex-1 flex flex-col overflow-hidden">
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

            {/* Right Panel: Controls & Extraction */}
            <div className="w-[400px] flex flex-col gap-6 overflow-y-auto">
                <Card>
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
                                        <select className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                                            <option value="openai">OpenAI (GPT-4o)</option>
                                            <option value="gemini">Google (Gemini 1.5 Pro)</option>
                                            <option value="claude">Anthropic (Claude 3.5 Sonnet)</option>
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-2 pt-2 border-t">
                                    <Label>Prompt / Keywords</Label>
                                    <Input
                                        value={promptText}
                                        onChange={(e) => setPromptText(e.target.value)}
                                        placeholder="e.g. Extract invoice total and date..."
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
                                        "Extract with Local Model"
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
                {extractedText && (
                    <Card className="flex-1 flex flex-col">
                        <CardHeader className="py-4">
                            <CardTitle className="text-lg">
                                Raw Extracted Text
                            </CardTitle>
                            <CardDescription>
                                Rust backend parsing result
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 relative">
                            <div className="absolute inset-0 p-4 overflow-auto text-xs font-mono bg-muted/30 whitespace-pre-wrap">
                                {extractedText}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
