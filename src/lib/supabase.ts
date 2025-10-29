import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// 从环境变量获取Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const isServer = typeof window === 'undefined'

// 创建客户端
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 创建服务端客户端（用于需要更高权限的操作）
// 仅在服务端创建 supabaseAdmin，避免在浏览器端因缺少服务密钥导致报错
export const supabaseAdmin: SupabaseClient | null = (isServer && !!supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey as string)
  : null

// 数据库表类型定义
export interface Prediction {
  id: number
  title: string
  description: string
  category: string
  deadline: string
  min_stake: number
  criteria: string
  reference_url: string
  image_url: string
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
}

export interface User {
  id: number
  username: string
  email: string
  password_hash: string
  wallet_address?: string
  created_at: string
  updated_at: string
}



export interface Bet {
  id: number
  user_id: number
  prediction_id: number
  amount: number
  outcome: 'yes' | 'no'
  created_at: string
}

// 热门专题相关表
export interface TrendingEvent {
  id: number
  title: string
  description: string
  category: string
  image_url: string
  followers_count: number
  created_at: string
  updated_at: string
}

export interface EventFollow {
  id: number
  user_id: string
  event_id: number
  created_at: string
}