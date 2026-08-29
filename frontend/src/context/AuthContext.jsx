import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [perms, setPerms] = useState({});
  const [isCeo, setIsCeo] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("automa_token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setCompany(data.company);
      setPerms(data.permissions || {});
      setIsCeo(data.is_ceo);
      setIsPlatformAdmin(!!data.is_platform_admin);
      setSubscriptionActive(data.subscription_active);
    } catch (e) {
      localStorage.removeItem("automa_token");
      setUser(null); setCompany(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("automa_token", data.token);
    await refresh();
  };
  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("automa_token", data.token);
    await refresh();
  };
  const logout = () => {
    localStorage.removeItem("automa_token");
    setUser(null); setCompany(null); setPerms({}); setIsCeo(false); setIsPlatformAdmin(false); setSubscriptionActive(false);
  };

  const can = (tab, action = "view") => {
    if (isCeo) return true;
    return !!perms?.[tab]?.[action];
  };

  return (
    <AuthCtx.Provider value={{ user, company, perms, isCeo, isPlatformAdmin, subscriptionActive, loading, login, register, logout, refresh, can }}>
      {children}
    </AuthCtx.Provider>
  );
}
