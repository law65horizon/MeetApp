import { create } from 'zustand';
import { User } from '../types';
import { createUser, logout as firebaseLogout, signIn } from '../lib/firebase';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tempUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name?: string) => Promise<boolean>;
  logout: () => void;
  initAuth: () => () => void;
  setUser: (user: User | null) => void;
  setTempUser: (tempUser: User | null) => void;
}

const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  tempUser: null,
  loading: true,

  login: async (email, password) => {
    try {
      const firebaseUser: any = await signIn(email, password);
      if (firebaseUser) {
        const user: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
        };
        set({ isAuthenticated: true, user });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  },

  signup: async (email, password, name) => {
    try {
      const firebaseUser: any = await createUser(email, password, name);
      if (firebaseUser) {
        const user: User = {
          id: firebaseUser.uid,
          name: name || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
        };
        set({ isAuthenticated: true, user });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Signup error:', error);
      return false;
    }
  },

  logout: () => {
    firebaseLogout();
    set({ isAuthenticated: false, user: null, tempUser: null });
  },

  /**
   * Subscribe to Firebase auth state. Call once at app root.
   * Returns an unsubscribe function.
   */
  initAuth: () => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const user: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
        };
        set({ isAuthenticated: true, user, loading: false });
      } else {
        set({ isAuthenticated: false, user: null, loading: false });
      }
    });
    return unsubscribe;
  },

  setUser: (user) => set({ user }),
  setTempUser: (tempUser) => set({ tempUser }),
}));

export default useAuthStore;
