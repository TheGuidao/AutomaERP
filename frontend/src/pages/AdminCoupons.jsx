import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Plus, Trash2, X, ArrowLeft } from "lucide-react";

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(null);
  const { user } = useAuth();

  const load = async () => { const { data } = await api.get("/admin/coupons"); setCoupons(data.coupons); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...form,
        percent_off: form.percent_off ? parseInt(form.percent_off) : null,
        amount_off: form.amount_off ? parseInt(form.amount_off) : null,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null };
      await api.post("/admin/coupons", body);
      toast.success("Cupom criado"); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (code) => { if (!window.confirm("Excluir cupom?")) return; await api.delete(`/admin/coupons/${code}`); load(); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/app" className="text-sm flex items-center gap-2"><ArrowLeft size={14}/> Voltar ao ERP</Link>
          <span className="text-sm text-muted-foreground">Admin da plataforma · {user?.email}</span>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-blue-600">Admin</div>
            <h1 className="font-display text-3xl font-bold mt-1">Cupons de desconto</h1>
            <p className="text-muted-foreground text-sm">Crie códigos promocionais para o checkout dos planos.</p>
          </div>
          <button data-testid="coupon-new-btn" onClick={()=>setForm({code:"", description:"", percent_off:"", amount_off:"", max_uses:"", active:true})} className="bg-black dark:bg-white dark:text-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Novo cupom</button>
        </div>

        <div className="grid-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left"><th className="p-3">Código</th><th className="p-3">Desconto</th><th className="p-3">Usos</th><th className="p-3">Status</th><th className="p-3">Descrição</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.code} className="border-t border-border">
                  <td className="p-3 font-mono font-semibold">{c.code}</td>
                  <td className="p-3">{c.percent_off ? `${c.percent_off}%` : c.amount_off ? `R$ ${(c.amount_off/100).toFixed(2)}` : "—"}</td>
                  <td className="p-3">{c.uses || 0}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 ${c.active ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{c.active ? "Ativo" : "Inativo"}</span></td>
                  <td className="p-3 text-muted-foreground">{c.description}</td>
                  <td className="p-3 text-right"><button data-testid={`coupon-del-${c.code}`} onClick={()=>del(c.code)} className="text-red-500"><Trash2 size={14}/></button></td>
                </tr>
              ))}
              {coupons.length===0 && <tr><td colSpan="6" className="p-12 text-center text-muted-foreground">Nenhum cupom criado. Dica: <b>WELCOME</b> com 100% off = primeiro mês grátis.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4">
        <div className="bg-card text-foreground w-full max-w-md border border-border my-8">
          <div className="border-b border-border flex justify-between p-4"><h3 className="font-display font-semibold">Novo cupom</h3><button onClick={()=>setForm(null)}><X size={18}/></button></div>
          <div className="p-6 space-y-3">
            <div><label className="text-sm font-medium">Código *</label><input data-testid="cp-code" placeholder="WELCOME" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent"/></div>
            <div><label className="text-sm font-medium">Descrição</label><input data-testid="cp-desc" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm">% off (1-100)</label><input data-testid="cp-percent" type="number" value={form.percent_off} onChange={e=>setForm({...form,percent_off:e.target.value, amount_off:""})} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent"/></div>
              <div><label className="text-sm">R$ off (centavos)</label><input data-testid="cp-amount" type="number" value={form.amount_off} onChange={e=>setForm({...form,amount_off:e.target.value, percent_off:""})} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent"/></div>
            </div>
            <div><label className="text-sm">Máx. usos (vazio = ilimitado)</label><input data-testid="cp-max" type="number" value={form.max_uses} onChange={e=>setForm({...form,max_uses:e.target.value})} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent"/></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Ativo</label>
            <button data-testid="cp-save" onClick={save} className="w-full bg-black dark:bg-white dark:text-black text-white py-2 rounded">Criar cupom</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
