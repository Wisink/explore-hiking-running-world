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
 * 解析范围字符串，返回 [min, max] 或 null
 * 例如: "0-3" -> [0, 3], "3-5" -> [3, 5], "20+" -> [20, Infinity], "1000+" -> [1000, Infinity]
 */
function parseRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null
  if (rangeStr.includes('+')) {
    const min = parseFloat(rangeStr.replace('+', ''))
    return [min, Infinity]
  }
  if (rangeStr.includes('-')) {
    const parts = rangeStr.split('-')
    return [parseFloat(parts[0]), parseFloat(parts[1])]
  }
  return null
}

/**
 * 获取路线列表（支持分页、筛选）
 * 入参：{ action: "list", page, pageSize, filterType, filter, keyword }
 * filterType: "tag" | "advanced" | "all"
 * - filterType === "tag": filter 是字符串标签（beginner/family/free 等）
 * - filterType === "advanced": filter 是 { difficulty, distance, elevation, surface, scenery, direction, cost, season }
 * - filterType === "all" 或未传: 不做额外筛选
 */
async function list(event) {
  let { page = 0, pageSize = 20, filterType, filter, keyword } = event
  const skip = Math.max(0, page) * pageSize
  const where = {}

  // 过滤无效路线
  where.isActive = true

  // 兼容旧调用：没有 filterType 时，按 filter 类型推断
  if (!filterType) {
    filterType = (typeof filter === 'string' && filter && filter !== 'all') ? 'tag' : 'all'
  }

  // 标签筛选
  if (filterType === 'tag' && typeof filter === 'string' && filter !== 'all') {
    switch (filter) {
      case 'beginner':
        where['difficulty.level'] = _.lte(1)
        break
      case 'family':
        where['difficulty.suitableFor'] = _.elemMatch(_.eq('亲子'))
        break
      case 'free':
        where['cost.type'] = '免费'
        break
      case 'east':
        where['location.direction'] = '秦岭东线'
        break
      case 'center':
        where['location.direction'] = '秦岭中线'
        break
      case 'west':
        where['location.direction'] = '秦岭西线'
        break
      case 'stream-waterfall':
        where['scenery'] = _.in(['溪流', '溪流清澈', '溪流潺潺', '瀑布', '瀑布壮观', '瀑布群', '瀑布群|溪流|峡谷', '瀑布|高冠峪|戏水|避暑'])
        break
      case 'redleaf':
        where['scenery'] = _.in(['红叶', '红叶漫山', '红叶|古寺|环线', '金黄', '秋色', '彩林', '银杏林'])
        break
      case 'meadow':
        where['scenery'] = _.in(['草甸', '高山草甸'])
        break
      case 'culture':
        where['scenery'] = _.in(['古寺', '古道', '历史遗迹', '古迹', '遗址', '古建筑', '石窟', '佛像', '壁塑'])
        break
      case 'nearby':
        where['location.direction'] = _.in(['秦岭中线', '秦岭中西线'])
        break
      case 'advanced':
        where['difficulty.level'] = _.gte(2)
        break
      case 'stone':
        // stone标签已移除，兼容返回空
        break
      case 'season': {
        const month = new Date().getMonth() + 1
        if (month >= 3 && month <= 5) {
          where['best_season'] = _.in(['春', '春季', '全年', '春夏'])
        } else if (month >= 6 && month <= 8) {
          where['best_season'] = _.in(['夏', '夏季', '全年', '春夏', '夏秋'])
        } else if (month >= 9 && month <= 11) {
          where['scenery'] = _.in(['红叶', '红叶漫山', '红叶|古寺|环线', '银杏林', '金黄', '秋色', '彩林'])
        } else {
          where['best_season'] = _.in(['冬', '冬季', '全年'])
        }
        break
      }
      case 'hot':
        break
      default:
        break
    }
  }

  // 高级筛选（支持 distance/elevation/surface/scenery/direction/cost/season）
  if (filterType === 'advanced' && typeof filter === 'object' && filter) {
    if (filter.difficulty && filter.difficulty.length > 0) {
      where['difficulty.level'] = _.in(filter.difficulty)
    }
    if (filter.cost) {
      where['cost.type'] = filter.cost
    }
    if (filter.direction && filter.direction !== 'all') {
      where['location.direction'] = filter.direction
    }
    if (filter.season && filter.season !== 'all') {
      where['best_season'] = filter.season
    }
    if (filter.distance) {
      const range = parseRange(filter.distance)
      if (range && range[1] === Infinity) {
        where.distance_km = _.gte(range[0])
      } else if (range) {
        where.distance_km = _.gte(range[0]).and(_.lte(range[1]))
      }
    }
    if (filter.elevation) {
      const range = parseRange(filter.elevation)
      if (range && range[1] === Infinity) {
        where.elevation_gain_m = _.gte(range[0])
      } else if (range && (range[0] > 0 || range[0] === 0)) {
        where.elevation_gain_m = _.gte(range[0]).and(_.lte(range[1]))
      }
    }
    if (filter.surface) {
      const surfaceMap = {
        '步道/土路': '步道',
        '水泥路/土路': '水泥路',
        '山间小道': '山间小道',
        '山脊/林间路': '山脊',
        '林间路': '林间路',
        '土路': '土路'
      }
      const keywords = Object.values(surfaceMap)
      where['sections.road'] = db.RegExp({
        regexp: keywords.join('|'),
        options: 'i'
      })
    }
    if (filter.scenery) {
      // filter.scenery 是单个关键词，用 RegExp 匹配 scenery 数组
      where['scenery'] = db.RegExp({
        regexp: filter.scenery,
        options: 'i'
      })
    }
    if (filter.suitableFor) {
      where['difficulty.suitableFor'] = _.elemMatch(_.eq(filter.suitableFor))
    }
  }

  // 搜索关键词（通过云端 search action 走专门的搜索函数）
  if (filterType === 'search' && keyword) {
    return await doSearch(keyword, page, pageSize)
  }

  try {
    const countRes = await db.collection('routes').where(where).count()
    const total = countRes.total

    const listRes = await db.collection('routes')
      .where(where)
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true, name: true, description: true, coverImage: true,
        difficulty: true, distance_km: true, duration_hours: true,
        cost: true, scenery: true, location: true, order: true,
        best_season: true, sections: true, elevation_gain_m: true
      })
      .get()

    return success({
      list: listRes.data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    console.error('routes list error:', err)
    return fail('获取路线列表失败：' + err.message)
  }
}

/**
 * 搜索路线（用于 list 内部的 filterType === 'search' 调用）
 */
async function doSearch(keyword, page, pageSize) {
  if (!keyword || !keyword.trim()) return fail('请输入搜索关键词')
  const kw = keyword.trim()
  const skip = Math.max(0, page) * pageSize

  const searchCondition = _.and([
    { isActive: true },
    _.or([
      { name: db.RegExp({ regexp: kw, options: 'i' }) },
      { description: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'location.address': db.RegExp({ regexp: kw, options: 'i' }) },
      { scenery: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'difficulty.suitableFor': db.RegExp({ regexp: kw, options: 'i' }) }
    ])
  ])

  try {
    const countRes = await db.collection('routes').where(searchCondition).count()
    const listRes = await db.collection('routes')
      .where(searchCondition)
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()

    return success({
      list: listRes.data,
      total: countRes.total,
      page,
      pageSize
    })
  } catch (err) {
    console.error('routes doSearch error:', err)
    return fail('搜索路线失败：' + err.message)
  }
}

/**
 * 获取路线详情
 * 入参：{ action: "detail", routeId }
 */
async function detail(event) {
  const { routeId } = event
  if (!routeId) return fail('缺少路线ID')

  try {
    const res = await db.collection('routes').doc(routeId).get()
    if (!res.data) return fail('路线不存在')
    // 检查路线是否有效
    if (res.data.isActive === false) return fail('路线已下架')
    return success(res.data)
  } catch (err) {
    console.error('routes detail error:', err)
    return fail('获取路线详情失败：' + err.message)
  }
}

/**
 * 搜索路线
 * 入参：{ action: "search", keyword, page, pageSize }
 */
async function search(event) {
  const { keyword, page = 1, pageSize = 20 } = event
  if (!keyword || !keyword.trim()) return fail('请输入搜索关键词')

  const skip = Math.max(0, page) * pageSize
  const kw = keyword.trim()

  // 名称、描述、地址、风景标签模糊搜索 + 仅搜索有效路线
  const searchCondition = _.and([
    { isActive: true },
    _.or([
      { name: db.RegExp({ regexp: kw, options: 'i' }) },
      { description: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'location.address': db.RegExp({ regexp: kw, options: 'i' }) },
      { scenery: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'difficulty.suitableFor': db.RegExp({ regexp: kw, options: 'i' }) }
    ])
  ])

  try {
    const countRes = await db.collection('routes').where(searchCondition).count()
    const total = countRes.total

    const listRes = await db.collection('routes')
      .where(searchCondition)
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()

    return success({
      list: listRes.data,
      total,
      page,
      pageSize
    })
  } catch (err) {
    console.error('routes search error:', err)
    return fail('搜索路线失败：' + err.message)
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
    case 'search':
      return await search(event)
    default:
      return fail('未知操作：' + action)
  }
}
