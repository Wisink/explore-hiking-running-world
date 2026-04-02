const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  console.log('开始更新路线亮点文案...')
  const countRes = await db.collection('routes').count()
  const total = countRes.total
  console.log('云端共', total, '条路线')
  const routes = []
  for (let i = 0; i < total; i += 100) {
    const res = await db.collection('routes').skip(i).limit(100).field({
      _id: true, name: true, description: true, features: true,
      best_season: true, difficulty: true, cost: true, traffic: true, highlights: true
    }).get()
    routes.push(...res.data)
  }
  function genHighlights(r) {
    var name = String(r.name || '')
    var desc = String(r.description || '')
    var features = r.features || []
    var season = r.best_season || []
    var diff = String(r.difficulty || '')
    var cost = r.cost || {}
    var traffic = String(r.traffic || '')
    var parts = []
    if (desc) parts.push(desc)
    if (Array.isArray(features) && features.length) parts.push('沿途可以欣赏到' + features.slice(0, 5).join('、') + '等美景。')
    if (Array.isArray(season) && season.length) parts.push(season.join('和') + '是最佳出行时间。')
    if (diff === '初级' || diff === '轻松') parts.push('路线轻松平缓，非常适合新手和亲子出行。')
    else if (diff === '中级' || diff === '适中') parts.push('路线有一定挑战性，适合有一定徒步经验的朋友。')
    else if (diff === '高级' || diff === '困难') parts.push('路线难度较大，适合经验丰富的户外爱好者挑战。')
    if (traffic.length > 10) parts.push('交通便利，方便到达。')
    var cType = typeof cost === 'object' ? (cost.type || '') : String(cost || '')
    if (cType === '免费') parts.push('全程免费，无需门票。')
    else if (cType) parts.push('费用参考：' + cType + (cost.note ? '（' + cost.note + '）' : '') + '。')
    parts.push('来' + name + '，感受自然的魅力吧！')
    return parts.join('')
  }
  var updated = 0, failed = 0
  for (var i = 0; i < routes.length; i++) {
    var r = routes[i]
    if (!r._id) { failed++; continue }
    try {
      var h = r.highlights || genHighlights(r)
      await db.collection('routes').doc(r._id).update({ data: { highlights: h } })
      updated++
      if ((i + 1) % 20 === 0) console.log('进度: ' + (i + 1) + '/' + total)
    } catch (e) {
      failed++
      console.error('更新失败: ' + (r.name || r._id) + ' - ' + e.message)
    }
  }
  console.log('完成！更新 ' + updated + ' 条，失败 ' + failed + ' 条')
  return { code: 0, message: '更新完成', total: routes.length, updated, failed }
}