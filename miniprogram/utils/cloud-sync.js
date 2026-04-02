/**
 * 云端数据同步工具
 * 负责收藏和已走过数据的云端同步
 */

// 调用用户数据云函数
async function callUserDataAPI(action, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'user-data',
      data: { action, ...data }
    })
    return res.result
  } catch (err) {
    console.error('云函数调用失败:', err)
    return { code: -1, message: err.message }
  }
}

// 从云端拉取用户数据并同步到本地
async function pullFromCloud() {
  const res = await callUserDataAPI('get')

  if (res.code === 0 && res.data) {
    const { favorites, completed } = res.data

    // 兼容新旧格式：将收藏统一转为 routeId 数组供本地使用
    const favoriteIds = (favorites || []).map(item => {
      if (typeof item === 'string') return item
      if (item && item.routeId) return item.routeId
      return null
    }).filter(Boolean)

    // 总是覆盖本地（包括空数组，确保云端删除同步到本地）
    wx.setStorageSync('route_favorites', favoriteIds)
    wx.setStorageSync('favorites', favoriteIds)
    // 保存完整收藏数据（含时间戳），供 profile 页使用
    wx.setStorageSync('favorites_full', favorites || [])
    wx.setStorageSync('completed', completed || [])

    // 同步清单勾选状态到本地缓存
    if (res.data.checklists && typeof res.data.checklists === 'object') {
      const checklists = res.data.checklists
      Object.keys(checklists).forEach(routeId => {
        const cacheKey = `checklist_${routeId}`
        wx.setStorageSync(cacheKey, checklists[routeId])
      })
    }

    return { favorites: favoriteIds, completed: completed || [] }
  }

  return { favorites: [], completed: [] }
}

// 同步收藏到云端
async function syncFavoritesToCloud(favorites) {
  return await callUserDataAPI('sync-favorites', { favorites })
}

// 同步已走过到云端
async function syncCompletedToCloud(completed) {
  return await callUserDataAPI('sync-completed', { completed })
}

// 添加收藏（本地+云端）
async function addFavorite(routeId) {
  // 更新本地（routeId 数组，供快速判断）
  let favorites = wx.getStorageSync('route_favorites') || []
  if (!favorites.includes(routeId)) {
    favorites.push(routeId)
    wx.setStorageSync('route_favorites', favorites)
    wx.setStorageSync('favorites', favorites)
  }
  // 同时更新完整数据（含时间戳）
  let favoritesFull = wx.getStorageSync('favorites_full') || []
  if (!favoritesFull.some(item => (typeof item === 'string' ? item === routeId : item.routeId === routeId))) {
    favoritesFull.push({ routeId: routeId, date: new Date().toISOString() })
    wx.setStorageSync('favorites_full', favoritesFull)
  }

  // 同步到云端
  return await callUserDataAPI('add-favorite', { routeId })
}

// 取消收藏（本地+云端）
async function removeFavorite(routeId) {
  // 更新本地
  let favorites = wx.getStorageSync('route_favorites') || []
  favorites = favorites.filter(id => id !== routeId)
  wx.setStorageSync('route_favorites', favorites)
  wx.setStorageSync('favorites', favorites)
  // 同时更新完整数据
  let favoritesFull = wx.getStorageSync('favorites_full') || []
  favoritesFull = favoritesFull.filter(item => {
    if (typeof item === 'string') return item !== routeId
    if (item && item.routeId) return item.routeId !== routeId
    return true
  })
  wx.setStorageSync('favorites_full', favoritesFull)

  // 同步到云端
  return await callUserDataAPI('remove-favorite', { routeId })
}

// 添加已走过（本地+云端）- 允许同一条路线多次标记
async function addCompleted(routeId, date, extra = {}) {
  const { weather, feeling, difficultyFeeling, companions, note, name, distance } = extra
  // 更新本地
  let completed = wx.getStorageSync('completed') || []
  const newItem = {
    routeId: routeId,
    date: date || new Date().toISOString().split('T')[0],
    name: name || '',
    weather: weather || '',
    feeling: feeling || '',
    difficultyFeeling: difficultyFeeling || '',
    companions: companions || '',
    distance: distance || 0,
    note: note || '',
    completedAt: Date.now()
  }

  // 检查：同一天同一路线不能重复标记
  const duplicate = completed.some(item => item.routeId === routeId && item.date === date)
  if (duplicate) {
    wx.showToast({ title: '这一天已经标记过这条路线了', icon: 'none' })
    return false
  }

  completed.push(newItem)
  wx.setStorageSync('completed', completed)

  // 同步到云端
  return await callUserDataAPI('add-completed', { routeId, date, note, weather, feeling, difficultyFeeling, companions, name })
}

// 更新已走过记录
function updateCompleted(routeId, completedAt, updates) {
  let completed = wx.getStorageSync('completed') || []
  const index = completed.findIndex(item => item.routeId === routeId && item.completedAt === completedAt)
  if (index === -1) {
    wx.showToast({ title: '未找到该记录', icon: 'none' })
    return false
  }
  // 更新字段
  const item = completed[index]
  if (updates.date !== undefined) item.date = updates.date
  if (updates.weather !== undefined) item.weather = updates.weather
  if (updates.feeling !== undefined) item.feeling = updates.feeling
  if (updates.difficultyFeeling !== undefined) item.difficultyFeeling = updates.difficultyFeeling
  if (updates.companions !== undefined) item.companions = updates.companions
  if (updates.distance !== undefined) item.distance = updates.distance
  completed[index] = item
  wx.setStorageSync('completed', completed)

  // 同步到云端（全量替换）
  syncCompletedToCloud(completed)
  return true
}

// 删除已走过记录（本地+云端）
async function removeCompleted(routeId) {
  // 更新本地
  let completed = wx.getStorageSync('completed') || []
  completed = completed.filter(item => item.routeId !== routeId)
  wx.setStorageSync('completed', completed)

  // 同步到云端
  return await callUserDataAPI('remove-completed', { routeId })
}

// 删除单条已走过记录（本地+云端）
function deleteCompleted(routeId, completedAt) {
  let completed = wx.getStorageSync('completed') || []
  completed = completed.filter(item => !(item.routeId === routeId && item.completedAt === completedAt))
  wx.setStorageSync('completed', completed)

  // 同步到云端
  syncCompletedToCloud(completed)
  return true
}

// 获取本地收藏列表（routeId 数组）
function getLocalFavorites() {
  return wx.getStorageSync('route_favorites') || wx.getStorageSync('favorites') || []
}

// 获取本地收藏完整数据（含时间戳）
function getLocalFavoritesFull() {
  return wx.getStorageSync('favorites_full') || []
}

// 获取本地已走过列表
function getLocalCompleted() {
  return wx.getStorageSync('completed') || []
}

// 检查是否已收藏
function isFavorited(routeId) {
  const favorites = getLocalFavorites()
  return favorites.includes(routeId)
}

// 检查是否已走过
function isCompleted(routeId) {
  const completed = getLocalCompleted()
  return completed.some(item => item.routeId === routeId)
}

// 同步清单到云端（勾选状态）
async function syncChecklist(routeId, checkedMap, customItems) {
  // 同时保存到本地缓存
  const cacheKey = `checklist_${routeId}`
  wx.setStorageSync(cacheKey, checkedMap)

  return await callUserDataAPI('sync-checklist', { routeId, checkedItems: checkedMap, customItems: customItems || [] })
}

// 从云端获取清单
async function getChecklist(routeId) {
  const res = await callUserDataAPI('get-checklist', { routeId })
  if (res.code === 0 && res.data) {
    // 同步到本地缓存
    const cacheKey = `checklist_${routeId}`
    wx.setStorageSync(cacheKey, res.data)
    return res.data
  }
  // 降级使用本地缓存
  return wx.getStorageSync(`checklist_${routeId}`) || {}
}

module.exports = {
  pullFromCloud,
  syncFavoritesToCloud,
  syncCompletedToCloud,
  addFavorite,
  removeFavorite,
  addCompleted,
  updateCompleted,
  removeCompleted,
  deleteCompleted,
  getLocalFavorites,
  getLocalFavoritesFull,
  getLocalCompleted,
  isFavorited,
  isCompleted,
  syncChecklist,
  getChecklist
}
