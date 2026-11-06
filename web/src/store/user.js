import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

export const useUser = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set((s) => ({ ...s, user })),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'fb_user',
      // 兼容旧会话：持久化里可能残留 plan 字段，合并时丢弃
      merge: (persisted, current) => {
        const { plan, ...rest } = persisted || {};
        return { ...current, ...rest };
      },
    }
  )
);

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}

export async function me() {
  const { data } = await api.get('/auth/me');
  return data;
}
