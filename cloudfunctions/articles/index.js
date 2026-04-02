const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 统一返回格式
function success(data, message = 'success') {
  return { code: 0, message, data }
}
function fail(message = '操作失败', data = null) {
  return { code: -1, message, data }
}

/**
 * 获取文章列表（支持分类筛选和分页）
 * 入参：{ action: "list", category, page, pageSize }
 * category: "装备选购" | "安全自救" | "户外礼仪" 等
 */
async function list(event) {
  const { category, page = 1, pageSize = 20 } = event
  const skip = (page - 1) * pageSize
  const where = { isActive: true }

  if (category) {
    where.category = category
  }

  try {
    const countRes = await db.collection('articles').where(where).count()
    const total = countRes.total

    const listRes = await db.collection('articles')
      .where(where)
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true, category: true, title: true,
        summary: true, coverImage: true, order: true, createdAt: true
      })
      .get()

    return success({
      list: listRes.data,
      total,
      page,
      pageSize
    })
  } catch (err) {
    console.error('articles list error:', err)
    return fail('获取文章列表失败：' + err.message)
  }
}

/**
 * 获取文章详情
 * 入参：{ action: "detail", articleId }
 */
async function detail(event) {
  const { articleId } = event
  if (!articleId) return fail('缺少文章ID')

  try {
    const res = await db.collection('articles').doc(articleId).get()
    if (!res.data) return fail('文章不存在')
    // 检查文章是否有效
    if (res.data.isActive === false) return fail('文章已下架')
    return success(res.data)
  } catch (err) {
    console.error('articles detail error:', err)
    return fail('获取文章详情失败：' + err.message)
  }
}

/**
 * 获取推荐文章（按 order 排序取前几篇）
 * 入参：{ action: "recommend", limit }
 */
async function recommend(event) {
  const { limit = 3 } = event

  try {
    const res = await db.collection('articles')
      .where({ isActive: true })
      .orderBy('order', 'asc')
      .limit(limit)
      .field({
        _id: true, category: true, title: true,
        summary: true, coverImage: true
      })
      .get()

    return success(res.data)
  } catch (err) {
    console.error('articles recommend error:', err)
    return fail('获取推荐文章失败：' + err.message)
  }
}

/**
 * 增加文章阅读次数
 * 入参：{ action: "incrementView", articleId }
 */
async function incrementView(event) {
  const { articleId } = event
  if (!articleId) return fail('缺少文章ID')

  try {
    const res = await db.collection('articles').doc(articleId).update({
      data: { viewCount: _.inc(1) }
    })
    console.log('[incrementView] articleId:', articleId, 'updated:', res.stats)
    return success({ updated: res.stats.updated })
  } catch (err) {
    console.error('[incrementView] error:', articleId, err)
    return fail('增加阅读次数失败：' + err.message)
  }
}

// 云函数入口
exports.main = async (event) => {
  const { action } = event

  switch (action) {
    case 'list':
      return await list(event)
    case 'detail':
      return await detail(event)
    case 'recommend':
      return await recommend(event)
    case 'incrementView':
      return await incrementView(event)
    default:
      return fail('未知操作：' + action)
  }
}
