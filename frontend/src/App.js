import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Pricing from "@/pages/Pricing";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import CreateCompany from "@/pages/CreateCompany";
import ERPLayout from "@/pages/ERPLayout";
import Dashboard from "@/pages/erp/Dashboard";
import Agenda from "@/pages/erp/Agenda";
import Garage from "@/pages/erp/Garage";
import Obras from "@/pages/erp/Obras";
import Estoque from "@/pages/erp/Estoque";
import RMA from "@/pages/erp/RMA";
import MyAgenda from "@/pages/erp/MyAgenda";
import Employees from "@/pages/erp/Employees";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Gate({ children }) {
  const { user, company, subscriptionActive, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!company) return <Navigate to="/onboarding/company" replace />;
  if (!subscriptionActive) return <Navigate to="/planos" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/planos" element={<Protected><Pricing /></Protected>} />
          <Route path="/payment/success" element={<Protected><PaymentSuccess /></Protected>} />
          <Route path="/payment/cancel" element={<Protected><PaymentCancel /></Protected>} />
          <Route path="/onboarding/company" element={<Protected><CreateCompany /></Protected>} />
          <Route path="/app" element={<Gate><ERPLayout /></Gate>}>
            <Route index element={<Dashboard />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="garagem" element={<Garage />} />
            <Route path="obras" element={<Obras />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="rma" element={<RMA />} />
            <Route path="minha-agenda" element={<MyAgenda />} />
            <Route path="funcionarios" element={<Employees />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
