import React from "react";
import { Link } from "react-router-dom";
export default function PaymentCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-md text-center border border-slate-200 p-12">
        <h1 className="font-display text-2xl font-bold">Pagamento cancelado</h1>
        <p className="text-slate-500 mt-2">Você pode tentar novamente quando quiser.</p>
        <Link data-testid="payment-cancel-back" to="/planos" className="inline-block mt-6 bg-black text-white px-6 py-3 rounded">Voltar aos planos</Link>
      </div>
    </div>
  );
}
