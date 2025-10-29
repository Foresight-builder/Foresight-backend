// 修复 Supabase public.event_follows.user_id 字段类型为 TEXT
// 使用 pg 直连数据库执行 ALTER TABLE 语句
require('dotenv/config')

// 兼容 CJS 的导入方式
let Client
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Client = require('pg').Client
} catch (e) {
  console.error('未找到 pg 依赖，请先运行: npm i pg')
  process.exit(1)
}

// 读取环境变量中的 Supabase 连接字符串
// 优先使用 SUPABASE_DB_URL，否则回退 SUPABASE_CONNECTION_STRING
let connectionString =
  process.env.SUPABASE_DB_URL || process.env.SUPABASE_CONNECTION_STRING

// 如果未配置环境变量，使用项目中已验证可用的连接字符串回退
if (!connectionString) {
  connectionString =
    'postgresql://postgres.qhllkgbddesrbhvjzfud:Foresight2024!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
}

// 允许使用上述回退连接字符串

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

// 需要执行的 SQL 语句列表（幂等）
const statements = [
  // 如果存在旧的外键约束，先移除（有些环境可能没有该约束）
  'ALTER TABLE IF EXISTS public.event_follows DROP CONSTRAINT IF EXISTS event_follows_user_id_fkey;',
  // 将 user_id 列类型改为 TEXT（使用 USING 保留现有数据）
  'ALTER TABLE IF EXISTS public.event_follows ALTER COLUMN user_id TYPE TEXT USING user_id::text;',
  // 确保唯一性索引存在（避免重复创建导致错误）
  'DROP INDEX IF EXISTS public.event_follows_user_id_event_id_idx;',
  'CREATE UNIQUE INDEX IF NOT EXISTS event_follows_user_id_event_id_key ON public.event_follows (user_id, event_id);',
]

async function main() {
  try {
    await client.connect()
    console.log('已连接 Supabase Postgres')
    for (let i = 0; i < statements.length; i++) {
      const sql = statements[i]
      process.stdout.write(`执行语句 ${i + 1}/${statements.length}: ${sql}\n`)
      try {
        await client.query(sql)
        console.log('  -> 成功')
      } catch (err) {
        console.error('  -> 失败:', err?.message || err)
        throw err
      }
    }

    // 验证：尝试插入一条包含文本 user_id 的记录（随后回滚删除）
    console.log('验证：插入/删除测试记录')
    const testUser = '0xTESTWALLET_VALIDATE_TYPE'
    const testEvent = 999999
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO public.event_follows (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING',
      [testUser, testEvent]
    )
    const { rows } = await client.query(
      'SELECT user_id::text AS user_id, event_id FROM public.event_follows WHERE user_id = $1 AND event_id = $2 LIMIT 1',
      [testUser, testEvent]
    )
    if (!rows?.length || typeof rows[0]?.user_id !== 'string') {
      throw new Error('验证失败：user_id 不是 TEXT 或插入记录失败')
    }
    // 清理测试数据
    await client.query('ROLLBACK')
    console.log('验证通过：user_id 为 TEXT 类型')

    console.log('所有操作完成')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('修复过程中发生错误:', err)
  process.exit(1)
})