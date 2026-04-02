// pages/admin/admin.js

// ========== 口令强度校验 ==========
function validatePasswordStrength(password) {
  const errors = []
  if (password.length < 8) errors.push('长度不少于 8 位')
  if (!/[A-Z]/.test(password)) errors.push('缺少大写字母')
  if (!/[a-z]/.test(password)) errors.push('缺少小写字母')
  if (!/[0-9]/.test(password)) errors.push('缺少数字')
  if (!/[@#$%^&*!~`+\-=<>?/\\|[\]{}()]/.test(password)) errors.push('缺少特殊符号（如 @#$%^&*!）')
  return errors
}

Page({
  data: {
    // 认证状态
    isLoggedIn: false,
    passwordInput: '',

    // Tab
    activeTab: 'overview',

    // 概览
    stats: { totalRoutes: 0, totalUsers: 0, totalArticles: 0 },
    statsLoading: true,

    // 路线
    routes: [],
    routesLoading: false,
    routesPage: 1,
    routesTotal: 0,
    routesKeyword: '',
    routesHasMore: true,

    // 用户
    users: [],
    usersLoading: false,
    usersPage: 1,
    usersTotal: 0,
    usersKeyword: '',
    usersHasMore: true,

    // 文章
    articles: [],
    articlesLoading: false,
    articlesPage: 1,
    articlesTotal: 0,
    articlesHasMore: true,

    // 已走过记录弹窗
    showCompletedModal: false,
    completedList: [],
    completedLoading: false,
    completedUserName: '',

    // Toast
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad() {
    // 双重保护：先验证管理员身份
    wx.cloud.callFunction({
      name: 'admin-api',
      data: { module: 'check-admin' }
    }).then(res => {
      if (!res.result || !res.result.data || !res.result.data.isAdmin) {
        wx.showToast({ title: '无权访问', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      // 管理员验证通过，检查密码登录状态
      const isLoggedIn = wx.getStorageSync('admin_logged_in')
      if (isLoggedIn) {
        this.setData({ isLoggedIn: true })
        this.loadAllData()
      }
    }).catch(() => {
      wx.showToast({ title: '验证失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    })
  },

  // ========== 认证 ==========

  onPasswordInput(e) {
    this.setData({ passwordInput: e.detail.value })
  },

  async onLogin() {
    const password = this.data.passwordInput
    if (!password) {
      this.showToast('请输入口令', 'error')
      return
    }

    // 1. 客户端口令强度校验
    const strengthErrors = validatePasswordStrength(password)
    if (strengthErrors.length > 0) {
      this.showToast('口令不合规：' + strengthErrors[0], 'error')
      return
    }

    // 2. 将口令明文传给云函数（服务端做哈希比对）
    try {
      wx.showLoading({ title: '验证中...' })
      const res = await wx.cloud.callFunction({
        name: 'admin-api',
        data: {
          module: 'auth',
          action: 'login',
          params: { password }
        }
      })
      wx.hideLoading()

      if (res.result && res.result.code === 0) {
        wx.setStorageSync('admin_logged_in', true)
        wx.setStorageSync('admin_token', res.result.data.token)
        this.setData({ isLoggedIn: true, passwordInput: '' })
        this.loadAllData()
        this.showToast('登录成功', 'success')
      } else {
        this.showToast(res.result?.message || '口令错误', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('登录失败:', e)
      this.showToast('验证失败，请重试', 'error')
    }
  },

  // ========== 通用 ==========

  callAdminApi(module, action, params = {}) {
    return wx.cloud.callFunction({
      name: 'admin-api',
      data: { module, action, params }
    }).then(res => res.result)
  },

  showToast(message, type = 'info', duration = 2000) {
    this.setData({ showToast: true, toastMessage: message, toastType: type })
    setTimeout(() => this.setData({ showToast: false }), duration)
  },

  // ========== Tab 切换 ==========

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    // 懒加载：首次切换到对应 tab 时加载数据
    if (tab === 'overview' && this.data.statsLoading) this.loadStats()
    if (tab === 'routes' && this.data.routes.length === 0) this.loadRoutes()
    if (tab === 'users' && this.data.users.length === 0) this.loadUsers()
    if (tab === 'articles' && this.data.articles.length === 0) this.loadArticles()
  },

  // ========== 数据加载 ==========

  loadAllData() {
    this.loadStats()
    this.loadRoutes()
    this.loadUsers()
    this.loadArticles()
  },

  // --- 概览 ---
  async loadStats() {
    this.setData({ statsLoading: true })
    try {
      const res = await this.callAdminApi('stats', 'overview')
      if (res.code === 0) {
        this.setData({ stats: res.data, statsLoading: false })
      }
    } catch (e) {
      console.error('加载概览失败:', e)
      this.setData({ statsLoading: false })
    }
  },

  // --- 路线 ---
  async loadRoutes(append = false) {
    if (this.data.routesLoading) return
    const page = append ? this.data.routesPage + 1 : 1
    this.setData({ routesLoading: true })
    try {
      const res = await this.callAdminApi('routes', 'list', {
        page, pageSize: 20, keyword: this.data.routesKeyword
      })
      if (res.code === 0) {
        const rawList = res.data.list.map(item => this.processRouteItem(item))
        const list = append ? this.data.routes.concat(rawList) : rawList
        this.setData({
          routes: list,
          routesTotal: res.data.total,
          routesPage: page,
          routesHasMore: list.length < res.data.total,
          routesLoading: false
        })
      }
    } catch (e) {
      console.error('加载路线失败:', e)
      this.setData({ routesLoading: false })
    }
  },

  onRoutesSearch(e) {
    this.setData({ routesKeyword: e.detail.value })
  },

  onRoutesSearchConfirm() {
    this.loadRoutes()
  },

  onRoutesScrollToLower() {
    if (this.data.routesHasMore) this.loadRoutes(true)
  },

  // --- 用户 ---
  async loadUsers(append = false) {
    if (this.data.usersLoading) return
    const page = append ? this.data.usersPage + 1 : 1
    this.setData({ usersLoading: true })
    try {
      const res = await this.callAdminApi('users', 'list', {
        page, pageSize: 20, keyword: this.data.usersKeyword
      })
      if (res.code === 0) {
        const rawList = res.data.list.map(item => this.processUserItem(item))
        const list = append ? this.data.users.concat(rawList) : rawList
        this.setData({
          users: list,
          usersTotal: res.data.total,
          usersPage: page,
          usersHasMore: list.length < res.data.total,
          usersLoading: false
        })
      }
    } catch (e) {
      console.error('加载用户失败:', e)
      this.setData({ usersLoading: false })
    }
  },

  onUsersSearch(e) {
    this.setData({ usersKeyword: e.detail.value })
  },

  onUsersSearchConfirm() {
    this.loadUsers()
  },

  onUsersScrollToLower() {
    if (this.data.usersHasMore) this.loadUsers(true)
  },

  // --- 文章 ---
  async loadArticles(append = false) {
    if (this.data.articlesLoading) return
    const page = append ? this.data.articlesPage + 1 : 1
    this.setData({ articlesLoading: true })
    try {
      const res = await this.callAdminApi('articles', 'list', {
        page, pageSize: 20
      })
      if (res.code === 0) {
        const list = append ? this.data.articles.concat(res.data.list) : res.data.list
        this.setData({
          articles: list,
          articlesTotal: res.data.total,
          articlesPage: page,
          articlesHasMore: list.length < res.data.total,
          articlesLoading: false
        })
      }
    } catch (e) {
      console.error('加载文章失败:', e)
      this.setData({ articlesLoading: false })
    }
  },

  onArticlesScrollToLower() {
    if (this.data.articlesHasMore) this.loadArticles(true)
  },

  // ========== 交互操作 ==========

  // 路线点击 -> 编辑页
  onRouteTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/route-edit?id=${id}` })
  },

  // 用户点击 -> 查看已走过记录
  async onUserTap(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '用户'
    this.setData({ showCompletedModal: true, completedLoading: true, completedUserName: name, completedList: [] })
    try {
      const res = await this.callAdminApi('users', 'completed', { id })
      if (res.code === 0) {
        this.setData({ completedList: res.data, completedLoading: false })
      } else {
        this.showToast(res.message || '加载失败', 'error')
        this.setData({ completedLoading: false })
      }
    } catch (e) {
      console.error('加载已走过记录失败:', e)
      this.setData({ completedLoading: false })
    }
  },

  onCloseCompletedModal() {
    this.setData({ showCompletedModal: false })
  },

  // 文章点击 -> 编辑
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/route-edit?id=${id}&type=article` })
  },

  // ========== 下拉刷新 ==========
  onPullDownRefresh() {
    if (this.data.activeTab === 'overview') {
      this.loadStats().then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'routes') {
      this.loadRoutes().then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'users') {
      this.loadUsers().then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'articles') {
      this.loadArticles().then(() => wx.stopPullDownRefresh())
    }
  },

  // ========== 工具方法 ==========

  getDifficultyLabel(level) {
    const labels = ['', '轻松', '初级', '中级', '高级', '挑战']
    return labels[level] || '未知'
  },

  getDifficultyColor(level) {
    const colors = { 1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF9800', 5: '#F44336' }
    return colors[level] || '#9E9E9E'
  },

  // 预处理路线数据（WXML 不能调用函数）
  processRouteItem(item) {
    const level = item.difficultyLevel || (item.difficulty && item.difficulty.level) || 0
    item.difficultyLabel = this.getDifficultyLabel(level)
    item.difficultyColor = this.getDifficultyColor(level)
    return item
  },

  // 预处理用户数据（WXML 不能调用函数或使用 [0]）
  processUserItem(item) {
    item.nickNameInitial = (item.nickName || '用').charAt(0)
    const completed = item.completed || []
    item.completedCount = completed.length
    const favs = item.favorites
    if (favs && Array.isArray(favs.favorites)) {
      item.favoritesCount = favs.favorites.length
    } else if (Array.isArray(favs)) {
      item.favoritesCount = favs.length
    } else {
      item.favoritesCount = 0
    }
    return item
  }
})
