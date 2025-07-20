import { useState, useEffect } from "react";
import { auth } from '../lib/firebase' // Adjust the import path to your Firebase config
import { onAuthStateChanged, User } from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null); // Current user
  const [token , setToken] = useState('')
  const [loading, setLoading] = useState(true); // Loading state
  const [error, setError] = useState(null); // Error state
console.log(loading)
  useEffect(() => {
    // Set up the auth state listener
    const unsubscribe =  onAuthStateChanged(
      auth,
      async (currentUser:any) => {
        setUser(currentUser); // Update user state
        setToken(await auth.currentUser?.getIdToken(true)??'')
        setLoading(false); // Authentication state resolved
      },
      (err:any) => {
        setError(err); // Capture any errors
        setLoading(false);
      }
    );

    // Clean up the listener on unmount
    return () => unsubscribe();
  }, []);

  return { user, loading, error, token };
}