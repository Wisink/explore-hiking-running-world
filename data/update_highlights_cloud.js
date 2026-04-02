const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

// 更新脚本 - 在云函数控制台执行
// 数据来源：local trails_data.json with highlights

async function main() {
  // 先获取云端所有路线的_id和name
  const MAX = 100
  const countRes = await db.collection('routes').count()
  const total = countRes.total
  console.log(`云端路线总数: ${total}`)
  
  const routes = []
  for (let i = 0; i < total; i += MAX) {
    const res = await db.collection('routes').skip(i).limit(MAX).get()
    routes.push(...res.data)
  }
  
  console.log(`获取到${routes.length}条路线`)
  
  // 读取本地highlights数据
  const fs = require('fs')
  const path = require('path')
  const localData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../miniprogram/trails_data.json'), 'utf-8'))
  
  // 建立 name -> highlights 映射
  const highlightsMap = {}
  for (const t of localData) {
    if (t.highlights) {
      highlightsMap[t.name] = t.highlights
    }
  }
  
  // 匹配并更新
  let updated = 0
  let failed = 0
  const BATCH = 20
  
  for (let i = 0; i < routes.length; i += BATCH) {
    const batch = routes.slice(i, i + BATCH)
    const tasks = batch.map(route => {
      const highlights = highlightsMap[route.name]
      if (highlights) {
        return db.collection('routes').doc(route._id).update({
          data: { highlights }
        }).then(() => { updated++ }).catch(() => { failed++ })
      }
      return Promise.resolve()
    })
    await Promise.all(tasks)
    console.log(`已处理 ${Math.min(i + BATCH, routes.length)}/${routes.length}`)
  }
  
  console.log(`完成！更新${updated}条，失败${failed}条`)
}

main()
