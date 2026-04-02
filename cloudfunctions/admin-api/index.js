// 后台管理系统云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const crypto = require('crypto')

// 统一响应
function success(data, message = 'success') { return { code: 0, message, data } }
function fail(message) { return { code: -1, message, data: null } }

// ===== 管理员口令配置 =====
// 服务端哈希比对：SHA-256(salt + password)
// salt 与哈希值必须配套使用，更换口令需重新生成
const SALT = 'qinren_salt_2026'
const ADMIN_PASSWORD_HASH = '6534131ffb8b1048830bda34f8dae1d7058ea46952f139c3c73ba2be92e1bc80'

// 固定Token — 云函数冷启动不丢失，解决"token无效"问题
const FIXED_TOKEN = crypto.createHash('sha256')
  .update(SALT + 'admin-qr-2026')
  .digest('hex')

// ===== 认证模块 =====
function handleAuth(action, params) {
  switch (action) {
    case 'login': {
      const { password } = params || {}
      if (!password) return fail('缺少口令')
      // 服务端做 SHA-256(salt + password) 哈希比对
      const hashed = crypto.createHash('sha256')
        .update(SALT + password)
        .digest('hex')
      if (hashed === ADMIN_PASSWORD_HASH) {
        // 返回固定 token，不受云函数重启影响
        return success({ token: FIXED_TOKEN, loginTime: Date.now() }, '登录成功')
      }
      return fail('口令错误')
    }
    case 'verify': {
      const { token } = params || {}
      if (!token) return fail('缺少 token')
      if (token !== FIXED_TOKEN) return fail('token 无效')
      return success({ valid: true }, 'token 有效')
    }
    default: return fail('未知操作')
  }
}

// ===== Token 验证中间件 =====
function verifyToken(params) {
  const { token } = params || {}
  if (!token) return { valid: false, message: '缺少 token' }
  if (token !== FIXED_TOKEN) return { valid: false, message: 'token 无效' }
  return { valid: true }
}

// ===== 路线管理 =====
async function handleRoutes(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, keyword = '' } = params || {}
      let where = {}
      if (keyword) {
        where = _.or([
          { name: db.RegExp({ regexp: keyword, options: 'i' }) },
          { 'location.address': db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      }
      const countRes = await db.collection('routes').where(where).count()
      const { data } = await db.collection('routes')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data } = await db.collection('routes').doc(id).get()
      return success(data)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('routes').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    case 'add': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: addData } = params || {}
      const res = await db.collection('routes').add({ data: addData })
      return success({ id: res._id }, '添加成功')
    }
    case 'delete': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id } = params || {}
      await db.collection('routes').doc(id).remove()
      return success(null, '删除成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 用户管理 =====
async function handleUsers(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, keyword = '' } = params || {}
      let where = {}
      if (keyword) {
        where = _.or([
          { nickName: db.RegExp({ regexp: keyword, options: 'i' }) },
          { openid: db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      }
      const countRes = await db.collection('user_data').where(where).count()
      const { data } = await db.collection('user_data')
        .where(where).orderBy('_id', 'desc')
        .skip((page - 1) * pageSize).limit(pageSize).get()

      // 关联 users 集合获取 visitCount 和 userNumber
      const openIds = data.map(u => u._openid).filter(Boolean)
      let userMetaMap = {}
      if (openIds.length > 0) {
        const { data: userMetas } = await db.collection('users')
          .where({ _openid: _.in(openIds) }).get()
        userMetas.forEach(u => { userMetaMap[u._openid] = u })
      }

      const enriched = data.map(u => ({
        ...u,
        visitCount: (userMetaMap[u._openid] || {}).visitCount || 0,
        userNumber: (userMetaMap[u._openid] || {}).userNumber || ''
      }))

      return success({ list: enriched, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data: userData } = await db.collection('user_data').doc(id).get()
      if (!userData) return fail('用户不存在')

      // 关联 users 集合
      let userMeta = {}
      if (userData._openid) {
        const { data: metas } = await db.collection('users')
          .where({ _openid: userData._openid }).limit(1).get()
        if (metas.length > 0) userMeta = metas[0]
      }

      // 获取收藏路线详情（兼容新旧格式）
      const rawFavorites = userData.favorites || []
      let favoriteIds = []
      if (Array.isArray(rawFavorites)) {
        favoriteIds = rawFavorites.map(item => {
          if (typeof item === 'string') return item
          if (item && item.routeId) return item.routeId
          return null
        }).filter(Boolean)
      }
      let favoriteRoutes = []
      if (favoriteIds.length > 0) {
        const { data: routes } = await db.collection('routes')
          .where({ _id: _.in(favoriteIds) }).get()
        favoriteRoutes = routes
      }

      // 获取已走过路线详情
      const completedList = userData.completed || []
      let completedRoutes = []
      if (completedList.length > 0) {
        let completedItems
        if (typeof completedList[0] === 'string') {
          completedItems = completedList.map(id => ({ routeId: id }))
        } else {
          completedItems = completedList
        }
        const routeIds = [...new Set(completedItems.map(i => i.routeId || i))]
        const { data: routes } = await db.collection('routes')
          .where({ _id: _.in(routeIds) }).get()
        const routeMap = {}
        routes.forEach(r => { routeMap[r._id] = r })
        completedRoutes = completedItems.map(item => ({
          ...(routeMap[item.routeId] || {}),
          routeId: item.routeId,
          userDate: item.date || item.completedAt || '',
          userDistance: item.distance || 0,
          userWeather: item.weather || '',
          userDifficulty: item.difficulty || '',
          userFeeling: item.feeling || '',
          userCompanions: item.companions || item.companion || '',
          userNote: item.note || ''
        }))
      }

      return success({
        userInfo: {
          ...userData,
          visitCount: userMeta.visitCount || 0,
          userNumber: userMeta.userNumber || ''
        },
        favoriteRoutes,
        completedRoutes
      })
    }
    case 'completed': {
      const { id } = params || {}
      const { data: userData } = await db.collection('user_data').doc(id).get()
      if (!userData) return fail('用户不存在')

      const completedList = userData.completed || []
      if (completedList.length === 0) return success([])

      // 兼容新旧格式
      let completedItems
      if (typeof completedList[0] === 'string') {
        completedItems = completedList.map(id => ({ routeId: id }))
      } else {
        completedItems = completedList
      }

      const routeIds = [...new Set(completedItems.map(i => i.routeId || i))]
      const { data: routes } = await db.collection('routes')
        .where({ _id: _.in(routeIds) }).get()

      const routeMap = {}
      routes.forEach(r => { routeMap[r._id] = r })

      const result = completedItems.map(item => ({
        ...(routeMap[item.routeId] || {}),
        routeId: item.routeId,
        userDate: item.date || item.completedAt || '',
        userDistance: item.distance || 0,
        userWeather: item.weather || '',
        userDifficulty: item.difficulty || '',
        userFeeling: item.feeling || '',
        userCompanions: item.companions || item.companion || '',
        userNote: item.note || ''
      }))
      return success(result)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('user_data').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 文章管理 =====
async function handleArticles(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, category = '' } = params || {}
      let where = {}
      if (category) where.category = category
      const countRes = await db.collection('articles').where(where).count()
      const { data } = await db.collection('articles')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data } = await db.collection('articles').doc(id).get()
      return success(data)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('articles').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    case 'add': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: addData } = params || {}
      const res = await db.collection('articles').add({ data: addData })
      return success({ id: res._id }, '添加成功')
    }
    case 'search': {
      const { keyword = '', searchType = 'all', page = 1, pageSize = 20 } = params || {}
      let where = {}
      if (keyword) {
        if (searchType === 'category') {
          where.category = db.RegExp({ regexp: keyword, options: 'i' })
        } else if (searchType === 'content') {
          where = _.or([
            { title: db.RegExp({ regexp: keyword, options: 'i' }) },
            { content: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        } else {
          // 'all' — 搜索标题、内容、分类
          where = _.or([
            { title: db.RegExp({ regexp: keyword, options: 'i' }) },
            { content: db.RegExp({ regexp: keyword, options: 'i' }) },
            { category: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        }
      }
      const countRes = await db.collection('articles').where(where).count()
      const { data } = await db.collection('articles')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'delete': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id } = params || {}
      await db.collection('articles').doc(id).remove()
      return success(null, '删除成功')
    }
    default: return fail('未知操作')
  }
}

// ===== isActive 切换 =====
async function handleToggleActive(action, params) {
  switch (action) {
    case 'toggle': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, collection } = params || {}
      if (!id || !collection) return fail('缺少参数')
      if (!['routes', 'articles'].includes(collection)) return fail('不支持的集合')
      const { data } = await db.collection(collection).doc(id).get()
      if (!data) return fail('记录不存在')
      const newVal = !(data.isActive !== false) // 默认 true，取反
      await db.collection(collection).doc(id).update({ data: { isActive: newVal } })
      return success({ isActive: newVal }, newVal ? '已启用' : '已禁用')
    }
    default: return fail('未知操作')
  }
}

// ===== 批量导出 JSONL =====
async function handleExport(action, params) {
  switch (action) {
    case 'exportData': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { collection } = params || {}
      if (!collection || !['routes', 'articles', 'user_data'].includes(collection)) {
        return fail('不支持的集合，可选：routes / articles / user_data')
      }

      // 分批获取全部数据
      const MAX_LIMIT = 100
      const countRes = await db.collection(collection).count()
      const total = countRes.total
      const batchTimes = Math.ceil(total / MAX_LIMIT)
      let allData = []
      for (let i = 0; i < batchTimes; i++) {
        const { data } = await db.collection(collection)
          .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
        allData = allData.concat(data)
      }

      // 转换时间字段为 JSONL 格式，生成 JSONL 字符串
      const jsonlLines = allData.map(record => {
        const converted = convertDates(record)
        return JSON.stringify(converted)
      })
      const jsonlContent = jsonlLines.join('\n')

      // 上传到云存储
      const fileName = `${collection}_export_${Date.now()}.jsonl`
      const cloudPath = `exports/${fileName}`
      const uploadRes = await cloud.uploadFile({
        cloudPath,
        fileContent: Buffer.from(jsonlContent, 'utf-8')
      })

      // 获取下载链接
      const fileID = uploadRes.fileID
      const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
      const downloadUrl = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL

      return success({
        fileID,
        downloadUrl,
        fileName,
        totalRecords: allData.length
      }, `导出成功，共 ${allData.length} 条记录`)
    }
    default: return fail('未知操作')
  }
}

// 递归转换 Date 对象为 { "$date": "..." } 格式
function convertDates(obj) {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) {
    return { $date: obj.toISOString() }
  }
  if (Array.isArray(obj)) {
    return obj.map(item => convertDates(item))
  }
  if (typeof obj === 'object') {
    const result = {}
    for (const key of Object.keys(obj)) {
      result[key] = convertDates(obj[key])
    }
    return result
  }
  return obj
}

// ===== 数据迁移：为现有数据添加 isActive =====
async function handleMigrate(action, params) {
  switch (action) {
    case 'migrateIsActive': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)

      const collections = ['routes', 'articles']
      const results = {}

      for (const col of collections) {
        // 查询没有 isActive 字段的记录
        const countRes = await db.collection(col).where({ isActive: _.exists(false) }).count()
        const total = countRes.total
        if (total === 0) {
          results[col] = { total: 0, updated: 0 }
          continue
        }

        const MAX_LIMIT = 100
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        let updated = 0

        for (let i = 0; i < batchTimes; i++) {
          const { data } = await db.collection(col)
            .where({ isActive: _.exists(false) })
            .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()

          const tasks = data.map(record =>
            db.collection(col).doc(record._id).update({ data: { isActive: true } })
              .then(() => { updated++ })
              .catch(e => console.error(`迁移 ${col} ${record._id} 失败:`, e))
          )
          await Promise.all(tasks)
        }

        results[col] = { total, updated }
      }

      return success(results, '数据迁移完成')
    }
    default: return fail('未知操作')
  }
}

// ===== 配置管理 =====
async function handleConfig(action, params) {
  switch (action) {
    case 'get': {
      const { data } = await db.collection('admin_config').limit(1).get()
      return success(data[0] || {})
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: updateData } = params || {}
      const { data: existing } = await db.collection('admin_config').limit(1).get()
      if (existing.length > 0) {
        await db.collection('admin_config').doc(existing[0]._id).update({ data: updateData })
      } else {
        await db.collection('admin_config').add({ data: { ...updateData, createdAt: db.serverDate() } })
      }
      return success(null, '更新成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 统计 =====
async function handleStats(action, params) {
  switch (action) {
    case 'overview': {
      const [routesRes, usersRes, articlesRes] = await Promise.all([
        db.collection('routes').count(),
        db.collection('user_data').count(),
        db.collection('articles').count()
      ])
      return success({
        totalRoutes: routesRes.total,
        totalUsers: usersRes.total,
        totalArticles: articlesRes.total
      })
    }

    // ====== 新增统计接口 ======

    // 用户增长趋势（按 day/week/month/year 统计）
    case 'userGrowth': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate, dateFormat

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        dateFormat = '%Y-%m-%d'
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
        dateFormat = '%Y-W%V'
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        dateFormat = '%Y-%m'
      } else { // year
        startDate = new Date(now.getFullYear() - 4, 0, 1)
        dateFormat = '%Y'
      }

      const res = await db.collection('user_data').aggregate()
        .match({ _openid: _.exists(true) })
        .project({
          dateStr: $.dateToString({
            date: '$updatedAt',
            format: dateFormat,
            timezone: '+08:00'
          })
        })
        .group({
          _id: '$dateStr',
          count: $.sum(1)
        })
        .sort({ _id: 1 })
        .end()

      return success({ list: res.list, dimension })
    }

    // 收藏趋势（按收藏日期分组统计）
    // 新数据格式：favorites = [{ routeId, date }]
    // 旧数据格式：favorites = ["route_001"]（无日期，跳过）
    case 'favoriteTrend': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate, dateFormat

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        dateFormat = '%Y-%m-%d'
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
        dateFormat = '%Y-W%V'
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        dateFormat = '%Y-%m'
      } else {
        startDate = new Date(now.getFullYear() - 4, 0, 1)
        dateFormat = '%Y'
      }

      // 展开 favorites 数组，按 date 字段聚合
      const res = await db.collection('user_data').aggregate()
        .unwind('$favorites')
        .match({
          'favorites.date': _.exists(true),
          'favorites.date': _.gte(startDate.toISOString())
        })
        .project({
          dateStr: $.dateToString({
            date: $.toDate('$favorites.date'),
            format: dateFormat,
            timezone: '+08:00'
          })
        })
        .group({
          _id: '$dateStr',
          count: $.sum(1)
        })
        .sort({ _id: 1 })
        .end()

      return success({ list: res.list, dimension })
    }

    // 已走过趋势（按 completedAt 时间戳聚合）
    case 'completedTrend': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate, dateFormat

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        dateFormat = '%Y-%m-%d'
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
        dateFormat = '%Y-W%V'
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        dateFormat = '%Y-%m'
      } else {
        startDate = new Date(now.getFullYear() - 4, 0, 1)
        dateFormat = '%Y'
      }

      // 展开 completed 数组，按 completedAt 聚合
      const res = await db.collection('user_data').aggregate()
        .unwind('$completed')
        .match({
          'completed.completedAt': _.gte(startDate.getTime())
        })
        .project({
          dateStr: $.dateToString({
            date: $.add([new Date(0), '$completed.completedAt']),
            format: dateFormat,
            timezone: '+08:00'
          })
        })
        .group({
          _id: '$dateStr',
          count: $.sum(1)
        })
        .sort({ _id: 1 })
        .end()

      return success({ list: res.list, dimension })
    }

    // 收藏最多的 50 条路线
    case 'topFavoritedRoutes': {
      const res = await db.collection('routes').aggregate()
        .match({ favoriteCount: _.gt(0) })
        .project({
          name: 1,
          favoriteCount: $.ifNull(['$favoriteCount', 0])
        })
        .sort({ favoriteCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 已走过最多的 50 条路线
    case 'topCompletedRoutes': {
      const res = await db.collection('routes').aggregate()
        .match({ completedCount: _.gt(0) })
        .project({
          name: 1,
          completedCount: $.ifNull(['$completedCount', 0])
        })
        .sort({ completedCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 阅读量最多的 50 篇文章
    case 'topArticles': {
      const res = await db.collection('articles').aggregate()
        .match({ viewCount: _.gt(0) })
        .project({
          title: 1,
          category: 1,
          author: 1,
          viewCount: $.ifNull(['$viewCount', 0])
        })
        .sort({ viewCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 访问最活跃的 100 位用户（按已走过记录数排序）
    // 注意：小程序没有独立的访问日志 collection，用已走过记录数作为活跃度指标
    case 'topUsers': {
      const res = await db.collection('user_data').aggregate()
        .project({
          _openid: 1,
          nickName: 1,
          avatarUrl: 1,
          completedCount: $.size($.ifNull(['$completed', []])),
          favoritesCount: $.size($.ifNull(['$favorites', []]))
        })
        .sort({ completedCount: -1 })
        .limit(100)
        .end()

      return success({ list: res.list })
    }

    // 初始化路线收藏和已走过次数统计（一次性操作）
    // 遍历所有 user_data，统计 favorites 和 completed，写入 routes 集合
    case 'initRouteStats': {
      const MAX_LIMIT = 100
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

      // 1. 获取所有 user_data
      const allUserData = await getAllRecords('user_data')

      // 2. 统计
      const favoriteCountMap = {}
      const completedCountMap = {}
      let totalFavorites = 0
      let totalCompleted = 0

      for (const user of allUserData) {
        const favorites = user.favorites || []
        for (const item of favorites) {
          // 兼容新旧格式
          const routeId = typeof item === 'string' ? item : (item && item.routeId ? item.routeId : null)
          if (routeId) {
            favoriteCountMap[routeId] = (favoriteCountMap[routeId] || 0) + 1
            totalFavorites++
          }
        }
        const completed = user.completed || []
        for (const item of completed) {
          const routeId = item.routeId
          if (routeId) {
            completedCountMap[routeId] = (completedCountMap[routeId] || 0) + 1
            totalCompleted++
          }
        }
      }

      // 3. 更新 routes 集合
      const allRoutes = await getAllRecords('routes')
      const updateTasks = []
      let routesUpdated = 0
      let routesWithFavorites = 0
      let routesWithCompleted = 0
      const details = []

      for (const route of allRoutes) {
        const routeId = route._id
        const favCount = favoriteCountMap[routeId] || 0
        const compCount = completedCountMap[routeId] || 0

        if (favCount > 0) routesWithFavorites++
        if (compCount > 0) routesWithCompleted++

        const needsUpdate =
          route.favoriteCount !== favCount ||
          route.completedCount !== compCount ||
          route.favoriteCount === undefined ||
          route.completedCount === undefined

        if (needsUpdate) {
          updateTasks.push(
            db.collection('routes').doc(routeId).update({
              data: { favoriteCount: favCount, completedCount: compCount }
            }).then(() => {
              routesUpdated++
              if (favCount > 0 || compCount > 0) {
                details.push({
                  routeId, name: route.name || '未知',
                  favoriteCount: favCount, completedCount: compCount
                })
              }
            }).catch(e => { console.error(`更新路线 ${routeId} 失败:`, e) })
          )
        }
      }

      await Promise.all(updateTasks)

      return success({
        totalUsers: allUserData.length,
        totalFavorites,
        totalCompleted,
        totalRoutes: allRoutes.length,
        routesUpdated,
        routesWithFavorites,
        routesWithCompleted,
        topFavorites: details.filter(d => d.favoriteCount > 0).sort((a, b) => b.favoriteCount - a.favoriteCount),
        topCompleted: details.filter(d => d.completedCount > 0).sort((a, b) => b.completedCount - a.completedCount)
      }, '初始化统计完成')
    }

    default: return fail('未知操作')
  }
}

// ===== 云函数入口 =====
exports.main = async (event, context) => {
  try {
    const { module, action, params } = event
    switch (module) {
      case 'routes': return await handleRoutes(action, params)
      case 'users': return await handleUsers(action, params)
      case 'articles': return await handleArticles(action, params)
      case 'config': return await handleConfig(action, params)
      case 'stats': return await handleStats(action, params)
      case 'auth': return handleAuth(action, params)
      case 'toggleActive': return await handleToggleActive(action, params)
      case 'export': return await handleExport(action, params)
      case 'migrate': return await handleMigrate(action, params)
      case 'check-admin': {
        const adminOpenIds = ['o4BVT3QcW1wbAgEt1yqRD7drVPhY']
        const { OPENID } = cloud.getWXContext()
        return success({ isAdmin: adminOpenIds.includes(OPENID), openid: OPENID })
      }
      default: return fail('未知模块: ' + module)
    }
  } catch (err) {
    console.error('admin-api error:', err)
    return fail(err.message)
  }
}

// 已在文件中 - 不要重复添加

