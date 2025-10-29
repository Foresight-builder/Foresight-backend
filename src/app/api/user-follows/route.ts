import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

// 移除本地降级逻辑，强制仅使用 Supabase

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: '缺少用户地址参数' },
        { status: 400 }
      )
    }

    // 获取用户关注的事件ID列表（仅 Supabase）
    const { data: followedEventIds, error: followsError } = await supabaseAdmin
      .from('event_follows')
      .select('event_id')
      .eq('user_id', address)
    
    if (followsError) {
      return NextResponse.json(
        { error: '获取关注事件ID失败' },
        { status: 500 }
      )
    }

    const eventIds: number[] = (followedEventIds || []).map(follow => follow.event_id)
    if (!eventIds.length) {
      return NextResponse.json({ follows: [], total: 0 })
    }

    // 获取事件详细信息
    const { data: eventsData, error: eventsError } = await supabaseAdmin
      .from('predictions')
      .select(`
        id,
        title,
        description,
        category,
        image_url,
        deadline,
        min_stake,
        status,
        created_at
      `)
      .in('id', eventIds)
      .order('created_at', { ascending: false })

    if (eventsError) {
      return NextResponse.json(
        { error: '获取事件详细信息失败' },
        { status: 500 }
      )
    }

    // 获取每个事件的关注数（仅 Supabase；出现错误时该事件计数置为 0）
    const eventsWithFollowersCount = await Promise.all(
      (eventsData || []).map(async (event) => {
        const { count, error: countError } = await supabaseAdmin
          .from('event_follows')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id)
        const followers = countError ? 0 : (count || 0)
        return {
          ...event,
          followers_count: followers
        }
      })
    )

    return NextResponse.json({
      follows: eventsWithFollowersCount,
      total: eventsWithFollowersCount.length
    })

  } catch (error) {
    console.error('获取用户关注数据失败:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}