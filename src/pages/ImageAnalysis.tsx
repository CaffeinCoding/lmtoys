import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readDir } from "@tauri-apps/plugin-fs";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, CheckSquare, Square, ImageIcon, Loader2, Maximize2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { streamLlamaCompletion } from "@/api/llama-api";
import { ExtractionConfigPanel, ModelInfo } from "@/components/ExtractionConfigPanel";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

const JSON_GBNF = `root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null")
object ::= "{" ws (string ":" ws value ("," ws string ":" ws value)*)? ws "}"
array  ::= "[" ws (value ("," ws value)*)? ws "]"
string ::= "\\"" ([^"\\\\\\x00-\\x1F] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F]{4}))* "\\""
number ::= "-"? ([0-9] | [1-9][0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
ws     ::= [ \\t\\n\\r]*`;

interface ImageItem {
  name: string;
  path: string;
  url: string;
}

function uint8ToBase64(u8Arr: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const c: string[] = [];
  for (let i = 0; i < u8Arr.length; i += CHUNK_SIZE) {
    c.push(String.fromCharCode.apply(null, Array.from(u8Arr.subarray(i, i + CHUNK_SIZE))));
  }
  return btoa(c.join(""));
}

function extractJsonFromString(text: string): any[] | null {
  try {
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
      const regex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\})|(\[(?:[^\[\]]|(?:\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]))*\])/g;
      let match;
      const results: any[] = [];
      while ((match = regex.exec(text)) !== null) {
          try {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed)) results.push(...parsed);
              else results.push(parsed);
          } catch {}
      }
      return results.length > 0 ? results : null;
  }
}

export default function ImageAnalysis() {
  const navigate = useNavigate();
  const {
    llmMode,
    modelName,
    builtInModel,
    provider,
    systemPrompt,
    promptText,
    customJsonFormat,
    setExtractedData,
    addHistoryItem,
    temperature,
    maxTokens,
    topP,
    topK,
    repeatPenalty,
    setIsStreaming,
    setExtractedText,
    setTokensPerSecond,
    setTimeToFirstToken,
    modelDownloadPath
  } = useAppStore();

  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        setFolderPath(selected);
        setIsLoading(true);
        setSelectedImages(new Set()); // Reset selection
        setErrorMsg(null);

        const entries = await readDir(selected);
        const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
        
        const imageFiles = entries
          .filter((entry) => 
            entry.isFile && 
            imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
          )
          .map((entry) => ({
            name: entry.name,
            path: `${selected}\\${entry.name}`,
            url: convertFileSrc(`${selected}\\${entry.name}`),
          }));

        setImages(imageFiles);
      }
    } catch (err) {
      console.error("Failed to open folder:", err);
      setErrorMsg("Failed to open folder.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = useCallback((path: string) => {
    setSelectedImages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map((img) => img.path)));
    }
  };

  const handleStopExtraction = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
  };

  const handleAnalyze = async () => {
    if (selectedImages.size === 0) return;

    setIsExtracting(true);
    setExtractedText("");
    setErrorMsg(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const finalSystemPrompt = `${systemPrompt}\n\nStrict JSON Format required:\n${customJsonFormat}`;
      const finalUserPrompt = promptText;

      let resultText = "";
      let parsedData: any[] | null = null;
      let firstTokenTime: number | null = null;
      let totalTokens = 0;
      let totalDuration = 0;
      let rawResponses: string[] = [];

      if (llmMode === "cloud") {
        const contentPayload: any[] = [
          { type: "text", text: finalUserPrompt }
        ];

        for (const path of selectedImages) {
          const u8Data = await readFile(path);
          const base64 = uint8ToBase64(u8Data);
          contentPayload.push({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
              detail: "auto"
            }
          });
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer YOUR_API_KEY`,
          },
          body: JSON.stringify({
            model: modelName || "gpt-4o",
            messages: [
              { role: "system", content: finalSystemPrompt },
              { role: "user", content: contentPayload },
            ],
            max_tokens: 1500,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        resultText = data.choices?.[0]?.message?.content || "";
        rawResponses.push(resultText);

        parsedData = extractJsonFromString(resultText);
      } else if (provider === "builtin") {
        const currentStatus = useAppStore.getState().serverStatus;
        if (currentStatus !== "running") {
            throw new Error("Llama Server is not running. Please start it from the top header.");
        }

        const port = useAppStore.getState().serverPort;
        const models = await invoke<ModelInfo[]>("get_downloaded_models", { path: modelDownloadPath });
        const isVisionModel = models.find(m => m.name === builtInModel)?.has_vision || false;

        if (!isVisionModel) {
            throw new Error("Selected built-in model does not support vision capabilities.");
        }

        setIsStreaming(true);
        let allParsedData: any[] = [];
        const startTime = performance.now();
        const imagesArr = Array.from(selectedImages);

        for (let i = 0; i < imagesArr.length; i++) {
            setExtractionProgress({ 
                current: i, 
                total: imagesArr.length, 
                message: `Processing image ${i + 1} of ${imagesArr.length}...` 
            });

            const path = imagesArr[i];
            const u8Data = await readFile(path);
            const base64 = uint8ToBase64(u8Data);
            
            const content: any[] = [
                { type: "text", text: finalUserPrompt },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
            ];

            const messages = [
                { role: "system", content: finalSystemPrompt },
                { role: "user", content }
            ];

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
                    if (i === 0) {
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
            setExtractedText((prev: string) => prev + "\n\n--- Next Image ---\n\n");
            
            const batchParsedData = extractJsonFromString(resultText);
            if (batchParsedData) {
                // Add filename context to each parsed item if it doesn't have a name
                const filename = path.split('\\').pop()?.split('/').pop() || `image_${i}`;
                const enrichedData = batchParsedData.map(item => ({
                    _source_image: filename,
                    ...item
                }));
                allParsedData = allParsedData.concat(enrichedData);
            }
        }

        setExtractionProgress({ current: imagesArr.length, total: imagesArr.length, message: "Merging results..." });
        setTokensPerSecond(totalTokens / totalDuration);
        
        parsedData = allParsedData.length > 0 ? allParsedData : null;
        resultText = rawResponses.join("\n\n--- Next Image ---\n\n");
      } else {
         throw new Error("Provider not supported for Image Analysis yet.");
      }

      if (!parsedData) {
        throw new Error("Failed to parse JSON from model response.");
      }

      setExtractedData(parsedData);

      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '_');
      const historyName = `Images_${selectedImages.size}_${dateStr}`;
      
      const configSnapshot = {
          modelName: llmMode === "local" ? builtInModel : modelName,
          llmMode,
          provider: llmMode === "local" ? provider : "openai",
          systemPrompt,
          promptText,
          customJsonFormat,
          rawResponse: resultText,
          runtime: llmMode === "local" ? "LlamaServer" : "Cloud",
          imageFolderPath: folderPath,
          ttft: firstTokenTime ? Math.round(firstTokenTime) : undefined,
          speed: totalTokens > 0 ? totalTokens / totalDuration : undefined
      };

      addHistoryItem({
          id: crypto.randomUUID(),
          name: historyName,
          data: parsedData,
          timestamp: now.getTime(),
          config: configSnapshot as any
      });

      navigate("/data");
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Analysis aborted");
        setExtractedText("Extraction stopped by user.");
      } else {
        console.error("Failed to analyze images:", err);
        setErrorMsg(err.message || String(err));
      }
    } finally {
      setIsExtracting(false);
      setIsStreaming(false);
      setExtractionProgress(null);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col lg:flex-row gap-6 items-stretch h-full overflow-hidden">
      {/* Left Panel: Viewer */}
      <div className="flex-1 flex flex-col min-w-0 gap-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" />
            Image Analysis
          </h1>
          <div className="flex gap-2 items-center flex-wrap">
            {errorMsg && (
              <div className="flex items-center gap-1 text-sm text-destructive font-medium mr-2">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </div>
            )}
            {folderPath && images.length > 0 && (
              <Button variant="outline" onClick={handleSelectAll} disabled={isExtracting}>
                {selectedImages.size === images.length ? (
                  <><Square className="w-4 h-4 mr-2" /> Deselect All</>
                ) : (
                  <><CheckSquare className="w-4 h-4 mr-2" /> Select All</>
                )}
              </Button>
            )}
            <Button onClick={handleOpenFolder} variant={folderPath ? "secondary" : "default"} disabled={isExtracting}>
              <FolderOpen className="w-4 h-4 mr-2" />
              {folderPath ? "Change Folder" : "Open Folder"}
            </Button>
          </div>
        </div>

        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden border-primary/20">
          <CardHeader className="py-4 border-b shrink-0 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {folderPath ? `Images in ${folderPath.split('\\').pop() || folderPath.split('/').pop()}` : "No Folder Selected"}
            </CardTitle>
            {images.length > 0 && (
              <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {selectedImages.size} of {images.length} selected
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden relative">
            {isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p>Loading images...</p>
              </div>
            ) : images.length > 0 ? (
              <ScrollArea className="h-full p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                  {images.map((img, index) => {
                    const isSelected = selectedImages.has(img.path);
                    return (
                      <div 
                        key={img.path} 
                        className={cn(
                          "group relative aspect-square rounded-lg border-2 overflow-hidden transition-all cursor-pointer bg-muted/50",
                          isSelected ? "border-primary shadow-sm" : "border-transparent hover:border-primary/50",
                          isExtracting && "opacity-50 pointer-events-none"
                        )}
                        onClick={() => !isExtracting && toggleSelection(img.path)}
                      >
                        <img 
                          src={img.url} 
                          alt={img.name} 
                          className={cn(
                            "w-full h-full object-cover transition-transform duration-300",
                            isSelected ? "scale-105" : "group-hover:scale-105"
                          )}
                          loading="lazy"
                        />
                        
                        <div className={cn(
                          "absolute top-2 left-2 transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <div className={cn(
                            "w-6 h-6 rounded-md flex items-center justify-center border shadow-sm transition-colors",
                            isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-background/80 border-muted-foreground/50 text-transparent backdrop-blur-sm"
                          )}>
                            <CheckSquare className={cn("w-4 h-4", isSelected ? "block" : "hidden")} />
                          </div>
                        </div>

                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            size="icon" 
                            variant="secondary" 
                            className="w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isExtracting) setPreviewIndex(index);
                            }}
                          >
                            <Maximize2 className="w-4 h-4 text-foreground" />
                          </Button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6 pointer-events-none">
                          <p className="text-xs text-white truncate font-medium drop-shadow-md">
                            {img.name}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : folderPath ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                <p>No images found in this folder.</p>
                <p className="text-sm">Supported formats: PNG, JPG, JPEG, WEBP</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <FolderOpen className="w-16 h-16 mb-4 opacity-20" />
                <p>Open a folder to view images</p>
                <Button variant="outline" className="mt-4" onClick={handleOpenFolder}>
                  Select Folder
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Lightbox
          open={previewIndex >= 0}
          close={() => setPreviewIndex(-1)}
          index={previewIndex}
          slides={images.map((img) => ({ src: img.url }))}
          plugins={[Zoom, Thumbnails]}
        />
      </div>

      {/* Right Panel: Controls & Extraction */}
      <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6 overflow-y-auto pb-4 pr-1 text-card-foreground">
          <ExtractionConfigPanel 
              handleExtract={handleAnalyze}
              handleStopExtraction={handleStopExtraction}
              isExtracting={isExtracting}
              extractionProgress={extractionProgress}
              isExtractDisabled={selectedImages.size === 0}
              extractButtonText={`Analyze ${selectedImages.size} Images`}
              hideTextMode={true}
          />
      </div>
    </div>
  );
}
