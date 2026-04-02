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

// 同步收藏列表（全量替换）
async function syncFavorites(openid, favorites) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  let oldFavorites = []
  if (res.data.length === 0) {
    // 创建新记录
    await db.collection('user_data').add({
      data: {
        _openid: openid,
        favorites: favorites || [],
        completed: [],
        updatedAt: db.serverDate()
      }
    })
  } else {
    oldFavorites = res.data[0].favorites || []
    // 更新现有记录
    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        favorites: favorites || [],
        updatedAt: db.serverDate()
      }
    })
  }

  // 计算差异并更新路线收藏计数
  const newFavorites = favorites || []
  const added = newFavorites.filter(id => !oldFavorites.includes(id))
  const removed = oldFavorites.filter(id => !newFavorites.includes(id))

  for (const routeId of added) {
    try {
      await db.collection('routes').doc(routeId).update({
        data: { favoriteCount: _.inc(1) }
      })
    } catch (e) { console.error('sync-fav inc error:', e) }
  }
  for (const routeId of removed) {
    try {
      await db.collection('routes').doc(routeId).update({
        data: { favoriteCount: _.inc(-1) }
      })
    } catch (e) { console.error('sync-fav dec error:', e) }
  }

  return { code: 0, message: '收藏同步成功' }
}

// 同步已走过列表（全量替换）
async function syncCompleted(openid, completed) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  let oldCompleted = []
  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: {
        _openid: openid,
        favorites: [],
        completed: completed || [],
        updatedAt: db.serverDate()
      }
    })
  } else {
    oldCompleted = res.data[0].completed || []
    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        completed: completed || [],
        updatedAt: db.serverDate()
      }
    })
  }

  // 计算差异（按 routeId+completedAt 唯一标识）并更新计数
  const newCompleted = completed || []
  const oldKeys = new Set(oldCompleted.map(item => `${item.routeId}_${item.completedAt}`))
  const newKeys = new Set(newCompleted.map(item => `${item.routeId}_${item.completedAt}`))

  // 统计每个 routeId 的增减量
  const routeDelta = {}
  for (const item of oldCompleted) {
    const key = `${item.routeId}_${item.completedAt}`
    if (!newKeys.has(key)) {
      routeDelta[item.routeId] = (routeDelta[item.routeId] || 0) - 1
    }
  }
  for (const item of newCompleted) {
    const key = `${item.routeId}_${item.completedAt}`
    if (!oldKeys.has(key)) {
      routeDelta[item.routeId] = (routeDelta[item.routeId] || 0) + 1
    }
  }

  for (const [routeId, delta] of Object.entries(routeDelta)) {
    if (delta !== 0) {
      try {
        await db.collection('routes').doc(routeId).update({
          data: { completedCount: _.inc(delta) }
        })
      } catch (e) { console.error('sync-completed count error:', e) }
    }
  }

  return { code: 0, message: '已走过同步成功' }
}

// 添加收藏
async function addFavorite(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  let shouldIncCount = true

  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: {
        _openid: openid,
        favorites: [routeId],
        completed: [],
        updatedAt: db.serverDate()
      }
    })
  } else {
    // 检查是否已收藏，避免重复计数
    const alreadyFavorited = (res.data[0].favorites || []).includes(routeId)
    if (alreadyFavorited) {
      shouldIncCount = false
    }
    // 使用 addToSet 避免重复
    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        favorites: _.addToSet(routeId),
        updatedAt: db.serverDate()
      }
    })
  }

  // 更新路线收藏计数（原子操作）
  if (shouldIncCount) {
    try {
      await db.collection('routes').doc(routeId).update({
        data: { favoriteCount: _.inc(1) }
      })
    } catch (e) {
      console.error('更新收藏计数失败:', e)
    }
  }

  return { code: 0, message: '收藏成功' }
}

// 取消收藏
async function removeFavorite(openid, routeId) {
  // 检查是否确实收藏过，避免错误减计数
  const res = await db.collection('user_data').where({ _openid: openid }).get()
  const wasFavorited = res.data.length > 0 && (res.data[0].favorites || []).includes(routeId)

  await db.collection('user_data').where({ _openid: openid }).update({
    data: {
      favorites: _.pull(routeId),
      updatedAt: db.serverDate()
    }
  })

  // 更新路线收藏计数（原子操作）
  if (wasFavorited) {
    try {
      await db.collection('routes').doc(routeId).update({
        data: { favoriteCount: _.inc(-1) }
      })
    } catch (e) {
      console.error('更新收藏计数失败:', e)
    }
  }

  return { code: 0, message: '取消收藏成功' }
}

// 添加已走过 - 同一路线同一天不能重复标记
async function addCompleted(openid, routeId, date, note, weather, feeling, difficultyFeeling, companions, name, distance) {
  const completedDate = date || new Date().toISOString().split('T')[0]
  const completedItem = {
    routeId: routeId,
    date: completedDate,
    name: name || '',
    weather: weather || '',
    feeling: feeling || '',
    difficultyFeeling: difficultyFeeling || '',
    companions: companions || '',
    distance: distance || 0,
    note: note || '',
    completedAt: Date.now()
  }

  const res = await db.collection('user_data').where({ _openid: openid }).get()

  // 新建记录
  if (res.data.length === 0) {
    await db.collection('user_data').add({
      data: {
        _openid: openid,
        favorites: [],
        completed: [completedItem],
        updatedAt: db.serverDate()
      }
    })
    // 更新路线已走过计数
    try {
      await db.collection('routes').doc(routeId).update({
        data: { completedCount: _.inc(1) }
      })
    } catch (e) {
      console.error('更新已走过计数失败:', e)
    }
  } else {
    // 检查：同一天同一路线不能重复标记
    const existing = res.data[0].completed || []
    const duplicate = existing.some(item => item.routeId === routeId && item.date === completedDate)
    if (duplicate) {
      return { code: -1, message: '这一天已经标记过这条路线了' }
    }

    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        completed: _.push([completedItem]),
        updatedAt: db.serverDate()
      }
    })
    // 更新路线已走过计数
    try {
      await db.collection('routes').doc(routeId).update({
        data: { completedCount: _.inc(1) }
      })
    } catch (e) {
      console.error('更新已走过计数失败:', e)
    }
  }

  return { code: 0, message: '记录成功' }
}

// 删除已走过记录
async function removeCompleted(openid, routeId) {
  const res = await db.collection('user_data').where({ _openid: openid }).get()

  if (res.data.length > 0) {
    const completed = res.data[0].completed || []
    const removedCount = completed.filter(item => item.routeId === routeId).length
    const newCompleted = completed.filter(item => item.routeId !== routeId)

    await db.collection('user_data').where({ _openid: openid }).update({
      data: {
        completed: newCompleted,
        updatedAt: db.serverDate()
      }
    })

    // 更新路线已走过计数
    if (removedCount > 0) {
      try {
        await db.collection('routes').doc(routeId).update({
          data: { completedCount: _.inc(-removedCount) }
        })
      } catch (e) {
        console.error('更新已走过计数失败:', e)
      }
    }
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
