import { AuthProvider } from "@/auth/AuthProvider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingRouteGuard from "./components/LandingRouteGuard";
import PlanRequiredRoute from "./components/PlanRequiredRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import SeoManager from "./components/SeoManager";
import { StudyTimerProvider } from "./study/StudyTimerProvider";

const AuthenticatedSidebarLayout = lazy(
  () => import("./components/AuthenticatedSidebarLayout")
);
const AssistantIA = lazy(() => import("./pages/AssistantIA"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const FooterAbout = lazy(() => import("./pages/FooterAbout"));
const FooterPrivacy = lazy(() => import("./pages/FooterPrivacy"));
const FooterTerms = lazy(() => import("./pages/FooterTerms"));
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const MiPerfil = lazy(() => import("./pages/MiPerfil"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PlanSelection = lazy(() => import("./pages/PlanSelection"));
const Plans = lazy(() => import("./pages/Plans"));
const ProfileBillingIssue = lazy(() => import("./pages/ProfileBillingIssue"));
const ProfileQuickTestSession = lazy(
  () => import("./pages/ProfileQuickTestSession")
);
const ProfileStudy = lazy(() => import("./pages/ProfileStudy"));
const ProfileTemario = lazy(() => import("./pages/ProfileTemario"));
const ProfileTest = lazy(() => import("./pages/ProfileTest"));
const PublicFaq = lazy(() => import("./pages/PublicFaq"));
const PublicPlans = lazy(() => import("./pages/PublicPlans"));
const Register = lazy(() => import("./pages/Register"));
const RegisterCheckoutSuccess = lazy(
  () => import("./pages/RegisterCheckoutSuccess")
);
const RegisterPlanSelection = lazy(
  () => import("./pages/RegisterPlanSelection")
);
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Support = lazy(() => import("./pages/Support"));
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
