import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, StickyNote, Calendar as CalIcon, Car } from "lucide-react";

export default function Dashboard() {
  const { isCeo, can, company } = useAuth();
  const [orders, setOrders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [noteText, setNoteText] = useState("");

  const load = async () => {
    try {
      const [o, n, v] = await Promise.all([
        can("agenda") ? api.get("/orders") : Promise.resolve({data:{orders:[]}}),
        api.get("/notes"),
        can("garage") ? api.get("/vehicles") : Promise.resolve({data:{vehicles:[]}}),
      ]);
      setOrders(o.data.orders); setNotes(n.data.notes); setVehicles(v.data.vehicles);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const addNote = async () => {
    if (!noteText.trim()) return;
    try { await api.post("/notes", { text: noteText }); setNoteText(""); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const delNote = async (id) => { await api.delete(`/notes/${id}`); load(); };

  const today = new Date();
  const weekEnd = new Date(); weekEnd.setDate(today.getDate() + 7);
  const weekOrders = orders.filter(o => {
    const d = new Date(o.scheduled_date);
    return d >= new Date(today.toDateString()) && d <= weekEnd;
  });
  const availVehicles = vehicles.filter(v => v.status === "available");

  const canAddNote = isCeo || can("dashboard", "edit");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">{company?.name} · Visão geral da semana</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat title="O.S. na semana" value={weekOrders.length} icon={CalIcon}/>
        <Stat title="Veículos disponíveis" value={availVehicles.length} icon={Car}/>
        <Stat title="Notas" value={notes.length} icon={StickyNote}/>
        <Stat title="Frota total" value={vehicles.length} icon={Car}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid-panel">
          <div className="grid-panel-header"><h3 className="font-display font-semibold">Agenda da semana</h3></div>
          <div className="p-4">
            {weekOrders.length === 0 ? <div className="text-sm text-slate-500">Nenhuma O.S. agendada nesta semana</div> :
              <div className="space-y-2">{weekOrders.map(o => (
                <div key={o.id} data-testid={`dash-order-${o.id}`} className="border border-slate-200 p-3 flex justify-between text-sm">
                  <div><div className="font-medium">{o.title}</div><div className="text-slate-500">{o.client_snapshot?.name} · {o.scheduled_date} {o.start_time}-{o.end_time}</div></div>
                  <span className={`text-xs px-2 py-1 h-fit ${o.status === "finalized" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{o.status}</span>
                </div>
              ))}</div>
            }
          </div>
        </div>

        <div className="grid-panel">
          <div className="grid-panel-header"><h3 className="font-display font-semibold">Notas</h3></div>
          <div className="p-4">
            {canAddNote && (
              <div className="flex gap-2 mb-3">
                <input data-testid="dash-note-input" value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Recado para a equipe" className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"/>
                <button data-testid="dash-note-add" onClick={addNote} className="bg-black text-white px-3 rounded"><Plus size={14}/></button>
              </div>
            )}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {notes.map(n => (
                <div key={n.id} className="border-l-2 border-blue-600 pl-3 py-1 text-sm">
                  <div>{n.text}</div>
                  <div className="text-xs text-slate-400 flex justify-between mt-1">
                    <span>{n.author}</span>
                    {isCeo && <button data-testid={`dash-note-del-${n.id}`} onClick={()=>delNote(n.id)} className="text-red-500"><Trash2 size={12}/></button>}
                  </div>
                </div>
              ))}
              {notes.length === 0 && <div className="text-sm text-slate-500">Nenhuma nota</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, icon: Icon }) {
  return (
    <div className="grid-panel p-5">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{title}</div>
          <div className="font-display text-3xl font-bold mt-2">{value}</div>
        </div>
        <Icon className="text-blue-600" size={20}/>
      </div>
    </div>
  );
}
