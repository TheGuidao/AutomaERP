import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await login(email, password); nav("/app"); }
    catch (err) { toast.error(err.response?.data?.detail || "Erro ao entrar"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden lg:flex flex-1 bg-slate-900 items-center justify-center p-16 text-white">
        <div className="max-w-md">
          <div className="text-sm uppercase tracking-[0.2em] text-blue-400 mb-4">AutomaERP</div>
          <h1 className="font-display text-4xl font-bold leading-tight">Gestão completa para automação.</h1>
          <p className="mt-4 text-slate-300">Entre para acessar sua empresa.</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold">Entrar</h2>
          <p className="text-slate-500 text-sm mt-1">Acesse sua conta</p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input data-testid="login-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
            </div>
            <div>
              <label className="text-sm font-medium">Senha</label>
              <input data-testid="login-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full mt-1 border border-slate-300 px-3 py-2 rounded outline-none focus:border-blue-600"/>
            </div>
          </div>
          <button data-testid="login-submit" disabled={loading} className="mt-6 w-full bg-black hover:bg-slate-800 text-white py-3 rounded font-medium">{loading ? "Entrando..." : "Entrar"}</button>
          <p className="mt-6 text-sm text-slate-500">Não tem conta? <Link to="/register" className="text-blue-600 font-medium">Cadastre-se</Link></p>
        </form>
      </div>
    </div>
  );
}
