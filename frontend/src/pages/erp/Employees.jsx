import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, X, Edit3 } from "lucide-react";

const TABS = [
  {key:"dashboard", label:"Dashboard"},
  {key:"agenda", label:"Agenda"},
  {key:"obras", label:"Obras (Clientes)"},
  {key:"estoque", label:"Estoque"},
  {key:"garage", label:"Garagem"},
  {key:"rma", label:"RMA"},
  {key:"my_agenda", label:"Minha Agenda"},
];

export default function Employees() {
  const { isCeo } = useAuth();
  const [emps, setEmps] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);

  const load = async () => { const {data} = await api.get("/employees"); setEmps(data.employees); };
  useEffect(() => { load(); }, []);

  if (!isCeo) return <div className="grid-panel p-8 text-slate-500">Somente o CEO tem acesso a esta aba.</div>;

  const emptyPerms = () => TABS.reduce((a,t)=>{a[t.key]={view:false,edit:false};return a;}, {});
  const openNew = () => setForm({ name:"", email:"", password:"", role:"", permissions: emptyPerms(), _new:true });
  const save = async () => {
    try {
      if (form.id) {
        const body = { name: form.name, role: form.role, permissions: form.permissions };
        if (form.password) body.password = form.password;
        await api.put(`/employees/${form.id}`, body);
      } else {
        await api.post("/employees", { name: form.name, email: form.email, password: form.password, role: form.role, permissions: form.permissions });
      }
      toast.success("Salvo"); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { if (!window.confirm("Excluir funcionário?")) return; await api.delete(`/employees/${id}`); load(); };
  const togglePerm = (tab, action) => {
    const p = {...form.permissions};
    p[tab] = { ...(p[tab]||{}), [action]: !(p[tab]?.[action]) };
    if (action==="edit" && p[tab].edit) p[tab].view = true;
    if (action==="view" && !p[tab].view) p[tab].edit = false;
    setForm({...form, permissions: p});
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">Funcionários</h1><p className="text-slate-500 text-sm">Equipe e permissões</p></div>
        <button data-testid="emp-new-btn" onClick={openNew} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Novo funcionário</button>
      </div>
      <input data-testid="emp-search" placeholder="Buscar por nome, email ou função..." value={q} onChange={e=>setQ(e.target.value)} className="border border-border rounded px-3 py-2 bg-transparent text-sm max-w-md w-full"/>
      <div className="grid-panel">
        <table className="w-full text-sm">
          <thead className="text-left"><tr><th className="p-3">Nome</th><th className="p-3">Email</th><th className="p-3">Função</th><th className="p-3"></th></tr></thead>
          <tbody>{emps.filter(e=>!q||[e.name,e.email,e.role].filter(Boolean).some(f=>f.toLowerCase().includes(q.toLowerCase()))).map(e => (
            <tr key={e.id} className="border-t hover:bg-slate-50">
              <td className="p-3 font-medium">{e.name}</td><td className="p-3">{e.email}</td><td className="p-3">{e.role || (e.company_id && "—")}</td>
              <td className="p-3 text-right">
                <button data-testid={`emp-edit-${e.id}`} onClick={()=>setForm({...e, permissions: {...emptyPerms(), ...(e.permissions||{})}, password:""})} className="text-blue-600 mr-2 text-xs"><Edit3 size={14}/></button>
                <button data-testid={`emp-del-${e.id}`} onClick={()=>del(e.id)} className="text-red-500"><Trash2 size={14}/></button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {form && <Modal onClose={()=>setForm(null)} title={form.id?"Editar funcionário":"Novo funcionário"}>
        <div className="space-y-3">
          <div><label className="text-sm">Nome</label><input data-testid="emp-name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          {!form.id && <div><label className="text-sm">Email</label><input data-testid="emp-email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>}
          <div><label className="text-sm">Senha {form.id && "(deixe em branco para não alterar)"}</label><input data-testid="emp-password" type="password" value={form.password||""} onChange={e=>setForm({...form,password:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div><label className="text-sm">Função (ex: Projetista, Instalador)</label><input data-testid="emp-role" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="w-full border rounded px-2 py-2 mt-1"/></div>
          <div>
            <label className="text-sm font-medium">Permissões por aba</label>
            <div className="mt-2 border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="text-left p-2">Aba</th><th className="p-2">Ver</th><th className="p-2">Editar</th></tr></thead>
                <tbody>{TABS.map(t => (
                  <tr key={t.key} className="border-t">
                    <td className="p-2">{t.label}</td>
                    <td className="p-2 text-center"><input data-testid={`perm-${t.key}-view`} type="checkbox" checked={!!form.permissions?.[t.key]?.view} onChange={()=>togglePerm(t.key,"view")}/></td>
                    <td className="p-2 text-center"><input data-testid={`perm-${t.key}-edit`} type="checkbox" checked={!!form.permissions?.[t.key]?.edit} onChange={()=>togglePerm(t.key,"edit")}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <button data-testid="emp-save" onClick={save} className="w-full bg-black text-white py-2 rounded">Salvar</button>
        </div>
      </Modal>}
    </div>
  );
}
function Modal({ children, onClose, title }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"><div className="bg-card text-foreground w-full max-w-xl border border-border my-8"><div className="border-b border-border flex justify-between p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div><div className="p-6">{children}</div></div></div>;
}
