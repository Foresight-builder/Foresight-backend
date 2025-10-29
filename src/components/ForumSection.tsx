"use client";
import React, { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/contexts/WalletContext'

interface ForumSectionProps { eventId: number }

interface ThreadView {
  id: number
  event_id: number
  title: string
  content: string
  user_id: string
  created_at: string
  upvotes: number
  downvotes: number
  comments?: CommentView[]
}

interface CommentView {
  id: number
  thread_id: number
  event_id: number
  user_id: string
  content: string
  created_at: string
  upvotes: number
  downvotes: number
  parent_id?: number | null
}

export default function ForumSection({ eventId }: ForumSectionProps) {
  const { account, connectWallet, formatAddress } = useWallet()
  const [threads, setThreads] = useState<ThreadView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/forum?eventId=${eventId}`)
      const data = await res.json()
      setThreads(Array.isArray(data?.threads) ? data.threads : [])
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [eventId])

  const postThread = async () => {
    if (!account) { setError('请先连接钱包'); return }
    if (!title.trim() || !content.trim()) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch('/api/forum', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, title, content, walletAddress: account })
      })
      if (!res.ok) throw new Error(await res.text())
      setTitle(''); setContent('')
      await load()
    } catch (e: any) { setError(e?.message || '创建失败') } finally { setPosting(false) }
  }

  const postComment = async (threadId: number, text: string, parentId?: number | null) => {
    if (!account) { setError('请先连接钱包'); return }
    if (!text.trim()) return
    try {
      const res = await fetch('/api/forum/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, threadId, content: text, walletAddress: account, parentId })
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e: any) { setError(e?.message || '评论失败') }
  }

  const vote = async (type: 'thread'|'comment', id: number, dir: 'up'|'down') => {
    try {
      const res = await fetch('/api/forum/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, dir }) })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e: any) { setError(e?.message || '投票失败') }
  }

  // 将评论按 parent_id 构建简单树
  const buildTree = (comments: CommentView[] = []) => {
    const byParent: Record<string, CommentView[]> = {}
    comments.forEach(c => {
      const key = String(c.parent_id ?? 'root')
      if (!byParent[key]) byParent[key] = []
      byParent[key].push(c)
    })
    const renderBranch = (parentId: number | null, depth = 0) => {
      const key = String(parentId ?? 'root')
      const nodes = byParent[key] || []
      return nodes.flatMap(node => [
        <div key={node.id} className="mt-3 pl-0" style={{ marginLeft: depth * 16 }}>
          <div className="text-sm text-gray-800">
            <span className="font-medium mr-2">{formatAddress(node.user_id)}</span>
            <span className="text-gray-400">{new Date(node.created_at).toLocaleString()}</span>
          </div>
          <div className="mt-1 text-gray-700 break-words">{node.content}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <button onClick={() => vote('comment', node.id, 'up')} className="hover:text-purple-600">▲ {node.upvotes}</button>
            <button onClick={() => vote('comment', node.id, 'down')} className="hover:text-pink-600">▼ {node.downvotes}</button>
            {account && <ReplyBox onSubmit={(text) => postComment(node.thread_id, text, node.id)} />}
          </div>
        </div>,
        ...renderBranch(node.id, depth + 1)
      ])
    }
    return renderBranch(null, 0)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-between">
        <div className="font-semibold">社区讨论</div>
        <div className="text-xs opacity-90">类似 Reddit 的主题与评论</div>
      </div>

      <div className="p-4 space-y-6">
        {/* 新建主题 */}
        <div className="bg-white/80 rounded-xl border border-gray-100 p-4">
          {!account ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">发帖需连接钱包</div>
              <button onClick={() => connectWallet()} className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl text-sm">连接钱包</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="主题标题"
                     className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/80" />
              <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="详细内容"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/80 min-h-[80px]" />
              <div className="flex justify-end">
                <button onClick={postThread} disabled={posting} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {posting ? '发布中…' : '发布主题'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 主题列表 */}
        <div className="space-y-4">
          {loading && <div className="text-sm text-gray-500">加载中…</div>}
          {!loading && threads.length === 0 && <div className="text-sm text-gray-500">暂无主题</div>}
          {threads.map(t => (
            <div key={t.id} className="bg-white/80 rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-800">{t.title}</div>
                  <div className="text-sm text-gray-600 mt-1">{t.content}</div>
                  <div className="text-xs text-gray-400 mt-1">由 {formatAddress(t.user_id)} 在 {new Date(t.created_at).toLocaleString()} 发布</div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <button onClick={() => vote('thread', t.id, 'up')} className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600">▲ {t.upvotes}</button>
                  <button onClick={() => vote('thread', t.id, 'down')} className="px-2 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-600">▼ {t.downvotes}</button>
                </div>
              </div>

              {/* 评论区 */}
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-700">评论</div>
                <div className="mt-2">
                  {buildTree(t.comments || [])}
                </div>
                {account && (
                  <div className="mt-2">
                    <ReplyBox onSubmit={(text) => postComment(t.id, text)} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </div>
  )
}

function ReplyBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async () => {
    if (!text.trim()) return
    setSending(true)
    try { await onSubmit(text); setText('') } finally { setSending(false) }
  }
  return (
    <div className="flex items-center gap-2">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="写下评论…"
             className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/80" />
      <button onClick={submit} disabled={sending} className="px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">{sending ? '发送中…' : '评论'}</button>
    </div>
  )
}