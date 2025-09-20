import { useEffect } from 'react';
import useAuthStore from '../store/authStore';

/**
 * Primary auth hook. Reads from the Zustand store which is kept in sync
 * with Firebase via initAuth() called in main.tsx.
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return { user, loading, isAuthenticated };
}
