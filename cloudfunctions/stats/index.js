/**
 * 统计云函数
 * 功能：总览统计、日/周/月统计、热门路线、活跃用户、地区统计
 * 数据表：users, trails, comments, corrections, likes, favorites
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const MAX_LIMIT = 100

/**
 * 统一返回格式
 */
function result(code, msg, data) {
  return { code, msg, data }
}

/**
 * 获取日期范围
 */
function getDateRange(dateStr) {
  const date = new Date(dateStr)
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { start, end }
}

function getWeekRange(weekStartStr) {
  const start = new Date(weekStartStr)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function getMonthRange(monthStr) {
  // monthStr 格式: "2024-03"
  const [year, month] = monthStr.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  return { start, end }
}

/**
 * 获取集合数量（兼容超过1000条的情况）
 */
async function getCollectionCount(collection, where = {}) {
  try {
    const res = await db.collection(collection).where(where).count()
    return res.total
  } catch (e) {
    console.error(`获取${collection}数量失败:`, e)
    return 0
  }
}

/**
 * 获取总览数据
 */
async function getOverview() {
  const [userCount, trailCount, commentCount, correctionCount] = await Promise.all([
    getCollectionCount('users'),
    getCollectionCount('trails'),
    getCollectionCount('comments', { status: _.neq('deleted') }),
    getCollectionCount('corrections')
  ])

  // 获取今日新增
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [todayUsers, todayComments] = await Promise.all([
    getCollectionCount('users', { created_at: _.gte(today) }),
    getCollectionCount('comments', { created_at: _.gte(today), status: 'normal' })
  ])

  return result(0, 'success', {
    total: {
      users: userCount,
      trails: trailCount,
      comments: commentCount,
      corrections: correctionCount
    },
    today: {
      newUsers: todayUsers,
      newComments: todayComments
    }
  })
}

/**
 * 获取每日统计
 * @param {Object} params - { date }
 */
async function getDailyStats(params) {
  const { date } = params

  if (!date) {
    return result(-1, '缺少date参数')
  }

  const { start, end } = getDateRange(date)

  // 查询条件
  const dateFilter = {
    created_at: _.gte(start).and(_.lt(end))
  }

  // 并行查询各项数据
  const [newUsers, newComments, newCorrections, likesCount, favoritesCount] = await Promise.all([
    getCollectionCount('users', dateFilter),
    getCollectionCount('comments', { ...dateFilter, status: 'normal' }),
    getCollectionCount('corrections', dateFilter),
    getCollectionCount('likes', dateFilter),
    getCollectionCount('favorites', dateFilter)
  ])

  return result(0, 'success', {
    date,
    newUsers,
    newComments,
    newCorrections,
    likes: likesCount,
    favorites: favoritesCount
  })
}

/**
 * 获取每周统计
 * @param {Object} params - { week_start }
 */
async function getWeeklyStats(params) {
  const { week_start } = params

  if (!week_start) {
    return result(-1, '缺少week_start参数')
  }

  const { start, end } = getWeekRange(week_start)

  const dateFilter = {
    created_at: _.gte(start).and(_.lt(end))
  }

  const [newUsers, newComments, newCorrections, likesCount, favoritesCount] = await Promise.all([
    getCollectionCount('users', dateFilter),
    getCollectionCount('comments', { ...dateFilter, status: 'normal' }),
    getCollectionCount('corrections', dateFilter),
    getCollectionCount('likes', dateFilter),
    getCollectionCount('favorites', dateFilter)
  ])

  // 获取每日明细
  const dailyStats = []
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(start)
    dayStart.setDate(dayStart.getDate() + i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const dayFilter = { created_at: _.gte(dayStart).and(_.lt(dayEnd)) }

    const [dayUsers, dayComments] = await Promise.all([
      getCollectionCount('users', dayFilter),
      getCollectionCount('comments', { ...dayFilter, status: 'normal' })
    ])

    dailyStats.push({
      date: dayStart.toISOString().split('T')[0],
      newUsers: dayUsers,
      newComments: dayComments
    })
  }

  return result(0, 'success', {
    weekStart: week_start,
    total: {
      newUsers,
      newComments,
      newCorrections,
      likes: likesCount,
      favorites: favoritesCount
    },
    daily: dailyStats
  })
}

/**
 * 获取每月统计
 * @param {Object} params - { month }
 */
async function getMonthlyStats(params) {
  const { month } = params

  if (!month) {
    return result(-1, '缺少month参数')
  }

  const { start, end } = getMonthRange(month)

  const dateFilter = {
    created_at: _.gte(start).and(_.lt(end))
  }

  const [newUsers, newComments, newCorrections, likesCount, favoritesCount] = await Promise.all([
    getCollectionCount('users', dateFilter),
    getCollectionCount('comments', { ...dateFilter, status: 'normal' }),
    getCollectionCount('corrections', dateFilter),
    getCollectionCount('likes', dateFilter),
    getCollectionCount('favorites', dateFilter)
  ])

  // 获取周统计
  const weeklyStats = []
  const currentDate = new Date(start)
  while (currentDate < end) {
    const weekEnd = new Date(currentDate)
    weekEnd.setDate(weekEnd.getDate() + 7)
    if (weekEnd > end) weekEnd.setTime(end.getTime())

    const weekFilter = { created_at: _.gte(currentDate).and(_.lt(weekEnd)) }

    const [weekUsers, weekComments] = await Promise.all([
      getCollectionCount('users', weekFilter),
      getCollectionCount('comments', { ...weekFilter, status: 'normal' })
    ])

    weeklyStats.push({
      weekStart: currentDate.toISOString().split('T')[0],
      newUsers: weekUsers,
      newComments: weekComments
    })

    currentDate.setDate(currentDate.getDate() + 7)
  }

  return result(0, 'success', {
    month,
    total: {
      newUsers,
      newComments,
      newCorrections,
      likes: likesCount,
      favorites: favoritesCount
    },
    weekly: weeklyStats
  })
}

/**
 * 获取热门路线排行
 * @param {Object} params - { limit }
 */
async function getHotTrails(params) {
  const { limit = 10 } = params

  // 按评论数和评分排序
  const listRes = await db.collection('trails')
    .orderBy('review_count', 'desc')
    .orderBy('rating', 'desc')
    .limit(Math.min(limit, MAX_LIMIT))
    .get()

  // 获取每条路线的收藏数
  const trailsWithStats = await Promise.all(
    listRes.data.map(async (trail) => {
      const favCount = await getCollectionCount('favorites', { trail_id: trail._id })
      return {
        ...trail,
        favorite_count: favCount
      }
    })
  )

  return result(0, 'success', { list: trailsWithStats })
}

/**
 * 获取活跃用户排行
 * @param {Object} params - { limit }
 */
async function getActiveUsers(params) {
  const { limit = 10 } = params

  // 按评论数聚合统计
  const commentStats = await db.collection('comments')
    .aggregate()
    .match({ status: 'normal' })
    .group({
      _id: '$user_id',
      comment_count: $.sum(1),
      last_active: $.max('$created_at')
    })
    .sort({ comment_count: -1 })
    .limit(Math.min(limit, MAX_LIMIT))
    .end()

  // 获取用户详细信息
  const userIds = commentStats.list.map(item => item._id)

  if (userIds.length === 0) {
    return result(0, 'success', { list: [] })
  }

  const usersRes = await db.collection('users')
    .where({ _id: _.in(userIds) })
    .get()

  const userMap = {}
  usersRes.data.forEach(user => {
    userMap[user._id] = user
  })

  const list = commentStats.list.map((stat, index) => ({
    rank: index + 1,
    user_id: stat._id,
    nickname: userMap[stat._id] ? (userMap[stat._id].nickname || '匿名用户') : '未知用户',
    avatar: userMap[stat._id] ? (userMap[stat._id].avatar || '') : '',
    comment_count: stat.comment_count,
    last_active: stat.last_active
  }))

  return result(0, 'success', { list })
}

/**
 * 获取地区统计
 */
async function getRegionStats() {
  // 按路线地区统计
  const regionRes = await db.collection('trails')
    .aggregate()
    .group({
      _id: '$region',
      trail_count: $.sum(1),
      avg_rating: $.avg('$rating')
    })
    .sort({ trail_count: -1 })
    .end()

  const list = regionRes.list.map(item => ({
    region: item._id || '未知地区',
    trail_count: item.trail_count,
    avg_rating: Math.round((item.avg_rating || 0) * 10) / 10
  }))

  return result(0, 'success', { list })
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action, ...params } = event

  try {
    switch (action) {
      case 'getOverview':
        return await getOverview()
      case 'getDailyStats':
        return await getDailyStats(params)
      case 'getWeeklyStats':
        return await getWeeklyStats(params)
      case 'getMonthlyStats':
        return await getMonthlyStats(params)
      case 'getHotTrails':
        return await getHotTrails(params)
      case 'getActiveUsers':
        return await getActiveUsers(params)
      case 'getRegionStats':
        return await getRegionStats()
      default:
        return result(-1, `未知操作: ${action}`)
    }
  } catch (err) {
    console.error('stats云函数错误:', err)
    return result(-1, '服务器内部错误', { error: err.message })
  }
}
