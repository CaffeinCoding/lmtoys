import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/useAppStore";
import { Loader2, Upload, FileText, Settings2 } from "lucide-react";

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker to use CDN to prevent Vite bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function Home() {
  const { currentPdfPath, setCurrentPdfPath } = useAppStore();
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState("");

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
        filters: [{
          name: 'PDF',
          extensions: ['pdf']
        }]
      });
      if (selected && typeof selected === 'string') {
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
      // Call Rust backend to extract text
      const text = await invoke<string>("extract_pdf_text", { filePath: currentPdfPath });
      setExtractedText(text);
    } catch (err) {
      console.error("Failed to extract text:", err);
      setExtractedText(`Error: ${err}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className="p-6 h-full flex gap-6">
      {/* Left Panel: Viewer */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-4 border-b">
          <CardTitle className="flex justify-between items-center text-lg">
            <span>PDF Viewer</span>
            <Button variant="outline" size="sm" onClick={handleUpload}>
              <Upload className="w-4 h-4 mr-2" />
              Open PDF
            </Button>
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
                  className="shadow-md"
                />
              </Document>
              {numPages && (
                <div className="flex justify-between items-center mt-4 px-4 pb-4">
                  <Button 
                    variant="outline" 
                    disabled={pageNumber <= 1} 
                    onClick={() => setPageNumber(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">Page {pageNumber} of {numPages}</span>
                  <Button 
                    variant="outline" 
                    disabled={pageNumber >= numPages} 
                    onClick={() => setPageNumber(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p>No PDF selected</p>
              <Button variant="secondary" className="mt-4" onClick={handleUpload}>
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
                <TabsTrigger value="text" className="flex-1">Text Extraction</TabsTrigger>
                <TabsTrigger value="vision" className="flex-1">Vision Extraction</TabsTrigger>
              </TabsList>
              
              <TabsContent value="text" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Prompt / Keywords</Label>
                  <Input placeholder="e.g. Extract invoice total and date..." />
                </div>
                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <select className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="json">JSON</option>
                    <option value="excel">Excel (CSV)</option>
                  </select>
                </div>
                <Button 
                  className="w-full" 
                  disabled={!currentPdfPath || isExtracting}
                  onClick={handleExtractText}
                >
                  {isExtracting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting...</>
                  ) : (
                    "Extract with Local Model"
                  )}
                </Button>
              </TabsContent>
              
              <TabsContent value="vision" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Vision extraction sends page images to the model. Requires a vision-capable LLM (e.g. GPT-4o, Gemini 1.5 Pro).
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
              <CardTitle className="text-lg">Raw Extracted Text</CardTitle>
              <CardDescription>Rust backend parsing result</CardDescription>
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
