// 用户数据云函数 - 管理收藏和已走过记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 接口说明：
 * action: 'get' - 获取用户数据
 * action: 'sync-favorites' - 同步收藏
 * action: 'sync-completed' - 同步已走过
 * action: 'add-favorite' - 添加收藏
 * action: 'remove-favorite' - 取消收藏
 * action: 'add-completed' - 添加已走过
 * action: 'remove-completed' - 删除已走过记录
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (event.action) {
      case 'get':
        return await getUserData(openid)

      case 'get-openid':
        return { code: 0, openid: openid }

      case 'sync-favorites':
        return await syncFavorites(openid, event.favorites)

      case 'sync-completed':
        return await syncCompleted(openid, event.completed)

      case 'add-favorite':
        return await addFavorite(openid, event.routeId)

      case 'remove-favorite':
        return await removeFavorite(openid, event.routeId)

      case 'add-completed':
        return await addCompleted(openid, event.routeId, event.date, event.note, event.weather, event.feeling, event.difficultyFeeling, event.companions, event.name, event.distance)

      case 'remove-completed':
        return await removeCompleted(openid, event.routeId)

      case 'sync-checklist':
        return await syncChecklist(openid, event.routeId, event.checkedItems, event.customItems)

      case 'get-checklist':
        return await getChecklist(openid, event.routeId)

      case 'init-user':
        return await initUser(openid)

      case 'migrate-formats':
        return await migrateDataFormats(openid)

      default:
        return { code: -1, message: '未知操作' }
    }
  } catch (err) {
    console.error('用户数据操作失败:', err)
    return { code: -1, message: err.message }
  }
}

// 获取用户数据
async function getUserData(openid) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  if (res.data.length === 0) {
    // 新用户，返回空数据
    return {
      code: 0,
      data: {
        favorites: [],
        completed: [],
        checklists: {}
      }
    }
  }

  return {
    code: 0,
    data: {
      favorites: res.data[0].favorites || [],
      completed: res.data[0].completed || [],
      checklists: res.data[0].checklists || {}
    }
  }
}

// 同步收藏列表（全量替换）— 使用事务保护
async function syncFavorites(openid, favorites) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  let oldFavoriteIds = []
  let userDataDocId = null
  const favObjects = (favorites || []).map(id => {
    if (typeof id === 'object' && id.routeId) return id
    return { routeId: id, date: new Date().toISOString() }
  })

  if (res.data.length === 0) {
    const addRes = await db.collection('user_data').add({
      data: { _openid: openid, favorites: favObjects, completed: [], updatedAt: db.serverDate() }
    })
    userDataDocId = addRes._id
  } else {
    oldFavoriteIds = extractFavoriteIds(res.data[0].favorites || [])
    userDataDocId = res.data[0]._id
    await db.runTransaction(async (txn) => {
      await txn.collection('user_data').doc(userDataDocId).update({
        data: { favorites: favObjects, updatedAt: db.serverDate() }
      })
    })
  }

  const newFavoriteIds = (favorites || []).map(id => {
    if (typeof id === 'object' && id.routeId) return id.routeId
    return id
  })
  const added = newFavoriteIds.filter(id => !oldFavoriteIds.includes(id))
  const removed = oldFavoriteIds.filter(id => !newFavoriteIds.includes(id))

  for (const routeId of added) {
    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(1) } })
      })
    } catch (e) { console.error('sync-fav inc txn error:', e) }
  }
  for (const routeId of removed) {
    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(-1) } })
      })
    } catch (e) { console.error('sync-fav dec txn error:', e) }
  }

  return { code: 0, message: '收藏同步成功' }
}


// 同步已走过列表（全量替换）— 使用事务保护
async function syncCompleted(openid, completed) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  let oldCompleted = []
  let userDataDocId = null
  if (res.data.length === 0) {
    const addRes = await db.collection('user_data').add({
      data: { _openid: openid, favorites: [], completed: completed || [], updatedAt: db.serverDate() }
    })
    userDataDocId = addRes._id
  } else {
    oldCompleted = res.data[0].completed || []
    userDataDocId = res.data[0]._id
    await db.runTransaction(async (txn) => {
      await txn.collection('user_data').doc(userDataDocId).update({
        data: { completed: completed || [], updatedAt: db.serverDate() }
      })
    })
  }

  const newCompleted = completed || []
  const oldKeys = new Set(oldCompleted.map(item => `${item.routeId}_${item.completedAt}`))
  const newKeys = new Set(newCompleted.map(item => `${item.routeId}_${item.completedAt}`))

  const routeDelta = {}
  for (const item of oldCompleted) {
    const key = `${item.routeId}_${item.completedAt}`
    if (!newKeys.has(key)) routeDelta[item.routeId] = (routeDelta[item.routeId] || 0) - 1
  }
  for (const item of newCompleted) {
    const key = `${item.routeId}_${item.completedAt}`
    if (!oldKeys.has(key)) routeDelta[item.routeId] = (routeDelta[item.routeId] || 0) + 1
  }

  for (const [routeId, delta] of Object.entries(routeDelta)) {
    if (delta !== 0) {
      try {
        await db.runTransaction(async (txn) => {
          await txn.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(delta) } })
        })
      } catch (e) { console.error('sync-completed txn count error:', e) }
    }
  }

  return { code: 0, message: '已走过同步成功' }
}

// 辅助函数：从收藏数组中提取 routeId（兼容新旧格式）
function extractFavoriteIds(favorites) {
  if (!Array.isArray(favorites)) return []
  return favorites.map(item => {
    if (typeof item === 'string') return item
    if (item && item.routeId) return item.routeId
    return null
  }).filter(Boolean)
}

// 辅助函数：检查收藏数组中是否包含某路线（兼容新旧格式）
function hasFavorite(favorites, routeId) {
  if (!Array.isArray(favorites)) return false
  return favorites.some(item => {
    if (typeof item === 'string') return item === routeId
    if (item && item.routeId) return item.routeId === routeId
    return false
  })
}

async function addFavorite(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  const favoriteItem = { routeId: routeId, date: new Date().toISOString() }

  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: { _openid: openid, favorites: [favoriteItem], completed: [], updatedAt: db.serverDate() }
    })
    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(1) } })
      })
    } catch (e) { console.error('更新收藏计数失败:', e) }
  } else {
    const userDataDocId = res.data[0]._id
    const currentFavorites = res.data[0].favorites || []
    const alreadyFavorited = hasFavorite(currentFavorites, routeId)

    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('user_data').doc(userDataDocId).update({
          data: { favorites: _.push([favoriteItem]), updatedAt: db.serverDate() }
        })
        if (!alreadyFavorited) {
          await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(1) } })
        }
      })
    } catch (e) {
      try {
        await db.runTransaction(async (txn) => {
          await txn.collection('user_data').doc(userDataDocId).update({
            data: { favorites: _.push([favoriteItem]), updatedAt: db.serverDate() }
          })
          if (!alreadyFavorited) {
            await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(1) } })
          }
        })
      } catch (e2) { console.error('更新收藏计数失败(重试):', e2) }
    }
  }

  return { code: 0, message: '收藏成功' }
}

// 取消收藏 — 使用事务保护
async function removeFavorite(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  if (res.data.length === 0) return { code: 0, message: '取消收藏成功' }

  const userDataDocId = res.data[0]._id
  const wasFavorited = hasFavorite(res.data[0].favorites || [], routeId)
  const currentFavorites = res.data[0].favorites || []
  const newFavorites = currentFavorites.filter(item => {
    if (typeof item === 'string') return item !== routeId
    if (item && item.routeId) return item.routeId !== routeId
    return true
  })

  try {
    await db.runTransaction(async (txn) => {
      await txn.collection('user_data').doc(userDataDocId).update({
        data: { favorites: newFavorites, updatedAt: db.serverDate() }
      })
      if (wasFavorited) {
        await txn.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(-1) } })
      }
    })
  } catch (e) {
    console.error('取消收藏事务失败:', e)
    try {
      await db.collection('user_data').doc(userDataDocId).update({
        data: { favorites: newFavorites, updatedAt: db.serverDate() }
      })
      if (wasFavorited) {
        await db.collection('routes').doc(routeId).update({ data: { favoriteCount: _.inc(-1) } })
      }
    } catch (e2) { console.error('取消收藏降级更新失败:', e2) }
  }

  return { code: 0, message: '取消收藏成功' }
}

// 添加已走过 - 同一路线同一天不能重复标记 — 使用事务保护
async function addCompleted(openid, routeId, date, note, weather, feeling, difficultyFeeling, companions, name, distance) {
  const completedDate = date || new Date().toISOString().split('T')[0]
  const completedItem = {
    routeId, date: completedDate, name: name || '', weather: weather || '',
    feeling: feeling || '', difficultyFeeling: difficultyFeeling || '',
    companions: companions || '', distance: distance || 0, note: note || '',
    completedAt: Date.now()
  }

  const res = await db.collection('user_data').where({ _openid: openid }).get()

  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: { _openid: openid, favorites: [], completed: [completedItem], updatedAt: db.serverDate() }
    })
    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(1) } })
      })
    } catch (e) { console.error('更新已走过计数失败:', e) }
  } else {
    const existing = res.data[0].completed || []
    const duplicate = existing.some(item => item.routeId === routeId && item.date === completedDate)
    if (duplicate) return { code: -1, message: '这一天已经标记过这条路线了' }

    const userDataDocId = res.data[0]._id
    try {
      await db.runTransaction(async (txn) => {
        await txn.collection('user_data').doc(userDataDocId).update({
          data: { completed: _.push([completedItem]), updatedAt: db.serverDate() }
        })
        await txn.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(1) } })
      })
    } catch (e) {
      try {
        await db.runTransaction(async (txn) => {
          await txn.collection('user_data').doc(userDataDocId).update({
            data: { completed: _.push([completedItem]), updatedAt: db.serverDate() }
          })
          await txn.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(1) } })
        })
      } catch (e2) { console.error('更新已走过计数失败(重试):', e2) }
    }
  }

  return { code: 0, message: '记录成功' }
}

// 删除已走过记录 — 使用事务保护
async function removeCompleted(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  if (res.data.length === 0) return { code: 0, message: '删除成功' }

  const userDataDocId = res.data[0]._id
  const completed = res.data[0].completed || []
  const removedCount = completed.filter(item => item.routeId === routeId).length
  const newCompleted = completed.filter(item => item.routeId !== routeId)

  if (removedCount === 0) return { code: 0, message: '删除成功' }

  try {
    await db.runTransaction(async (txn) => {
      await txn.collection('user_data').doc(userDataDocId).update({
        data: { completed: newCompleted, updatedAt: db.serverDate() }
      })
      await txn.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(-removedCount) } })
    })
  } catch (e) {
    console.error('删除已走过事务失败:', e)
    try {
      await db.collection('user_data').doc(userDataDocId).update({
        data: { completed: newCompleted, updatedAt: db.serverDate() }
      })
      await db.collection('routes').doc(routeId).update({ data: { completedCount: _.inc(-removedCount) } })
    } catch (e2) { console.error('删除已走过降级更新失败:', e2) }
  }

  return { code: 0, message: '删除成功' }
}

// 同步清单勾选状态
async function syncChecklist(openid, routeId, checkedItems, customItems) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: {
        _openid: openid,
        favorites: [],
        completed: [],
        checklists: {
          [routeId]: { checked: checkedItems || [], custom: customItems || [] }
        },
        updatedAt: db.serverDate()
      }
    })
  } else {
    const checklists = res.data[0].checklists || {}
    checklists[routeId] = { checked: checkedItems || [], custom: customItems || [] }
    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        checklists: checklists,
        updatedAt: db.serverDate()
      }
    })
  }

  return { code: 0, message: '清单同步成功' }
}

// 初始化用户编号（服务端原子操作，保证唯一递增）
async function initUser(openid) {
  // 先检查是否已有该用户
  const userRes = await db.collection('users').where({ _openid: openid }).get()
  if (userRes.data.length > 0) {
    const user = userRes.data[0]
    // 已有用户，访问次数 +1
    await db.collection('users').doc(user._id).update({
      data: { visitCount: _.inc(1) }
    })
    return {
      code: 0,
      data: {
        userNumber: user.userNumber,
        nickName: user.nickName,
        visitCount: (user.visitCount || 0) + 1
      }
    }
  }

  // 新用户：分配编号
  // 使用 _.inc(1) 原子自增，再读取新值
  try {
    await db.collection('counters').doc('user_number').update({
      data: { value: _.inc(1) }
    })
  } catch (e) {
    // 文档不存在，先创建初始值再自增
    try {
      await db.collection('counters').add({
        data: { _id: 'user_number', value: 0 }
      })
    } catch (addErr) {
      // 可能并发创建，忽略
    }
    await db.collection('counters').doc('user_number').update({
      data: { value: _.inc(1) }
    })
  }

  // 读取当前编号值
  const counterRes = await db.collection('counters').doc('user_number').get()
  const number = counterRes.data.value
  const nickName = String(number).padStart(3, '0') + '号徒步爱好者'

  // 创建用户记录
  await db.collection('users').add({
    data: {
      _openid: openid,
      userNumber: number,
      nickName: nickName,
      visitCount: 1,
      createdAt: db.serverDate()
    }
  })

  console.log('initUser: 新用户注册，编号', number, '昵称', nickName)
  return {
    code: 0,
    data: {
      userNumber: number,
      nickName: nickName,
      visitCount: 1
    }
  }
}

// 获取清单勾选状态
async function getChecklist(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  if (res.data.length === 0) {
    return { code: 0, data: { checked: [], custom: [] } }
  }

  const checklists = res.data[0].checklists || {}
  const data = checklists[routeId] || { checked: [], custom: [] }

  return { code: 0, data: data }
}

/**
 * 数据格式迁移函数（一次性执行）
 * 将 user_data 集合中的旧格式数据迁移为新格式
 * - favorites: 旧格式 ["route_001", ...] → 新格式 [{routeId: "route_001", date: "..."}, ...]
 * - completed: 补充缺失的 completedAt 字段
 *
 * 触发方式：通过 admin-api 或手动调用云函数
 * { action: 'migrate-formats' }
 */
async function migrateDataFormats(openid) {
  const startTime = Date.now()
  let totalUsers = 0
  let migratedUsers = 0
  let favoritesMigrated = 0
  let completedMigrated = 0
  let errors = 0

  try {
    // 分页查询所有 user_data 记录
    let hasMore = true
    let skip = 0
    const batchSize = 100

    while (hasMore) {
      const res = await db.collection('user_data')
        .skip(skip)
        .limit(batchSize)
        .get()

      if (!res.data || res.data.length === 0) {
        hasMore = false
        break
      }

      totalUsers += res.data.length

      for (const doc of res.data) {
        try {
          let needUpdate = false
          const updateData = {}

          // 1. 迁移 favorites: 字符串数组 → 对象数组
          const favorites = doc.favorites || []
          if (Array.isArray(favorites) && favorites.some(item => typeof item === 'string')) {
            const migratedFavorites = favorites.map(item => {
              if (typeof item === 'string') {
                return { routeId: item, date: new Date().toISOString() }
              }
              return item
            })
            updateData.favorites = migratedFavorites
            favoritesMigrated += favorites.filter(item => typeof item === 'string').length
            needUpdate = true
          }

          // 2. 迁移 completed: 补充缺失的 completedAt 字段
          const completed = doc.completed || []
          if (Array.isArray(completed) && completed.some(item => !item.completedAt)) {
            const migratedCompleted = completed.map(item => {
              if (!item.completedAt) {
                // 用 date 字段生成时间戳，如果没有 date 则用当前时间
                let timestamp = Date.now()
                if (item.date) {
                  const dateObj = new Date(item.date)
                  if (!isNaN(dateObj.getTime())) {
                    timestamp = dateObj.getTime()
                  }
                }
                return { ...item, completedAt: timestamp }
              }
              return item
            })
            updateData.completed = migratedCompleted
            completedMigrated += completed.filter(item => !item.completedAt).length
            needUpdate = true
          }

          // 执行更新
          if (needUpdate) {
            updateData.updatedAt = db.serverDate()
            await db.collection('user_data').doc(doc._id).update({
              data: updateData
            })
            migratedUsers++
          }
        } catch (err) {
          console.error(`迁移用户 ${doc._id} 失败:`, err)
          errors++
        }
      }

      skip += res.data.length
      if (res.data.length < batchSize) {
        hasMore = false
      }
    }

    const elapsed = Date.now() - startTime
    console.log('迁移完成:', { totalUsers, migratedUsers, favoritesMigrated, completedMigrated, errors, elapsed })

    return {
      code: 0,
      message: '迁移完成',
      data: {
        totalUsers,
        migratedUsers,
        favoritesMigrated,
        completedMigrated,
        errors,
        elapsed: `${elapsed}ms`
      }
    }
  } catch (err) {
    console.error('迁移失败:', err)
    return {
      code: -1,
      message: '迁移失败: ' + err.message,
      data: {
        totalUsers,
        migratedUsers,
        favoritesMigrated,
        completedMigrated,
        errors: errors + 1
      }
    }
  }
}
