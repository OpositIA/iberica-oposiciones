import { AuthProvider } from "@/auth/AuthProvider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthenticatedSidebarLayout from "./components/AuthenticatedSidebarLayout";
import LandingRouteGuard from "./components/LandingRouteGuard";
import PlanRequiredRoute from "./components/PlanRequiredRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import SeoManager from "./components/SeoManager";
import AssistantIA from "./pages/AssistantIA";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import FooterAbout from "./pages/FooterAbout";
import FooterPrivacy from "./pages/FooterPrivacy";
import FooterTerms from "./pages/FooterTerms";
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
import PublicFaq from "./pages/PublicFaq";
import PublicPlans from "./pages/PublicPlans";
import Register from "./pages/Register";
import RegisterCheckoutSuccess from "./pages/RegisterCheckoutSuccess";
import RegisterPlanSelection from "./pages/RegisterPlanSelection";
import ResetPassword from "./pages/ResetPassword";
import Support from "./pages/Support";
import { StudyTimerProvider } from "./study/StudyTimerProvider";

const ProfileSyllabusPdfViewer = lazy(
  () => import("./pages/ProfileSyllabusPdfViewer")
);
const ProfileSyllabusDownload = lazy(
  () => import("./pages/ProfileSyllabusDownload")
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
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
          <SeoManager />
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
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/registro"
              element={
                <LandingRouteGuard>
                  <Register />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/registro/planes"
              element={
                <LandingRouteGuard>
                  <RegisterPlanSelection />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/registro/pago-completado"
              element={
                <LandingRouteGuard>
                  <RegisterCheckoutSuccess />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/preguntas-frecuentes"
              element={
                <LandingRouteGuard>
                  <PublicFaq />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/faq"
              element={<Navigate to="/preguntas-frecuentes" replace />}
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
              path="/terminos"
              element={
                <LandingRouteGuard>
                  <FooterTerms />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/privacidad"
              element={
                <LandingRouteGuard>
                  <FooterPrivacy />
                </LandingRouteGuard>
              }
            />
            <Route
              path="/sobre-nosotros"
              element={
                <LandingRouteGuard>
                  <FooterAbout />
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
                element={<Navigate to="/perfil/asistente-ia" replace />}
              />
              <Route
                path="/perfil"
                element={<Navigate to="/perfil/mi-perfil" replace />}
              />
              <Route path="/perfil/asistente-ia" element={<AssistantIA />} />
              <Route path="/perfil/planes" element={<Plans />} />
              <Route
                path="/perfil/pago-fallido"
                element={<ProfileBillingIssue />}
              />
              <Route path="/perfil/soporte" element={<Support />} />
              <Route path="/perfil/test" element={<ProfileTest />} />
              <Route
                path="/perfil/test/:testId"
                element={<ProfileQuickTestSession />}
              />
              <Route path="/perfil/temario" element={<ProfileTemario />} />
              <Route
                path="/perfil/temario/pdf/:subtopicFileId"
                element={<ProfileSyllabusPdfViewer />}
              />
              <Route
                path="/perfil/temario/descarga/:subtopicFileId"
                element={<ProfileSyllabusDownload />}
              />
              <Route
                path="/perfil/a-estudiar"
                element={<Navigate to="/perfil/pomodoro" replace />}
              />
              <Route path="/perfil/pomodoro" element={<ProfileStudy />} />
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
