import React, { useEffect, useState } from "react";
import api from "@/lib/api";

export default function MyAgenda() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.get("/orders/mine").then(r=>setOrders(r.data.orders)); }, []);

  const byDate = orders.reduce((a,o)=>{(a[o.scheduled_date]=a[o.scheduled_date]||[]).push(o); return a;}, {});
  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-bold">Minha Agenda</h1><p className="text-slate-500 text-sm">Seus serviços agendados</p></div>
      {dates.length===0 && <div className="grid-panel p-12 text-center text-slate-500">Nenhum serviço agendado para você</div>}
      {dates.map(d => (
        <div key={d} className="grid-panel">
          <div className="grid-panel-header"><h3 className="font-display font-semibold">{new Date(d+"T12:00").toLocaleDateString("pt-BR", {weekday:"long", day:"numeric", month:"long"})}</h3></div>
          <div className="p-4 space-y-3">
            {byDate[d].map(o => (
              <div key={o.id} data-testid={`my-order-${o.id}`} className="border border-slate-200 p-4">
                <div className="flex justify-between"><b>{o.title}</b><span className={`text-xs px-2 py-0.5 ${o.status==="finalized"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700"}`}>{o.status}</span></div>
                <div className="text-sm text-slate-600 mt-1">{o.client_snapshot?.name} · {o.start_time}-{o.end_time}</div>
                <div className="text-xs text-slate-500 mt-1">{o.client_snapshot?.address}</div>
                <div className="text-sm mt-2">{o.description}</div>
                {o.materials?.length>0 && <div className="text-xs mt-2 text-slate-600">Materiais: {o.materials.map(m=>`${m.quantity_taken}×`).join(", ")}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
