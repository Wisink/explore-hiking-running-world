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
 * 导入文章数据（旧 articles 集合）
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
 * 从云存储导入跑步文章到 running_articles 集合
 * 入参：{ action: "import-articles-from-cloud", fileID: "cloud://xxx" }
 * 流程：
 * 1. 从云存储下载 JSON 文件
 * 2. 解析文章数据
 * 3. 检查已有数据，跳过重复
 * 4. 补充默认字段（readTime, order, isActive, readCount 等）
 * 5. 批量写入 running_articles 集合（每批20条）
 * 6. 返回导入结果
 */
async function importArticlesFromCloud(event) {
  const { fileID } = event
  if (!fileID) {
    return fail('缺少 fileID 参数')
  }

  try {
    // 1. 从云存储下载文件
    console.log('开始下载文件:', fileID)
    const downloadRes = await cloud.downloadFile({ fileID })
    const fileContent = downloadRes.fileContent

    // 2. 解析 JSON
    let articles
    try {
      articles = JSON.parse(fileContent.toString('utf-8'))
    } catch (parseErr) {
      console.error('JSON 解析失败:', parseErr)
      return fail('文件 JSON 解析失败：' + parseErr.message)
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      return fail('文件中没有文章数据')
    }

    console.log(`解析到 ${articles.length} 篇文章`)

    // 3. 检查已有数据，避免重复
    const { total: existingCount } = await db.collection('running_articles').count()
    let existingTitles = new Set()
    if (existingCount > 0) {
      // 分批获取已有标题
      let fetched = 0
      while (fetched < existingCount) {
        const batch = existingCount - fetched > 100 ? 100 : existingCount - fetched
        const { data } = await db.collection('running_articles')
          .field({ title: true })
          .skip(fetched)
          .limit(batch)
          .get()
        data.forEach(item => existingTitles.add(item.title))
        fetched += data.length
      }
    }

    // 4. 过滤重复 + 补充默认字段
    const channelMap = {
      1: '跑步观念',
      2: '从零开始跑',
      3: '训练方法',
      4: '无伤跑步',
      5: '装备指南',
      6: '跑步文化'
    }

    const newArticles = []
    let skipped = 0
    articles.forEach((article, index) => {
      if (existingTitles.has(article.title)) {
        skipped++
        return
      }
      newArticles.push({
        ...article,
        categoryName: channelMap[article.channel] || '未分类',
        readTime: article.readTime || Math.max(3, Math.ceil((article.content || '').length / 400)),
        order: article.order || index + 1,
        isActive: article.isActive !== undefined ? article.isActive : true,
        readCount: 0,
        favoriteCount: 0,
        reviewCount: 0,
        shareCount: 0,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    })

    console.log(`新文章: ${newArticles.length}, 跳过重复: ${skipped}`)

    if (newArticles.length === 0) {
      return success({ imported: 0, skipped, total: articles.length }, '所有文章已存在，无需导入')
    }

    // 5. 批量写入
    const result = await batchAdd('running_articles', newArticles)
    result.skipped = skipped
    result.total = articles.length

    return success(result, `导入完成：成功${result.imported}条，跳过${skipped}条重复，失败${result.failed}条`)
  } catch (err) {
    console.error('importArticlesFromCloud error:', err)
    return fail('从云存储导入文章失败：' + err.message)
  }
}

/**
 * 清空集合数据
 * 入参：{ action: "clear", collection: "routes"|"articles" }
 */
async function clearCollection(event) {
  const { collection } = event
  if (!['routes', 'articles', 'running_articles'].includes(collection)) {
    return fail('仅支持清空 routes、articles 或 running_articles 集合')
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
  if (!['routes', 'articles', 'weather', 'running_articles'].includes(collection)) {
    return fail('仅支持 routes、articles、weather、running_articles 集合')
  }

  try {
    const res = await db.collection(collection).count()
    return success({ count: res.total })
  } catch (err) {
    console.error('countCollection error:', err)
    return fail('查询数据量失败：' + err.message)
  }
}

/**
 * 批量更新路线数据
 * 入参：{ action: "update-routes", data: [{_id, ...fields}, ...] }
 * 按 _id 匹配，更新传入的字段
 */
async function updateRoutes(event) {
  const { data } = event
  if (!data || !Array.isArray(data) || data.length === 0) {
    return fail('没有需要更新的数据')
  }

  let updated = 0
  let failed = 0

  for (let i = 0; i < data.length; i += MAX_BATCH) {
    const batch = data.slice(i, i + MAX_BATCH)
    try {
      const tasks = batch.map(item => {
        const { _id, ...fields } = item
        if (!_id) return Promise.resolve()
        return db.collection('routes').doc(_id).update({ data: fields })
      })
      await Promise.all(tasks)
      updated += batch.length
    } catch (err) {
      failed += batch.length
      console.error('批量更新失败:', err)
    }
  }

  return success({ updated, failed }, `更新完成：成功${updated}条，失败${failed}条`)
}

// 云函数入口
exports.main = async (event) => {
  const { action } = event

  switch (action) {
    case 'import-routes':
      return await importRoutes(event)
    case 'import-articles':
      return await importArticles(event)
    case 'import-articles-from-cloud':
      return await importArticlesFromCloud(event)
    case 'update-routes':
      return await updateRoutes(event)
    case 'clear':
      return await clearCollection(event)
    case 'count':
      return await countCollection(event)
    default:
      return fail('未知操作。支持：import-routes, import-articles, import-articles-from-cloud, update-routes, clear, count')
  }
}
