import { createClient } from '@supabase/supabase-js'

// 從環境變數讀取 Supabase 的 URL 和金鑰
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 建立並匯出 Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)