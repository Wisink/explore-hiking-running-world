const cloudbase = require('@cloudbase/node-sdk')
const fs = require('fs')
const path = require('path')

// Read credentials from tcb login session
const authData = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/.cloudbase/auth.json'), 'utf-8'))
const { tmpSecretId, tmpSecretKey, tmpToken } = authData.credential

const app = cloudbase.init({
  env: 'cloud1-1ghoxvn859e9d0df',
  credentials: {
    secretId: tmpSecretId,
    secretKey: tmpSecretKey,
    token: tmpToken
  }
})

const db = app.database()

const TARGET_IDS = [
  'article_050','article_051','article_052','article_053',
  'article_054','article_055','article_056','article_057'
]

async function main() {
  const articlesPath = path.join(__dirname, '../miniprogram/data/articles.json')
  const allArticles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'))
  const newArticles = allArticles.filter(a => TARGET_IDS.includes(a._id))

  console.log(`找到 ${newArticles.length} 篇待导入文章`)

  let imported = 0
  let skipped = 0

  for (const article of newArticles) {
    try {
      const existing = await db.collection('articles').doc(article._id).get()
      console.log(`跳过（已存在）：${article._id} - ${article.title}`)
      skipped++
    } catch (e) {
      await db.collection('articles').add({ data: article })
      console.log(`已导入：${article._id} - ${article.title}`)
      imported++
    }
  }

  console.log(`\n导入完成！新增 ${imported} 篇，跳过 ${skipped} 篇`)
}

main().catch(err => {
  console.error('导入失败:', err)
  process.exit(1)
})
