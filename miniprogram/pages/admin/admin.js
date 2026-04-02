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
    // 状态栏高度
    statusBarHeight: 0,
    // 认证状态
    isLoggedIn: false,
    showPassword: false,
    passwordInput: '',

    // Tab
    activeTab: 'overview',

    // 概览
    stats: { totalRoutes: 0, totalUsers: 0, totalArticles: 0 },
    statsLoading: true,

    // 概览图表数据
    chartLoaded: false,
    chartLoading: false,
    trendDimension: 'month', // day / week / month / year
    trendDimensions: [
      { label: '按天', value: 'day' },
      { label: '按周', value: 'week' },
      { label: '按月', value: 'month' },
      { label: '按年', value: 'year' }
    ],

    // 图表数据
    userGrowthList: [],
    favoriteTrendList: [],
    completedTrendList: [],
    topFavoritedRoutes: [],
    topCompletedRoutes: [],
    topArticles: [],
    topUsers: [],

    // 图表面板折叠状态
    panelUserGrowth: true,
    panelFavoriteTrend: true,
    panelCompletedTrend: true,
    panelTopFavorited: true,
    panelTopCompleted: true,
    panelTopArticles: true,
    panelTopUsers: true,

    // 路线
    routes: [],
    routesFiltered: [],
    routesLoading: false,
    routesPage: 1,
    routesTotal: 0,
    routesKeyword: '',
    routesHasMore: true,
    routesActiveFilter: 'all', // all | published | draft

    // 用户
    users: [],
    usersLoading: false,
    usersPage: 1,
    usersTotal: 0,
    usersKeyword: '',
    usersHasMore: true,

    // 文章
    articles: [],
    articlesFiltered: [],
    articlesLoading: false,
    articlesPage: 1,
    articlesTotal: 0,
    articlesHasMore: true,
    articlesActiveFilter: 'all', // all | published | draft
    articlesKeyword: '',
    articlesSearchType: 'all', // all | category | content
    articlesSearchTypes: [
      { label: '全部', value: 'all' },
      { label: '按类别', value: 'category' },
      { label: '按内容', value: 'content' }
    ],
    articlesSearchTypeLabel: '全部',

    // 用户详情弹窗
    showUserDetailModal: false,
    userDetailLoading: false,
    userDetailName: '',
    userDetailTab: 'favorites', // favorites | completed
    userFavoriteRoutes: [],
    userCompletedRoutes: [],
    userDetailInfo: {},

    // Toast
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
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
      // 管理员验证通过，检查密码登录状态（2小时过期）
      const loginTime = wx.getStorageSync('admin_login_time')
      const isLoggedIn = wx.getStorageSync('admin_logged_in') && loginTime && (Date.now() - loginTime < 2 * 60 * 60 * 1000)
      if (isLoggedIn) {
        this.setData({ isLoggedIn: true })
        this.loadAllData()
      }
    }).catch(() => {
      wx.showToast({ title: '验证失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  },

  onShow() {
    if (!this.data.isLoggedIn) return
    // 从编辑页返回时刷新当前 tab 数据
    if (this.data.activeTab === 'routes') {
      this.loadRoutes()
    } else if (this.data.activeTab === 'articles') {
      this.loadArticles()
    }
    // 始终刷新概览统计（删除/编辑路线/文章后数据可能变化）
    this.loadStats()
  },

  // ========== 认证 ==========

  onPasswordInput(e) {
    this.setData({ passwordInput: e.detail.value })
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
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
        wx.setStorageSync('admin_login_time', Date.now())
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
    const token = wx.getStorageSync('admin_token') || ''
    return wx.cloud.callFunction({
      name: 'admin-api',
      data: { module, action, params: { ...params, token } }
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
    // 切换到概览时刷新统计数据，确保删除操作后数据最新
    if (tab === 'overview') {
      this.loadStats()
      if (!this.data.chartLoaded) this.loadCharts()
    }
    if (tab === 'routes' && this.data.routes.length === 0) this.loadRoutes()
    if (tab === 'users' && this.data.users.length === 0) this.loadUsers()
    if (tab === 'articles' && this.data.articles.length === 0) this.loadArticles()
  },

  // ========== 数据加载 ==========

  loadAllData() {
    this.loadStats()
    this.loadCharts()
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

  // --- 概览图表 ---
  async loadCharts() {
    if (this.data.chartLoading) return
    this.setData({ chartLoading: true })
    const dim = this.data.trendDimension
    try {
      const [growth, favTrend, compTrend, topFav, topComp, articles, users] = await Promise.all([
        this.callAdminApi('stats', 'userGrowth', { dimension: dim }),
        this.callAdminApi('stats', 'favoriteTrend', { dimension: dim }),
        this.callAdminApi('stats', 'completedTrend', { dimension: dim }),
        this.callAdminApi('stats', 'topFavoritedRoutes'),
        this.callAdminApi('stats', 'topCompletedRoutes'),
        this.callAdminApi('stats', 'topArticles'),
        this.callAdminApi('stats', 'topUsers')
      ])

      // 处理柱状图比例
      const calcBarPct = (list, key) => {
        if (!list || list.length === 0) return []
        const max = Math.max(...list.map(i => i[key] || 0), 1)
        return list.map(i => ({ ...i, barPct: Math.round(((i[key] || 0) / max) * 100) }))
      }

      this.setData({
        userGrowthList: growth.code === 0 ? (growth.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : [],
        completedTrendList: compTrend.code === 0 ? (compTrend.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : [],
        favoriteTrendList: favTrend.code === 0 ? (favTrend.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : [],
        topFavoritedRoutes: topFav.code === 0 ? calcBarPct(topFav.data.list || [], 'favoriteCount') : [],
        topCompletedRoutes: topComp.code === 0 ? calcBarPct(topComp.data.list || [], 'completedCount') : [],
        topArticles: articles.code === 0 ? calcBarPct(articles.data.list || [], 'viewCount') : [],
        topUsers: users.code === 0 ? (users.data.list || []) : [],
        chartLoading: false,
        chartLoaded: true
      })

      // 重新计算趋势图的 barPct（需要特殊处理）
      this._calcTrendBarPct('userGrowthList', 'value')
      this._calcTrendBarPct('completedTrendList', 'value')
      this._calcTrendBarPct('favoriteTrendList', 'value')
    } catch (e) {
      console.error('加载图表失败:', e)
      this.setData({ chartLoading: false })
    }
  },

  // 计算趋势图柱状图比例
  _calcTrendBarPct(field, key) {
    const list = this.data[field]
    if (!list || list.length === 0) return
    const max = Math.max(...list.map(i => i[key] || 0), 1)
    const updated = list.map(i => ({ ...i, barPct: Math.round(((i[key] || 0) / max) * 100) }))
    this.setData({ [field]: updated })
  },

  // 时间维度切换
  onTrendDimensionChange(e) {
    const dim = e.currentTarget.dataset.value
    if (dim === this.data.trendDimension) return
    this.setData({ trendDimension: dim })
    // 重新加载趋势数据
    this._reloadTrends()
  },

  async _reloadTrends() {
    const dim = this.data.trendDimension
    try {
      const [growth, compTrend, favTrend] = await Promise.all([
        this.callAdminApi('stats', 'userGrowth', { dimension: dim }),
        this.callAdminApi('stats', 'completedTrend', { dimension: dim }),
        this.callAdminApi('stats', 'favoriteTrend', { dimension: dim })
      ])

      this.setData({
        userGrowthList: growth.code === 0 ? (growth.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : [],
        completedTrendList: compTrend.code === 0 ? (compTrend.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : [],
        favoriteTrendList: favTrend.code === 0 ? (favTrend.data.list || []).map(i => ({ label: i._id, value: i.count, barPct: 0 })) : []
      })
      this._calcTrendBarPct('userGrowthList', 'value')
      this._calcTrendBarPct('completedTrendList', 'value')
      this._calcTrendBarPct('favoriteTrendList', 'value')
    } catch (e) {
      console.error('刷新趋势失败:', e)
    }
  },

  // 图表面板折叠/展开
  toggleChartPanel(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: !this.data[field] })
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
          routesFiltered: this._filterRoutes(list, this.data.routesActiveFilter),
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

  // 路线发布状态筛选
  onRoutesFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.routesActiveFilter) return
    this.setData({
      routesActiveFilter: filter,
      routesFiltered: this._filterRoutes(this.data.routes, filter)
    })
  },

  _filterRoutes(list, filter) {
    if (filter === 'all') return list
    if (filter === 'published') return list.filter(r => r.isActive === true)
    if (filter === 'draft') return list.filter(r => r.isActive !== true)
    return list
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
      const keyword = this.data.articlesKeyword
      let res
      if (keyword) {
        res = await this.callAdminApi('articles', 'search', {
          keyword,
          searchType: this.data.articlesSearchType,
          page,
          pageSize: 20
        })
      } else {
        res = await this.callAdminApi('articles', 'list', {
          page, pageSize: 20
        })
      }
      if (res.code === 0) {
        const list = append ? this.data.articles.concat(res.data.list) : res.data.list
        this.setData({
          articles: list,
          articlesFiltered: this._filterArticles(list, this.data.articlesActiveFilter),
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

  onArticlesSearch(e) {
    this.setData({ articlesKeyword: e.detail.value })
  },

  onArticlesSearchConfirm() {
    this.setData({ articlesPage: 1, articlesHasMore: true })
    this.loadArticles()
  },

  onArticlesSearchTypeChange(e) {
    const idx = parseInt(e.detail.value)
    const item = this.data.articlesSearchTypes[idx]
    this.setData({
      articlesSearchType: item.value,
      articlesSearchTypeLabel: item.label
    })
    // 切换搜索类型后自动重新搜索
    if (this.data.articlesKeyword) {
      this.setData({ articlesPage: 1, articlesHasMore: true })
      this.loadArticles()
    }
  },

  onArticlesScrollToLower() {
    if (this.data.articlesHasMore) this.loadArticles(true)
  },

  // 文章发布状态筛选
  onArticlesFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.articlesActiveFilter) return
    this.setData({
      articlesActiveFilter: filter,
      articlesFiltered: this._filterArticles(this.data.articles, filter)
    })
  },

  _filterArticles(list, filter) {
    if (filter === 'all') return list
    if (filter === 'published') return list.filter(a => a.isActive === true)
    if (filter === 'draft') return list.filter(a => a.isActive !== true)
    return list
  },

  // ========== 交互操作 ==========

  // 路线点击 -> 编辑页
  onRouteTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/route-edit?id=${id}` })
  },

  // 添加路线
  onAddRoute() {
    wx.navigateTo({ url: '/pages/admin/route-edit' })
  },

  // 用户点击 -> 查看用户详情（收藏 + 已走过）
  async onUserTap(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '用户'
    this.setData({
      showUserDetailModal: true,
      userDetailLoading: true,
      userDetailName: name,
      userDetailTab: 'favorites',
      userFavoriteRoutes: [],
      userCompletedRoutes: [],
      userDetailInfo: {}
    })
    try {
      const res = await this.callAdminApi('users', 'detail', { id })
      if (res.code === 0) {
        this.setData({
          userDetailInfo: res.data.userInfo || {},
          userFavoriteRoutes: res.data.favoriteRoutes || [],
          userCompletedRoutes: res.data.completedRoutes || [],
          userDetailLoading: false
        })
      } else {
        this.showToast(res.message || '加载失败', 'error')
        this.setData({ userDetailLoading: false })
      }
    } catch (e) {
      console.error('加载用户详情失败:', e)
      this.setData({ userDetailLoading: false })
    }
  },

  onUserDetailTabChange(e) {
    this.setData({ userDetailTab: e.currentTarget.dataset.tab })
  },

  onCloseUserDetailModal() {
    this.setData({ showUserDetailModal: false })
  },

  // 文章点击 -> 编辑
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/route-edit?id=${id}&type=article` })
  },

  // 添加文章
  onAddArticle() {
    wx.navigateTo({ url: '/pages/admin/route-edit?type=article' })
  },

  // ========== isActive 切换 ==========

  async onToggleRouteActive(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await this.callAdminApi('toggleActive', 'toggle', { id, collection: 'routes' })
      if (res.code === 0) {
        this.showToast(res.message, 'success')
        // 更新本地数据
        const routes = this.data.routes.map(r => {
          if (r._id === id) r.isActive = res.data.isActive
          return r
        })
        this.setData({
          routes,
          routesFiltered: this._filterRoutes(routes, this.data.routesActiveFilter)
        })
      } else {
        this.showToast(res.message || '操作失败', 'error')
      }
    } catch (err) {
      console.error('切换路线状态失败:', err)
      this.showToast('操作失败', 'error')
    }
  },

  async onToggleArticleActive(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await this.callAdminApi('toggleActive', 'toggle', { id, collection: 'articles' })
      if (res.code === 0) {
        this.showToast(res.message, 'success')
        const articles = this.data.articles.map(a => {
          if (a._id === id) a.isActive = res.data.isActive
          return a
        })
        this.setData({
          articles,
          articlesFiltered: this._filterArticles(articles, this.data.articlesActiveFilter)
        })
      } else {
        this.showToast(res.message || '操作失败', 'error')
      }
    } catch (err) {
      console.error('切换文章状态失败:', err)
      this.showToast('操作失败', 'error')
    }
  },

  // ========== 批量导出 ==========

  async onExportRoutes() {
    this._doExport('routes', '路线')
  },

  async onExportArticles() {
    this._doExport('articles', '文章')
  },

  async onExportUsers() {
    this._doExport('user_data', '用户')
  },

  async _doExport(collection, label) {
    wx.showModal({
      title: '确认导出',
      content: `确定导出全部${label}数据？（JSONL格式）`,
      success: async (modal) => {
        if (!modal.confirm) return
        wx.showLoading({ title: '导出中...' })
        try {
          const res = await this.callAdminApi('export', 'exportData', { collection })
          wx.hideLoading()
          if (res.code === 0 && res.data.downloadUrl) {
            this.showToast(`${label}导出成功（${res.data.totalRecords}条）`, 'success')
            // 复制下载链接到剪贴板
            wx.setClipboardData({
              data: res.data.downloadUrl,
              success: () => {
                wx.showModal({
                  title: '导出成功',
                  content: `共 ${res.data.totalRecords} 条记录\n下载链接已复制到剪贴板，请在浏览器中打开下载`,
                  showCancel: false
                })
              }
            })
          } else {
            this.showToast(res.message || '导出失败', 'error')
          }
        } catch (err) {
          wx.hideLoading()
          console.error('导出失败:', err)
          this.showToast('导出失败', 'error')
        }
      }
    })
  },

  // ========== 下拉刷新 ==========
  onPullDownRefresh() {
    if (this.data.activeTab === 'overview') {
      Promise.all([this.loadStats(), this.loadCharts()]).then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'routes') {
      this.loadRoutes().then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'users') {
      this.loadUsers().then(() => wx.stopPullDownRefresh())
    } else if (this.data.activeTab === 'articles') {
      this.loadArticles().then(() => wx.stopPullDownRefresh())
    }
  },

  // ========== 工具方法 ==========

  // 空函数，用于 catchtap 阻止冒泡
  noop() {},

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
    // 昵称：编号+「徒步爱好者」，如 001号徒步爱好者
    const num = item.userNumber || ''
    if (num) {
      item.displayName = num + '号徒步爱好者'
      item.nickNameInitial = num.toString().charAt(0)
    } else {
      item.displayName = item.nickName || '未设置昵称'
      item.nickNameInitial = (item.nickName || '用').charAt(0)
    }
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
    item.visitCount = item.visitCount || 0
    return item
  }
})
