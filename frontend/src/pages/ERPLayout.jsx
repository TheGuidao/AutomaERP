import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Calendar, Car, HardHat, Boxes, AlertOctagon, User2, Users, LogOut, Menu, X } from "lucide-react";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard", end: true },
  { to: "/app/agenda", label: "Agenda", icon: Calendar, perm: "agenda" },
  { to: "/app/obras", label: "Obras (Clientes)", icon: HardHat, perm: "obras" },
  { to: "/app/estoque", label: "Estoque", icon: Boxes, perm: "estoque" },
  { to: "/app/garagem", label: "Garagem", icon: Car, perm: "garage" },
  { to: "/app/rma", label: "RMA", icon: AlertOctagon, perm: "rma" },
  { to: "/app/minha-agenda", label: "Minha Agenda", icon: User2, perm: "my_agenda" },
  { to: "/app/funcionarios", label: "Funcionários", icon: Users, perm: "employees", ceoOnly: true },
];

export default function ERPLayout() {
  const { user, company, logout, can, isCeo } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = () => { logout(); nav("/"); };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static z-30 top-0 left-0 h-full lg:h-screen w-64 bg-white border-r border-slate-200 flex flex-col transition-transform`}>
        <div className="p-4 border-b border-slate-200">
          <div className="text-xs uppercase tracking-[0.2em] text-blue-600">AutomaERP</div>
          <div className="font-display font-bold text-lg truncate" data-testid="sidebar-company-name">{company?.name}</div>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          {NAV.map(item => {
            const allowed = isCeo ? true : (item.ceoOnly ? false : can(item.perm, "view"));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`nav-${item.perm}`}
                onClick={() => setOpen(false)}
                className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded text-sm mb-1 ${allowed ? (isActive ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100") : "text-slate-300 pointer-events-none"}`}
              >
                <item.icon size={16}/> {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <div className="text-xs text-slate-500 mb-2 truncate">{user?.name} {isCeo && <span className="text-blue-600 font-medium">(CEO)</span>}</div>
          <button data-testid="sidebar-logout" onClick={doLogout} className="w-full flex items-center gap-2 text-sm text-slate-600 hover:text-black"><LogOut size={14}/> Sair</button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={()=>setOpen(false)}/>}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden border-b border-slate-200 bg-white p-3 flex items-center justify-between">
          <button onClick={()=>setOpen(!open)} data-testid="mobile-menu-toggle">{open ? <X size={20}/> : <Menu size={20}/>}</button>
          <div className="font-display font-bold">{company?.name}</div>
        </header>
        <div className="flex-1 p-4 lg:p-8 overflow-x-hidden">
          <Outlet/>
        </div>
      </main>
    </div>
  );
}
