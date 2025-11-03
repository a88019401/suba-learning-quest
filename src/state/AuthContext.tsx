// src/state/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Session, User } from '@supabase/supabase-js'

export type Profile = {
  id: string;
  full_name: string | null;
  school: string | null;
  grade: string | null;
  // 若需要也可加上：
  // progress?: Record<string, any> | null;
  // updated_at?: string | null;
}

const AuthContext = createContext<{
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}>({ session: null, user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const hydrate = async (sess: Session | null) => {
      if (!isMounted) return
      try {
        setSession(sess)
        setUser(sess?.user ?? null)

        if (sess?.user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, school, grade') // 需要更多欄位再加
            .eq('id', sess.user.id)
            .single()

          if (error && error.code !== 'PGRST116') {
            console.error('fetch profile error:', error)
            setProfile(null) // 失敗就先給 null，避免卡 loading
          } else {
            setProfile(data ?? null) // 查無資料 => null（或這裡可改成自動 insert）
          }
        } else {
          setProfile(null)
        }
      } finally {
        // 任何情況都結束 loading（避免卡「讀取中…」）
        if (isMounted) setLoading(false)
      }
    }

    // 1) 先拿一次現有 session（加快初次載入）
    supabase.auth.getSession()
      .then(({ data }) => hydrate(data.session))
      .catch((e) => {
        console.error('getSession error:', e)
        if (isMounted) setLoading(false)
      })

    // 2) 監聽後續變更（包含 INITIAL_SESSION、SIGNED_IN、SIGNED_OUT…）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => { hydrate(sess) }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
