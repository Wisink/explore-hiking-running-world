// 跑步业务统一入口云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 统一响应
function success(data, message = 'success') { return { code: 0, message, data } }
function fail(message) { return { code: -1, message, data: null } }

// 获取openid
function getOpenId() {
  const { OPENID } = cloud.getWXContext()
  return OPENID
}

// ===== 频道数据 =====
const CHANNELS = [
  { id: 1, name: '跑步观念', description: '建立正确的跑步认知和理念', icon: '🎯' },
  { id: 2, name: '从零开始跑', description: '新手入门指南，从走路到跑步', icon: '🚀' },
  { id: 3, name: '训练方法', description: '科学训练，提升跑步能力', icon: '📊' },
  { id: 4, name: '无伤跑步', description: '预防损伤，健康跑步', icon: '🏥' },
  { id: 5, name: '装备指南', description: '选择合适的跑步装备', icon: '👟' },
  { id: 6, name: '跑步文化', description: '跑步的历史、哲学和文化', icon: '📚' },
  { id: 7, name: '专题合集', description: '精选专题内容', icon: '⭐' }
]

// ===== 子分类数据 =====
const SUBCATEGORIES = {
  1: [
    { id: '1.1', name: '跑步前的心理准备' },
    { id: '1.2', name: '跑步认知纠偏' },
    { id: '1.3', name: '正确的跑绩观' },
    { id: '1.4', name: '跑步与健康' },
    { id: '1.5', name: '不同人群建议' }
  ],
  2: [
    { id: '2.1', name: '第一次出门跑' },
    { id: '2.2', name: '走跑交替' },
    { id: '2.3', name: '第一个月常见问题' },
    { id: '2.4', name: '从能跑到跑得舒服' }
  ],
  3: [
    { id: '3.1', name: '跑步关键指标' },
    { id: '3.2', name: '训练方法详解' },
    { id: '3.3', name: '训练计划设计' },
    { id: '3.4', name: '跑步技术' },
    { id: '3.5', name: '交叉训练与力量' }
  ],
  4: [
    { id: '4.1', name: '听懂身体信号' },
    { id: '4.2', name: '损伤预防5原则' },
    { id: '4.3', name: '常见损伤详解' },
    { id: '4.4', name: '受伤了怎么办' },
    { id: '4.5', name: '跑姿与损伤' }
  ],
  5: [
    { id: '5.1', name: '跑鞋' },
    { id: '5.2', name: '运动服装' },
    { id: '5.3', name: '运动手表与心率设备' },
    { id: '5.4', name: '其他装备' }
  ],
  6: [
    { id: '6.1', name: '跑步历史与故事' },
    { id: '6.2', name: '跑步哲学与思考' },
    { id: '6.3', name: '全球跑步文化' },
    { id: '6.4', name: '跑者故事' }
  ],
  7: [
    { id: '7.1', name: '新手入门专题' },
    { id: '7.2', name: '马拉松备赛专题' },
    { id: '7.3', name: '减肥跑步专题' },
    { id: '7.4', name: '女性跑步专题' },
    { id: '7.5', name: '中老年跑步专题' },
    { id: '7.6', name: '跑步与营养专题' },
    { id: '7.7', name: '跑步心理专题' },
    { id: '7.8', name: '跑步与睡眠专题' },
    { id: '7.9', name: '跑步与工作专题' },
    { id: '7.10', name: '跑步社群专题' }
  ]
}

exports.main = async (event, context) => {
  const { action, ...params } = event
  const openid = getOpenId()

  try {
    switch (action) {
      // 获取频道列表
      case 'getChannels':
        return success(CHANNELS)
      
      // 获取子分类列表
      case 'getSubcategories':
        return await getSubcategories(params)
      
      // 获取文章列表
      case 'getArticles':
        return await getArticles(params)
      
      // 获取文章详情
      case 'getArticle':
        return await getArticle(params, openid)
      
      // 搜索文章
      case 'search':
        return await searchArticles(params)
      
      // 收藏/取消收藏
      case 'toggleFavorite':
        return await toggleFavorite(params, openid)
      
      // 保存阅读感受
      case 'saveReview':
        return await saveReview(params, openid)
      
      // 获取我的收藏列表
      case 'getMyFavorites':
        return await getMyFavorites(openid)
      
      // 获取我的阅读感受列表
      case 'getMyReviews':
        return await getMyReviews(openid)
      
      // 获取个人统计
      case 'getMyStats':
        return await getMyStats(openid)

      // 检查收藏状态
      case 'checkFavorite':
        return await checkFavorite(params, openid)

      // 获取我的感受（单篇文章）
      case 'getMyReview':
        return await getMyReview(params, openid)

      // 删除感受
      case 'deleteReview':
        return await deleteReview(params, openid)

      // 获取频道文章统计
      case 'getChannelStats':
        return await getChannelStats()

      // 获取子分类文章统计
      case 'getSubcategoryStats':
        return await getSubcategoryStats(params)

      default:
        return fail('未知操作')
    }
  } catch (err) {
    console.error('running-api错误:', err)
    return fail(err.message)
  }
}

// 获取子分类列表
async function getSubcategories(params) {
  const { channel } = params
  if (!channel || channel < 1 || channel > 7) {
    return fail('频道参数错误')
  }
  return success(SUBCATEGORIES[channel] || [])
}

// 获取文章列表
async function getArticles(params) {
  const { subcategory, page = 0, pageSize = 10 } = params
  if (!subcategory) {
    return fail('缺少subcategory参数')
  }
  
  const query = {
    subcategory,
    isActive: true
  }
  
  const countRes = await db.collection('running_articles').where(query).count()
  const { data } = await db.collection('running_articles')
    .where(query)
    .orderBy('order', 'asc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()
  
  return success({
    list: data,
    total: countRes.total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < countRes.total
  })
}

// 获取文章详情并自增阅读数
async function getArticle(params, openid) {
  const { id } = params
  if (!id) {
    return fail('缺少文章ID')
  }
  
  // 获取文章详情
  const { data } = await db.collection('running_articles').doc(id).get()
  if (!data) {
    return fail('文章不存在')
  }
  
  // 自增阅读数
  await db.collection('running_articles').doc(id).update({
    data: { viewCount: _.inc(1) }
  })
  
  // 记录阅读历史
  await db.collection('running_reading_history').add({
    data: {
      _openid: openid,
      articleId: id,
      readAt: db.serverDate()
    }
  })
  
  // 获取用户收藏状态
  const favoriteRes = await db.collection('running_favorites')
    .where({ _openid: openid, articleId: id })
    .count()
  const isFavorited = favoriteRes.total > 0
  
  // 获取用户阅读感受
  const reviewRes = await db.collection('running_reviews')
    .where({ _openid: openid, articleId: id })
    .limit(1)
    .get()
  const userReview = reviewRes.data.length > 0 ? reviewRes.data[0] : null
  
  return success({
    ...data,
    viewCount: (data.viewCount || 0) + 1,
    isFavorited,
    userReview
  })
}

// 搜索文章
async function searchArticles(params) {
  const { keyword } = params
  if (!keyword || keyword.trim() === '') {
    return fail('搜索关键词不能为空')
  }
  
  const query = {
    isActive: true,
    _or: [
      { title: db.RegExp({ origin: keyword, options: 'i' }) },
      { content: db.RegExp({ origin: keyword, options: 'i' }) }
    ]
  }
  
  const { data } = await db.collection('running_articles')
    .where(query)
    .limit(30)
    .get()
  
  return success(data)
}

// 收藏/取消收藏
async function toggleFavorite(params, openid) {
  const { articleId } = params
  if (!articleId) {
    return fail('缺少文章ID')
  }
  
  // 检查是否已收藏
  const existing = await db.collection('running_favorites')
    .where({ _openid: openid, articleId })
    .limit(1)
    .get()
  
  if (existing.data.length > 0) {
    // 取消收藏
    await db.collection('running_favorites').doc(existing.data[0]._id).remove()
    return success({ isFavorited: false }, '已取消收藏')
  } else {
    // 添加收藏
    await db.collection('running_favorites').add({
      data: {
        _openid: openid,
        articleId,
        createdAt: db.serverDate()
      }
    })
    return success({ isFavorited: true }, '收藏成功')
  }
}

// 保存阅读感受
async function saveReview(params, openid) {
  const { articleId, content } = params
  if (!articleId || !content) {
    return fail('缺少必要参数')
  }

  // 检查是否已有感受
  const existing = await db.collection('running_reviews')
    .where({ _openid: openid, articleId })
    .limit(1)
    .get()

  if (existing.data.length > 0) {
    // 更新感受
    const updatedAt = db.serverDate()
    await db.collection('running_reviews').doc(existing.data[0]._id).update({
      data: {
        content,
        updatedAt
      }
    })
    // 返回数据库中已有的 createdAt，updatedAt 用当前时间
    return success({
      _id: existing.data[0]._id,
      content,
      createdAt: existing.data[0].createdAt,
      updatedAt: new Date().toISOString()
    }, '保存成功')
  } else {
    // 新增感受
    const createdAt = db.serverDate()
    const res = await db.collection('running_reviews').add({
      data: {
        _openid: openid,
        articleId,
        content,
        createdAt,
        updatedAt: createdAt
      }
    })
    // 返回当前时间（ISO字符串），数据库里已正确存储 serverDate
    const nowStr = new Date().toISOString()
    return success({
      _id: res._id,
      content,
      createdAt: nowStr,
      updatedAt: nowStr
    }, '保存成功')
  }
}

// 获取我的收藏列表
async function getMyFavorites(openid) {
  const { data } = await db.collection('running_favorites')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .get()
  
  if (data.length === 0) {
    return success([])
  }
  
  // 获取文章信息
  const articleIds = data.map(item => item.articleId)
  const { data: articles } = await db.collection('running_articles')
    .where({ _id: _.in(articleIds) })
    .get()
  
  const articleMap = {}
  articles.forEach(article => {
    articleMap[article._id] = article
  })
  
  const result = data.map(favorite => ({
    ...favorite,
    article: articleMap[favorite.articleId] || null
  }))
  
  return success(result)
}

// 获取我的阅读感受列表
async function getMyReviews(openid) {
  const { data } = await db.collection('running_reviews')
    .where({ _openid: openid })
    .orderBy('updatedAt', 'desc')
    .get()
  
  if (data.length === 0) {
    return success([])
  }
  
  // 获取文章信息
  const articleIds = data.map(item => item.articleId)
  const { data: articles } = await db.collection('running_articles')
    .where({ _id: _.in(articleIds) })
    .get()
  
  const articleMap = {}
  articles.forEach(article => {
    articleMap[article._id] = article
  })
  
  const result = data.map(review => ({
    ...review,
    article: articleMap[review.articleId] || null
  }))
  
  return success(result)
}

// 获取个人统计
async function getMyStats(openid) {
  // 阅读文章数
  const readingHistoryRes = await db.collection('running_reading_history')
    .where({ _openid: openid })
    .count()
  
  // 访问次数
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()
  const runningVisits = userRes.data.length > 0 ? (userRes.data[0].runningVisits || 0) : 0
  
  // 收藏数
  const favoritesRes = await db.collection('running_favorites')
    .where({ _openid: openid })
    .count()
  
  // 感受数
  const reviewsRes = await db.collection('running_reviews')
    .where({ _openid: openid })
    .count()
  
  return success({
    readArticleCount: readingHistoryRes.total,
    visitCount: runningVisits,
    favoritesCount: favoritesRes.total,
    reviewsCount: reviewsRes.total
  })
}

// 检查收藏状态
async function checkFavorite(params, openid) {
  const { articleId } = params
  if (!articleId) {
    return fail('缺少文章ID')
  }

  const existing = await db.collection('running_favorites')
    .where({ _openid: openid, articleId })
    .count()

  return success({ isFavorited: existing.total > 0 })
}

// 获取我的感受（单篇文章）
async function getMyReview(params, openid) {
  const { articleId } = params
  if (!articleId) {
    return fail('缺少文章ID')
  }

  const { data } = await db.collection('running_reviews')
    .where({ _openid: openid, articleId })
    .limit(1)
    .get()

  if (data.length === 0) {
    return success(null)
  }

  return success(data[0])
}

// 删除感受
async function deleteReview(params, openid) {
  const { articleId } = params
  if (!articleId) {
    return fail('缺少文章ID')
  }

  const { data } = await db.collection('running_reviews')
    .where({ _openid: openid, articleId })
    .limit(1)
    .get()

  if (data.length === 0) {
    return fail('感受不存在')
  }

  await db.collection('running_reviews').doc(data[0]._id).remove()
  return success(null, '删除成功')
}

// 获取频道文章统计
async function getChannelStats() {
  const { data } = await db.collection('running_articles')
    .aggregate()
    .match({ isActive: true })
    .group({
      _id: '$channel',
      count: db.command.aggregate.sum(1)
    })
    .end()

  // 转换为 { 1: 29, 2: 18, ... } 格式
  const stats = {}
  data.forEach(item => {
    stats[item._id] = item.count
  })

  return success(stats)
}

// 获取子分类文章统计
async function getSubcategoryStats(params) {
  const { channel } = params
  if (!channel) {
    return fail('缺少频道参数')
  }

  const { data } = await db.collection('running_articles')
    .aggregate()
    .match({
      isActive: true,
      channel: parseInt(channel)
    })
    .group({
      _id: '$subcategory',
      count: db.command.aggregate.sum(1)
    })
    .end()

  // 转换为 { '1.1': 4, '1.2': 7, ... } 格式
  const stats = {}
  data.forEach(item => {
    stats[item._id] = item.count
  })

  return success(stats)
}