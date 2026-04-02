const cloudbase = require('@cloudbase/node-sdk')
const fs = require('fs')
const path = require('path')

// 读取tcb登录凭证
const auth = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/.cloudbase/auth.json', 'utf-8'))
const { tmpSecretId, tmpSecretKey, tmpToken } = auth.credential

const app = cloudbase.init({
  env: 'cloud1-1ghoxvn859e9d0df',
  secretId: tmpSecretId,
  secretKey: tmpSecretKey,
  token: tmpToken
})

const db = app.database()

const TARGET_IDS = ['article_050','article_051','article_052','article_053','article_054','article_055','article_056','article_057']

async function main() {
  // 先测试连接
  const countRes = await db.collection('articles').count()
  console.log('云端articles总数:', countRes.total)

  // 读取本地文章
  const articlesPath = path.join(__dirname, '../miniprogram/data/articles.json')
  const allArticles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'))
  const newArticles = allArticles.filter(a => TARGET_IDS.includes(a._id))
  console.log(`待导入: ${newArticles.length}篇`)

  let imported = 0, skipped = 0
  for (const article of newArticles) {
    try {
      await db.collection('articles').doc(article._id).get()
      console.log(`跳过: ${article._id} - ${article.title}`)
      skipped++
    } catch (e) {
      await db.collection('articles').add({ data: article })
      console.log(`已导入: ${article._id} - ${article.title}`)
      imported++
    }
  }
  console.log(`\n完成！新增${imported}篇，跳过${skipped}篇`)
}
main().catch(e => { console.error('ERROR:', e.message, e.code) })
