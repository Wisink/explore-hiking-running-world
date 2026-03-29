// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const MAX_LIMIT = 100 // 云数据库单次查询最大条数

/**
 * 统一返回格式
 */
function success(data, msg = 'success') {
  return { code: 0, msg, data }
}

function fail(msg = '操作失败', data = null) {
  return { code: -1, msg, data }
}

/**
 * 构建筛选条件
 */
function buildFilter(params) {
  const { keyword, difficulty, region, season, scenery, family_friendly, features } = params
  const where = {}

  // 关键词模糊搜索（名称、简介）
  if (keyword && keyword.trim()) {
    const keywordTrimmed = keyword.trim()
    where.name = db.RegExp({
      regexp: keywordTrimmed,
      options: 'i'
    })
  }

  // 难度筛选
  if (difficulty) {
    where.difficulty = difficulty
  }

  // 地区筛选
  if (region) {
    where.region = region
  }

  // 季节筛选
  if (season) {
    where.seasons = _.elemMatch(_.eq(season))
  }

  // 风景类型筛选
  if (scenery) {
    where.scenery_types = _.elemMatch(_.eq(scenery))
  }

  // 亲子友好筛选
  if (family_friendly !== undefined && family_friendly !== '') {
    where.family_friendly = family_friendly === true || family_friendly === 'true'
  }

  // 特色标签筛选
  if (features && features.length > 0) {
    const featureList = Array.isArray(features) ? features : [features]
    where.features = _.all(featureList.map(f => _.elemMatch(_.eq(f))))
  }

  return where
}

/**
 * 获取路线列表（支持分页、筛选）
 * 参数：keyword, difficulty, region, season, scenery, family_friendly, features, page, pageSize
 */
async function getList(event) {
  const {
    keyword,
    difficulty,
    region,
    season,
    scenery,
    family_friendly,
    features,
    page = 1,
    pageSize = 10
  } = event

  const skip = (page - 1) * pageSize

  try {
    const where = buildFilter({ keyword, difficulty, region, season, scenery, family_friendly, features })

    // 查询总数
    const countRes = await db.collection('trails').where(where).count()
    const total = countRes.total

    // 分页查询
    const listRes = await db.collection('trails')
      .where(where)
      .orderBy('hot_score', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    return success({
      list: listRes.data,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    console.error('getList error:', err)
    return fail('获取路线列表失败：' + err.message)
  }
}

/**
 * 获取路线详情
 * 参数：id
 */
async function getDetail(event) {
  const { id } = event

  if (!id) {
    return fail('缺少路线ID')
  }

  try {
    const res = await db.collection('trails').doc(id).get()

    if (!res.data) {
      return fail('路线不存在')
    }

    // 增加浏览量
    await db.collection('trails').doc(id).update({
      data: {
        view_count: _.inc(1)
      }
    })

    return success(res.data)
  } catch (err) {
    console.error('getDetail error:', err)
    return fail('获取路线详情失败：' + err.message)
  }
}

/**
 * 搜索路线
 * 参数：keyword, filters, page, pageSize
 */
async function search(event) {
  const { keyword, filters = {}, page = 1, pageSize = 20 } = event

  if (!keyword || !keyword.trim()) {
    return fail('请输入搜索关键词')
  }

  const skip = (page - 1) * pageSize

  try {
    const keywordTrimmed = keyword.trim()

    // 构建搜索条件：名称、位置、描述匹配关键词
    const searchWhere = _.or([
      { name: db.RegExp({ regexp: keywordTrimmed, options: 'i' }) },
      { description: db.RegExp({ regexp: keywordTrimmed, options: 'i' }) },
      { location: db.RegExp({ regexp: keywordTrimmed, options: 'i' }) }
    ])

    // 构建筛选条件（适配前端传入的格式）
    const filterWhere = {}
    
    // 难度筛选（数组）
    if (filters.difficulty && filters.difficulty.length > 0) {
      filterWhere.difficulty = _.in(filters.difficulty)
    }
    
    // 地区筛选（数组）
    if (filters.region && filters.region.length > 0) {
      // 按地市名称筛选（模糊匹配）
      filterWhere.location = db.RegExp({
        regexp: filters.region.join('|'),
        options: 'i'
      })
    }
    
    // 季节筛选（数组）
    if (filters.season && filters.season.length > 0) {
      filterWhere.best_season = _.in(filters.season.map(s => new RegExp(s, 'i')))
    }
    
    // 风景评分筛选（数字）
    if (filters.score && filters.score > 0) {
      filterWhere.scenery = _.gte(filters.score)
    }
    
    // 亲子友好筛选（字符串 '是'/'否'）
    if (filters.familyFriendly === '是') {
      filterWhere.family_friendly = true
    } else if (filters.familyFriendly === '否') {
      filterWhere.family_friendly = false
    }
    
    // 费用筛选（字符串）
    if (filters.cost) {
      filterWhere.cost = db.RegExp({
        regexp: filters.cost,
        options: 'i'
      })
    }
    
    // 景色特点筛选（数组）
    if (filters.tags && filters.tags.length > 0) {
      filterWhere.features = _.all(filters.tags.map(tag => 
        db.RegExp({ regexp: tag, options: 'i' })
      ))
    }

    // 合并条件
    const where = filterWhere ? _.and([searchWhere, filterWhere]) : searchWhere

    // 查询总数
    const countRes = await db.collection('trails').where(where).count()
    const total = countRes.total

    // 分页查询
    const listRes = await db.collection('trails')
      .where(where)
      .orderBy('scenery', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    return success(listRes.data)
  } catch (err) {
    console.error('search error:', err)
    return fail('搜索路线失败：' + err.message)
  }
}

/**
 * 获取推荐路线
 * 按风景评分排序，取 top
 */
async function recommend(event) {
  const { limit = 6 } = event

  try {
    // 按风景评分排序，取 top
    const res = await db.collection('trails')
      .orderBy('scenery', 'desc')
      .limit(limit)
      .get()

    return success(res.data)
  } catch (err) {
    console.error('recommend error:', err)
    return fail('获取推荐路线失败：' + err.message)
  }
}

/**
 * 获取热门路线
 * 按点赞数排序，取 top
 */
async function hot(event) {
  const { limit = 10 } = event

  try {
    const res = await db.collection('trails')
      .orderBy('likes_count', 'desc')
      .limit(limit)
      .get()

    return success(res.data)
  } catch (err) {
    console.error('hot error:', err)
    return fail('获取热门路线失败：' + err.message)
  }
}

/**
 * 点赞路线
 * 参数：trail_id, user_id
 */
async function like(event) {
  const { trail_id, user_id } = event

  if (!trail_id || !user_id) {
    return fail('缺少必要参数')
  }

  try {
    // 检查是否已点赞
    const existingLike = await db.collection('likes').where({
      trail_id: trail_id,
      user_id: user_id
    }).get()

    if (existingLike.data && existingLike.data.length > 0) {
      // 已点赞，取消点赞
      await db.collection('likes').where({
        trail_id: trail_id,
        user_id: user_id
      }).remove()

      // 路线点赞数 -1（确保不小于0）
      const trailRes = await db.collection('trails').doc(trail_id).get()
      const currentLikes = trailRes.data.likes_count || 0
      const newLikes = Math.max(0, currentLikes - 1)
      
      await db.collection('trails').doc(trail_id).update({
        data: {
          likes_count: newLikes
        }
      })

      return success({ liked: false }, '已取消点赞')
    } else {
      // 未点赞，添加点赞
      await db.collection('likes').add({
        data: {
          trail_id: trail_id,
          user_id: user_id,
          created_at: db.serverDate()
        }
      })

      // 路线点赞数 +1
      await db.collection('trails').doc(trail_id).update({
        data: {
          likes_count: _.inc(1)
        }
      })

      return success({ liked: true }, '点赞成功')
    }
  } catch (err) {
    console.error('like error:', err)
    return fail('点赞操作失败：' + err.message)
  }
}

/**
 * 收藏路线
 * 参数：trail_id, user_id
 */
async function favorite(event) {
  const { trail_id, user_id } = event

  if (!trail_id || !user_id) {
    return fail('缺少必要参数')
  }

  try {
    // 检查是否已收藏
    const existingFav = await db.collection('favorites').where({
      trail_id: trail_id,
      user_id: user_id
    }).get()

    if (existingFav.data && existingFav.data.length > 0) {
      return success({ favorited: true }, '已经收藏过了')
    }

    // 添加收藏
    await db.collection('favorites').add({
      data: {
        trail_id: trail_id,
        user_id: user_id,
        created_at: db.serverDate()
      }
    })

    // 路线收藏数 +1
    await db.collection('trails').doc(trail_id).update({
      data: {
        favorites_count: _.inc(1)
      }
    })

    return success({ favorited: true }, '收藏成功')
  } catch (err) {
    console.error('favorite error:', err)
    return fail('收藏失败：' + err.message)
  }
}

/**
 * 取消收藏
 * 参数：trail_id, user_id
 */
async function unfavorite(event) {
  const { trail_id, user_id } = event

  if (!trail_id || !user_id) {
    return fail('缺少必要参数')
  }

  try {
    // 检查是否已收藏
    const existingFav = await db.collection('favorites').where({
      trail_id: trail_id,
      user_id: user_id
    }).get()

    if (!existingFav.data || existingFav.data.length === 0) {
      return success({ favorited: false }, '未收藏该路线')
    }

    // 移除收藏
    await db.collection('favorites').where({
      trail_id: trail_id,
      user_id: user_id
    }).remove()

    // 路线收藏数 -1（确保不小于0）
    const trailRes = await db.collection('trails').doc(trail_id).get()
    const currentFavorites = trailRes.data.favorites_count || 0
    const newFavorites = Math.max(0, currentFavorites - 1)
    
    await db.collection('trails').doc(trail_id).update({
      data: {
        favorites_count: newFavorites
      }
    })
    }

    return success({ favorited: false }, '已取消收藏')
  } catch (err) {
    console.error('unfavorite error:', err)
    return fail('取消收藏失败：' + err.message)
  }
}

/**
 * 检查是否已收藏
 * 参数：trail_id, user_id
 */
async function checkFavorite(event) {
  const { trail_id, user_id } = event

  if (!trail_id || !user_id) {
    return fail('缺少必要参数')
  }

  try {
    const res = await db.collection('favorites').where({
      trail_id: trail_id,
      user_id: user_id
    }).get()

    const isFavorited = res.data && res.data.length > 0

    return success({
      favorited: isFavorited
    })
  } catch (err) {
    console.error('checkFavorite error:', err)
    return fail('检查收藏状态失败：' + err.message)
  }
}

/**
 * 检查是否已点赞
 * 参数：trail_id, user_id
 */
async function checkLike(event) {
  const { trail_id, user_id } = event

  if (!trail_id || !user_id) {
    return fail('缺少必要参数')
  }

  try {
    const res = await db.collection('likes').where({
      trail_id: trail_id,
      user_id: user_id
    }).get()

    const isLiked = res.data && res.data.length > 0
    return success({ liked: isLiked })
  } catch (err) {
    console.error('checkLike error:', err)
    return fail('检查点赞状态失败：' + err.message)
  }
}

/**
 * 获取所有地区（从数据库中提取）
 * 按地市显示，按路线数量从高到低排序
 */
async function getRegions(event) {
  try {
    // 使用聚合管道统计各地市路线数量
    const aggRes = await db.collection('trails')
      .aggregate()
      .group({
        _id: '$location',
        count: $.sum(1)
      })
      .end()

    // 提取地市名称并统计数量
    const cityCount = {}
    aggRes.list.forEach(item => {
      if (item._id) {
        // 从"陕西省西安市xxx"中提取"西安市"
        const match = item._id.match(/省(.+?市)/)
        const city = match ? match[1] : item._id.match(/(.+?市)/)?.[1]
        if (city) {
          cityCount[city] = (cityCount[city] || 0) + item.count
        }
      }
    })

    // 按路线数量从高到低排序
    const regions = Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1])
      .map(([city]) => city)

    return success(regions)
  } catch (err) {
    console.error('getRegions error:', err)
    return fail('获取地区列表失败：' + err.message)
  }
}

/**
 * 修复负数点赞数和收藏数（管理员用）
 */
async function fixNegativeCounts(event) {
  try {
    // 查询所有路线
    const trailsRes = await db.collection('trails').get()
    let fixedCount = 0
    
    for (const trail of trailsRes.data) {
      const updateData = {}
      let needUpdate = false
      
      // 修复负数点赞数
      if ((trail.likes_count || 0) < 0) {
        updateData.likes_count = 0
        needUpdate = true
      }
      
      // 修复负数收藏数
      if ((trail.favorites_count || 0) < 0) {
        updateData.favorites_count = 0
        needUpdate = true
      }
      
      // 修复负数评论数
      if ((trail.comments_count || 0) < 0) {
        updateData.comments_count = 0
        needUpdate = true
      }
      
      if (needUpdate) {
        await db.collection('trails').doc(trail._id).update({
          data: updateData
        })
        fixedCount++
        console.log(`修复: ${trail.name} - 点赞:${trail.likes_count} 收藏:${trail.favorites_count} 评论:${trail.comments_count}`)
      }
    }
    
    return success({ fixedCount }, `修复完成，共修复 ${fixedCount} 条路线`)
  } catch (err) {
    console.error('fixNegativeCounts error:', err)
    return fail('修复失败：' + err.message)
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event

  switch (action) {
    case 'getList':
      return await getList(event)
    case 'getDetail':
      return await getDetail(event)
    case 'search':
      return await search(event)
    case 'recommend':
      return await recommend(event)
    case 'hot':
      return await hot(event)
    case 'like':
      return await like(event)
    case 'favorite':
      return await favorite(event)
    case 'unfavorite':
      return await unfavorite(event)
    case 'checkFavorite':
      return await checkFavorite(event)
    case 'checkLike':
      return await checkLike(event)
    case 'getRegions':
      return await getRegions(event)
    case 'fixNegativeCounts':
      return await fixNegativeCounts(event)
    default:
      return fail('未知操作：' + action)
  }
}
