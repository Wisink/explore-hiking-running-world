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
 * 获取路线列表（支持分页、筛选）
 * 入参：{ action: "list", page, pageSize, filter }
 * filter 可以是字符串（前端标签筛选）或对象（高级筛选）
 */
async function list(event) {
  let { page = 0, pageSize = 20, filter } = event
  // 兼容前端传 0-indexed 的 page
  const skip = Math.max(0, page) * pageSize
  const where = {}

  // 如果 filter 是字符串（前端标签筛选），转换为查询条件
  if (typeof filter === 'string' && filter && filter !== 'all') {
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
          // 春天
          where['best_season'] = _.in(['春', '春季', '全年', '春夏'])
        } else if (month >= 6 && month <= 8) {
          // 夏天
          where['best_season'] = _.in(['夏', '夏季', '全年', '春夏', '夏秋'])
        } else if (month >= 9 && month <= 11) {
          // 秋天
          where['scenery'] = _.in(['红叶', '红叶漫山', '红叶|古寺|环线', '银杏林', '金黄', '秋色', '彩林'])
        } else {
          // 冬天
          where['best_season'] = _.in(['冬', '冬季', '全年'])
        }
        break
      }
      case 'hot':
        // 本周热门：按用户完成次数降序（需要user_data集合）
        // 先按默认顺序返回，后续可以接入用户数据
        break
      default:
        break
    }
  } else if (typeof filter === 'object' && filter) {
    // 高级筛选对象
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
 * 获取路线详情
 * 入参：{ action: "detail", routeId }
 */
async function detail(event) {
  const { routeId } = event
  if (!routeId) return fail('缺少路线ID')

  try {
    const res = await db.collection('routes').doc(routeId).get()
    if (!res.data) return fail('路线不存在')
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

  // 名称、描述、地址、风景标签模糊搜索
  const where = _.or([
    { name: db.RegExp({ regexp: kw, options: 'i' }) },
    { description: db.RegExp({ regexp: kw, options: 'i' }) },
    { 'location.address': db.RegExp({ regexp: kw, options: 'i' }) },
    { scenery: db.RegExp({ regexp: kw, options: 'i' }) },
    { 'difficulty.suitableFor': db.RegExp({ regexp: kw, options: 'i' }) }
  ])

  try {
    const countRes = await db.collection('routes').where(where).count()
    const total = countRes.total

    const listRes = await db.collection('routes')
      .where(where)
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
