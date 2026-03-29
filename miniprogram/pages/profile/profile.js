// pages/profile/profile.js
const app = getApp()

// 等级配置：{ 名称, 所需完成数 }
const LEVELS = [
  { level: 1, name: '新手驴友', target: 3 },
  { level: 2, name: '初级驴友', target: 10 },
  { level: 3, name: '中级驴友', target: 25 },
  { level: 4, name: '高级驴友', target: 50 },
  { level: 5, name: '资深驴友', target: 100 },
  { level: 6, name: '秦岭达人', target: Infinity }
]

Page({
  data: {
    // 是否已登录
    isLogin: false,
    // 用户信息
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    // 用户等级
    userLevel: {
      level: 1,
      name: '新手驴友',
      current: 0,
      target: 3,
      progress: 0
    },
    // 数据统计
    stats: {
      favorites: 0,
      footprints: 0,
      comments: 0,
      ecoActions: 0
    },
    // 未读消息数
    unreadCount: 0,
    // 登录弹窗
    showLoginPopup: false
  },

  onLoad() {
    // 页面加载时检查登录状态
    this.checkLoginStatus()
  },

  onShow() {
    // 每次页面显示时刷新数据（tabBar 页面切换时触发）
    if (this.data.isLogin) {
      this.loadUserData()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    if (this.data.isLogin) {
      this.loadUserData().then(() => {
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // ========== 登录相关 ==========

  /**
   * 检查登录状态
   * 从本地缓存读取用户信息
   */
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && (userInfo._openid || userInfo.openid)) {
      this.setData({
        isLogin: true,
        userInfo
      })
      this.loadUserData()
    }
  },

  /**
   * 点击用户区域
   * 未登录 -> 弹出登录弹窗；已登录 -> 查看个人资料
   */
  onUserTap() {
    if (!this.data.isLogin) {
      this.setData({ showLoginPopup: true })
    } else {
      // 已登录暂不跳转，后续可扩展个人资料编辑页
      wx.showToast({ title: `${this.data.userInfo.nickName || '用户'}`, icon: 'none' })
    }
  },

  /**
   * 关闭登录弹窗
   */
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },

  /**
   * 登录成功回调
   */
  onLoginSuccess() {
    this.setData({ showLoginPopup: false })
    this.checkLoginStatus()
  },

  // ========== 数据加载 ==========

  /**
   * 加载用户相关数据
   * 从云数据库获取统计数据、消息数、等级
   */
  async loadUserData() {
    try {
      await Promise.all([
        this.loadStats(),
        this.loadUnreadCount(),
        this.loadUserLevel()
      ])
    } catch (err) {
      console.error('加载用户数据失败：', err)
    }
  },

  /**
   * 加载统计数据
   * 查询收藏、足迹、评论、环保次数
   */
  async loadStats() {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) return

      const res = await wx.cloud.callFunction({
        name: 'stats',
        data: {
          action: 'getOverview'
        }
      })

      if (res.result && res.result.code === 0) {
        const data = res.result.data
        this.setData({
          stats: {
            favorites: data.total?.trails || 0,
            footprints: data.total?.trails || 0,
            comments: data.total?.comments || 0,
            ecoActions: data.total?.corrections || 0
          }
        })
      }
    } catch (err) {
      console.error('加载统计数据失败：', err)
    }
  },

  /**
   * 加载未读消息数
   */
  async loadUnreadCount() {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) return

      const res = await wx.cloud.callFunction({
        name: 'message',
        data: {
          action: 'getUnreadCount',
          user_id: userInfo._id
        }
      })

      if (res.result && res.result.code === 0) {
        this.setData({ unreadCount: res.result.data || 0 })
      }
    } catch (err) {
      console.error('加载消息数失败：', err)
    }
  },

  /**
   * 计算用户等级
   * 基于已完成的路线足迹数来判定等级
   */
  async loadUserLevel() {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) return

      const count = this.data.stats.footprints

      // 根据足迹数匹配等级
      let matched = LEVELS[0]
      let prevTarget = 0
      for (let i = 0; i < LEVELS.length; i++) {
        if (count < LEVELS[i].target) {
          matched = LEVELS[i]
          prevTarget = i > 0 ? LEVELS[i - 1].target : 0
          break
        }
        if (i === LEVELS.length - 1) {
          matched = LEVELS[i]
          prevTarget = LEVELS[i - 1].target
        }
      }

      // 计算进度百分比
      const range = matched.target - prevTarget
      const currentInLevel = count - prevTarget
      const progress = matched.target === Infinity
        ? 100
        : Math.min(100, Math.round((currentInLevel / range) * 100))

      this.setData({
        userLevel: {
          level: matched.level,
          name: matched.name,
          current: count,
          target: matched.target === Infinity ? '已满级' : matched.target,
          progress
        }
      })
    } catch (err) {
      console.error('加载等级失败：', err)
    }
  },

  // ========== 菜单跳转 ==========

  /**
   * 点击统计卡片
   * 跳转到对应页面
   */
  onStatTap(e) {
    const type = e.currentTarget.dataset.type
    // 统计卡片类型到页面路由的映射（仅已存在的页面）
    const pageMap = {
      comments: '/pages/comments/comments'
    }
    const url = pageMap[type]
    if (url) {
      this.navigateTo(url)
    } else {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
    }
  },

  /**
   * 点击功能菜单
   * 未登录提示登录，已登录跳转页面
   */
  onMenuTap(e) {
    const page = e.currentTarget.dataset.page

    // 未登录拦截（安全知识和法律法规除外）
    if (!this.data.isLogin && page !== 'safety' && page !== 'laws') {
      this.setData({ showLoginPopup: true })
      return
    }

    // 已存在的页面路由
    const existingPages = {
      comments: '/pages/comments/comments',
      correction: '/pages/correction/correction',
      messages: '/pages/messages/messages',
      safety: '/pages/safety/safety',
      laws: '/pages/laws/laws'
    }

    // 开发中的功能
    const devPages = ['favorites', 'footprints', 'level', 'eco']

    const url = existingPages[page]
    if (url) {
      this.navigateTo(url)
    } else if (devPages.includes(page)) {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
    }
  },

  /**
   * 统一导航方法
   * tabBar 页面用 switchTab，普通页面用 navigateTo
   */
  navigateTo(url) {
    // tabBar 页面列表
    const tabBarPages = [
      '/pages/home/home',
      '/pages/search/search',
      '/pages/profile/profile'
    ]
    if (tabBarPages.includes(url)) {
      wx.switchTab({ url })
    } else {
      wx.navigateTo({ url })
    }
  },

  // ========== 分享 ==========

  onShareAppMessage() {
    return {
      title: '秦人户外集合 - 探索秦岭之美',
      path: '/pages/home/home'
    }
  }
})
