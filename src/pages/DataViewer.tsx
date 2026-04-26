import { useState, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import * as XLSX from "xlsx";
import { Trash2, FileSpreadsheet, FileText, History, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Cpu, Zap, Gauge, Database } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function DataViewer() {
  const { extractedData, setExtractedData, extractionHistory, removeHistoryItem, extractedText } = useAppStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  // Find the selected history item to show its metadata
  const selectedHistoryItem = useMemo(() => {
    return extractionHistory.find(item => item.data === extractedData);
  }, [extractedData, extractionHistory]);

  // Use either the most recent extracted data or the last item from history if none is active
  const displayData = useMemo(() => {
    let rawData: any = [];
    if (extractedData && extractedData.length > 0) {
      rawData = extractedData;
    } else if (extractionHistory.length > 0) {
      rawData = extractionHistory[0].data;
    }

    const data = Array.isArray(rawData) ? rawData : [rawData];
    
    // Check if we have a single object that should be exploded into multiple rows
    if (data.length === 1 && typeof data[0] === 'object' && data[0] !== null) {
      const obj = data[0];
      const keys = Object.keys(obj);
      const arrayKeys = keys.filter(k => Array.isArray(obj[k]));
      
      if (arrayKeys.length > 0) {
        const lengths = arrayKeys.map(k => obj[k].length);
        const allSameLength = lengths.every(l => l === lengths[0]);
        
        if (allSameLength && lengths[0] > 1) {
          const exploded = [];
          for (let i = 0; i < lengths[0]; i++) {
            const row: any = {};
            keys.forEach(k => {
              row[k] = Array.isArray(obj[k]) ? obj[k][i] : obj[k];
            });
            exploded.push(row);
          }
          return exploded;
        }
      }
    }

    return data;
  }, [extractedData, extractionHistory]);

  const exportToExcel = async () => {
    try {
      const ws = XLSX.utils.json_to_sheet(displayData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ExtractedData");
      
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      
      const filePath = await save({
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        defaultPath: 'Extracted_Data.xlsx'
      });
      
      if (filePath) {
        await writeFile(filePath, new Uint8Array(excelBuffer));
      }
    } catch (err) {
      console.error("Failed to export Excel:", err);
    }
  };

  const exportToCSV = async () => {
    try {
      if (displayData.length === 0) return;
      
      const allKeysSet = new Set<string>();
      displayData.forEach(row => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach(key => allKeysSet.add(key));
        }
      });
      const keys = Array.from(allKeysSet);
      
      const header = keys.join(",");
      const rows = displayData.map(obj => 
        keys.map(key => {
          let val = obj[key] === null || obj[key] === undefined ? "" : obj[key];
          if (typeof val === 'object') val = JSON.stringify(val);
          let strVal = String(val);
          strVal = strVal.replace(/"/g, '""');
          if (strVal.includes(",") || strVal.includes("\n") || strVal.includes('"')) {
            strVal = `"${strVal}"`;
          }
          return strVal;
        }).join(",")
      );
      const csvContent = [header, ...rows].join("\n");
      
      const filePath = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: 'Extracted_Data.csv'
      });
      
      if (filePath) {
        await writeFile(filePath, new TextEncoder().encode(csvContent));
      }
    } catch (err) {
      console.error("Failed to export CSV:", err);
    }
  };

  const clearData = () => {
    setExtractedData(null);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 p-6 gap-6">
        <div className="flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              View and export extracted data from PDFs.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={exportToExcel} 
              disabled={displayData.length === 0}
              className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button 
              variant="outline" 
              onClick={exportToCSV} 
              disabled={displayData.length === 0}
              className="bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              variant="destructive" 
              size="icon" 
              onClick={clearData} 
              title="Clear Current Data"
              className="w-10 h-10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              title="Toggle History"
              className="w-10 h-10"
            >
              {isSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <History className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Metadata Banner */}
        {selectedHistoryItem?.config && (
          <div className="flex flex-col p-4 bg-muted/30 border rounded-lg shrink-0 transition-all duration-200">
            <div 
              className="flex flex-wrap items-center justify-between cursor-pointer group"
              onClick={() => setIsMetadataOpen(!isMetadataOpen)}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 mr-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{selectedHistoryItem.config.modelName}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="font-normal">Temp: {selectedHistoryItem.config.temperature}</Badge>
                  <Badge variant="outline" className="font-normal">NGL: {selectedHistoryItem.config.nGpuLayers}</Badge>
                  <Badge variant="secondary" className="font-normal ml-2">{selectedHistoryItem.config.llmMode.toUpperCase()}</Badge>
                  
                  {selectedHistoryItem.config.runtime && (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-semibold ml-1">
                      {selectedHistoryItem.config.runtime.toUpperCase()}
                    </Badge>
                  )}
                  
                  {(selectedHistoryItem.config.ttft !== undefined && selectedHistoryItem.config.ttft !== null) && (
                    <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full border border-amber-500/20">
                      <Gauge className="w-3 h-3" />
                      <span>{selectedHistoryItem.config.ttft}ms</span>
                    </div>
                  )}

                  {(selectedHistoryItem.config.speed !== undefined && selectedHistoryItem.config.speed !== null) && (
                    <div className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full border border-blue-200/20">
                      <Zap className="w-3 h-3" />
                      <span>{selectedHistoryItem.config.speed.toFixed(1)} t/s</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                {isMetadataOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
            
            {isMetadataOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-3 mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <Zap className="w-3 h-3" /> System Prompt
                  </div>
                  <div className="text-[11px] bg-background/50 p-2 rounded border max-h-32 overflow-y-auto whitespace-pre-wrap italic">
                    {selectedHistoryItem.config.systemPrompt || "No system prompt used."}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <FileText className="w-3 h-3" /> User Prompt
                  </div>
                  <div className="text-[11px] bg-background/50 p-2 rounded border max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {selectedHistoryItem.config.promptText || "No user prompt data."}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <Database className="w-3 h-3" /> JSON Format
                  </div>
                  <div className="text-[11px] bg-background/50 p-2 rounded border max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                    {selectedHistoryItem.config.customJsonFormat || "No format specified."}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
          <CardHeader className="py-4 border-b shrink-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle>LLM Raw Response</CardTitle>
              <CardDescription>The original text generated by the model before parsing.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle History">
                {isSidebarOpen ? <ChevronRight className="w-4 h-4 mr-2" /> : <History className="w-4 h-4 mr-2" />}
                {isSidebarOpen ? "Hide History" : "Show History"}
              </Button>
              <Button variant="destructive" size="sm" onClick={clearData} title="Clear Current Data">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 relative bg-muted/10 font-mono text-xs">
            <ScrollArea className="h-full w-full">
              <div className="p-6 whitespace-pre-wrap leading-relaxed">
                {selectedHistoryItem?.config?.rawResponse || extractedText || "No raw response data available."}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Collapsible Sidebar for History */}
      <aside className={cn(
        "border-l bg-card flex flex-col transition-all duration-300 ease-in-out shrink-0",
        isSidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <History className="w-4 h-4" /> Extraction History
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {extractionHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center p-4">No history yet.</p>
            ) : (
              extractionHistory.map((item) => (
                <div 
                  key={item.id} 
                  className={cn(
                    "group flex flex-col gap-1 p-3 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors",
                    extractedData === item.data ? "border-primary bg-primary/5" : "border-transparent"
                  )}
                  onClick={() => setExtractedData(item.data)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistoryItem(item.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                  <div className="text-[10px] text-muted-foreground">
                    {Array.isArray(item.data) ? item.data.length : 1} items extracted
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}