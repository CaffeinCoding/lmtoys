import { useNavigate } from "react-router-dom";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Image as ImageIcon } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="p-6 h-full flex flex-col items-center justify-center space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Select Analysis Mode</h1>
        <p className="text-muted-foreground text-lg">Choose the type of data you want to analyze using LLM.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        <Card 
          className="hover:border-primary cursor-pointer transition-all hover:shadow-md"
          onClick={() => navigate("/pdf-analysis")}
        >
          <CardHeader className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <FileText className="w-12 h-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">PDF Analysis</CardTitle>
            <CardDescription className="text-base">
              Extract and analyze text and data from PDF documents.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="hover:border-primary cursor-pointer transition-all hover:shadow-md"
          onClick={() => navigate("/image-analysis")}
        >
          <CardHeader className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <ImageIcon className="w-12 h-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Image Analysis</CardTitle>
            <CardDescription className="text-base">
              Extract insights and analyze multiple images at once.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
