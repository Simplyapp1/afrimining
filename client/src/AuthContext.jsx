import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const data = await authApi.me();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    await authApi.login(email, password);
    // Refetch from /auth/me so we get full user (page_roles, tenant_id, etc.) with session
    const data = await authApi.me();
    setUser(data.user ?? null);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const switchTenant = async (tenantId) => {
    const data = await authApi.switchTenant(tenantId);
    await loadUser();
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh: loadUser, switchTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
