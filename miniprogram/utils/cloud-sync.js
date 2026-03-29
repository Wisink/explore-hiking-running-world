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

    // 同步到本地缓存
    if (favorites && favorites.length > 0) {
      wx.setStorageSync('route_favorites', favorites)
      wx.setStorageSync('favorites', favorites)
    }

    if (completed && completed.length > 0) {
      wx.setStorageSync('completed', completed)
    }

    return { favorites: favorites || [], completed: completed || [] }
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
  // 更新本地
  let favorites = wx.getStorageSync('route_favorites') || []
  if (!favorites.includes(routeId)) {
    favorites.push(routeId)
    wx.setStorageSync('route_favorites', favorites)
    wx.setStorageSync('favorites', favorites)
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

  // 同步到云端
  return await callUserDataAPI('remove-favorite', { routeId })
}

// 添加已走过（本地+云端）
async function addCompleted(routeId, date, note) {
  // 更新本地
  let completed = wx.getStorageSync('completed') || []
  const newItem = {
    routeId: routeId,
    date: date || new Date().toISOString().split('T')[0],
    note: note || ''
  }

  // 检查是否已存在
  const existingIndex = completed.findIndex(item => item.routeId === routeId)
  if (existingIndex >= 0) {
    completed[existingIndex] = newItem
  } else {
    completed.push(newItem)
  }
  wx.setStorageSync('completed', completed)

  // 同步到云端
  return await callUserDataAPI('add-completed', { routeId, date, note })
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

// 获取本地收藏列表
function getLocalFavorites() {
  return wx.getStorageSync('route_favorites') || wx.getStorageSync('favorites') || []
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

module.exports = {
  pullFromCloud,
  syncFavoritesToCloud,
  syncCompletedToCloud,
  addFavorite,
  removeFavorite,
  addCompleted,
  removeCompleted,
  getLocalFavorites,
  getLocalCompleted,
  isFavorited,
  isCompleted
}
