import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";
import { LayoutDashboard, Calendar, Car, HardHat, Boxes, AlertOctagon, User2, Users, LogOut, Menu, X, Sun, Moon, Tag } from "lucide-react";

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
  const { user, company, logout, can, isCeo, isPlatformAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = () => { logout(); nav("/"); };
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static z-30 top-0 left-0 h-full lg:h-screen w-64 bg-card border-r border-border flex flex-col transition-transform`}>
        <div className="p-4 border-b border-border">
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
                className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded text-sm mb-1 ${allowed ? (isActive ? "bg-black dark:bg-white text-white dark:text-black" : "text-foreground hover:bg-muted") : "text-muted-foreground opacity-40 pointer-events-none"}`}
              >
                <item.icon size={16}/> {item.label}
              </NavLink>
            );
          })}
          {isPlatformAdmin && (
            <Link to="/admin/cupons" data-testid="nav-admin-coupons" className="flex items-center gap-3 px-3 py-2 rounded text-sm mb-1 text-blue-600 hover:bg-muted mt-4 border-t border-border pt-4">
              <Tag size={16}/> Cupons (Admin)
            </Link>
          )}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2 truncate">{user?.name} {isCeo && <span className="text-blue-600 font-medium">(CEO)</span>}</div>
          <div className="flex items-center justify-between">
            <button data-testid="sidebar-logout" onClick={doLogout} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><LogOut size={14}/> Sair</button>
            <button data-testid="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema" className="p-2 hover:bg-muted rounded">
              {theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={()=>setOpen(false)}/>}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden border-b border-border bg-card p-3 flex items-center justify-between">
          <button onClick={()=>setOpen(!open)} data-testid="mobile-menu-toggle">{open ? <X size={20}/> : <Menu size={20}/>}</button>
          <div className="font-display font-bold">{company?.name}</div>
          <button onClick={toggleTheme} data-testid="theme-toggle-mobile" className="p-2">{theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}</button>
        </header>
        <div className="flex-1 p-4 lg:p-8 overflow-x-hidden">
          <Outlet/>
        </div>
      </main>
    </div>
  );
}
