import React, { useEffect, useState } from "react";
import api, { fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, X, Minus, Package } from "lucide-react";

export default function Estoque() {
  const { can } = useAuth();
  const [cats, setCats] = useState([]);
  const [prods, setProds] = useState([]);
  const [tab, setTab] = useState("all");
  const [form, setForm] = useState(null);
  const [catForm, setCatForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [adjust, setAdjust] = useState(null);
  const canEdit = can("estoque", "edit");

  const load = async () => {
    const [c, p] = await Promise.all([api.get("/categories"), api.get("/products")]);
    setCats(c.data.categories); setProds(p.data.products);
  };
  useEffect(() => { load(); }, []);

  const filtered = tab === "all" ? prods : prods.filter(p => p.category_id === tab);

  const saveCat = async () => { if (!catName) return; await api.post("/categories", { name: catName }); setCatName(""); setCatForm(false); load(); };
  const delCat = async (id) => { if (!window.confirm("Excluir categoria?")) return; await api.delete(`/categories/${id}`); load(); };
  const saveProd = async () => {
    try {
      const body = { ...form, quantity: parseInt(form.quantity)||0 };
      if (form.id) await api.put(`/products/${form.id}`, body); else await api.post("/products", body);
      toast.success("Salvo"); setForm(null); load();
    } catch(e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const delProd = async (id) => { if (!window.confirm("Excluir?")) return; await api.delete(`/products/${id}`); load(); };
  const doAdjust = async () => { await api.post(`/products/${adjust.id}/adjust`, { delta: adjust.delta, reason: adjust.reason }); setAdjust(null); load(); toast.success("Estoque ajustado"); };
  const uploadPhoto = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    const { data } = await api.post("/upload", fd);
    setForm({...form, photo_path: data.file.storage_path});
    toast.success("Foto anexada");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">Estoque</h1><p className="text-slate-500 text-sm">Materiais e categorias</p></div>
        {canEdit && <div className="flex gap-2">
          <button data-testid="cat-new-btn" onClick={()=>setCatForm(true)} className="border px-4 py-2 rounded">+ Categoria</button>
          <button data-testid="prod-new-btn" onClick={()=>setForm({name:"", category_id: cats[0]?.id||"", sku:"", quantity:0, unit:"un", photo_path:"", notes:""})} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Produto</button>
        </div>}
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        <button data-testid="cat-tab-all" onClick={()=>setTab("all")} className={`px-3 py-1 text-sm ${tab==="all"?"bg-black text-white":"border"}`}>Todos ({prods.length})</button>
        {cats.map(c => <div key={c.id} className="flex items-center">
          <button data-testid={`cat-tab-${c.id}`} onClick={()=>setTab(c.id)} className={`px-3 py-1 text-sm ${tab===c.id?"bg-black text-white":"border"}`}>{c.name} ({prods.filter(p=>p.category_id===c.id).length})</button>
          {canEdit && <button onClick={()=>delCat(c.id)} className="text-red-500 ml-1 text-xs" data-testid={`cat-del-${c.id}`}><X size={12}/></button>}
        </div>)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(p => (
          <div key={p.id} data-testid={`prod-card-${p.id}`} className="grid-panel p-4">
            {p.photo_path ? <img src={fileUrl(p.photo_path)} alt={p.name} className="w-full h-32 object-cover border mb-3"/> : <div className="w-full h-32 bg-slate-100 flex items-center justify-center mb-3"><Package className="text-slate-400"/></div>}
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-slate-500">{cats.find(c=>c.id===p.category_id)?.name}</div>
            <div className="mt-2"><span className="font-display text-2xl font-bold">{p.quantity}</span> <span className="text-sm text-slate-500">{p.unit}</span></div>
            {p.reserved > 0 && <div className="text-xs text-orange-600">{p.reserved} reservado(s)</div>}
            {canEdit && <div className="flex gap-1 mt-3">
              <button data-testid={`prod-plus-${p.id}`} onClick={()=>setAdjust({id:p.id, delta:1, reason:"Compra"})} className="border px-2 py-1 flex-1 text-xs flex items-center justify-center gap-1"><Plus size={12}/></button>
              <button data-testid={`prod-minus-${p.id}`} onClick={()=>setAdjust({id:p.id, delta:-1, reason:"Baixa"})} className="border px-2 py-1 flex-1 text-xs flex items-center justify-center gap-1"><Minus size={12}/></button>
              <button data-testid={`prod-edit-${p.id}`} onClick={()=>setForm(p)} className="border px-2 py-1 text-xs">Editar</button>
              <button data-testid={`prod-del-${p.id}`} onClick={()=>delProd(p.id)} className="text-red-500 px-2"><Trash2 size={12}/></button>
            </div>}
          </div>
        ))}
        {filtered.length===0 && <div className="col-span-full text-center p-12 text-slate-500 grid-panel">Nenhum produto</div>}
      </div>

      {catForm && <Modal onClose={()=>setCatForm(false)} title="Nova categoria">
        <input data-testid="cat-name-input" autoFocus value={catName} onChange={e=>setCatName(e.target.value)} className="w-full border rounded px-2 py-2" placeholder="Ex: Insumos"/>
        <button data-testid="cat-save" onClick={saveCat} className="mt-3 w-full bg-black text-white py-2 rounded">Criar</button>
      </Modal>}

      {form && <Modal onClose={()=>setForm(null)} title={form.id?"Editar produto":"Novo produto"}>
        <div className="space-y-3">
          <div><label className="text-sm">Nome</label><input data-testid="prod-name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div><label className="text-sm">Categoria</label><select data-testid="prod-cat" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} className="w-full border rounded px-2 py-2 mt-1">{cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-sm">Qtd</label><input data-testid="prod-qty" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
            <div><label className="text-sm">Unid.</label><input data-testid="prod-unit" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
            <div><label className="text-sm">SKU</label><input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          </div>
          <div><label className="text-sm">Foto (opcional)</label><input data-testid="prod-photo" type="file" accept="image/*" onChange={uploadPhoto} className="w-full border rounded px-2 py-2 mt-1 text-sm"/>{form.photo_path && <div className="text-xs text-green-600 mt-1">Foto anexada</div>}</div>
          <button data-testid="prod-save" onClick={saveProd} className="w-full bg-black text-white py-2 rounded">Salvar</button>
        </div>
      </Modal>}

      {adjust && <Modal onClose={()=>setAdjust(null)} title={adjust.delta>0?"Adicionar estoque":"Baixar estoque"}>
        <div className="space-y-3">
          <div><label className="text-sm">Quantidade ({adjust.delta>0?"+":"−"})</label><input data-testid="adj-qty" type="number" min="1" value={Math.abs(adjust.delta)} onChange={e=>setAdjust({...adjust, delta: (adjust.delta>0?1:-1)*(parseInt(e.target.value)||1)})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div><label className="text-sm">Motivo</label><input data-testid="adj-reason" value={adjust.reason} onChange={e=>setAdjust({...adjust, reason:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <button data-testid="adj-save" onClick={doAdjust} className="w-full bg-black text-white py-2 rounded">Confirmar</button>
        </div>
      </Modal>}
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"><div className="bg-white w-full max-w-md border my-8"><div className="border-b flex justify-between p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div><div className="p-6">{children}</div></div></div>;
}
