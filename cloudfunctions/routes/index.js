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
 * 入参：{ action: "list", page, pageSize, filter: { difficulty, cost, direction } }
 */
async function list(event) {
  const { page = 1, pageSize = 20, filter = {} } = event
  const skip = (page - 1) * pageSize
  const where = {}

  // 难度筛选：数组 [1,2,3]
  if (filter.difficulty && filter.difficulty.length > 0) {
    where['difficulty.level'] = _.in(filter.difficulty)
  }

  // 费用筛选："免费" | "收费"
  if (filter.cost) {
    where['cost.type'] = filter.cost
  }

  // 方向筛选："秦岭东线" | "秦岭中线" | "秦岭西线"
  if (filter.direction) {
    where['location.direction'] = filter.direction
  }

  // 适合人群筛选："新手" | "亲子5岁+"
  if (filter.suitableFor) {
    where['difficulty.suitableFor'] = _.elemMatch(_.eq(filter.suitableFor))
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
        cost: true, scenery: true, location: true, order: true
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

  const skip = (page - 1) * pageSize
  const kw = keyword.trim()

  // 名称、描述、地址模糊搜索
  const where = _.or([
    { name: db.RegExp({ regexp: kw, options: 'i' }) },
    { description: db.RegExp({ regexp: kw, options: 'i' }) },
    { 'location.address': db.RegExp({ regexp: kw, options: 'i' }) },
    { scenery: db.RegExp({ regexp: kw, options: 'i' }) }
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
