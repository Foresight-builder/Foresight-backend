import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getFollowersCount } from '@/lib/localFollowStore'

function isMissingRelation(error?: { message?: string }) {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  return msg.includes('relation') && msg.includes('does not exist')
}
function isUserIdForeignKeyViolation(error?: { message?: string }) {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  return msg.includes('violates foreign key constraint') && msg.includes('event_follows_user_id_fkey')
}
function isUserIdTypeIntegerError(error?: { message?: string }) {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  return msg.includes('out of range for type integer') || msg.includes('invalid input syntax for type integer')
}

const enableFallback = process.env.ENABLE_LOCAL_FOLLOW_FALLBACK === 'true'

async function parseRequestBody(req: Request) {
  const contentType = req.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      const text = await req.text()
      try { return JSON.parse(text) } catch { return {} }
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const params = new URLSearchParams(text)
      return Object.fromEntries(params.entries())
    }
    const text = await req.text()
    if (text) {
      try { return JSON.parse(text) } catch { return {} }
    }
    return {}
  } catch (_) {
    return {}
  }
}

// POST /api/follows/counts  body: { eventIds: number[] }
export async function POST(req: Request) {
  try {
    const body = await parseRequestBody(req) as any
    const rawIds = Array.isArray(body?.eventIds) ? body.eventIds : []
    const ids = Array.from(new Set(rawIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)))

    if (ids.length === 0) {
      return NextResponse.json({ message: 'eventIds 必须为正整数数组' }, { status: 400 })
    }
    const limitedIds = ids.slice(0, 50) // 简单限制一次查询数量，避免过多并发

    let fallbackTriggered = false
    const entries = await Promise.all(limitedIds.map(async (id) => {
      const { count, error } = await supabaseAdmin
        .from('event_follows')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)

      if (error) {
        if (isMissingRelation(error) || isUserIdForeignKeyViolation(error) || isUserIdTypeIntegerError(error)) {
          if (enableFallback) {
            fallbackTriggered = true
            const local = await getFollowersCount(Number(id))
            return [id, local] as const
          } else {
            throw { type: 'setup', error }
          }
        }
        throw { type: 'query', error }
      }
      return [id, count || 0] as const
    }))

    const counts: Record<number, number> = {}
    for (const [id, c] of entries) counts[Number(id)] = c

    if (fallbackTriggered) {
      return NextResponse.json({
        counts,
        fallbackUsed: true,
        setupRequired: true,
        sql: `
ALTER TABLE public.event_follows ALTER COLUMN user_id TYPE TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS event_follows_user_id_event_id_key ON public.event_follows (user_id, event_id);`
      }, { status: 200 })
    }

    return NextResponse.json({ counts }, { status: 200 })
  } catch (e: any) {
    if (e?.type === 'setup') {
      const err = e.error
      return NextResponse.json({
        message: '批量计数查询失败，需要修复表结构',
        setupRequired: true,
        detail: err?.message,
        sql: `
ALTER TABLE public.event_follows ALTER COLUMN user_id TYPE TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS event_follows_user_id_event_id_key ON public.event_follows (user_id, event_id);`
      }, { status: 501 })
    }
    return NextResponse.json({ message: '批量计数查询失败', detail: String(e?.error?.message || e?.message || e) }, { status: 500 })
  }
}