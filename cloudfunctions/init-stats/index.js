// 初始化路线收藏次数和已走过次数统计
// 一次性云函数：遍历 user_data 集合，统计 favorites 和 completed，写入 routes 集合
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100 // 云数据库单次查询上限

/**
 * 分页获取集合全部数据
 */
async function getAllRecords(collection) {
  const countRes = await db.collection(collection).count()
  const total = countRes.total
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    tasks.push(
      db.collection(collection)
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
        .then(res => res.data)
    )
  }
  const results = await Promise.all(tasks)
  return results.reduce((acc, cur) => acc.concat(cur), [])
}

exports.main = async (event, context) => {
  try {
    // 1. 获取所有 user_data 记录
    console.log('正在查询 user_data 集合...')
    const allUserData = await getAllRecords('user_data')
    console.log(`共查询到 ${allUserData.length} 条用户数据`)

    // 2. 统计每条路线的收藏次数
    const favoriteCountMap = {}  // routeId -> count
    const completedCountMap = {} // routeId -> count
    let totalFavorites = 0
    let totalCompleted = 0

    for (const user of allUserData) {
      // 收藏：favorites 是 routeId 字符串数组
      const favorites = user.favorites || []
      for (const routeId of favorites) {
        if (routeId) {
          favoriteCountMap[routeId] = (favoriteCountMap[routeId] || 0) + 1
          totalFavorites++
        }
      }

      // 已走过：completed 是对象数组，每个对象含 routeId 字段
      const completed = user.completed || []
      for (const item of completed) {
        const routeId = item.routeId
        if (routeId) {
          completedCountMap[routeId] = (completedCountMap[routeId] || 0) + 1
          totalCompleted++
        }
      }
    }

    console.log(`收藏统计: 共 ${totalFavorites} 次收藏，涉及 ${Object.keys(favoriteCountMap).length} 条路线`)
    console.log(`已走过统计: 共 ${totalCompleted} 次记录，涉及 ${Object.keys(completedCountMap).length} 条路线`)

    // 3. 更新 routes 集合中每条路线的 favoriteCount 和 completedCount
    // 先获取所有路线 ID，将其余未涉及的路线设为 0
    console.log('正在查询 routes 集合...')
    const allRoutes = await getAllRecords('routes')
    console.log(`共查询到 ${allRoutes.length} 条路线`)

    const updateTasks = []
    const stats = {
      routesUpdated: 0,
      routesWithFavorites: 0,
      routesWithCompleted: 0,
      details: []
    }

    for (const route of allRoutes) {
      const routeId = route._id
      const favCount = favoriteCountMap[routeId] || 0
      const compCount = completedCountMap[routeId] || 0

      if (favCount > 0) stats.routesWithFavorites++
      if (compCount > 0) stats.routesWithCompleted++

      // 只更新有数据变化的路线，或字段不存在的路线
      const needsUpdate =
        route.favoriteCount !== favCount ||
        route.completedCount !== compCount ||
        route.favoriteCount === undefined ||
        route.completedCount === undefined

      if (needsUpdate) {
        updateTasks.push(
          db.collection('routes').doc(routeId).update({
            data: {
              favoriteCount: favCount,
              completedCount: compCount
            }
          }).then(() => {
            stats.routesUpdated++
            if (favCount > 0 || compCount > 0) {
              stats.details.push({
                routeId,
                name: route.name || '未知',
                favoriteCount: favCount,
                completedCount: compCount
              })
            }
          }).catch(e => {
            console.error(`更新路线 ${routeId} 失败:`, e)
          })
        )
      }
    }

    await Promise.all(updateTasks)

    // 4. 汇报结果
    const result = {
      code: 0,
      message: '初始化统计完成',
      data: {
        totalUsers: allUserData.length,
        totalFavorites,
        totalCompleted,
        totalRoutes: allRoutes.length,
        routesUpdated: stats.routesUpdated,
        routesWithFavorites: stats.routesWithFavorites,
        routesWithCompleted: stats.routesWithCompleted,
        topFavorites: stats.details
          .filter(d => d.favoriteCount > 0)
          .sort((a, b) => b.favoriteCount - a.favoriteCount),
        topCompleted: stats.details
          .filter(d => d.completedCount > 0)
          .sort((a, b) => b.completedCount - a.completedCount)
      }
    }

    console.log('=== 初始化统计结果 ===')
    console.log(JSON.stringify(result.data, null, 2))

    return result
  } catch (err) {
    console.error('初始化统计失败:', err)
    return { code: -1, message: '初始化统计失败: ' + err.message }
  }
}
