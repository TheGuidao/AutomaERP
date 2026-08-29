import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";

export default function RMA() {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const canEdit = can("rma", "edit");

  const load = async () => {
    const [r, p] = await Promise.all([api.get("/rma"), api.get("/products").catch(()=>({data:{products:[]}}))]);
    setItems(r.data.rma); setProducts(p.data.products);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.post("/rma", form); toast.success("RMA aberto"); setForm(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { if (!window.confirm("Excluir?")) return; await api.delete(`/rma/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">RMA</h1><p className="text-slate-500 text-sm">Produtos com defeito</p></div>
        {canEdit && <button data-testid="rma-new-btn" onClick={()=>setForm({product_id: products[0]?.id||"", serial_number:"", problem:""})} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Abrir RMA</button>}
      </div>
      <div className="grid-panel">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Produto</th><th className="p-3">Nº série</th><th className="p-3">Problema</th><th className="p-3">Status</th><th className="p-3">Data</th><th className="p-3"></th></tr></thead>
          <tbody>{items.map(r => (
            <tr key={r.id} className="border-t hover:bg-slate-50">
              <td className="p-3">{r.product_name}</td><td className="p-3 font-mono">{r.serial_number}</td>
              <td className="p-3 text-slate-600">{r.problem}</td>
              <td className="p-3"><span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700">{r.status}</span></td>
              <td className="p-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="p-3 text-right">{canEdit && <button data-testid={`rma-del-${r.id}`} onClick={()=>del(r.id)} className="text-red-500"><Trash2 size={14}/></button>}</td>
            </tr>
          ))}{items.length===0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">Nenhum RMA</td></tr>}</tbody>
        </table>
      </div>
      {form && <Modal onClose={()=>setForm(null)} title="Abrir RMA">
        <div className="space-y-3">
          <div><label className="text-sm">Produto</label><select data-testid="rma-product" value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})} className="w-full border rounded px-2 py-2 mt-1">{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="text-sm">Número de série</label><input data-testid="rma-serial" value={form.serial_number} onChange={e=>setForm({...form,serial_number:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div><label className="text-sm">Problema apresentado</label><textarea data-testid="rma-problem" value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})} className="w-full border rounded px-2 py-2 mt-1" rows={3}/></div>
          <button data-testid="rma-save" onClick={save} className="w-full bg-black text-white py-2 rounded">Abrir RMA</button>
        </div>
      </Modal>}
    </div>
  );
}
function Modal({ children, onClose, title }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4"><div className="bg-white w-full max-w-md border my-8"><div className="border-b flex justify-between p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div><div className="p-6">{children}</div></div></div>;
}
