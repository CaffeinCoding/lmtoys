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
import { Download, TableProperties, BarChart3, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function DataViewer() {
  const { extractedData, setExtractedData } = useAppStore();
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  // Mock data for demonstration if no data is extracted
  const displayData = extractedData || [
    { id: 1, item: "Apple Macbook Pro", amount: 2500, date: "2023-10-01" },
    { id: 2, item: "Dell XPS 15", amount: 1800, date: "2023-10-05" },
    { id: 3, item: "Logitech Mouse", amount: 100, date: "2023-10-10" },
    { id: 4, item: "Keychron Keyboard", amount: 150, date: "2023-10-12" },
  ];

  const columnHelper = createColumnHelper<any>();

  // Dynamic columns based on data keys
  const columns = useMemo(() => {
    if (displayData.length === 0) return [];
    
    const keys = Object.keys(displayData[0]);
    return keys.map(key => 
      columnHelper.accessor(key, {
        header: key.charAt(0).toUpperCase() + key.slice(1),
        cell: info => info.getValue(),
      })
    );
  }, [displayData]);

  const table = useReactTable({
    data: displayData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(displayData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ExtractedData");
    XLSX.writeFile(wb, "Extracted_Data.xlsx");
  };

  const clearData = () => {
    setExtractedData(null);
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Dashboard</h1>
          <p className="text-muted-foreground mt-2">
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
          <Button variant="outline" onClick={exportToExcel} className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
          <Button variant="destructive" onClick={clearData}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        {viewMode === "table" ? (
          <>
            <CardHeader className="py-4 border-b">
              <CardTitle>Extracted Data Table</CardTitle>
              <CardDescription>
                {extractedData ? "Data successfully extracted from LLM." : "Showing mock data. Extract a PDF to see actual results."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-0">
              <Table>
                <TableHeader>
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
            </CardContent>
            
            <div className="flex items-center justify-end space-x-2 py-4 px-4 border-t">
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
        ) : (
          <>
            <CardHeader className="py-4 border-b">
              <CardTitle>Data Visualization</CardTitle>
              <CardDescription>Visualizing numerical fields across the dataset.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-6">
              {/* Attempt to find a string column for X axis and number column for Y axis */}
              {(() => {
                const numKey = Object.keys(displayData[0] || {}).find(k => typeof displayData[0][k] === 'number');
                const strKey = Object.keys(displayData[0] || {}).find(k => typeof displayData[0][k] === 'string');
                
                if (!numKey) {
                  return <div className="h-full flex items-center justify-center text-muted-foreground">No numerical data found for charting.</div>;
                }

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey={strKey || "id"} tick={{fontSize: 12}} />
                      <YAxis tick={{fontSize: 12}} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey={numKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
