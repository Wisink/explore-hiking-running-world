const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX_BATCH = 20 // 云数据库单次批量写入上限

// 统一返回格式
function success(data, message = 'success') {
  return { code: 0, message, data }
}
function fail(message = '操作失败', data = null) {
  return { code: -1, message, data }
}

/**
 * 批量写入数据到指定集合
 */
async function batchAdd(collectionName, items) {
  if (!items || items.length === 0) {
    return { imported: 0, failed: 0 }
  }

  let imported = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const batch = items.slice(i, i + MAX_BATCH)
    try {
      const tasks = batch.map(item =>
        db.collection(collectionName).add({
          data: { ...item, createdAt: db.serverDate() }
        })
      )
      await Promise.all(tasks)
      imported += batch.length
    } catch (err) {
      failed += batch.length
      errors.push({ batch: Math.floor(i / MAX_BATCH) + 1, error: err.message })
      console.error(`批次 ${Math.floor(i / MAX_BATCH) + 1} 导入失败:`, err)
    }
  }

  return { imported, failed, errors: errors.length > 0 ? errors : undefined }
}

/**
 * 导入路线数据
 * 入参：{ action: "import-routes", data: [...] }
 */
async function importRoutes(event) {
  const { data } = event
  if (!data || !Array.isArray(data) || data.length === 0) {
    return fail('没有需要导入的路线数据')
  }

  try {
    const result = await batchAdd('routes', data)
    return success(result, `导入完成：成功${result.imported}条，失败${result.failed}条`)
  } catch (err) {
    console.error('importRoutes error:', err)
    return fail('导入路线数据失败：' + err.message)
  }
}

/**
 * 导入文章数据
 * 入参：{ action: "import-articles", data: [...] }
 */
async function importArticles(event) {
  const { data } = event
  if (!data || !Array.isArray(data) || data.length === 0) {
    return fail('没有需要导入的文章数据')
  }

  try {
    const result = await batchAdd('articles', data)
    return success(result, `导入完成：成功${result.imported}条，失败${result.failed}条`)
  } catch (err) {
    console.error('importArticles error:', err)
    return fail('导入文章数据失败：' + err.message)
  }
}

/**
 * 清空集合数据
 * 入参：{ action: "clear", collection: "routes"|"articles" }
 */
async function clearCollection(event) {
  const { collection } = event
  if (!['routes', 'articles'].includes(collection)) {
    return fail('仅支持清空 routes 或 articles 集合')
  }

  try {
    const { total } = await db.collection(collection).count()
    if (total <= 0) return success({ deleted: 0 }, '集合已为空')

    let deleted = 0
    while (deleted < total) {
      const { data } = await db.collection(collection).limit(MAX_BATCH).get()
      if (data.length === 0) break
      await Promise.all(data.map(item => db.collection(collection).doc(item._id).remove()))
      deleted += data.length
    }
    return success({ deleted }, `已清空 ${deleted} 条数据`)
  } catch (err) {
    console.error('clearCollection error:', err)
    return fail('清空集合失败：' + err.message)
  }
}

/**
 * 查询集合数据量
 * 入参：{ action: "count", collection: "routes"|"articles"|"weather" }
 */
async function countCollection(event) {
  const { collection } = event
  if (!['routes', 'articles', 'weather'].includes(collection)) {
    return fail('仅支持 routes、articles、weather 集合')
  }

  try {
    const res = await db.collection(collection).count()
    return success({ count: res.total })
  } catch (err) {
    console.error('countCollection error:', err)
    return fail('查询数据量失败：' + err.message)
  }
}

// 云函数入口
exports.main = async (event) => {
  const { action } = event

  switch (action) {
    case 'import-routes':
      return await importRoutes(event)
    case 'import-articles':
      return await importArticles(event)
    case 'clear':
      return await clearCollection(event)
    case 'count':
      return await countCollection(event)
    default:
      return fail('未知操作。支持：import-routes, import-articles, clear, count')
  }
}
