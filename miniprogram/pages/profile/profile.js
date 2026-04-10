function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/profile/profile.js
const app = getApp()
const { handleSyncError } = require('../../utils/error-handler')

Page({
  // 轮循欢迎语列表（28条）
  greetings: [
    '这里，记录了每一条你喜欢的路线和走过的风景！',       // [0] 首次访问展示
    '走到没路了，坐下来看云起.',                          // [1]
    '爬到山顶才知道，别的山都矮了.',                      // [2]
    '路再长，一步一步总能走完.',                          // [3]
    '想看得更远，就往山里多走走.',                        // [4]
    '站得够高，云彩就挡不住眼睛.',                        // [5]
    '青山和风雨陪着你，不孤单.',                          // [6]
    '走遍青山人没老，一路好风景.',                        // [7]
    '两只脚走遍天下，不辜负少年心.',                      // [8]
    '走一千里一起看月亮，山里就是家.',                    // [9]
    '走到路尽头，自有云和风在等你.',                      // [10]
    '爬到山顶，才见天地到底有多宽.',                      // [11]
    '再远的路，一步一步总能走到头.',                      // [12]
    '用两只脚，走遍所有想看的好山河.',                    // [13]
    '走遍青山绿水，人永远有少年劲.',                      // [14]
    '拐过这道弯，总有新风景在等你.',                      // [15]
    '出门不是赶路，是赴山水的约会.',                      // [16]
    '路再长，也挡不住想出发的脚步.',                      // [17]
    '往山里多走一步，心就静一分.',                        // [18]
    '踩过溪石，接住山间吹来的清风.',                      // [19]
    '最难走的路，藏着最好看的风景.',                      // [20]
    '看过的山水，都成了你的眼界.',                        // [21]
    '钻进山里，把烦心事全都丢开.',                        // [22]
    '别停脚，前面的春山正迎着你.',                        // [23]
    '往高处走，把世界都装进眼里.',                        // [24]
    '走到旷野里，才懂风有多自由.',                        // [25]
    '只要不停步，没有翻不过的山.',                        // [26]
    '走着走着，就跨过了所有难走的路.',                    // [27]
    '走到山野里，心就有了落脚的地方.',                    // [28]
  ],

  data: {
    // 状态栏高度
    statusBarHeight: 0,
    // 头像和昵称
    avatarUrl: '',
    hikerNickname: '',
    // 用户信息（编号、昵称、访问次数）
    userInfo: null,
    // 管理员权限
    isAdmin: false,
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
    syncStatus: '',
    syncFailed: false,
    // 查看更多状态
    showAllFavorites: false,
    showAllCompleted: false,
    displayedFavorites: [],
    displayedCompleted: [],
    // 轮循欢迎语
    greetingText: '',
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    // 初始化头像和昵称
    this.initHikerProfile()
    // 检查管理员权限（非管理员静默忽略）
    wx.cloud.callFunction({
      name: 'admin-api',
      data: { module: 'check-admin' }
    }).then(res => {
      if (res.result && res.result.data && res.result.data.isAdmin) {
        this.setData({ isAdmin: true })
      }
    }).catch(() => {
      // 非管理员用户，静默忽略
    })
  },

  onShow() {
    // 设置自定义tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    // 每次页面显示时刷新数据（从TabBar切换回来时触发）
    this.loadData()
    this.syncFromCloud()

    // 轮循欢迎语：首次访问→greetings[0]（首访语），之后在greetings[1]-[28]之间轮循
    let hasVisited = wx.getStorageSync('greetingHasVisited')
    if (!hasVisited) {
      wx.setStorageSync('greetingHasVisited', true)
      wx.setStorageSync('greetingRotateIndex', -1)
      this.setData({ greetingText: this.greetings[0] })
    } else {
      let rotateIndex = wx.getStorageSync('greetingRotateIndex') || 0
      rotateIndex = (rotateIndex + 1) % 28  // 0-27 对应 greetings[1]-[28]
      wx.setStorageSync('greetingRotateIndex', rotateIndex)
      this.setData({ greetingText: this.greetings[rotateIndex + 1] })
    }

    // 从全局数据加载用户信息（等待 app.js initUser 完成）
    const app = getApp()
    if (app.globalData && app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo })
      // 同步昵称为云端用户编号
      if (app.globalData.userInfo.nickName) {
        this.setData({ hikerNickname: app.globalData.userInfo.nickName })
      }
    } else if (app._userInitPromise) {
      // initUser 后台异步执行中，监听其完成结果
      app._userInitPromise.then(() => {
        if (app.globalData && app.globalData.userInfo) {
          this.setData({ userInfo: app.globalData.userInfo })
          if (app.globalData.userInfo.nickName) {
            this.setData({ hikerNickname: app.globalData.userInfo.nickName })
          }
        }
      }).catch(() => {
        // 用户初始化失败，静默忽略（已使用本地头像昵称）
      })
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 初始化徒步者头像和昵称
   * 首次进入随机生成，再次进入从缓存读取
   */
  initHikerProfile() {
    let hikerNumber = wx.getStorageSync('hikerNumber')
    let avatarIndex = wx.getStorageSync('hikerAvatarIndex')

    if (!hikerNumber) {
      hikerNumber = this.generateNumber(3)
      wx.setStorageSync('hikerNumber', hikerNumber)
    }

    if (!avatarIndex) {
      avatarIndex = Math.floor(Math.random() * 8) + 1
      wx.setStorageSync('hikerAvatarIndex', avatarIndex)
    }

    const paddedIndex = String(avatarIndex).padStart(2, '0')
    this.setData({
      avatarUrl: `/images/avatars/avatar-${paddedIndex}.jpg`,
      hikerNickname: `${hikerNumber}号徒步爱好者`
    })
  },

  /**
   * 生成随机编号（支持扩展位数）
   * @param {number} digits - 编号位数，默认3位
   * @returns {string} 补零后的编号字符串
   */
  generateNumber(digits = 3) {
    const max = Math.pow(10, digits) - 1
    const number = Math.floor(Math.random() * max) + 1
    return String(number).padStart(digits, '0')
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
   * 收藏数据结构（新）: favorites_full = [{ routeId: "route_001", date: "..." }]
   * 兼容旧格式: favorites = ["route_001", "route_002"]
   * 按收藏日期倒序排列（最新的在前）
   */
  async loadFavorites() {
    try {
      // 优先读取完整数据（含时间戳）
      let favoritesFull = wx.getStorageSync('favorites_full') || []
      let favorites = wx.getStorageSync('favorites') || []

      // 兼容：如果没有 favorites_full，从 favorites 构建
      let favoriteIds = []
      let dateMap = {}

      if (favoritesFull.length > 0) {
        favoritesFull.forEach(item => {
          if (typeof item === 'string') {
            favoriteIds.push(item)
            dateMap[item] = null
          } else if (item && item.routeId) {
            favoriteIds.push(item.routeId)
            dateMap[item.routeId] = item.date || null
          }
        })
      } else if (Array.isArray(favorites)) {
        favoriteIds = favorites
      } else if (favorites && favorites.favorites) {
        favoriteIds = favorites.favorites
      }

      this.setData({ favoriteCount: favoriteIds.length })

      if (favoriteIds.length === 0) {
        this.setData({ favoriteRoutes: [] })
        return
      }

      // 从云端批量获取路线详情
      const db = wx.cloud.database()
      const _ = db.command
      const MAX = 20
      let allRoutes = []

      // 分批查询（云数据库_.in限制20条）
      for (let i = 0; i < favoriteIds.length; i += MAX) {
        const batchIds = favoriteIds.slice(i, i + MAX)
        try {
          const res = await db.collection('routes').where({
            _id: _.in(batchIds)
          }).field({
            _id: true, name: true, description: true, coverImage: true,
            difficulty: true, distance: true, durationMin: true, durationMax: true,
            shortDesc: true, location: true
          }).get()
          allRoutes = allRoutes.concat(res.data)
        } catch (e) {
          console.warn('批量获取收藏路线失败:', e)
        }
      }

      // 构建路线列表并附上收藏日期
      let routes = favoriteIds.map(id => {
        const r = allRoutes.find(t => t._id === id)
        const route = r ? this.normalizeRoute(r) : { _id: id, name: '路线详情', description: '', coverImage: '', location: '', distance: '', duration: '', difficulty: '', difficultyLevel: 0 }
        return { ...route, favoriteDate: dateMap[id] || null }
      })

      // 按收藏日期倒序（有日期的在前，无日期的按原顺序排在后面）
      routes.sort((a, b) => {
        if (a.favoriteDate && b.favoriteDate) return new Date(b.favoriteDate) - new Date(a.favoriteDate)
        if (a.favoriteDate) return -1
        if (b.favoriteDate) return 1
        return 0
      })

      this.setData({ favoriteRoutes: routes })
      this._rebuildDisplayed()
    } catch (err) {
      console.error('加载收藏列表失败：', err)
      this.setData({ favoriteRoutes: [], favoriteCount: 0, displayedFavorites: [] })
    }
  },

  /**
   * 加载已走过列表
   * 已走过数据: { completed: [{ routeId, date, weather, feeling, difficultyFeeling, companions }] }
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

      // 从云端批量获取路线详情
      const routeIds = completedList.map(item => item.routeId).filter(Boolean)
      const db = wx.cloud.database()
      const _ = db.command
      let allRoutes = []

      for (let i = 0; i < routeIds.length; i += 20) {
        try {
          const res = await db.collection('routes').where({
            _id: _.in(routeIds.slice(i, i + 20))
          }).field({
            _id: true, name: true, description: true, coverImage: true,
            difficulty: true, distance: true, durationMin: true, durationMax: true,
            shortDesc: true, location: true
          }).get()
          allRoutes = allRoutes.concat(res.data)
        } catch (e) {
          console.warn('批量获取已走过路线失败:', e)
        }
      }

      // 合并路线详情和已走过信息，计算总里程，并统计每条路线走过次数
      const routes = []
      // 先按 routeId 分组统计
      const routeCountMap = {}
      for (const item of completedList) {
        if (item.routeId) {
          routeCountMap[item.routeId] = (routeCountMap[item.routeId] || 0) + 1
        }
      }
      // 先算总里程：优先用用户填写的徒步距离，没有则用路线数据库距离
      let totalDistance = 0
      for (const item of completedList) {
        if (item.distance && item.distance > 0) {
          totalDistance += parseFloat(item.distance) || 0
        } else {
          const cloudRoute = allRoutes.find(t => t._id === item.routeId)
          if (cloudRoute) {
            const route = this.normalizeRoute(cloudRoute)
            const distStr = String(route.distance || '0')
            const distMatch = distStr.match(/[\d.]+/)
            totalDistance += distMatch ? parseFloat(distMatch[0]) : 0
          }
        }
      }
      // 去重：每条路线只保留最新一次的记录用于展示
      const seen = new Set()
      for (const item of completedList) {
        if (seen.has(item.routeId)) continue
        seen.add(item.routeId)
        const cloudRoute = allRoutes.find(t => t._id === item.routeId)
        const route = cloudRoute ? this.normalizeRoute(cloudRoute) : null
        if (route) {
          routes.push({
            ...route,
            routeId: item.routeId,
            completedDate: item.date,
            completedNote: item.note || '',
            weather: item.weather || '',
            weatherEmoji: this.getWeatherEmoji(item.weather),
            feeling: item.feeling || '',
            difficultyFeeling: item.difficultyFeeling || '',
            companion: item.companion || item.companions || '',
            completedCount: routeCountMap[item.routeId] || 1
          })
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
            difficultyFeeling: item.difficultyFeeling || '',
            companion: item.companion || item.companions || '',
            completedCount: routeCountMap[item.routeId] || 1
          })
        }
      }

      this.setData({ completedRoutes: routes, totalDistance: Math.round(totalDistance * 10) / 10 })
      this._rebuildDisplayed()
    } catch (err) {
      console.error('加载已走过列表失败：', err)
      this.setData({ completedRoutes: [], completedCount: 0, totalDistance: 0, displayedCompleted: [] })
    }
  },

  /**
   * 标准化路线数据格式
   * 将不同来源的路线数据统一格式
   */
  normalizeRoute(trail) {
    if (!trail) return {}
    const diffLevel = typeof trail.difficulty === 'number' ? trail.difficulty : 3
    return {
      _id: trail._id,
      name: trail.name || '路线详情',
      description: trail.shortDesc || trail.description || '',
      coverImage: trail.coverImage || '/images/scenery/scenery-general.jpg',
      difficulty: this.getDifficultyLabel(diffLevel),
      difficultyLevel: diffLevel,
      distance: trail.distance ? `${trail.distance}km` : '',
      duration: trail.durationText || trail.duration || '',
      location: trail.location && typeof trail.location === 'object' ? trail.location.district : (trail.location || ''),
      sceneryTags: []
    }
  },

  /**
   * 获取难度标签（接受 level 数字或 route 对象）
   */
  getDifficultyLabel(levelOrItem) {
    const level = typeof levelOrItem === 'object'
      ? (levelOrItem.difficultyLevel || levelOrItem.difficulty || 3)
      : (levelOrItem || 3)
    const labels = { 1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难' }
    return labels[level] || '适中'
  },

  /**
   * 获取难度文本（中文）
   */
  getDifficultyText(levelOrItem) {
    const level = typeof levelOrItem === 'object'
      ? (levelOrItem.difficultyLevel || levelOrItem.difficulty || 3)
      : (levelOrItem || 3)
    const map = { 1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难' }
    return map[level] || '适中'
  },

  /**
   * 获取难度颜色（接受 level 数字或 route 对象）
   */
  getDifficultyColor(levelOrItem) {
    const level = typeof levelOrItem === 'object'
      ? (levelOrItem.difficultyLevel || levelOrItem.difficulty || 3)
      : (levelOrItem || 3)
    const colors = {
      1: '#4CAF50',
      2: '#8BC34A',
      3: '#FFC107',
      4: '#FF9800',
      5: '#F44336'
    }
    return colors[level] || '#FFC107'
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
        this.setData({ syncStatus: 'success', syncFailed: false })
        // 3秒后隐藏提示
        setTimeout(() => {
          if (this.data.syncStatus === 'success') {
            this.setData({ syncStatus: '' })
          }
        }, 3000)
      }
    } catch (err) {
      console.error('同步失败:', err)
      this.setData({ syncStatus: 'error', syncFailed: true })
      showNiceToast(this, '同步失败，可手动重试', 'error', 2000)
    }
  },

  // 手动重试同步
  onRetrySync: function () {
    this.syncFromCloud()
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

  // 备案号查询
  onIcpTap: function () {
    wx.setClipboardData({
      data: '陕ICP备2026006901号'
    })
  },

  // 重建显示列表（默认5条）
  _rebuildDisplayed() {
    const fav = this.data.showAllFavorites ? this.data.favoriteRoutes : this.data.favoriteRoutes.slice(0, 3)
    const comp = this.data.showAllCompleted ? this.data.completedRoutes : this.data.completedRoutes.slice(0, 3)
    this.setData({ displayedFavorites: fav, displayedCompleted: comp })
  },

  // 收藏列表展开/收起
  toggleShowAllFavorites() {
    const showAll = !this.data.showAllFavorites
    this.setData({
      showAllFavorites: showAll,
      displayedFavorites: showAll ? this.data.favoriteRoutes : this.data.favoriteRoutes.slice(0, 3)
    })
  },

  // 已走过列表展开/收起
  toggleShowAllCompleted() {
    const showAll = !this.data.showAllCompleted
    this.setData({
      showAllCompleted: showAll,
      displayedCompleted: showAll ? this.data.completedRoutes : this.data.completedRoutes.slice(0, 3)
    })
  },

  /**
   * 点击路线卡片 -> 进入详情页
   */
  onRouteTap(e) {
    // route-card 组件通过 e.detail.route 传递；直接调用时用 dataset.id
    const route = e.detail ? e.detail.route : null
    const id = route ? route._id : e.currentTarget.dataset.id
    if (!id) return
    const routeObj = route || this.data.favoriteRoutes.find(r => r._id === id) ||
                          this.data.completedRoutes.find(r => r._id === id)
    if (routeObj && routeObj.name) {
      wx.setStorageSync('routeName_' + id, routeObj.name)
    }
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${id}` })
  },

  // 已走过卡片点击 -> 进入详情页并自动滚动到徒步记录
  onCompletedRouteTap(e) {
    const route = e.detail ? e.detail.route : null
    const id = route ? route._id : e.currentTarget.dataset.id
    if (!id) return
    const routeObj = route || this.data.completedRoutes.find(r => r._id === id)
    if (routeObj && routeObj.name) {
      wx.setStorageSync('routeName_' + id, routeObj.name)
    }
    wx.navigateTo({ url: `/pages/route-detail/route-detail?id=${id}&scrollToRecords=1` })
  },

  // 点击爱心取消收藏（带确认弹窗）
  onCancelFavorite(e) {
    // route-card 组件通过 e.detail.route 传递；直接调用时用 dataset.id
    const route = e.detail ? e.detail.route : null
    const id = route ? route._id : e.currentTarget.dataset.id
    const routeObj = route || this.data.favoriteRoutes.find(r => r._id === id)
    const name = routeObj ? routeObj.name : '该路线'

    wx.showModal({
      title: '取消收藏',
      content: `你确认要取消收藏「${name}」吗？`,
      confirmText: '确认取消',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          try {
            const cloudSync = require('../../utils/cloud-sync.js')
            cloudSync.removeFavorite(id)
            // 即时UI更新：同时更新 favoriteRoutes、displayedFavorites、favoriteCount
            const favoriteRoutes = this.data.favoriteRoutes.filter(r => r._id !== id)
            const displayedFavorites = this.data.displayedFavorites.filter(r => r._id !== id)
            this.setData({
              favoriteRoutes,
              displayedFavorites,
              favoriteCount: favoriteRoutes.length
            })
            showNiceToast(this, '已取消收藏', 'success', 2000)
          } catch (err) {
            console.error('取消收藏失败：', err)
            showNiceToast(this, '操作失败', 'error', 2000)
          }
        }
      }
    })
  },


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
      // 先更新本地（兼容新旧格式）
      let favorites = wx.getStorageSync('favorites') || []
      if (!Array.isArray(favorites)) {
        favorites = favorites.favorites || []
      }
      favorites = favorites.filter(fid => fid !== id)
      wx.setStorageSync('favorites', favorites)

      // 同时更新完整数据
      let favoritesFull = wx.getStorageSync('favorites_full') || []
      favoritesFull = favoritesFull.filter(item => {
        if (typeof item === 'string') return item !== id
        if (item && item.routeId) return item.routeId !== id
        return true
      })
      wx.setStorageSync('favorites_full', favoritesFull)

      // 同步到云端
      const cloudSync = require('../../utils/cloud-sync.js')
      cloudSync.removeFavorite(id)

      showNiceToast(this, '已取消收藏', 'success', 2000)
      // 即时UI更新：同时更新 favoriteRoutes、displayedFavorites、favoriteCount
      const favoriteRoutes = this.data.favoriteRoutes.filter(r => r._id !== id)
      const displayedFavorites = this.data.displayedFavorites.filter(r => r._id !== id)
      this.setData({
        favoriteRoutes,
        displayedFavorites,
        favoriteCount: favoriteRoutes.length
      })
    } catch (err) {
      console.error('取消收藏失败：', err)
      showNiceToast(this, '操作失败', 'error', 2000)
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

      showNiceToast(this, '已删除记录', 'success', 2000)
      this.loadCompleted()
    } catch (err) {
      console.error('删除记录失败：', err)
      showNiceToast(this, '操作失败', 'error', 2000)
    }
  },

  // ========== 导航 ==========

  // ========== 后台管理 ==========

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

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
