import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import EquipmentListPage from "@/pages/equipment-list-page";
import EquipmentPage from "@/pages/equipment-page";
import DashboardPage from "@/pages/dashboard-page";
import AdminPage from "@/pages/admin-page";
import BookingPage from "@/pages/BookingPage";
import ComparePage from "@/pages/compare-page";
import ReceiptHistory from "@/pages/ReceiptHistory";
import "./lib/i18n";
import ReceiptPage from "./pages/ReceiptPage";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/equipment" component={EquipmentListPage} />
      <ProtectedRoute path="/equipment/:id" component={EquipmentPage} />
      <ProtectedRoute path="/booking/:id" component={BookingPage} />
      <ProtectedRoute path="/bookings/:id/receipt" component={ReceiptPage} />
      <ProtectedRoute path="/receipts" component={ReceiptHistory} />
      <ProtectedRoute path="/compare" component={ComparePage} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/admin" component={() => <AdminPage />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;