import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function CreateCompany() {
  const [form, setForm] = useState({ name: "", cnpj: "", email: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/companies", form);
      await refresh();
      toast.success("Empresa criada!");
      nav("/app");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 402) { toast.error("Assinatura necessária"); nav("/planos"); }
      else toast.error(detail || "Erro");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-blue-600">Etapa 3 de 3</div>
          <h1 className="font-display text-3xl font-bold mt-2">Cadastro da empresa</h1>
          <p className="text-slate-600 mt-1">Preencha os dados para configurar seu ERP.</p>
        </div>
        <form onSubmit={submit} className="bg-white border border-slate-200 p-8 space-y-5">
          <Field label="Nome da empresa *" testid="company-name" value={form.name} onChange={v => setForm({...form, name: v})} required/>
          <Field label="CNPJ *" testid="company-cnpj" value={form.cnpj} onChange={v => setForm({...form, cnpj: v})} required/>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Email" testid="company-email" type="email" value={form.email} onChange={v => setForm({...form, email: v})}/>
            <Field label="Telefone" testid="company-phone" value={form.phone} onChange={v => setForm({...form, phone: v})}/>
          </div>
          <Field label="Endereço" testid="company-address" value={form.address} onChange={v => setForm({...form, address: v})}/>
          <button data-testid="company-submit" disabled={loading} className="w-full bg-black hover:bg-slate-800 text-white py-3 rounded font-medium">{loading ? "Criando..." : "Criar empresa e acessar sistema"}</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, testid, value, onChange, type="text", required }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input data-testid={testid} type={type} required={required} value={value} onChange={e => onChange(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
    </div>
  );
}
