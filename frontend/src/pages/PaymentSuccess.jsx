import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sid = params.get("session_id");
  const { refresh, company } = useAuth();
  const [status, setStatus] = useState("polling");
  const nav = useNavigate();

  useEffect(() => {
    if (!sid) return;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const { data } = await api.get(`/payments/status/${sid}`);
        if (data.payment_status === "paid") {
          setStatus("paid");
          await refresh();
          return;
        }
      } catch (err) {
        console.error("Payment status poll failed:", err);
      }
      if (tries < 20) setTimeout(poll, 2000);
      else setStatus("timeout");
    };
    poll();
  }, [sid, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center border border-slate-200 p-12">
        {status === "polling" && <><Loader2 className="animate-spin mx-auto text-blue-600" size={40}/><h1 className="font-display text-2xl font-bold mt-4">Confirmando pagamento...</h1></>}
        {status === "paid" && <>
          <CheckCircle2 className="mx-auto text-green-600" size={40}/>
          <h1 className="font-display text-2xl font-bold mt-4">Pagamento aprovado!</h1>
          <p className="text-slate-500 mt-2">{company ? "Seu plano foi renovado." : "Agora configure sua empresa para começar."}</p>
          <button data-testid="payment-success-continue" onClick={() => nav(company ? "/app" : "/onboarding/company")} className="mt-8 bg-black text-white px-6 py-3 rounded">{company ? "Ir para o sistema" : "Configurar empresa"}</button>
        </>}
        {status === "timeout" && <>
          <h1 className="font-display text-2xl font-bold">Aguardando confirmação</h1>
          <p className="text-slate-500 mt-2">Se o pagamento foi aprovado, aparecerá em instantes.</p>
          <Link to="/planos" className="mt-6 inline-block text-blue-600">Voltar aos planos</Link>
        </>}
      </div>
    </div>
  );
}
