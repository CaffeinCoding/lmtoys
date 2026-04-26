import { useEffect, useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { appDataDir } from "@tauri-apps/api/path";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/useAppStore";
import {
    Loader2,
    Upload,
    FileText,
    Settings2,
    Search,
    Trash2,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    Eye,
    Zap,
    Square,
} from "lucide-react";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { cn } from "@/lib/utils";
import { streamLlamaCompletion } from "@/api/llama-api";

// Configure PDF.js worker to use CDN to prevent Vite bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const JSON_GBNF = `root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null")
object ::= "{" ws (string ":" ws value ("," ws string ":" ws value)*)? ws "}"
array  ::= "[" ws (value ("," ws value)*)? ws "]"
string ::= "\\"" ([^"\\\\\\x00-\\x1F] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F]{4}))* "\\""
number ::= "-"? ([0-9] | [1-9][0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
ws     ::= [ \\t\\n\\r]*`;

interface ModelInfo {
    name: string;
    repo: string;
    has_vision: boolean;
}

/**
 * Robustly extracts JSON from a string that might contain other text.
 * Finds the first '[' or '{' and the last matching ']' or '}'.
 */
function extractJsonFromString(text: string): any[] | null {
    // Attempt standard parse first
    const tryStandardParse = (jsonStr: string) => {
        try {
            const cleaned = jsonStr.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    };

    // Advanced Regex fallback for duplicate keys
    const regexFallback = (rawText: string): any[] | null => {
        // Matches string values, numbers, booleans, and null
        const pairs = Array.from(rawText.matchAll(/"([^"]+)"\s*:\s*("[^"]*"|-?\d+(?:\.\d+)?|true|false|null)/g));
        if (pairs.length === 0) return null;

        const grouped: Record<string, any[]> = {};
        for (const match of pairs) {
            const key = match[1];
            let rawValue = match[2];
            let value;
            if (rawValue.startsWith('"')) {
                value = rawValue.slice(1, -1); // remove quotes
            } else if (rawValue === 'true') {
                value = true;
            } else if (rawValue === 'false') {
                value = false;
            } else if (rawValue === 'null') {
                value = null;
            } else {
                value = Number(rawValue);
            }

            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(value);
        }

        // Pivot to rows
        const maxLen = Math.max(...Object.values(grouped).map(arr => arr.length));
        const rows = [];
        for (let i = 0; i < maxLen; i++) {
            const row: any = {};
            for (const key of Object.keys(grouped)) {
                row[key] = grouped[key][i] !== undefined ? grouped[key][i] : null;
            }
            rows.push(row);
        }
        return rows;
    };

    // First try finding standard objects/arrays
    const regex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\})|(\[(?:[^\[\]]|(?:\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]))*\])/g;
    let match;
    const results: any[] = [];
    
    while ((match = regex.exec(text)) !== null) {
        const jsonStr = match[0];
        const parsed = tryStandardParse(jsonStr);
        if (parsed) {
            // Check if it's an object and we might have lost keys due to duplicates
            // We can compare the number of keys in the raw string vs parsed
            const rawKeys = Array.from(jsonStr.matchAll(/"([^"]+)"\s*:/g)).length;
            const parsedKeys = Array.isArray(parsed) ? 0 : Object.keys(parsed).length;
            
            if (!Array.isArray(parsed) && rawKeys > parsedKeys) {
                // Duplicate keys detected!
                const fallback = regexFallback(jsonStr);
                if (fallback) results.push(...fallback);
            } else {
                if (Array.isArray(parsed)) results.push(...parsed);
                else results.push(parsed);
            }
        } else {
            // Unparsable, maybe due to duplicate keys or bad syntax, try fallback
            const fallback = regexFallback(jsonStr);
            if (fallback) results.push(...fallback);
        }
    }
    
    if (results.length > 0) return results;
    
    // Global fallback
    const fallback = regexFallback(text);
    if (fallback && fallback.length > 0) return fallback;
    
    return null;
}

function highlightPattern(text: string, pattern: string) {
    if (!pattern) return text;
    const splitText = text.split(new RegExp(`(${pattern})`, "gi"));
    return (
        <>
            {splitText.map((piece, index) =>
                piece.toLowerCase() === pattern.toLowerCase() ? (
                    <mark
                        key={index}
                        className="bg-yellow-400 text-black font-bold px-0.5 rounded-sm"
                    >
                        {piece}
                    </mark>
                ) : (
                    piece
                ),
            )}
        </>
    );
}

export default function Home() {
    const navigate = useNavigate();
    const {
        currentPdfPath,
        setCurrentPdfPath,
        setExtractedData,
        llmMode,
        setLlmMode,
        extractionMode,
        setExtractionMode,
        promptText,
        setPromptText,
        provider,
        setProvider,
        modelName,
        setModelName,
        builtInModel,
        setBuiltInModel,
        modelDownloadPath,
        temperature,
        setTemperature,
        maxTokens,
        setMaxTokens,
        topK,
        setTopK,
        topP,
        setTopP,
        cloudProvider,
        setCloudProvider,
        systemPrompt,
        setSystemPrompt,
        customJsonFormat,
        setCustomJsonFormat,
        repeatPenalty,
        setRepeatPenalty,
        nGpuLayers,
        setNGpuLayers,
        isStreaming,
        setIsStreaming,
        extractedText,
        setExtractedText,
        setTokensPerSecond,
        setTimeToFirstToken,
        parsedPdfText,
        setParsedPdfText,
        suggestNgl,
        setModelDownloadPath
    } = useAppStore();
    const [pdfFile, setPdfFile] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>();
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [searchText, setSearchText] = useState("");
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractionProgress, setExtractionProgress] = useState<{current: number, total: number, message: string} | null>(null);
    const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
    const [isTextParseOpen, setIsTextParseOpen] = useState(false);
    const [isJsonValid, setIsJsonValid] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        try {
            JSON.parse(customJsonFormat);
            setIsJsonValid(true);
        } catch {
            setIsJsonValid(false);
        }
    }, [customJsonFormat]);

    useEffect(() => {
        async function initPath() {
            if (modelDownloadPath) return; // Already initialized
            try {
                const store = await load("settings.json");
                const downloadPath =
                    await store.get<string>("modelDownloadPath");
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
        const refresh = () => {
            if (provider === "builtin" && modelDownloadPath) {
                invoke<ModelInfo[]>("get_downloaded_models", {
                    path: modelDownloadPath,
                })
                    .then((models) => {
                        setDownloadedModels(models);
                        // 자동 선택: builtInModel이 null이거나 목록에 없으면 첫 번째 모델 자동 선택
                        if (
                            models.length > 0 &&
                            (!builtInModel || !models.find(m => m.name === builtInModel))
                        ) {
                            const firstModel = models[0];
                            setBuiltInModel(firstModel.name);
                        }
                    })
                    .catch(console.error);
            }
        };
        refresh();

        const unlisten = import("@tauri-apps/api/event").then(m => m.listen("models-changed", refresh));
        return () => {
            unlisten.then(f => f());
        };
    }, [provider, modelDownloadPath, builtInModel, setBuiltInModel]);

    // When path changes, read the file and create a Blob URL to prevent ArrayBuffer detachment issues
    useEffect(() => {
        let objectUrl: string | null = null;
        async function loadPdf() {
            if (currentPdfPath) {
                try {
                    const data = await readFile(currentPdfPath);
                    const blob = new Blob([data], { type: "application/pdf" });
                    objectUrl = URL.createObjectURL(blob);
                    setPdfFile(objectUrl);
                } catch (err) {
                    console.error("Failed to read PDF file", err);
                    setPdfFile(null);
                }
            } else {
                setPdfFile(null);
            }
        }
        loadPdf();
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
                        name: "PDF Files",
                        extensions: ["pdf"],
                    },
                ],
            });

            if (selected && typeof selected === "string") {
                setCurrentPdfPath(selected);
                setPageNumber(1);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleExtract = async () => {
        if (!currentPdfPath || !pdfFile) return;

        setIsExtracting(true);
        setExtractedText("");

        // Initialize AbortController
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            let pdfText = parsedPdfText;
            
            // 1. Text extraction if not cached or in text mode
            if (extractionMode === "text" && !pdfText) {
                try {
                    // Use filePath to align with Tauri's camelCase conversion for file_path
                    pdfText = await invoke<string>("extract_pdf_text", { filePath: currentPdfPath });
                    setParsedPdfText(pdfText);
                } catch (e) {
                    console.error("PDF text extraction failed", e);
                }
            }

            const finalUserPrompt = extractionMode === "text" 
                ? `Context from PDF:\n${pdfText}\n\nQuestion: ${promptText}`
                : promptText;

            const finalSystemPrompt = `${systemPrompt}\n\nStrict JSON Format required:\n${customJsonFormat}`;

            let response;

            if (llmMode === "cloud") {
                // 1. Cloud LLM 처리 (기존 로직 유지)
                response = await fetch(
                    "https://api.openai.com/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer YOUR_API_KEY`, // Replace with actual logic
                        },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: "system", content: finalSystemPrompt },
                                { role: "user", content: finalUserPrompt },
                            ],
                        }),
                        signal: controller.signal,
                    },
                );
            } else if (provider === "builtin") {
                // 3. Llama-server (Built-in) 로컬 추론 실행
                const currentStatus = useAppStore.getState().serverStatus;
                if (currentStatus !== "running") {
                    throw new Error(
                        "Llama Server is not running. Please start it from the top header.",
                    );
                }

                setIsStreaming(true);
                setExtractedText("");

                const startTime = performance.now();
                let firstTokenTime: number | null = null;
                const port = useAppStore.getState().serverPort;
                const visionResolution = useAppStore.getState().visionResolution;

                // Vision support detection
                const currentModelInfo = downloadedModels.find(m => (typeof m === 'string' ? m : m.name) === builtInModel);
                const isVisionModel = (typeof currentModelInfo === 'object' && currentModelInfo?.has_vision) || false;

                if (extractionMode === "vision" && isVisionModel && currentPdfPath) {
                    let allParsedData: any[] = [];
                    let totalTokens = 0;
                    let totalDuration = 0;
                    let rawResponses = [];
                    
                    try {
                        const pdf = await pdfjs.getDocument(pdfFile!).promise;
                        const totalPages = pdf.numPages;
                        
                        for (let i = 1; i <= totalPages; i++) {
                            setExtractionProgress({ 
                                current: i - 1, 
                                total: totalPages, 
                                message: `Processing page ${i} of ${totalPages}...` 
                            });
                            
                            const content: any[] = [{ type: "text", text: finalUserPrompt }];
                            
                            const page = await pdf.getPage(i);
                            const initialViewport = page.getViewport({ scale: 1.0 });
                            const scale = visionResolution / Math.max(initialViewport.width, initialViewport.height);
                            const viewport = page.getViewport({ scale });

                            const canvas = document.createElement("canvas");
                            const context = canvas.getContext("2d");
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;

                            await page.render({ canvasContext: context!, viewport, canvas: canvas as any }).promise;

                            const imageData = canvas.toDataURL("image/jpeg", 0.8);
                            content.push({ type: "image_url", image_url: { url: imageData } });
                            
                            const messages = [
                                { role: "system", content: finalSystemPrompt },
                                { role: "user", content }
                            ];
                            
                            setExtractionProgress({ current: i - 1, total: totalPages, message: `Extracting data (page ${i} of ${totalPages})...` });
                            const batchStartTime = performance.now();
                            
                            const { resultText, tokenCount } = await streamLlamaCompletion({
                                port,
                                model: builtInModel || "local-model",
                                messages,
                                temperature,
                                maxTokens,
                                topP,
                                topK,
                                repeatPenalty,
                                grammar: JSON_GBNF,
                                signal: controller.signal,
                                onFirstToken: () => {
                                    if (i === 1) {
                                        firstTokenTime = performance.now() - startTime;
                                        setTimeToFirstToken(Math.round(firstTokenTime));
                                    }
                                },
                                onToken: (token) => {
                                    setExtractedText((prev: string) => prev + token);
                                }
                            });
                            
                            totalTokens += tokenCount;
                            totalDuration += (performance.now() - batchStartTime) / 1000;
                            rawResponses.push(resultText);
                            setExtractedText((prev: string) => prev + "\n\n--- Next Page ---\n\n");
                            
                            const parsedData = extractJsonFromString(resultText);
                            if (parsedData) {
                                allParsedData = allParsedData.concat(parsedData);
                            }
                        }
                        
                        setExtractionProgress({ current: totalPages, total: totalPages, message: "Merging results..." });
                        setTokensPerSecond(totalTokens / totalDuration);
                        
                        const mergedNames: string[] = [];
                        const validData = allParsedData.filter((item: any) => !item.error);
                        validData.forEach((item: any) => {
                            if (item.name && item.name !== "N/A" && item.name !== "None") {
                                if (Array.isArray(item.name)) {
                                    mergedNames.push(...item.name);
                                } else if (typeof item.name === 'string') {
                                    mergedNames.push(item.name);
                                }
                            }
                        });
                        
                        allParsedData = mergedNames.length > 0 ? [{ name: mergedNames }] : validData;
                        setExtractedData(allParsedData);
                        
                        const now = new Date();
                        const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '_');
                        const fileName = currentPdfPath?.split('\\').pop()?.split('/').pop() || "unknown";
                        const historyName = `${fileName}_${dateStr}`;
                        
                        const state = useAppStore.getState();
                        const configSnapshot = {
                            modelName: state.builtInModel || "unknown",
                            llmMode: "local" as const,
                            provider: "builtin",
                            temperature: state.temperature,
                            maxTokens: state.maxTokens,
                            topP: state.topP,
                            topK: state.topK,
                            repeatPenalty: state.repeatPenalty,
                            nGpuLayers: state.nGpuLayers,
                            systemPrompt: state.systemPrompt,
                            promptText: state.promptText,
                            customJsonFormat: state.customJsonFormat,
                            rawResponse: rawResponses.join("\n\n--- Next Page ---\n\n"),
                            runtime: state.selectedRuntime,
                            ttft: Math.round(firstTokenTime || 0),
                            speed: totalTokens / totalDuration
                        };

                        useAppStore.getState().addHistoryItem({
                            id: crypto.randomUUID(),
                            name: historyName,
                            data: allParsedData,
                            timestamp: now.getTime(),
                            config: configSnapshot
                        });

                        setIsExtracting(false);
                        setExtractionProgress(null);
                        setIsStreaming(false);
                        navigate("/data");
                        return;
                    } catch (e: any) {
                        console.error("Vision sequential processing failed", e);
                        throw e;
                    }
                } else {
                    const messages = [
                        { role: "system", content: finalSystemPrompt },
                        { role: "user", content: finalUserPrompt }
                    ];
                    
                    const { resultText, tokenCount } = await streamLlamaCompletion({
                        port,
                        model: builtInModel || "local-model",
                        messages,
                        temperature,
                        maxTokens,
                        topP,
                        topK,
                        repeatPenalty,
                        grammar: JSON_GBNF,
                        signal: controller.signal,
                        onFirstToken: () => {
                            firstTokenTime = performance.now() - startTime;
                            setTimeToFirstToken(Math.round(firstTokenTime));
                        },
                        onToken: (token) => {
                            setExtractedText((prev: string) => prev + token);
                        }
                    });

                    setIsStreaming(false);

                    const endTime = performance.now();
                    const durationSeconds = (endTime - startTime) / 1000;
                    setTokensPerSecond(tokenCount / durationSeconds);

                    const parsedData = extractJsonFromString(resultText);
                    if (!parsedData) {
                        throw new Error(
                            `Failed to parse JSON from model response. The model might not have followed the format instructions.`,
                        );
                    }
                    
                    setExtractedData(parsedData);
                    
                    // Add to history
                    const now = new Date();
                    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '_');
                    const fileName = currentPdfPath?.split('\\').pop()?.split('/').pop() || "unknown";
                    const historyName = `${fileName}_${dateStr}`;
                    
                    const state = useAppStore.getState();
                    const configSnapshot = {
                        modelName: state.builtInModel || "unknown",
                        llmMode: "local" as const,
                        provider: "builtin",
                        temperature: state.temperature,
                        maxTokens: state.maxTokens,
                        topP: state.topP,
                        topK: state.topK,
                        repeatPenalty: state.repeatPenalty,
                        nGpuLayers: state.nGpuLayers,
                        systemPrompt: state.systemPrompt,
                        promptText: state.promptText,
                        customJsonFormat: state.customJsonFormat,
                        rawResponse: resultText,
                        runtime: state.selectedRuntime,
                        ttft: Math.round(firstTokenTime || 0),
                        speed: tokenCount / durationSeconds
                    };

                    useAppStore.getState().addHistoryItem({
                        id: crypto.randomUUID(),
                        name: historyName,
                        data: Array.isArray(parsedData) ? parsedData : [parsedData],
                        timestamp: now.getTime(),
                        config: configSnapshot
                    });

                    setIsExtracting(false);
                    navigate("/data");
                    return; // 여기서 종료
                }
            } else if (provider === "ollama") {
                // 3a. Ollama API로 전송 (기존 로직 유지)
                response = await fetch(
                    "http://localhost:11434/api/chat",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: "system", content: finalSystemPrompt },
                                { role: "user", content: finalUserPrompt },
                            ],
                            stream: false,
                            options: {
                                temperature,
                                num_ctx: maxTokens,
                                top_p: topP,
                                top_k: topK,
                                repeat_penalty: repeatPenalty
                            }
                        }),
                        signal: controller.signal,
                    },
                );
            }

            if (!response || !response.ok) {
                throw new Error(
                    `API request failed with status ${response?.status}`,
                );
            }

            const data = await response.json();
            
            // Handle different API response structures (OpenAI vs Ollama)
            let resultText = "";
            if (data.choices && data.choices[0]?.message) {
                resultText = data.choices[0].message.content; // OpenAI format
            } else if (data.message && data.message.content) {
                resultText = data.message.content; // Ollama format
            } else {
                throw new Error("Unexpected API response format");
            }
            
            setExtractedText(resultText);

            const parsedData = extractJsonFromString(resultText);
            if (!parsedData) {
                throw new Error(
                    "Failed to parse JSON from model response.",
                );
            }

            setExtractedData(parsedData);
            
            // Add to history
            const now = new Date();
            const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '_');
            const fileName = currentPdfPath?.split('\\').pop()?.split('/').pop() || "unknown";
            const historyName = `${fileName}_${dateStr}`;
            
            const state = useAppStore.getState();
            const configSnapshot = {
                modelName: state.llmMode === "local" ? (state.provider === "builtin" ? (state.builtInModel || "unknown") : state.modelName) : state.cloudProvider,
                llmMode: state.llmMode,
                provider: state.provider,
                temperature: state.temperature,
                maxTokens: state.maxTokens,
                topP: state.topP,
                topK: state.topK,
                repeatPenalty: state.repeatPenalty,
                nGpuLayers: state.nGpuLayers,
                systemPrompt: state.systemPrompt,
                promptText: state.promptText,
                customJsonFormat: state.customJsonFormat,
                rawResponse: resultText,
                runtime: state.llmMode === "local" ? (state.provider === "builtin" ? state.selectedRuntime : "External") : "Cloud",
                ttft: state.timeToFirstToken,
                speed: state.tokensPerSecond
            };
            
            useAppStore.getState().addHistoryItem({
                id: crypto.randomUUID(),
                name: historyName,
                data: parsedData,
                timestamp: now.getTime(),
                config: configSnapshot
            });

            // 5. Data Viewer 화면으로 이동
            navigate("/data");
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log("Extraction aborted by user");
                setExtractedText("Extraction stopped by user.");
                return;
            }
            console.error("Failed to extract data:", err);
            const errorMsg =
                typeof err === "string" ? err : err?.message || String(err);

            let hint = "";
            if (errorMsg.includes("401") || errorMsg.includes("unauthorized")) {
                hint =
                    "\n\nAPI 키가 올바르게 설정되어 있는지 Settings에서 확인해 주세요.";
            }

            setExtractedText(`Error during extraction: ${errorMsg}${hint}`);
        } finally {
            setIsExtracting(false);
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    };

    const handleStopExtraction = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const textRenderer = useCallback(
        (textItem: any) => highlightPattern(textItem.str, searchText),
        [searchText],
    );

    return (
        <div className="p-4 sm:p-6 flex flex-col lg:flex-row gap-6 items-stretch h-full overflow-hidden">
            {/* Left Panel: Viewer & Parsed Text */}
            <div className="flex-1 flex flex-col min-w-0 gap-6 overflow-hidden">
                <Card className="flex flex-col w-full flex-1 overflow-hidden min-h-0">
                    <CardHeader className="py-4 border-b shrink-0">
                    <CardTitle className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-lg w-full">
                        <span>PDF Viewer</span>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            {currentPdfPath && pdfFile && (
                                <div className="relative w-full sm:w-48">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search text..."
                                        value={searchText}
                                        onChange={(e) =>
                                            setSearchText(e.target.value)
                                        }
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
                    <CardContent className="flex-1 overflow-auto bg-muted/20 p-0 relative flex flex-col items-center min-h-0">
                        {currentPdfPath && pdfFile ? (
                            <div className="w-full flex flex-col items-center">
                                {/* PDF Controls at Top */}
                                <div className="w-full border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10 py-2 px-4 flex flex-wrap justify-center items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pageNumber <= 1}
                                            onClick={() =>
                                                setPageNumber((p) => p - 1)
                                            }
                                            className="h-8"
                                        >
                                            Previous
                                        </Button>
                                        <span className="text-sm font-medium min-w-[80px] text-center">
                                            Page {pageNumber} / {numPages || "?"}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={
                                                numPages ? pageNumber >= numPages : true
                                            }
                                            onClick={() =>
                                                setPageNumber((p) => p + 1)
                                            }
                                            className="h-8"
                                        >
                                            Next
                                        </Button>
                                    </div>
                                    
                                    <div className="h-4 w-[1px] bg-border hidden sm:block" />

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setScale((s) =>
                                                    Math.max(0.5, s - 0.2),
                                                )
                                            }
                                            className="h-8"
                                        >
                                            Zoom Out
                                        </Button>
                                        <span className="text-sm w-12 text-center font-medium">
                                            {Math.round(scale * 100)}%
                                        </span>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setScale((s) =>
                                                    Math.min(3.0, s + 0.2),
                                                )
                                            }
                                            className="h-8"
                                        >
                                            Zoom In
                                        </Button>
                                    </div>
                                </div>

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
                                </div>
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
                    <Card className="shrink-0 mb-2">
                        <CardHeader
                            className="py-3 flex flex-row items-center justify-between cursor-pointer select-none"
                            onClick={() => setIsTextParseOpen(!isTextParseOpen)}
                        >
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
                                {isTextParseOpen ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                        </CardHeader>
                        {isTextParseOpen && (
                            <CardContent className="p-0 border-t relative">
                                <div className="p-4 max-h-[200px] overflow-y-auto text-xs font-mono bg-muted/10 whitespace-pre-wrap">
                                    {parsedPdfText ? (
                                        parsedPdfText
                                    ) : (
                                        <span className="text-muted-foreground italic">
                                            No parsed data yet. Click "Extract
                                            with LLM" to parse.
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        )}
                    </Card>
                )}
            </div>

            {/* Right Panel: Controls & Extraction */}
            <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6 overflow-y-auto pb-4 pr-1 text-card-foreground">
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
                            onValueChange={(v) =>
                                setLlmMode(v as "cloud" | "local")
                            }
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
                                            setCloudProvider(
                                                e.target.value as any,
                                            )
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
                                        onChange={(e) =>
                                            setModelName(e.target.value)
                                        }
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
                                        <option value="lmstudio">
                                            LM Studio
                                        </option>
                                        <option value="builtin">
                                            Built-in
                                        </option>
                                    </select>
                                </div>

                                {provider === "builtin" ? (
                                    <div className="space-y-2">
                                        <Label>Built-in Model</Label>
                                        {downloadedModels.length > 0 ? (
                                            <div className="relative">
                                                <select
                                                    value={
                                                        builtInModel || ""
                                                    }
                                                    onChange={(e) =>
                                                        setBuiltInModel(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 pr-10"
                                                >
                                                    <option
                                                        value=""
                                                        disabled
                                                    >
                                                        Select a model...
                                                    </option>
                                                    {downloadedModels.map(
                                                        (m) => {
                                                            const name = m.name;
                                                            return (
                                                                <option
                                                                    key={name}
                                                                    value={name}
                                                                >
                                                                    {name} {m.has_vision ? " (👁️ Vision)" : ""}
                                                                </option>
                                                            );
                                                        }
                                                    )}
                                                </select>
                                                {downloadedModels.find(m => m.name === builtInModel)?.has_vision && (
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                                                        <Eye className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-destructive border rounded-md p-2 bg-destructive/10">
                                                No models downloaded.
                                                Please visit Settings to
                                                download a model.
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
                                    <Button 
                                        variant={extractionMode === "text" ? "default" : "ghost"} 
                                        size="sm" 
                                        className={cn(
                                            "h-7 text-xs px-4 transition-all",
                                            extractionMode === "text" ? "shadow-sm bg-background text-foreground hover:bg-background" : "text-muted-foreground"
                                        )}
                                        onClick={() => setExtractionMode("text")}
                                    >
                                        Text
                                    </Button>
                                    <Button 
                                        variant={extractionMode === "vision" ? "default" : "ghost"} 
                                        size="sm" 
                                        className={cn(
                                            "h-7 text-xs px-4 gap-1.5 transition-all",
                                            extractionMode === "vision" ? "shadow-sm bg-background text-foreground hover:bg-background" : "text-muted-foreground"
                                        )}
                                        onClick={() => setExtractionMode("vision")}
                                        disabled={provider === "builtin" && !downloadedModels.find(m => m.name === builtInModel)?.has_vision}
                                    >
                                        <Eye className="w-3 h-3" /> Vision
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Temp ({temperature})</Label>
                                    <input
                                        type="range" min="0" max="1" step="0.1"
                                        value={temperature}
                                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Top-P ({topP})</Label>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={topP}
                                        onChange={(e) => setTopP(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Repeat Penalty ({repeatPenalty})</Label>
                                <input
                                    type="range" min="1" max="2" step="0.05"
                                    value={repeatPenalty}
                                    onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                                    <Input 
                                        type="number" value={maxTokens} 
                                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Top-K</Label>
                                    <Input 
                                        type="number" value={topK} 
                                        onChange={(e) => setTopK(parseInt(e.target.value))}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>

                            {provider === "builtin" && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-muted-foreground">GPU Layers (NGL)</Label>
                                        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1 gap-1 text-primary hover:bg-primary/10" onClick={suggestNgl}>
                                            <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" /> Auto Optimize
                                        </Button>
                                    </div>
                                    <Input 
                                        type="number" value={nGpuLayers} 
                                        onChange={(e) => setNGpuLayers(parseInt(e.target.value))}
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
                                        onChange={(e) =>
                                            setPromptText(e.target.value)
                                        }
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
                                        <CheckCircle2 className="w-3 h-3" />{" "}
                                        Valid JSON
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                                        <XCircle className="w-3 h-3" /> Invalid
                                        JSON
                                    </span>
                                )}
                            </div>
                            <Textarea
                                placeholder='[{"key": "value"}]'
                                value={customJsonFormat}
                                onChange={(e) =>
                                    setCustomJsonFormat(e.target.value)
                                }
                                className="font-mono text-[11px] min-h-[120px] bg-muted/30 border-primary/10"
                            />
                        </div>

                        <div className="flex gap-2 mt-2">
                            <Button
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                                size="lg"
                                onClick={handleExtract}
                                disabled={isExtracting || !currentPdfPath}
                            >
                                {isExtracting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Extracting...
                                    </>
                                ) : (
                                    "Extract with LLM"
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
                                    <span>{Math.round((extractionProgress.current / extractionProgress.total) * 100)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                                    <div 
                                        className="h-full bg-primary transition-all duration-300 ease-in-out" 
                                        style={{ width: `${Math.round((extractionProgress.current / extractionProgress.total) * 100)}%` }}
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
            </div>
        </div>
    );
}
