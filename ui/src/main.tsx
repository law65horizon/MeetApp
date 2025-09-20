import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import useAuthStore from './store/authStore';

function Root() {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    // Subscribe to Firebase auth state once at app root
    const unsubscribe = initAuth();
    return unsubscribe;
  }, [initAuth]);

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
