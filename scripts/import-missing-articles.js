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

const TARGET_IDS = ['article_047', 'article_048', 'article_049']

async function main() {
  const articlesPath = path.join(__dirname, '../miniprogram/data/articles.json')
  const allArticles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'))
  const newArticles = allArticles.filter(a => TARGET_IDS.includes(a._id))
  console.log(`待导入: ${newArticles.length}篇`)

  for (const article of newArticles) {
    try {
      await db.collection('articles').doc(article._id).get()
      console.log(`跳过（已存在）: ${article._id} - ${article.title}`)
    } catch (e) {
      await db.collection('articles').add({ data: article })
      console.log(`已导入: ${article._id} - ${article.title}`)
    }
  }
  console.log('完成！')
}
main().catch(e => console.error('ERROR:', e.message, e.code))
