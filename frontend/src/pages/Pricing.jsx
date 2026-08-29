import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { Tag, CheckCircle2 } from "lucide-react";

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [validated, setValidated] = useState({});
  const { logout, user, company, subscriptionActive, isPlatformAdmin } = useAuth();

  useEffect(() => { api.get("/plans").then(r => setPlans(r.data.plans)); }, []);

  const validate = async (lookup_key) => {
    if (!couponCode) { setValidated({}); return; }
    try {
      const { data } = await api.post("/coupons/validate", { code: couponCode, lookup_key });
      setValidated({...validated, [lookup_key]: data});
    } catch (err) {
      console.error("Coupon validate failed:", err);
      toast.error("Erro validando cupom");
    }
  };

  const validateAll = async () => {
    const results = {};
    for (const p of plans) {
      try {
        const { data } = await api.post("/coupons/validate", { code: couponCode, lookup_key: p.lookup_key });
        results[p.lookup_key] = data;
      } catch (err) { console.error("Coupon validate failed:", err); }
    }
    setValidated(results);
    if (couponCode && Object.values(results).some(r => r.valid)) toast.success("Cupom aplicado!");
    else if (couponCode) toast.error("Cupom inválido");
  };

  const checkout = async (lookup_key) => {
    setLoading(lookup_key);
    try {
      const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin, coupon_code: couponCode || null });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); setLoading(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="font-display font-bold text-lg">AutomaERP</Link>
          <div className="flex gap-4 items-center">
            {isPlatformAdmin && <Link to="/admin/cupons" className="text-sm text-blue-600" data-testid="pricing-admin-link">Admin cupons</Link>}
            {company && subscriptionActive && <Link data-testid="pricing-goto-app" to="/app" className="text-sm text-blue-600">Ir para o sistema</Link>}
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <button data-testid="pricing-logout" onClick={logout} className="text-sm hover:opacity-70">Sair</button>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Escolha seu plano</h1>
        <p className="text-muted-foreground mt-2">Sua conta está criada. Para acessar o sistema, ative uma assinatura.</p>

        <div className="mt-8 max-w-md border border-border p-4 flex items-center gap-2">
          <Tag className="text-blue-600" size={16}/>
          <input data-testid="coupon-input" placeholder="Cupom de desconto (opcional)" value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase())} className="flex-1 bg-transparent outline-none text-sm"/>
          <button data-testid="coupon-apply" onClick={validateAll} className="text-sm bg-black dark:bg-white dark:text-black text-white px-3 py-1 rounded">Aplicar</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {plans.map((p, i) => {
            const v = validated[p.lookup_key];
            const finalAmount = v?.valid ? v.final_amount : p.amount;
            const hasDiscount = v?.valid && v.discount > 0;
            return (
              <div key={p.lookup_key} data-testid={`checkout-plan-${p.lookup_key}`} className={`border p-8 ${i === 1 ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/30" : "border-border"}`}>
                {i === 1 && <div className="text-xs uppercase tracking-[0.2em] text-blue-600 mb-3">Mais popular</div>}
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                <div className="mt-6">
                  {hasDiscount && <div className="text-sm text-muted-foreground line-through">R$ {(p.amount/100).toFixed(0)}</div>}
                  <span className="text-4xl font-display font-bold">R$ {(finalAmount/100).toFixed(0)}</span>
                  {finalAmount === 0 && <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5">GRÁTIS</span>}
                </div>
                <div className="text-muted-foreground text-sm">{p.days} dias de acesso</div>
                {hasDiscount && <div className="mt-2 text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> Cupom {couponCode} aplicado</div>}
                <button data-testid={`checkout-btn-${p.lookup_key}`} onClick={() => checkout(p.lookup_key)} disabled={loading === p.lookup_key} className="mt-8 w-full bg-black dark:bg-white dark:text-black text-white py-3 rounded font-medium">{loading === p.lookup_key ? "Redirecionando..." : (finalAmount === 0 ? "Ativar grátis" : "Assinar")}</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
