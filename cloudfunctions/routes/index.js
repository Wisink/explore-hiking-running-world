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

// 解析范围字符串如 "0-3"、"1000+" 为 {min, max}
function parseRange(rangeStr) {
  if (!rangeStr) return null
  if (rangeStr.includes('+')) {
    return { min: parseFloat(rangeStr.replace('+', '')), max: Infinity }
  }
  const parts = rangeStr.split('-').map(Number)
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { min: parts[0], max: parts[1] }
  }
  return null
}

/**
 * 获取路线列表（支持分页、筛选）
 * 入参：{ action: "list", page, pageSize, filterType, filter, keyword }
 * filterType: "tag" | "advanced" | "search" | "keyword" | "all"
 * - filterType === "tag": filter 是字符串标签（beginner/family/free/stream/waterfall/forest/season 等）
 * - filterType === "advanced": filter 是 { difficulty, distance, elevation, surface, scenery, direction, cost }
 * - filterType === "search": keyword 做综合搜索
 * - filterType === "keyword": keyword 做名称模糊搜索
 * - filterType === "all" 或未传: 不做额外筛选
 */
async function list(event) {
  let { page = 0, pageSize = 20, filterType, filter, keyword } = event
  // 兼容前端传 0-indexed 的 page
  let skip = Math.max(0, page) * pageSize
  const where = {}

  // 过滤无效路线
  where.isActive = true

  // 兼容旧调用：没有 filterType 时，按 filter 类型推断
  if (!filterType) {
    filterType = typeof filter === 'string' ? 'tag' : (filter ? 'advanced' : 'all')
  }

  // === 根据 filterType 构建查询条件 ===
  if (filterType === 'tag') {
    // 标签筛选：用现有的 switch-case 逻辑
    switch (filter) {
      case 'beginner':
        where['difficulty.label'] = _.in(['第一次也能走', '初级'])
        break
      case 'family':
        where['difficulty.suitableFor'] = _.elemMatch(_.eq('亲子5岁+'))
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
      case 'stream':
        where['scenery'] = _.in(['溪流', '溪流清澈', '溪流潺潺', '瀑布群|溪流|峡谷'])
        break
      case 'waterfall':
        where['scenery'] = _.in(['瀑布', '瀑布壮观', '瀑布群', '瀑布|高冠峪|戏水|避暑', '瀑布群|溪流|峡谷'])
        break
      case 'forest':
        where['scenery'] = _.in(['森林', '原始森林'])
        break
      case 'stone':
        where['sections.road'] = db.RegExp({ regexp: '石', options: 'i' })
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
        // 热门：暂时按 order 排序
        break
      default:
        break
    }
  } else if (filterType === 'advanced' && typeof filter === 'object' && filter !== null) {
    // ===== 高级筛选：逐项构建查询条件 =====
    if (filter.difficulty && filter.difficulty.length > 0) {
      where['difficulty.level'] = _.in(filter.difficulty)
    }
    if (filter.cost) {
      where['cost.type'] = filter.cost
    }
    if (filter.direction) {
      where['location.direction'] = filter.direction
    }
    if (filter.suitableFor) {
      where['difficulty.suitableFor'] = _.elemMatch(_.eq(filter.suitableFor))
    }
    // 距离 (distance_km)
    if (filter.distance) {
      const range = parseRange(filter.distance)
      if (range) {
        where.distance_km = _.gte(range.min).and(_.lte(range.max))
      }
    }
    // 爬升 (elevation_gain_m)
    if (filter.elevation) {
      const range = parseRange(filter.elevation)
      if (range) {
        where.elevation_gain_m = _.gte(range.min).and(_.lte(range.max))
      }
    }
    // 路面 (sections 数组中 road 字段)
    if (filter.surface) {
      switch (filter.surface) {
        case '步道/土路':
          where['sections.road'] = db.RegExp({ regexp: '土路|步道', options: 'i' })
          break
        case '水泥路为主':
          where['sections.road'] = db.RegExp({ regexp: '水泥路', options: 'i' })
          break
        case '山间小道':
          where['sections.road'] = '山间小道'
          break
        case '山脊/林间路':
          where['sections.road'] = db.RegExp({ regexp: '山脊|林间路', options: 'i' })
          break
      }
    }
    // 风景 (scenery 数组包含关键字)
    if (filter.scenery) {
      where['scenery'] = db.RegExp({ regexp: filter.scenery, options: 'i' })
    }
  } else if (filterType === 'keyword' && keyword) {
    // 名称模糊搜索
    where['name'] = db.RegExp({ regexp: keyword, options: 'i' })
  }
  // filterType === 'search' 或 'all' 不做额外筛选，由 search action 处理

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
