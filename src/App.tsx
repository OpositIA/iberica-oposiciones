import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Plans from "./pages/Plans";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import AssistantIA from "./pages/AssistantIA";
import ProtectedRoute from "./components/ProtectedRoute";
import ProfileTest from "./pages/ProfileTest";
import ProfileTemario from "./pages/ProfileTemario";
import ProfileCalendario from "./pages/ProfileCalendario";
import ProfileEstadisticas from "./pages/ProfileEstadisticas";
import AuthenticatedSidebarLayout from "./components/AuthenticatedSidebarLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
            <Route path="/asistente-ia" element={<Navigate to="/perfil/oposia" replace />} />
            <Route path="/perfil" element={<Navigate to="/perfil/oposia" replace />} />
            <Route path="/perfil/oposia" element={<AssistantIA />} />
            <Route path="/perfil/test" element={<ProfileTest />} />
            <Route path="/perfil/temario" element={<ProfileTemario />} />
            <Route path="/perfil/calendario" element={<ProfileCalendario />} />
            <Route path="/perfil/estadisticas" element={<ProfileEstadisticas />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
