import { useState, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  useReactTable,
  getPaginationRowModel
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";
import { TableProperties, BarChart3, Trash2, FileSpreadsheet, FileText, History, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Cpu, Zap, Gauge, Database } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function DataViewer() {
  const { extractedData, setExtractedData, extractionHistory, removeHistoryItem, extractedText } = useAppStore();
  const [viewMode, setViewMode] = useState<"table" | "chart" | "raw">("table");
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
    // e.g. {"name": ["1", "2"], "age": [20, 30]} -> [{"name": "1", "age": 20}, {"name": "2", "age": 30}]
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

  const columnHelper = createColumnHelper<any>();

  // Dynamic columns based on all data keys in the dataset
  const columns = useMemo(() => {
    if (displayData.length === 0) return [];
    
    // Collect all unique keys from all rows to prevent missing columns
    const allKeys = new Set<string>();
    displayData.forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(key => allKeys.add(key));
      }
    });

    return Array.from(allKeys).map(key => 
      columnHelper.accessor(key, {
        header: key.charAt(0).toUpperCase() + key.slice(1),
        cell: info => {
          const val = info.getValue();
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val === null || val === undefined ? "-" : String(val);
        },
      })
    );
  }, [displayData]);

  const table = useReactTable({
    data: displayData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

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
              View, edit, and visualize extracted data from PDFs.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant={viewMode === "table" ? "default" : "outline"} 
              onClick={() => setViewMode("table")}
            >
              <TableProperties className="w-4 h-4 mr-2" />
              Table
            </Button>
            <Button 
              variant={viewMode === "chart" ? "default" : "outline"} 
              onClick={() => setViewMode("chart")}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Chart
            </Button>
            <Button 
              variant={viewMode === "raw" ? "default" : "outline"} 
              onClick={() => setViewMode("raw")}
            >
              <FileText className="w-4 h-4 mr-2" />
              Raw Response
            </Button>
            <Button 
              variant="outline" 
              onClick={exportToExcel} 
              disabled={displayData.length === 0}
              className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button 
              variant="outline" 
              onClick={exportToCSV} 
              disabled={displayData.length === 0}
              className="bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50"
            >
              <FileText className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <History className="w-4 h-4" />}
            </Button>
            <Button variant="destructive" onClick={clearData}>
              <Trash2 className="w-4 h-4" />
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
          {viewMode === "table" ? (
            <>
              <CardHeader className="py-4 border-b shrink-0">
                <CardTitle>Extracted Data Table</CardTitle>
                <CardDescription>
                  {displayData.length > 0 ? "Data successfully extracted from LLM." : "No data available. Use the Home page to extract data."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0 relative">
                <ScrollArea className="h-full w-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      {table.getHeaderGroups().map(headerGroup => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map(header => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map(row => (
                          <TableRow
                            key={row.id}
                            data-state={row.getIsSelected() && "selected"}
                          >
                            {row.getVisibleCells().map(cell => (
                              <TableCell key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={columns.length} className="h-24 text-center">
                            No results.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
              
              <div className="flex items-center justify-end space-x-2 py-4 px-4 border-t shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </>
          ) : viewMode === "chart" ? (
            <>
              <CardHeader className="py-4 border-b shrink-0">
                <CardTitle>Data Visualization</CardTitle>
                <CardDescription>Visualizing numerical fields across the dataset.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-6 min-h-0">
                {(() => {
                  if (displayData.length === 0) return <div className="h-full flex items-center justify-center text-muted-foreground">No data available for charting.</div>;
                  
                  const numKey = Object.keys(displayData[0] || {}).find(k => typeof displayData[0][k] === 'number');
                  const strKey = Object.keys(displayData[0] || {}).find(k => typeof displayData[0][k] === 'string');
                  
                  if (!numKey) {
                    return <div className="h-full flex items-center justify-center text-muted-foreground">No numerical data found for charting.</div>;
                  }

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey={strKey || "id"} tick={{fontSize: 10}} />
                        <YAxis tick={{fontSize: 10}} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        />
                        <Bar dataKey={numKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="py-4 border-b shrink-0">
                <CardTitle>LLM Raw Response</CardTitle>
                <CardDescription>The original text generated by the model before parsing.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0 relative bg-muted/10 font-mono text-xs">
                <ScrollArea className="h-full w-full">
                  <div className="p-6 whitespace-pre-wrap leading-relaxed">
                    {selectedHistoryItem?.config?.rawResponse || extractedText || "No raw response data available."}
                  </div>
                </ScrollArea>
              </CardContent>
            </>
          )}
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
                    {item.data.length} items extracted
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
