import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, X, Wrench } from "lucide-react";

export default function Garage() {
  const { can } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(null);
  const [maint, setMaint] = useState(null);
  const canEdit = can("garage", "edit");

  const load = async () => { const { data } = await api.get("/vehicles"); setVehicles(data.vehicles); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...form, year: parseInt(form.year)||null, km: parseInt(form.km)||0 };
      if (form.id) await api.put(`/vehicles/${form.id}`, body);
      else await api.post("/vehicles", body);
      toast.success("Salvo"); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { if (!window.confirm("Excluir?")) return; await api.delete(`/vehicles/${id}`); load(); };
  const addMaint = async () => { await api.post(`/vehicles/${maint.vid}/maintenance`, { description: maint.description, km: parseInt(maint.km)||null }); setMaint(null); load(); toast.success("Manutenção registrada"); };

  const statusColor = { available: "bg-green-100 text-green-700", in_use: "bg-blue-100 text-blue-700", maintenance: "bg-orange-100 text-orange-700" };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">Garagem</h1><p className="text-slate-500 text-sm">Frota da empresa</p></div>
        {canEdit && <button data-testid="garage-new-btn" onClick={()=>setForm({plate:"", model:"", year:"", km:0, status:"available", notes:""})} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Novo veículo</button>}
      </div>
      <div className="grid-panel">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Placa</th><th className="p-3">Modelo</th><th className="p-3">Ano</th><th className="p-3">KM</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>{vehicles.map(v => (
            <tr key={v.id} className="border-t hover:bg-slate-50">
              <td className="p-3 font-mono">{v.plate}</td>
              <td className="p-3">{v.model}</td>
              <td className="p-3">{v.year || "—"}</td>
              <td className="p-3">{v.km}</td>
              <td className="p-3"><span className={`text-xs px-2 py-0.5 ${statusColor[v.status]}`}>{v.status}</span></td>
              <td className="p-3 text-right">
                {canEdit && <>
                  <button data-testid={`veh-maint-${v.id}`} onClick={()=>setMaint({vid: v.id, description:"", km:""})} className="text-slate-500 mr-2"><Wrench size={14}/></button>
                  <button data-testid={`veh-edit-${v.id}`} onClick={()=>setForm(v)} className="text-blue-600 mr-2 text-xs">Editar</button>
                  <button data-testid={`veh-del-${v.id}`} onClick={()=>del(v.id)} className="text-red-500"><Trash2 size={14}/></button>
                </>}
              </td>
            </tr>
          ))}{vehicles.length===0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">Nenhum veículo</td></tr>}</tbody>
        </table>
      </div>

      {form && <Modal onClose={()=>setForm(null)} title={form.id?"Editar veículo":"Novo veículo"}>
        <div className="space-y-3">
          {[["Placa","plate"],["Modelo","model"],["Ano","year"],["KM","km"]].map(([l,k]) => (
            <div key={k}><label className="text-sm">{l}</label><input data-testid={`veh-${k}`} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          ))}
          <div><label className="text-sm">Status</label><select data-testid="veh-status" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"><option value="available">Disponível</option><option value="in_use">Em uso</option><option value="maintenance">Manutenção</option></select></div>
          <button data-testid="veh-save" onClick={save} className="w-full bg-black text-white py-2 rounded">Salvar</button>
        </div>
      </Modal>}

      {maint && <Modal onClose={()=>setMaint(null)} title="Registrar manutenção">
        <div className="space-y-3">
          <div><label className="text-sm">Descrição / falha</label><textarea data-testid="maint-desc" value={maint.description} onChange={e=>setMaint({...maint,description:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div><label className="text-sm">KM atual</label><input data-testid="maint-km" type="number" value={maint.km} onChange={e=>setMaint({...maint,km:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <button data-testid="maint-save" onClick={addMaint} className="w-full bg-black text-white py-2 rounded">Registrar</button>
        </div>
      </Modal>}
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4">
      <div className="bg-white w-full max-w-md border border-slate-200 my-8">
        <div className="border-b flex justify-between items-center p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
