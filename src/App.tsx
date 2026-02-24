import { AuthProvider } from "@/auth/AuthProvider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthenticatedSidebarLayout from "./components/AuthenticatedSidebarLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import AssistantIA from "./pages/AssistantIA";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import Login from "./pages/Login";
import MiPerfil from "./pages/MiPerfil";
import NotFound from "./pages/NotFound";
import Plans from "./pages/Plans";
import ProfileCalendario from "./pages/ProfileCalendario";
import ProfileTemario from "./pages/ProfileTemario";
import ProfileTest from "./pages/ProfileTest";
import Register from "./pages/Register";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/planes" element={<Plans />} />
            <Route
              element={
                <ProtectedRoute>
                  <AuthenticatedSidebarLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/asistente-ia"
                element={<Navigate to="/perfil/opositAI" replace />}
              />
              <Route
                path="/perfil"
                element={<Navigate to="/perfil/mi-perfil" replace />}
              />
              <Route path="/perfil/opositAI" element={<AssistantIA />} />
              <Route path="/perfil/test" element={<ProfileTest />} />
              <Route path="/perfil/temario" element={<ProfileTemario />} />
              <Route
                path="/perfil/calendario"
                element={<ProfileCalendario />}
              />
              <Route path="/perfil/mi-perfil" element={<MiPerfil />} />
              <Route
                path="/perfil/estadisticas"
                element={<Navigate to="/dashboard" replace />}
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
