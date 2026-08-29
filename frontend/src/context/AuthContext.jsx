import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
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
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setCompany(data.company);
      setPerms(data.permissions || {});
      setIsCeo(data.is_ceo);
      setIsPlatformAdmin(!!data.is_platform_admin);
      setSubscriptionActive(data.subscription_active);
    } catch (err) {
      if (err.response?.status !== 401) {
        console.error("Auth refresh failed:", err);
      }
      setUser(null); setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    await api.post("/auth/login", { email, password });
    await refresh();
  }, [refresh]);

  const register = useCallback(async (name, email, password) => {
    await api.post("/auth/register", { name, email, password });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); }
    catch (err) { console.error("Logout failed:", err); }
    setUser(null); setCompany(null); setPerms({}); setIsCeo(false); setIsPlatformAdmin(false); setSubscriptionActive(false);
  }, []);

  const can = useCallback((tab, action = "view") => {
    if (isCeo) return true;
    return !!perms?.[tab]?.[action];
  }, [isCeo, perms]);

  const value = useMemo(() => ({
    user, company, perms, isCeo, isPlatformAdmin, subscriptionActive, loading,
    login, register, logout, refresh, can,
  }), [user, company, perms, isCeo, isPlatformAdmin, subscriptionActive, loading, login, register, logout, refresh, can]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
