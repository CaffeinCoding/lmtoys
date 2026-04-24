import { Outlet, Link, useLocation } from "react-router-dom";
import { FileText, Database, Settings as SettingsIcon, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { GlobalStatusBar } from "../GlobalStatusBar";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { name: "Home", path: "/", icon: <FileText size={20} /> },
    { name: "Data", path: "/data", icon: <Database size={20} /> },
    { name: "Settings", path: "/settings", icon: <SettingsIcon size={20} /> },
  ];

  return (
    // 전체 뷰포트를 column flex로 구성하여 StatusBar가 항상 맨 아래에 위치하도록 합니다.
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top area: sidebar + main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card flex flex-col shrink-0">
          <div className="p-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="text-primary" />
              PDF Parser
            </h2>
          </div>

          <nav className="flex-1 px-4 space-y-2">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}>
                <Button
                  variant={pathname === item.path ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3 mb-1"
                >
                  {item.icon}
                  {item.name}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="p-4 flex flex-col gap-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">Theme</span>
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                <Button variant={theme === 'light' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('light')}>
                  <Sun size={16} />
                </Button>
                <Button variant={theme === 'dark' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('dark')}>
                  <Moon size={16} />
                </Button>
                <Button variant={theme === 'system' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTheme('system')}>
                  <Monitor size={16} />
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content — overflow-auto here so content scrolls, not the whole page */}
        <main className="flex-1 overflow-auto relative">
          <div className="absolute inset-0 bg-linear-to-br from-background to-muted/20 -z-10" />
          <Outlet />
        </main>
      </div>

      {/* Global Status Bar — always at the very bottom, never overlaps content */}
      <GlobalStatusBar />
    </div>
  );
}
