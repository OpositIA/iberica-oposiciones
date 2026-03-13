import { AuthProvider } from "@/auth/AuthProvider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthenticatedSidebarLayout from "./components/AuthenticatedSidebarLayout";
import LandingRouteGuard from "./components/LandingRouteGuard";
import PlanRequiredRoute from "./components/PlanRequiredRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import AssistantIA from "./pages/AssistantIA";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import Login from "./pages/Login";
import MiPerfil from "./pages/MiPerfil";
import NotFound from "./pages/NotFound";
import PlanSelection from "./pages/PlanSelection";
import Plans from "./pages/Plans";
import ProfileBillingIssue from "./pages/ProfileBillingIssue";
import ProfileQuickTestSession from "./pages/ProfileQuickTestSession";
import ProfileStudy from "./pages/ProfileStudy";
import ProfileTemario from "./pages/ProfileTemario";
import ProfileTest from "./pages/ProfileTest";
import PublicPlans from "./pages/PublicPlans";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import { StudyTimerProvider } from "./study/StudyTimerProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

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
            <Route
              path="/"
              element={
                <LandingRouteGuard>
                  <Index />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/login"
              element={
                <LandingRouteGuard>
                  <Login />
                </LandingRouteGuard>
              }
            />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/registro"
              element={
                <LandingRouteGuard>
                  <Register />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/planes"
              element={
                <LandingRouteGuard>
                  <PublicPlans />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/seleccion-plan"
              element={
                <ProtectedRoute>
                  <PlanSelection />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <PlanRequiredRoute>
                    <StudyTimerProvider>
                      <AuthenticatedSidebarLayout />
                    </StudyTimerProvider>
                  </PlanRequiredRoute>
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
              <Route path="/perfil/planes" element={<Plans />} />
              <Route
                path="/perfil/pago-fallido"
                element={<ProfileBillingIssue />}
              />
              <Route path="/perfil/test" element={<ProfileTest />} />
              <Route
                path="/perfil/test/:testId"
                element={<ProfileQuickTestSession />}
              />
              <Route path="/perfil/temario" element={<ProfileTemario />} />
              <Route path="/perfil/a-estudiar" element={<ProfileStudy />} />
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
