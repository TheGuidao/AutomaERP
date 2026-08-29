import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await register(name, email, password); nav("/planos"); }
    catch (err) { toast.error(err.response?.data?.detail || "Erro"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden lg:flex flex-1 bg-blue-600 items-center justify-center p-16 text-white">
        <div className="max-w-md">
          <div className="text-sm uppercase tracking-[0.2em] text-blue-100 mb-4">AutomaERP</div>
          <h1 className="font-display text-4xl font-bold leading-tight">Comece em minutos.</h1>
          <p className="mt-4 text-blue-100">Crie sua conta, escolha um plano e configure sua empresa.</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold">Criar conta</h2>
          <p className="text-slate-500 text-sm mt-1">Etapa 1 de 3</p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium">Nome completo</label>
              <input data-testid="register-name" required value={name} onChange={e=>setName(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input data-testid="register-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
            </div>
            <div>
              <label className="text-sm font-medium">Senha</label>
              <input data-testid="register-password" type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
            </div>
          </div>
          <button data-testid="register-submit" disabled={loading} className="mt-6 w-full bg-black hover:bg-slate-800 text-white py-3 rounded font-medium">{loading ? "Criando..." : "Criar conta"}</button>
          <p className="mt-6 text-sm text-slate-500">Já tem conta? <Link to="/login" className="text-blue-600 font-medium">Entrar</Link></p>
        </form>
      </div>
    </div>
  );
}
