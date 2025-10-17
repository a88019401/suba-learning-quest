// src/state/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { AuthSession, User } from '@supabase/supabase-js';

// 定義 Profile 的型別，對應資料庫欄位
export type Profile = {
  id: string;
  full_name: string | null;
  school: string | null;
  grade: string | null;
};

const AuthContext = createContext<{
  session: AuthSession | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}>({ session: null, user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const setData = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Error getting session:", error);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // ✅ *** 這裡是修改的關鍵 ***
        // 我們把 select('*') 改成明確指定需要的欄位
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, school, grade') // <-- 從 '*' 改成明確欄位
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') { // Ignore "no rows found"
          console.error("Error fetching profile:", profileError);
        } else {
          setProfile(profileData);
        }
      }
      setLoading(false);
    };

    const handleAuthStateChange = async (_event: string, session: AuthSession | null) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, school, grade') // <-- 同步修改這裡
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("Error fetching profile on auth change:", profileError);
        } else {
          setProfile(profileData);
        }
      } else {
        setProfile(null);
      }
      setLoading(false); // 確保狀態改變後 loading 結束
    };

    setData(); // 初始載入

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}