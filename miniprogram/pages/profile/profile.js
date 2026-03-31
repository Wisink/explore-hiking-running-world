// pages/profile/profile.js
const app = getApp()

Page({
  data: {
    // 当前激活的Tab
    activeTab: 'favorites',
    // 收藏路线列表
    favoriteRoutes: [],
    // 已走过路线列表
    completedRoutes: [],
    // 统计数据
    favoriteCount: 0,
    completedCount: 0,
    totalDistance: 0,
    // 同步状态
    syncStatus: ''
  },

  onLoad() {
    // 页面加载
  },

  onShow() {
    // 每次页面显示时刷新数据（从TabBar切换回来时触发）
    this.loadData()
    this.syncFromCloud()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ========== 数据加载 ==========

  /**
   * 加载所有数据
   */
  async loadData() {
    await Promise.all([
      this.loadFavorites(),
      this.loadCompleted()
    ])
  },

  /**
   * 从本地缓存加载收藏列表
   * 收藏数据结构: { favorites: ["route_001", "route_002"] }
   * 需要将ID转换为路线详情
   */
  async loadFavorites() {
    try {
      const favorites = wx.getStorageSync('favorites') || []
      const favoriteIds = Array.isArray(favorites) ? favorites : (favorites.favorites || [])
      
      this.setData({ favoriteCount: favoriteIds.length })

      if (favoriteIds.length === 0) {
        this.setData({ favoriteRoutes: [] })
        return
      }

      // 从缓存中获取路线详情，或者使用基本信息
      const routes = []
      for (const id of favoriteIds) {
        const route = this.getRouteById(id)
        if (route) {
          routes.push(route)
        }
      }

      this.setData({ favoriteRoutes: routes })
    } catch (err) {
      console.error('加载收藏列表失败：', err)
      this.setData({ favoriteRoutes: [], favoriteCount: 0 })
    }
  },

  /**
   * 从本地缓存加载已走过列表
   * 已走过数据结构: { completed: [{ routeId, date, weather, feeling, difficultyFeeling }] }
   */
  async loadCompleted() {
    try {
      const completed = wx.getStorageSync('completed') || []
      const completedList = Array.isArray(completed) ? completed : (completed.completed || [])
      
      this.setData({ completedCount: completedList.length })

      if (completedList.length === 0) {
        this.setData({ completedRoutes: [], totalDistance: 0 })
        return
      }

      // 合并路线详情和已走过信息，并计算总里程
      const routes = []
      let totalDistance = 0
      for (const item of completedList) {
        const route = this.getRouteById(item.routeId)
        if (route) {
          routes.push({
            ...route,
            routeId: item.routeId,
            completedDate: item.date,
            completedNote: item.note || '',
            weather: item.weather || '',
            weatherEmoji: this.getWeatherEmoji(item.weather),
            feeling: item.feeling || '',
            difficultyFeeling: item.difficultyFeeling || ''
          })
          // 提取数值距离
          const distNum = parseFloat(route.distance) || 0
          totalDistance += distNum
        } else {
          routes.push({
            _id: item.routeId,
            routeId: item.routeId,
            name: item.name || '未知路线',
            description: '',
            coverImage: '',
            location: '',
            distance: '',
            duration: '',
            completedDate: item.date,
            completedNote: item.note || '',
            weather: item.weather || '',
            weatherEmoji: this.getWeatherEmoji(item.weather),
            feeling: item.feeling || '',
            difficultyFeeling: item.difficultyFeeling || ''
          })
        }
      }

      this.setData({ completedRoutes: routes, totalDistance: Math.round(totalDistance * 10) / 10 })
    } catch (err) {
      console.error('加载已走过列表失败：', err)
      this.setData({ completedRoutes: [], completedCount: 0, totalDistance: 0 })
    }
  },

  /**
   * 根据ID获取路线详情
   * 优先从本地缓存的路线数据中查找
   */
  getRouteById(id) {
    // 先尝试从全局缓存的路线数据中查找
    const allTrails = wx.getStorageSync('allTrails') || []
    const trail = allTrails.find(t => t._id === id)
    if (trail) {
      return this.normalizeRoute(trail)
    }

    // 尝试从 app.globalData 中查找
    if (app.globalData && app.globalData.trails) {
      const trail2 = app.globalData.trails.find(t => t._id === id)
      if (trail2) {
        return this.normalizeRoute(trail2)
      }
    }

    // 返回基本信息（使用缓存中可能存在的路线名称）
    const cachedName = wx.getStorageSync('routeName_' + id)
    return {
      _id: id,
      name: cachedName || '路线详情',
      description: '',
      coverImage: '',
      location: '',
      distance: '',
      duration: '',
      difficulty: '',
      difficultyLevel: 0,
      sceneryTags: []
    }
  },

  /**
   * 标准化路线数据格式
   * 将不同来源的路线数据统一格式
   */
  normalizeRoute(trail) {
    return {
      _id: trail._id,
      name: trail.name || '未知路线',
      description: trail.description || '',
      coverImage: trail.coverImage || (trail.images && trail.images[0]) || '',
      location: trail.location?.address || trail.location || '',
      distance: trail.distance_km ? trail.distance_km + 'km' : (trail.distance || ''),
      duration: trail.duration_hours ? trail.duration_hours + 'h' : (trail.duration || ''),
      difficulty: this.getDifficultyLabel(trail.difficulty?.level || trail.difficultyLevel || 0),
      difficultyLevel: trail.difficulty?.level || trail.difficultyLevel || 0,
      sceneryTags: trail.scenery || trail.sceneryTags || []
    }
  },

  /**
   * 获取难度标签
   */
  getDifficultyLabel(level) {
    const labels = ['', '轻松', '初级', '中级', '高级', '挑战']
    return labels[level] || '未知'
  },

  /**
   * 获取难度颜色
   */
  getDifficultyColor(level) {
    const colors = {
      1: '#4CAF50',
      2: '#8BC34A',
      3: '#FFC107',
      4: '#FF9800',
      5: '#F44336'
    }
    return colors[level] || '#9E9E9E'
  },

  // ========== 云端同步 ==========

  syncFromCloud: async function () {
    this.setData({ syncStatus: 'syncing' })
    try {
      const cloudSync = require('../../utils/cloud-sync.js')
      const result = await cloudSync.pullFromCloud()
      if (result) {
        // 重新加载本地数据
        this.loadFavorites()
        this.loadCompleted()
        this.setData({ syncStatus: 'success' })
        // 3秒后隐藏提示
        setTimeout(() => {
          if (this.data.syncStatus === 'success') {
            this.setData({ syncStatus: '' })
          }
        }, 3000)
      }
    } catch (err) {
      console.error('同步失败:', err)
      this.setData({ syncStatus: 'error' })
      setTimeout(() => {
        if (this.data.syncStatus === 'error') {
          this.setData({ syncStatus: '' })
        }
      }, 3000)
    }
  },

  // ========== Tab 切换 ==========

  /**
   * 切换Tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab !== this.data.activeTab) {
      this.setData({ activeTab: tab })
    }
  },

  // ========== 路线操作 ==========

  /**
   * 点击路线卡片 -> 进入详情页
   */
  onRouteTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      // 缓存路线名称（供后续显示用）
      const route = this.data.favoriteRoutes.find(r => r._id === id) ||
                    this.data.completedRoutes.find(r => r._id === id)
      if (route && route.name) {
        wx.setStorageSync('routeName_' + id, route.name)
      }
      
      wx.navigateTo({
        url: `/pages/route-detail/route-detail?id=${id}`
      })
    }
  },

  /**
   * 长按收藏卡片 -> 取消收藏
   */
  onRemoveFavorite(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该路线'

    wx.showModal({
      title: '取消收藏',
      content: `确定要取消收藏「${name}」吗？`,
      confirmText: '取消收藏',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          this.removeFavorite(id)
        }
      }
    })
  },

  /**
   * 长按已走过卡片 -> 删除记录
   */
  onRemoveCompleted(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该路线'

    wx.showModal({
      title: '删除记录',
      content: `确定要删除「${name}」的行走记录吗？`,
      confirmText: '删除',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          this.removeCompleted(id)
        }
      }
    })
  },

  /**
   * 从收藏中移除路线
   */
  removeFavorite(id) {
    try {
      // 先更新本地
      let favorites = wx.getStorageSync('favorites') || []
      if (!Array.isArray(favorites)) {
        favorites = favorites.favorites || []
      }
      favorites = favorites.filter(fid => fid !== id)
      wx.setStorageSync('favorites', favorites)

      // 同步到云端
      const cloudSync = require('../../utils/cloud-sync.js')
      cloudSync.removeFavorite(id)

      wx.showToast({ title: '已取消收藏', icon: 'success' })
      this.loadFavorites()
    } catch (err) {
      console.error('取消收藏失败：', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /**
   * 从已走过中移除记录
   */
  removeCompleted(routeId) {
    try {
      // 先更新本地
      let completed = wx.getStorageSync('completed') || []
      if (!Array.isArray(completed)) {
        completed = completed.completed || []
      }
      completed = completed.filter(item => item.routeId !== routeId)
      wx.setStorageSync('completed', completed)

      // 同步到云端
      const cloudSync = require('../../utils/cloud-sync.js')
      cloudSync.removeCompleted(routeId)

      wx.showToast({ title: '已删除记录', icon: 'success' })
      this.loadCompleted()
    } catch (err) {
      console.error('删除记录失败：', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ========== 导航 ==========

  // ========== 工具方法 ==========

  /**
   * 获取天气emoji
   */
  getWeatherEmoji(weather) {
    if (!weather) return ''
    const map = {
      '晴': '☀️', 'sunny': '☀️',
      '多云': '⛅', 'cloudy': '⛅',
      '阴': '☁️', 'overcast': '☁️',
      '雨': '🌧️', 'rain': '🌧️', '小雨': '🌦️', '大雨': '🌧️',
      '雪': '❄️', 'snow': '❄️',
      '雾': '🌫️', 'fog': '🌫️',
      '风': '💨', 'wind': '💨'
    }
    // 尝试精确匹配
    if (map[weather]) return map[weather]
    // 模糊匹配
    for (const [key, emoji] of Object.entries(map)) {
      if (weather.includes(key)) return emoji
    }
    return '🌤️'
  },

  /**
   * 去探索路线 -> 切换到首页Tab
   */
  goExplore() {
    wx.switchTab({
      url: '/pages/routes/routes'
    })
  },

  // ========== 分享 ==========

  onShareAppMessage() {
    return {
      title: '秦人徒步路线分享 - 探索秦岭之美',
      path: '/pages/routes/routes'
    }
  }
})
