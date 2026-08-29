import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(null);
  const { logout, user, company, subscriptionActive } = useAuth();

  useEffect(() => { api.get("/plans").then(r => setPlans(r.data.plans)); }, []);

  const checkout = async (lookup_key) => {
    setLoading(lookup_key);
    try {
      const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); setLoading(null); }
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="font-display font-bold text-lg">AutomaERP</Link>
          <div className="flex gap-4 items-center">
            {company && subscriptionActive && <Link data-testid="pricing-goto-app" to="/app" className="text-sm text-blue-600">Ir para o sistema</Link>}
            <span className="text-sm text-slate-500">{user?.email}</span>
            <button data-testid="pricing-logout" onClick={logout} className="text-sm text-slate-600 hover:text-black">Sair</button>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Escolha seu plano</h1>
        <p className="text-slate-600 mt-2">Sua conta está criada. Para acessar o sistema, ative uma assinatura.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {plans.map((p, i) => (
            <div key={p.lookup_key} data-testid={`checkout-plan-${p.lookup_key}`} className={`border p-8 ${i === 1 ? "border-blue-600 bg-blue-50/30" : "border-slate-200"}`}>
              {i === 1 && <div className="text-xs uppercase tracking-[0.2em] text-blue-600 mb-3">Mais popular</div>}
              <h3 className="font-display text-2xl font-bold">{p.name}</h3>
              <div className="mt-6"><span className="text-4xl font-display font-bold">R$ {(p.amount/100).toFixed(0)}</span></div>
              <div className="text-slate-500 text-sm">{p.days} dias de acesso</div>
              <button data-testid={`checkout-btn-${p.lookup_key}`} onClick={() => checkout(p.lookup_key)} disabled={loading === p.lookup_key} className="mt-8 w-full bg-black hover:bg-slate-800 text-white py-3 rounded font-medium">{loading === p.lookup_key ? "Redirecionando..." : "Assinar"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
