import React, { useEffect, useState, useRef, useMemo } from "react";
import api, { fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, Edit3, X, CheckCircle2, Upload, Paperclip } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

export default function Agenda() {
  const { can, user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [finalize, setFinalize] = useState(null);
  const [q, setQ] = useState("");
  const canEdit = can("agenda", "edit");

  const load = async () => {
    const [o, c, e, v, p] = await Promise.all([
      api.get("/orders"), api.get("/clients"), api.get("/employees"),
      api.get("/vehicles").catch(()=>({data:{vehicles:[]}})),
      api.get("/products").catch(()=>({data:{products:[]}})),
    ]);
    setOrders(o.data.orders); setClients(c.data.clients);
    setEmployees(e.data.employees); setVehicles(v.data.vehicles); setProducts(p.data.products);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => setForm({ client_id: "", title: "", description: "", scheduled_date: new Date().toISOString().slice(0,10), start_time: "08:00", end_time: "12:00", employee_ids: [], vehicle_id: "", materials: [] });
  const openEdit = (o) => setForm({ ...o, vehicle_id: o.vehicle_id || "", materials: o.materials || [] });

  const save = async () => {
    try {
      const body = { ...form, vehicle_id: form.vehicle_id || null };
      if (form.id) await api.put(`/orders/${form.id}`, body);
      else await api.post("/orders", body);
      toast.success("O.S. salva"); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { if (!window.confirm("Excluir?")) return; await api.delete(`/orders/${id}`); load(); };

  const filteredOrders = useMemo(
    () => orders.filter(o => !q || [o.title, o.description, o.client_snapshot?.name].filter(Boolean).some(f=>f.toLowerCase().includes(q.toLowerCase()))),
    [orders, q]
  );
  const groupedByDate = useMemo(
    () => filteredOrders.reduce((acc, o) => { (acc[o.scheduled_date] = acc[o.scheduled_date] || []).push(o); return acc; }, {}),
    [filteredOrders]
  );
  const dates = useMemo(() => Object.keys(groupedByDate).sort(), [groupedByDate]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl font-bold">Agenda</h1><p className="text-slate-500 text-sm">Ordens de serviço</p></div>
        {canEdit && <button data-testid="agenda-new-btn" onClick={openNew} className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"><Plus size={16}/> Nova O.S.</button>}
      </div>

      <input data-testid="agenda-search" placeholder="Buscar por título, cliente ou descrição..." value={q} onChange={e=>setQ(e.target.value)} className="border border-border rounded px-3 py-2 bg-transparent text-sm max-w-md w-full"/>

      {dates.length === 0 && <div className="grid-panel p-12 text-center text-muted-foreground">Nenhuma O.S. encontrada</div>}
      {dates.map(date => (
        <div key={date} className="grid-panel">
          <div className="grid-panel-header"><h3 className="font-display font-semibold">{new Date(date+"T12:00").toLocaleDateString("pt-BR", {weekday:"long", day:"numeric", month:"long"})}</h3></div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupedByDate[date].map(o => (
              <div key={o.id} data-testid={`os-card-${o.id}`} className="border border-slate-200 p-4 hover:border-black cursor-pointer" onClick={()=>setDetail(o)}>
                <div className="flex justify-between items-start">
                  <div className="font-medium">{o.title}</div>
                  <span className={`text-xs px-2 py-0.5 ${o.status === "finalized" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{o.status}</span>
                </div>
                <div className="text-sm text-slate-500 mt-1">{o.client_snapshot?.name}</div>
                <div className="text-xs text-slate-400 mt-1">{o.start_time} - {o.end_time}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {form && <OSForm form={form} setForm={setForm} clients={clients} employees={employees} vehicles={vehicles} products={products} onSave={save} onClose={()=>setForm(null)}/>}
      {detail && <OSDetail order={detail} onClose={()=>setDetail(null)} onEdit={()=>{ openEdit(detail); setDetail(null); }} onDelete={()=>{del(detail.id); setDetail(null);}} onFinalize={()=>{setFinalize(detail); setDetail(null);}} canEdit={canEdit} products={products} employees={employees} vehicles={vehicles} onRefresh={load}/>}
      {finalize && <OSFinalizeModal order={finalize} onClose={()=>setFinalize(null)} onDone={()=>{setFinalize(null); load();}}/>}
    </div>
  );
}

function OSForm({ form, setForm, clients, employees, vehicles, products, onSave, onClose }) {
  const upd = (k, v) => setForm({...form, [k]: v});
  const toggleEmp = (id) => upd("employee_ids", form.employee_ids.includes(id) ? form.employee_ids.filter(x=>x!==id) : [...form.employee_ids, id]);
  const addMat = () => upd("materials", [...form.materials, { product_id: products[0]?.id || "", quantity_taken: 1 }]);
  const updMat = (i, k, v) => { const m = [...form.materials]; m[i] = {...m[i], [k]: v}; upd("materials", m); };
  const rmMat = (i) => upd("materials", form.materials.filter((_,idx)=>idx!==i));

  return (
    <Modal onClose={onClose} title={form.id ? "Editar O.S." : "Nova O.S."} testid="os-form">
      <div className="space-y-4">
        <Row label="Cliente"><select data-testid="os-client-select" value={form.client_id} onChange={e=>upd("client_id", e.target.value)} className="w-full border rounded px-2 py-2"><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Row>
        <Row label="Título"><input data-testid="os-title" value={form.title} onChange={e=>upd("title", e.target.value)} className="w-full border rounded px-2 py-2"/></Row>
        <Row label="Descrição"><textarea data-testid="os-desc" value={form.description} onChange={e=>upd("description", e.target.value)} className="w-full border rounded px-2 py-2" rows={2}/></Row>
        <div className="grid grid-cols-3 gap-3">
          <Row label="Data"><input data-testid="os-date" type="date" value={form.scheduled_date} onChange={e=>upd("scheduled_date", e.target.value)} className="w-full border rounded px-2 py-2"/></Row>
          <Row label="Início"><input data-testid="os-start" type="time" value={form.start_time} onChange={e=>upd("start_time", e.target.value)} className="w-full border rounded px-2 py-2"/></Row>
          <Row label="Fim"><input data-testid="os-end" type="time" value={form.end_time} onChange={e=>upd("end_time", e.target.value)} className="w-full border rounded px-2 py-2"/></Row>
        </div>
        <Row label="Funcionários">
          <div className="flex flex-wrap gap-2">
            {employees.map(e => (
              <button key={e.id} type="button" data-testid={`os-emp-${e.id}`} onClick={()=>toggleEmp(e.id)} className={`px-3 py-1 text-sm border ${form.employee_ids.includes(e.id) ? "bg-black text-white" : "bg-white"}`}>{e.name}</button>
            ))}
          </div>
        </Row>
        <Row label="Veículo"><select data-testid="os-vehicle" value={form.vehicle_id || ""} onChange={e=>upd("vehicle_id", e.target.value)} className="w-full border rounded px-2 py-2"><option value="">Nenhum</option>{vehicles.filter(v=>v.status==="available"||v.id===form.vehicle_id).map(v => <option key={v.id} value={v.id}>{v.plate} - {v.model}</option>)}</select></Row>
        <Row label="Materiais">
          {form.materials.map((m, i) => (
            <div key={m._id || `mat-${i}`} className="flex gap-2 mb-2">
              <select value={m.product_id} onChange={e=>updMat(i,"product_id",e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.quantity - (p.reserved||0)} disp.)</option>)}</select>
              <input type="number" min="1" value={m.quantity_taken} onChange={e=>updMat(i,"quantity_taken",parseInt(e.target.value)||1)} className="w-20 border rounded px-2 py-1 text-sm"/>
              <button type="button" onClick={()=>rmMat(i)} className="text-red-500 px-2"><X size={14}/></button>
            </div>
          ))}
          {products.length>0 && <button type="button" data-testid="os-add-material" onClick={addMat} className="text-sm text-blue-600">+ Adicionar material</button>}
        </Row>
        <div className="flex gap-2 pt-4 border-t">
          <button data-testid="os-save-btn" onClick={onSave} className="bg-black text-white px-4 py-2 rounded flex-1">Salvar</button>
          <button onClick={onClose} className="border px-4 py-2 rounded">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function OSDetail({ order, onClose, onEdit, onDelete, onFinalize, canEdit, products, employees, vehicles, onRefresh }) {
  const fileInput = useRef();
  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try { await api.post(`/orders/${order.id}/attach`, fd); toast.success("Anexado"); onRefresh(); }
    catch (err) { toast.error("Erro no upload"); }
  };
  const productName = (id) => products.find(p=>p.id===id)?.name || id;
  const empName = (id) => employees.find(e=>e.id===id)?.name || id;
  const veh = vehicles.find(v=>v.id===order.vehicle_id);

  return (
    <Modal onClose={onClose} title={order.title} testid="os-detail">
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 items-center"><span className={`text-xs px-2 py-0.5 ${order.status==="finalized"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700"}`}>{order.status}</span><span className="text-slate-500">{order.scheduled_date} {order.start_time}-{order.end_time}</span></div>
        <div><b>Cliente:</b> {order.client_snapshot?.name} · {order.client_snapshot?.phone}</div>
        <div><b>Endereço:</b> {order.client_snapshot?.address}</div>
        <div><b>Descrição:</b> {order.description || "—"}</div>
        {order.previous_notes && <div className="border-l-2 border-blue-600 pl-3 bg-blue-50/40 p-2"><b>Da última O.S.:</b> {order.previous_notes}</div>}
        <div><b>Funcionários:</b> {order.employee_ids.map(empName).join(", ") || "—"}</div>
        {veh && <div><b>Veículo:</b> {veh.plate} - {veh.model}</div>}
        {order.materials?.length > 0 && <div><b>Materiais:</b><ul className="list-disc pl-5">{order.materials.map((m)=><li key={m.product_id}>{productName(m.product_id)} × {m.quantity_taken}</li>)}</ul></div>}
        {order.attachments?.length > 0 && <div><b>Anexos:</b><ul className="pl-1 space-y-1">{order.attachments.map(a => <li key={a.id}><a href={fileUrl(a.path)} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1"><Paperclip size={12}/>{a.filename}</a></li>)}</ul></div>}
        {order.signature_path && <div><b>Assinatura:</b><br/><img src={fileUrl(order.signature_path)} alt="assinatura" className="border max-h-32 mt-1"/></div>}
        <div className="flex gap-2 pt-4 border-t flex-wrap">
          {canEdit && order.status !== "finalized" && <>
            <button data-testid="os-detail-edit" onClick={onEdit} className="border px-3 py-2 rounded flex items-center gap-1"><Edit3 size={14}/>Editar</button>
            <button data-testid="os-detail-finalize" onClick={onFinalize} className="bg-green-600 text-white px-3 py-2 rounded flex items-center gap-1"><CheckCircle2 size={14}/>Finalizar</button>
            <button data-testid="os-detail-attach" onClick={()=>fileInput.current?.click()} className="border px-3 py-2 rounded flex items-center gap-1"><Upload size={14}/>Anexar</button>
            <input type="file" hidden ref={fileInput} onChange={upload}/>
            <button data-testid="os-detail-delete" onClick={onDelete} className="border border-red-300 text-red-600 px-3 py-2 rounded flex items-center gap-1"><Trash2 size={14}/>Excluir</button>
          </>}
        </div>
      </div>
    </Modal>
  );
}

function OSFinalizeModal({ order, onClose, onDone }) {
  const sigRef = useRef();
  const [used, setUsed] = useState(order.materials.map(m => ({...m, quantity_used: m.quantity_taken})));
  const [notes, setNotes] = useState("");

  const submit = async () => {
    const sig = sigRef.current?.isEmpty?.() ? null : sigRef.current?.toDataURL("image/png");
    try {
      await api.post(`/orders/${order.id}/finalize`, { materials_used: used, signature_base64: sig, notes });
      toast.success("O.S. finalizada"); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  return (
    <Modal onClose={onClose} title="Finalizar O.S." testid="os-finalize">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Materiais efetivamente usados</label>
          {used.map((m,i) => (
            <div key={m.product_id} className="flex items-center gap-2 mt-1 text-sm">
              <span className="flex-1">Produto</span>
              <input type="number" min="0" max={m.quantity_taken} value={m.quantity_used} onChange={e => { const u=[...used]; u[i]={...u[i], quantity_used: parseInt(e.target.value)||0}; setUsed(u); }} className="w-20 border rounded px-2 py-1"/>
              <span className="text-slate-500 text-xs">de {m.quantity_taken}</span>
            </div>
          ))}
          {used.length===0 && <div className="text-sm text-slate-500 mt-1">Sem materiais</div>}
        </div>
        <div>
          <label className="text-sm font-medium">Observações finais</label>
          <textarea data-testid="finalize-notes" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full border rounded px-2 py-2 mt-1" rows={2}/>
        </div>
        <div>
          <label className="text-sm font-medium">Assinatura do cliente</label>
          <div className="mt-1">
            <SignatureCanvas ref={sigRef} canvasProps={SIG_CANVAS_PROPS}/>
            <button type="button" onClick={()=>sigRef.current.clear()} className="text-xs text-slate-500 mt-1">Limpar</button>
          </div>
        </div>
        <div className="flex gap-2 pt-4 border-t">
          <button data-testid="finalize-submit" onClick={submit} className="bg-green-600 text-white px-4 py-2 rounded flex-1">Finalizar</button>
          <button onClick={onClose} className="border px-4 py-2 rounded">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

const SIG_CANVAS_PROPS = { className: "sig-canvas w-full h-40", "data-testid": "signature-pad" };

function Modal({ children, onClose, title, testid }) {
  return (
    <div data-testid={testid} className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card text-foreground w-full max-w-2xl border border-border my-8">
        <div className="border-b border-border flex justify-between items-center p-4"><h3 className="font-display font-semibold">{title}</h3><button onClick={onClose}><X size={18}/></button></div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Row({ label, children }) { return <div><label className="text-sm font-medium">{label}</label><div className="mt-1">{children}</div></div>; }
