// 跑步后台管理统一入口云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 管理员OPENID列表
const ADMIN_OPENIDS = ['ou_d6656d16bac3744e4a4b444432a70a8e']

// 统一响应
function success(data, message = 'success') { return { code: 0, message, data } }
function fail(message) { return { code: -1, message, data: null } }

// 获取openid并验证管理员权限
function getAdminOpenId() {
  const { OPENID } = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(OPENID)) {
    throw new Error('无权限')
  }
  return OPENID
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  
  try {
    // 验证管理员权限
    const openid = getAdminOpenId()
    
    switch (action) {
      // 获取统计数据
      case 'getDashboard':
        return await getDashboard()
      
      // 获取趋势数据
      case 'getTrendData':
        return await getTrendData(params)
      
      // 获取分类阅读排行
      case 'getTopArticles':
        return await getTopArticles(params)
      
      // 文章管理列表
      case 'getArticleList':
        return await getArticleList(params)
      
      // 获取单篇文章详情
      case 'getArticle':
        return await getArticle(params)
      
      // 新增或更新文章
      case 'saveArticle':
        return await saveArticle(params)
      
      // 删除文章
      case 'deleteArticle':
        return await deleteArticle(params)
      
      // 上下架文章
      case 'toggleArticle':
        return await toggleActive(params)
      
      default:
        return fail('未知操作')
    }
  } catch (err) {
    console.error('running-admin错误:', err)
    if (err.message === '无权限') {
      return fail('无权限')
    }
    return fail(err.message)
  }
}

// 获取统计数据
async function getDashboard() {
  // 文章总数
  const articlesRes = await db.collection('running_articles').count()
  
  // 用户总数（访问过跑步世界的用户）
  const usersRes = await db.collection('users').where({
    runningVisits: _.gt(0)
  }).count()
  
  // 累计阅读数
  const readingHistoryRes = await db.collection('running_reading_history').count()
  
  // 累计收藏数
  const favoritesRes = await db.collection('running_favorites').count()
  
  // 累计感受数
  const reviewsRes = await db.collection('running_reviews').count()
  
  // 累计分享数（从文章表汇总）
  const articlesData = await db.collection('running_articles')
    .where({})
    .get()
  
  let totalShareCount = 0
  articlesData.data.forEach(article => {
    totalShareCount += (article.shareCount || 0)
  })
  
  return success({
    totalArticles: articlesRes.total,
    totalUsers: usersRes.total,
    totalReads: readingHistoryRes.total,
    totalFavorites: favoritesRes.total,
    totalReviews: reviewsRes.total,
    totalShares: totalShareCount
  })
}

// 获取趋势数据
async function getTrendData(params) {
  const { dimension = 'day' } = params

  // 根据维度计算日期范围
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  let startDate = new Date()

  if (dimension === 'day') {
    startDate.setDate(startDate.getDate() - 29) // 最近30天
  } else if (dimension === 'week') {
    startDate.setDate(startDate.getDate() - 7 * 12) // 最近12周
  } else if (dimension === 'month') {
    startDate.setMonth(startDate.getMonth() - 11) // 最近12个月
  }

  const startStr = startDate.toISOString().split('T')[0]

  // 从 running_daily_stats 集合查询
  const { data } = await db.collection('running_daily_stats')
    .where({
      date: _.and(_.gte(startStr), _.lte(today))
    })
    .orderBy('date', 'asc')
    .get()

  // 按维度聚合
  const userTrend = [], readTrend = [], favoriteTrend = [], reviewTrend = [], shareTrend = []

  if (data.length > 0) {
    data.forEach(item => {
      const label = dimension === 'day' ? item.date.slice(5) : item.date
      userTrend.push({ label, value: item.newUsers || 0 })
      readTrend.push({ label, value: item.reads || 0 })
      favoriteTrend.push({ label, value: item.favorites || 0 })
      reviewTrend.push({ label, value: item.reviews || 0 })
      shareTrend.push({ label, value: item.shares || 0 })
    })
  }

  return success({ userTrend, readTrend, favoriteTrend, reviewTrend, shareTrend })
}

// 获取分类阅读排行
async function getTopArticles(params) {
  const { channel, limit = 10 } = params
  if (!channel || channel < 1 || channel > 7) {
    return fail('频道参数错误')
  }
  
  const { data } = await db.collection('running_articles')
    .where({ channel, isActive: true })
    .orderBy('viewCount', 'desc')
    .limit(limit)
    .get()
  
  return success(data)
}

// 文章管理列表
async function getArticleList(params) {
  const { page = 1, pageSize = 20, channel } = params
  let query = {}
  
  if (channel) {
    query.channel = channel
  }
  
  const countRes = await db.collection('running_articles').where(query).count()
  const { data } = await db.collection('running_articles')
    .where(query)
    .orderBy('order', 'asc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return success({
    list: data,
    total: countRes.total,
    page,
    pageSize
  })
}

// 获取单篇文章详情
async function getArticle(params) {
  const { id } = params
  if (!id) {
    return fail('缺少文章ID')
  }
  
  const { data } = await db.collection('running_articles').doc(id).get()
  if (!data) {
    return fail('文章不存在')
  }
  
  return success(data)
}

// 新增或更新文章
async function saveArticle(params) {
  const { id, ...articleData } = params
  
  // 验证必填字段
  const requiredFields = ['title', 'channel', 'subcategory', 'content']
  for (const field of requiredFields) {
    if (!articleData[field]) {
      return fail(`缺少必填字段: ${field}`)
    }
  }
  
  // 设置默认值
  const defaultData = {
    difficulty: 'beginner',
    readTime: '5分钟',
    order: 0,
    isActive: true,
    viewCount: 0,
    shareCount: 0,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
  
  const saveData = { ...defaultData, ...articleData }
  
  if (id) {
    // 更新文章
    delete saveData.createdAt
    delete saveData._id
    delete saveData._openid
    
    await db.collection('running_articles').doc(id).update({
      data: saveData
    })
    return success({ id }, '更新成功')
  } else {
    // 新增文章
    const res = await db.collection('running_articles').add({
      data: saveData
    })
    return success({ id: res._id }, '添加成功')
  }
}

// 删除文章
async function deleteArticle(params) {
  const { id } = params
  if (!id) {
    return fail('缺少文章ID')
  }
  
  await db.collection('running_articles').doc(id).remove()
  return success(null, '删除成功')
}

// 上下架文章
async function toggleActive(params) {
  const { id } = params
  if (!id) {
    return fail('缺少文章ID')
  }
  
  // 获取当前状态
  const { data } = await db.collection('running_articles').doc(id).get()
  if (!data) {
    return fail('文章不存在')
  }
  
  const newStatus = !data.isActive
  
  await db.collection('running_articles').doc(id).update({
    data: {
      isActive: newStatus,
      updatedAt: db.serverDate()
    }
  })
  
  return success({ isActive: newStatus }, newStatus ? '已上架' : '已下架')
}