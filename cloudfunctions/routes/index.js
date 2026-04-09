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

// 难度中文映射（供 _processListItem 和前端展示使用）
const DIFFICULTY_ZH = { 1:'轻松', 2:'简单', 3:'适中', 4:'较难', 5:'困难' }

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
 * 预处理列表项，转换为前端需要的格式
 * 1. 用 difficulty 数字映射 difficultyText 中文
 * 2. 合并 durationMin/durationMax 为 durationText
 * 3. 统一 location.district 字段
 * 4. 过滤掉数据库内部字段
 */
function _processListItem(item) {
  const district = (item.location && item.location.district) ? item.location.district : ''
  const difficultyText = DIFFICULTY_ZH[String(item.difficulty)] || '适中'

  let durationText = ''
  if (item.durationMin !== undefined || item.durationMax !== undefined) {
    const min = item.durationMin !== undefined ? item.durationMin : ''
    const max = item.durationMax !== undefined ? item.durationMax : ''
    if (min !== '' && max !== '' && String(min) !== String(max)) {
      durationText = `${min}-${max}小时`
    } else if (min !== '') {
      durationText = `${min}小时`
    } else if (max !== '') {
      durationText = `${max}小时`
    }
  }

  return {
    _id: item._id,
    name: item.name,
    shortDesc: item.shortDesc || '',
    coverImage: item.coverImage || '',
    difficulty: item.difficulty,
    difficultyText: difficultyText,
    distance: item.distance,
    durationMin: item.durationMin,
    durationMax: item.durationMax,
    durationText: durationText,
    elevationGain: item.elevationGain,
    terrainTypes: item.terrainTypes || [],
    routeDNA: item.routeDNA || [],
    bestSeasons: item.bestSeasons || [],
    location: { district },
    district: district,
    status: item.status,
    familyFriendly: item.familyFriendly,
    safetyLevel: item.safetyLevel
  }
}

/**
 * 获取路线列表（支持分页、筛选）
 * 入参：{ action: "list", page, pageSize, filterType, filter, keyword }
 * filterType: "tag" | "advanced" | "search" | "all"
 * - filterType === "tag": filter 是字符串标签（beginner/family/scenic/stream/forest/climb/spring/summer/autumn/winter/advanced）
 * - filterType === "advanced": filter 是 { difficulty, distance, elevation, terrain, season, district }
 * - filterType === "search": keyword 搜索（已在 list 内部调用 doSearch，直接返回）
 * - filterType === "all" 或未传: 不做额外筛选
 */
async function list(event) {
  let { page = 0, pageSize = 20, filterType, filter, keyword } = event
  const skip = Math.max(0, page) * pageSize
  const where = {}

  // 过滤已上线路线
  where.status = 'open'

  // 兼容旧调用：没有 filterType 时，按 filter 类型推断
  if (!filterType) {
    filterType = (typeof filter === 'string' && filter && filter !== 'all') ? 'tag' : 'all'
  }

  // ─── 标签筛选（全部改用新版字段） ───
  if (filterType === 'tag' && typeof filter === 'string' && filter !== 'all') {
    switch (filter) {
      case 'beginner':   // 新手友好
        where.difficulty = _.in([1, 2])
        break
      case 'family':     // 亲子休闲
        where.difficulty = _.in([1, 2])
        where.distance = _.lte(10)
        break
      case 'scenic':     // 观景路线
        where.routeDNA = _.or(
          _.elemMatch(_.eq('scenic_viewpoint')),
          _.elemMatch(_.eq('exposed_ridge')),
          _.elemMatch(_.eq('paved_comfort'))
        )
        break
      case 'stream':     // 亲水溯溪
        where.terrainTypes = _.elemMatch(_.eq('stream'))
        break
      case 'forest':     // 森林漫步
        where.terrainTypes = _.elemMatch(_.eq('forest'))
        break
      case 'climb':      // 挑战爬升
        where.elevationGain = _.gte(800)
        break
      case 'spring':
      case 'summer':
      case 'autumn':
      case 'winter':
        where.bestSeasons = _.elemMatch(_.eq(filter))
        break
      case 'advanced':   // 进阶挑战
        where.difficulty = _.in([4, 5])
        break
      // 以下旧标签不再支持，兼容返回空
      case 'free':
      case 'east':
      case 'center':
      case 'west':
      case 'stream-waterfall':
      case 'redleaf':
      case 'meadow':
      case 'culture':
      case 'nearby':
      case 'stone':
      case 'hot':
      case 'season':
        break
      default:
        break
    }
  }

  // ─── 高级筛选（全部改用新版字段） ───
  if (filterType === 'advanced' && typeof filter === 'object' && filter) {
    if (filter.difficulty && filter.difficulty.length > 0) {
      where.difficulty = _.in(filter.difficulty)
    }
    if (filter.distance) {
      const range = parseRange(filter.distance)
      if (range) {
        if (range[1] === Infinity) {
          where.distance = _.gte(range[0])
        } else {
          where.distance = _.gte(range[0]).and(_.lte(range[1]))
        }
      }
    }
    if (filter.elevation) {
      const range = parseRange(filter.elevation)
      if (range) {
        if (range[1] === Infinity) {
          where.elevationGain = _.gte(range[0])
        } else {
          where.elevationGain = _.gte(range[0]).and(_.lte(range[1]))
        }
      }
    }
    if (filter.terrain) {
      where.terrainTypes = _.elemMatch(_.eq(filter.terrain))
    }
    if (filter.season) {
      where.bestSeasons = _.elemMatch(_.eq(filter.season))
    }
    if (filter.district && filter.district !== 'all') {
      where['location.district'] = filter.district
    }
    // 以下旧字段不再支持，跳过
    // filter.cost -> 全部免费，无需筛选
    // filter.direction -> 已改为 district
    // filter.surface -> 已改为 terrainTypes
    // filter.scenery -> 已改为 routeDNA/terrainTypes
    // filter.suitableFor -> 已改为 familyFriendly
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
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true,
        name: true,
        shortDesc: true,
        coverImage: true,
        difficulty: true,
        distance: true,
        durationMin: true,
        durationMax: true,
        elevationGain: true,
        terrainTypes: true,
        routeDNA: true,
        bestSeasons: true,
        location: true,
        status: true,
        familyFriendly: true,
        safetyLevel: true
      })
      .get()

    // 预处理每条记录，转换为前端所需格式
    const processedList = listRes.data.map(_processListItem)

    return success({
      list: processedList,
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
 * 全部改用新版字段：status/shortDesc/location.district
 */
async function doSearch(keyword, page, pageSize) {
  if (!keyword || !keyword.trim()) return fail('请输入搜索关键词')
  const kw = keyword.trim()
  const skip = Math.max(0, page) * pageSize

  const searchCondition = _.and([
    { status: 'open' },
    _.or([
      { name: db.RegExp({ regexp: kw, options: 'i' }) },
      { shortDesc: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'location.district': db.RegExp({ regexp: kw, options: 'i' }) }
    ])
  ])

  try {
    const countRes = await db.collection('routes').where(searchCondition).count()
    const listRes = await db.collection('routes')
      .where(searchCondition)
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true,
        name: true,
        shortDesc: true,
        coverImage: true,
        difficulty: true,
        distance: true,
        durationMin: true,
        durationMax: true,
        elevationGain: true,
        terrainTypes: true,
        routeDNA: true,
        bestSeasons: true,
        location: true,
        status: true,
        familyFriendly: true,
        safetyLevel: true
      })
      .get()

    // 预处理每条记录
    const processedList = listRes.data.map(_processListItem)

    return success({
      list: processedList,
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
    // 直接返回完整记录，不再检查 isActive 字段
    return success(res.data)
  } catch (err) {
    console.error('routes detail error:', err)
    return fail('获取路线详情失败：' + err.message)
  }
}

/**
 * 搜索路线（独立搜索入口）
 * 入参：{ action: "search", keyword, page, pageSize }
 * 全部改用新版字段：status/shortDesc/location.district
 */
async function search(event) {
  const { keyword, page = 1, pageSize = 20 } = event
  if (!keyword || !keyword.trim()) return fail('请输入搜索关键词')

  const skip = Math.max(0, page) * pageSize
  const kw = keyword.trim()

  const searchCondition = _.and([
    { status: 'open' },
    _.or([
      { name: db.RegExp({ regexp: kw, options: 'i' }) },
      { shortDesc: db.RegExp({ regexp: kw, options: 'i' }) },
      { 'location.district': db.RegExp({ regexp: kw, options: 'i' }) }
    ])
  ])

  try {
    const countRes = await db.collection('routes').where(searchCondition).count()
    const total = countRes.total

    const listRes = await db.collection('routes')
      .where(searchCondition)
      .skip(skip)
      .limit(pageSize)
      .field({
        _id: true,
        name: true,
        shortDesc: true,
        coverImage: true,
        difficulty: true,
        distance: true,
        durationMin: true,
        durationMax: true,
        elevationGain: true,
        terrainTypes: true,
        routeDNA: true,
        bestSeasons: true,
        location: true,
        status: true,
        familyFriendly: true,
        safetyLevel: true
      })
      .get()

    // 预处理每条记录
    const processedList = listRes.data.map(_processListItem)

    return success({
      list: processedList,
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
