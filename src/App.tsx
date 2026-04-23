import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import AppLayout from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import DataViewer from "@/pages/DataViewer";
import Settings from "@/pages/Settings";

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="pdf-parser-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="data" element={<DataViewer />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
