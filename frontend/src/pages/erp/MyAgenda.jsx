import React, { useEffect, useRef, useState } from "react";
import api, { fileUrl } from "@/lib/api";
import { toast } from "sonner";
import { X, Upload, CheckCircle2, Paperclip, MapPin, Users2, Package } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

export default function MyAgenda() {
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);
  const [finalize, setFinalize] = useState(null);

  const load = async () => {
    const r = await api.get("/orders/mine");
    setOrders(r.data.orders);
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (o) => {
    // refetch to get latest attachments and materials
    try {
      const { data } = await api.get(`/orders/${o.id}`);
      setDetail(data.order);
    } catch { setDetail(o); }
  };

  const byDate = orders.reduce((a,o)=>{(a[o.scheduled_date]=a[o.scheduled_date]||[]).push(o); return a;}, {});
  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-bold">Minha Agenda</h1><p className="text-muted-foreground text-sm">Toque em um serviço para abrir, anexar arquivos ou finalizar</p></div>
      {dates.length===0 && <div className="grid-panel p-12 text-center text-muted-foreground">Nenhum serviço agendado para você</div>}
      {dates.map(d => (
        <div key={d} className="grid-panel">
          <div className="grid-panel-header"><h3 className="font-display font-semibold">{new Date(d+"T12:00").toLocaleDateString("pt-BR", {weekday:"long", day:"numeric", month:"long"})}</h3></div>
          <div className="p-4 space-y-3">
            {byDate[d].map(o => (
              <button key={o.id} data-testid={`my-order-${o.id}`} onClick={()=>openDetail(o)} className="w-full text-left border border-border p-4 hover:border-blue-600 hover:bg-muted transition-colors">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium">{o.title}</div>
                  <span className={`text-xs px-2 py-0.5 ${o.status==="finalized"?"bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300":"bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>{o.status}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{o.client_snapshot?.name} · {o.start_time}-{o.end_time}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin size={12}/>{o.client_snapshot?.address}</div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {detail && <DetailModal order={detail} onClose={()=>setDetail(null)} onFinalize={()=>{ setFinalize(detail); setDetail(null); }} onRefresh={async()=>{ await load(); const r = await api.get(`/orders/${detail.id}`); setDetail(r.data.order); }}/>}
      {finalize && <FinalizeModal order={finalize} onClose={()=>setFinalize(null)} onDone={()=>{ setFinalize(null); load(); }}/>}
    </div>
  );
}

function DetailModal({ order, onClose, onFinalize, onRefresh }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const isDone = order.status === "finalized";

  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    try { await api.post(`/orders/${order.id}/attach`, fd); toast.success("Arquivo anexado"); await onRefresh(); }
    catch { toast.error("Erro no upload"); }
    finally { setUploading(false); e.target.value=""; }
  };

  return (
    <Modal onClose={onClose} title={order.title} testid="my-os-detail">
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-xs px-2 py-0.5 ${isDone?"bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300":"bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>{order.status}</span>
          <span className="text-muted-foreground">{order.scheduled_date} · {order.start_time}-{order.end_time}</span>
        </div>
        <Field label="Cliente">{order.client_snapshot?.name} {order.client_snapshot?.phone && <span className="text-muted-foreground">· {order.client_snapshot.phone}</span>}</Field>
        <Field label="Endereço"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.client_snapshot?.address || "")}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{order.client_snapshot?.address}</a></Field>
        <Field label="Descrição do serviço">{order.description || "—"}</Field>
        {order.previous_notes && <div className="border-l-2 border-blue-600 pl-3 bg-blue-50/40 dark:bg-blue-950/30 p-2"><b>Observações da última O.S. deste cliente:</b><br/>{order.previous_notes}</div>}
        {order.materials?.length > 0 && <div>
          <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-1 flex items-center gap-1"><Package size={12}/>Materiais a levar</div>
          <ul className="list-disc pl-5">{order.materials.map((m)=><li key={m.product_id}>Produto × {m.quantity_taken}</li>)}</ul>
        </div>}
        {order.attachments?.length > 0 && <div>
          <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-1">Anexos</div>
          <ul className="pl-1 space-y-1">{order.attachments.map(a => <li key={a.id}><a href={fileUrl(a.path)} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 text-sm"><Paperclip size={12}/>{a.filename}</a></li>)}</ul>
        </div>}
        {order.signature_path && <div>
          <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-1">Assinatura do cliente</div>
          <img src={fileUrl(order.signature_path)} alt="assinatura" className="border border-border max-h-32 bg-white"/>
        </div>}
        {isDone && order.final_notes && <Field label="Observações finais">{order.final_notes}</Field>}

        <div className="flex gap-2 pt-4 border-t border-border flex-wrap">
          {!isDone && <>
            <button data-testid="my-os-attach" onClick={()=>fileRef.current?.click()} disabled={uploading} className="border border-border px-3 py-2 rounded flex items-center gap-1"><Upload size={14}/>{uploading?"Enviando...":"Anexar arquivo"}</button>
            <input type="file" hidden ref={fileRef} onChange={upload}/>
            <button data-testid="my-os-finalize" onClick={onFinalize} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded flex items-center gap-1"><CheckCircle2 size={14}/>Finalizar O.S.</button>
          </>}
          {isDone && <div className="text-xs text-muted-foreground">O.S. finalizada. Não é possível alterar.</div>}
        </div>
      </div>
    </Modal>
  );
}

function FinalizeModal({ order, onClose, onDone }) {
  const sigRef = useRef();
  const [used, setUsed] = useState(order.materials.map(m => ({ product_id: m.product_id, quantity_taken: m.quantity_taken, quantity_used: m.quantity_taken })));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const sig = sigRef.current?.isEmpty?.() ? null : sigRef.current?.toDataURL("image/png");
    if (!sig && !window.confirm("Nenhuma assinatura foi capturada. Deseja finalizar mesmo assim?")) return;
    setSubmitting(true);
    try {
      const body = { materials_used: used.map(u => ({ product_id: u.product_id, quantity_taken: u.quantity_taken, quantity_used: u.quantity_used })), signature_base64: sig, notes };
      await api.post(`/orders/${order.id}/finalize`, body);
      toast.success("O.S. finalizada com sucesso");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro ao finalizar"); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose} title="Finalizar O.S." testid="my-os-finalize">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Materiais efetivamente usados</label>
          <div className="text-xs text-muted-foreground mb-2">Informe quantos de cada material foram realmente aplicados. O que sobrar volta pro estoque.</div>
          {used.length===0 && <div className="text-sm text-muted-foreground">Sem materiais reservados nesta O.S.</div>}
          {used.map((m,i) => (
            <div key={m.product_id} className="flex items-center gap-2 mt-1 text-sm">
              <span className="flex-1 truncate">Material {i+1}</span>
              <input data-testid={`fin-used-${i}`} type="number" min="0" max={m.quantity_taken} value={m.quantity_used} onChange={e => { const u=[...used]; u[i]={...u[i], quantity_used: Math.min(m.quantity_taken, Math.max(0, parseInt(e.target.value)||0))}; setUsed(u); }} className="w-20 border border-border rounded px-2 py-1 bg-transparent"/>
              <span className="text-muted-foreground text-xs">de {m.quantity_taken}</span>
            </div>
          ))}
        </div>
        <div>
          <label className="text-sm font-medium">Observações finais / relatório</label>
          <textarea data-testid="my-fin-notes" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full border border-border rounded px-2 py-2 mt-1 bg-transparent" rows={3} placeholder="O que foi feito, pendências, próximos passos..."/>
        </div>
        <div>
          <label className="text-sm font-medium">Assinatura do cliente</label>
          <div className="text-xs text-muted-foreground mb-1">Peça para o cliente assinar abaixo com o dedo ou caneta</div>
          <SignatureCanvas ref={sigRef} canvasProps={MY_SIG_CANVAS_PROPS}/>
          <button type="button" onClick={()=>sigRef.current.clear()} className="text-xs text-muted-foreground mt-1 hover:text-foreground">Limpar assinatura</button>
        </div>
        <div className="flex gap-2 pt-4 border-t border-border">
          <button data-testid="my-fin-submit" onClick={submit} disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex-1 font-medium">{submitting?"Finalizando...":"Finalizar O.S."}</button>
          <button onClick={onClose} className="border border-border px-4 py-2 rounded">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

const MY_SIG_CANVAS_PROPS = { className: "sig-canvas w-full h-40", "data-testid": "my-signature-pad" };

function Field({ label, children }) {
  return <div><div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</div><div className="mt-0.5">{children}</div></div>;
}

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
