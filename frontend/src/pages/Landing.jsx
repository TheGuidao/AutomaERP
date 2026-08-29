import React from "react";
import { Link } from "react-router-dom";
import { Cpu, ShieldCheck, Zap, Users, Warehouse, ClipboardCheck, ArrowUpRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl">
            <div className="w-8 h-8 bg-blue-600 flex items-center justify-center text-white"><Cpu size={16}/></div>
            AutomaERP
          </div>
          <div className="flex items-center gap-3">
            <Link data-testid="nav-login" to="/login" className="text-sm text-slate-600 hover:text-black">Entrar</Link>
            <Link data-testid="nav-register" to="/register" className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-slate-800">Criar conta</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-blue-600 mb-6 border border-blue-200 px-3 py-1">
            <Zap size={12}/> ERP para empresas de automação
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            O ERP feito para automatizar<br/>
            <span className="text-blue-600">quem automatiza.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl">
            Gestão completa de O.S., garagem, estoque, RMA e equipe externa em um só lugar.
            Feito para empresas brasileiras de automação residencial e comercial.
          </p>
          <div className="mt-8 flex gap-3">
            <Link data-testid="hero-cta-plans" to="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium flex items-center gap-2">
              Começar agora <ArrowUpRight size={16}/>
            </Link>
            <a data-testid="hero-cta-see-plans" href="#planos" className="border border-slate-300 hover:border-black px-6 py-3 rounded font-medium">Ver planos</a>
          </div>
        </div>
        <div className="lg:col-span-5">
          <img src="https://images.unsplash.com/photo-1558002038-1055907df827?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="Automação" className="w-full h-[420px] object-cover border border-slate-200"/>
        </div>
      </section>

      {/* Features - bento */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {[
            {icon: ClipboardCheck, title: "Ordens de Serviço", desc: "Crie O.S. com cliente, equipe, veículo, materiais, anexos e assinatura digital do cliente."},
            {icon: Warehouse, title: "Estoque inteligente", desc: "Baixa automática de materiais ao vincular na O.S. e retorno do que sobrou."},
            {icon: Users, title: "Equipe com permissões", desc: "Defina o que cada funcionário vê e edita em cada aba do sistema."},
            {icon: ShieldCheck, title: "Histórico completo", desc: "Toda O.S. de um cliente puxa automaticamente as informações da anterior."},
          ].map((f, i) => (
            <div key={i} className={`border border-slate-200 p-6 ${i === 0 ? "md:col-span-7" : i === 1 ? "md:col-span-5" : "md:col-span-6"}`}>
              <f.icon className="text-blue-600 mb-4" size={22}/>
              <h3 className="font-display text-xl font-semibold">{f.title}</h3>
              <p className="text-slate-600 mt-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="max-w-7xl mx-auto px-6 py-20 border-t border-slate-200">
        <div className="mb-12">
          <span className="text-xs uppercase tracking-[0.2em] text-blue-600">Planos</span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2">Escolha o plano da sua empresa</h2>
          <p className="text-slate-600 mt-2">Pague uma vez, use enquanto o plano estiver ativo. Cancele quando quiser.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {name: "Mensal", price: "100", period: "por 1 mês", features: ["Todas as funcionalidades", "Suporte por e-mail", "Sem limite de O.S."], featured: false},
            {name: "Trimestral", price: "250", period: "por 3 meses", features: ["Todas as funcionalidades", "Economize R$ 50", "Suporte prioritário"], featured: true},
            {name: "Anual", price: "900", period: "por 12 meses", features: ["Todas as funcionalidades", "Economize R$ 300", "Consultoria de setup"], featured: false},
          ].map((p, i) => (
            <div key={i} data-testid={`plan-card-${i}`} className={`border p-8 ${p.featured ? "border-blue-600 bg-blue-50/30" : "border-slate-200"}`}>
              {p.featured && <div className="text-xs uppercase tracking-[0.2em] text-blue-600 mb-3">Mais popular</div>}
              <h3 className="font-display text-2xl font-bold">{p.name}</h3>
              <div className="mt-6"><span className="text-4xl font-display font-bold">R$ {p.price}</span> <span className="text-slate-500">{p.period}</span></div>
              <ul className="mt-6 space-y-2 text-sm">{p.features.map((f, j) => <li key={j} className="text-slate-600">— {f}</li>)}</ul>
              <Link data-testid={`plan-cta-${i}`} to="/register" className="mt-8 block text-center bg-black hover:bg-slate-800 text-white py-3 rounded font-medium">Assinar</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-6 text-sm text-slate-500 flex justify-between">
          <div>© 2026 AutomaERP</div>
          <div>Feito para o Brasil</div>
        </div>
      </footer>
    </div>
  );
}
