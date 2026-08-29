import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, X, History } from "lucide-react";

export default function Obras() {
  const { can } = useAuth();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [history, setHistory] = useState(null);
  const canEdit = can("obras", "edit");

  const load = async () => { const { data } = await api.get("/clients"); setClients(data.clients); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (form.id) await api.put(`/clients/${form.id}`, form);
      else await api.post("/clients", form);
      toast.success("Salvo"); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { if (!window.confirm("Excluir?")) return; await api.delete(`/clients/${id}`); load(); };
  const openHistory = async (c) => { const { data } = await api.get(`/clients/${c.id}/history`); setHistory({ client: c, orders: data.history }); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">Obras · Clientes</h1><p className="text-slate-500 text-sm">Cadastro e histórico</p></div>
        {canEdit && <button data-testid="obras-new-btn" onClick={()=>setForm({name:"",contact_name:"",phone:"",email:"",address:"",notes:""})} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Novo cliente</button>}
      </div>
      <div className="grid-panel">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Nome</th><th className="p-3">Contato</th><th className="p-3">Telefone</th><th className="p-3">Endereço</th><th className="p-3"></th></tr></thead>
          <tbody>{clients.map(c => (
            <tr key={c.id} className="border-t hover:bg-slate-50">
              <td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.contact_name}</td><td className="p-3">{c.phone}</td><td className="p-3 text-slate-500">{c.address}</td>
              <td className="p-3 text-right">
                <button data-testid={`obra-hist-${c.id}`} onClick={()=>openHistory(c)} className="text-slate-500 mr-2"><History size={14}/></button>
                {canEdit && <>
                  <button data-testid={`obra-edit-${c.id}`} onClick={()=>setForm(c)} className="text-blue-600 mr-2 text-xs">Editar</button>
                  <button data-testid={`obra-del-${c.id}`} onClick={()=>del(c.id)} className="text-red-500"><Trash2 size={14}/></button>
                </>}
              </td>
            </tr>
          ))}{clients.length===0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">Nenhum cliente</td></tr>}</tbody>
        </table>
      </div>

      {form && <Modal onClose={()=>setForm(null)} title={form.id?"Editar cliente":"Novo cliente"}>
        <div className="space-y-3">
          {[["Nome *","name"],["Nome do contato","contact_name"],["Telefone","phone"],["Email","email"],["Endereço","address"]].map(([l,k]) => (
            <div key={k}><label className="text-sm">{l}</label><input data-testid={`cli-${k}`} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          ))}
          <div><label className="text-sm">Observações</label><textarea data-testid="cli-notes" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <button data-testid="cli-save" onClick={save} className="w-full bg-black text-white py-2 rounded">Salvar</button>
        </div>
      </Modal>}

      {history && <Modal onClose={()=>setHistory(null)} title={`Histórico · ${history.client.name}`}>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.orders.length === 0 && <div className="text-sm text-slate-500">Sem O.S. registradas</div>}
          {history.orders.map(o => (
            <div key={o.id} className="border border-slate-200 p-3 text-sm">
              <div className="flex justify-between"><b>{o.title}</b><span className="text-xs text-slate-500">{o.scheduled_date}</span></div>
              <div className="text-slate-600 mt-1">{o.description}</div>
              <div className="text-xs text-slate-400 mt-1">Status: {o.status}</div>
            </div>
          ))}
        </div>
      </Modal>}
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"><div className="bg-white w-full max-w-lg border my-8"><div className="border-b flex justify-between p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div><div className="p-6">{children}</div></div></div>;
}
