Page({
  data: {
    category: '',
    icon: '',
    subtitle: '',
    themeColor: '',
    articles: [],
    filteredArticles: [],
    tabs: [],
    activeTab: '',
    loading: false,
    hasMore: true,
    page: 0,
    pageSize: 20,
    statusBarHeight: 20
  },

  categoryConfig: {
    '装备推荐': {
      icon: '🥾',
      themeColor: '#2d6a4f',
      subtitle: '精选户外装备，助你轻装上阵'
    },
    '安全自救': {
      icon: '🆘',
      themeColor: '#D32F2F',
      subtitle: '掌握自救技能，守护生命安全'
    },
    '户外礼仪': {
      icon: '🤝',
      themeColor: '#1565C0',
      subtitle: '文明出行，做有素质的户外人'
    }
  },

  onLoad(options) {
    const category = decodeURIComponent(options.category || '')
    const sysInfo = wx.getSystemInfoSync()

    const config = this.categoryConfig[category] || {
      icon: '📖',
      themeColor: '#2E7D32',
      subtitle: '探索更多户外知识'
    }

    this.setData({
      category,
      icon: config.icon,
      themeColor: config.themeColor,
      subtitle: config.subtitle,
      statusBarHeight: sysInfo.statusBarHeight
    })

    this.loadArticles()
  },

  loadArticles() {
    if (this.data.loading || !this.data.hasMore) return

    const db = wx.cloud.database()
    const _ = db.command
    const skip = this.data.page * this.data.pageSize

    this.setData({ loading: true })

    db.collection('articles')
      .where({ category: this.data.category, isActive: true })
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(this.data.pageSize)
      .get()
      .then(res => {
        const newArticles = res.data || []
        const allArticles = this.data.articles.concat(newArticles)

        // 构建子分类Tab
        const subcategories = [...new Set(allArticles.map(a => a.subcategory).filter(Boolean))]
        const tabs = [{ label: '全部', value: '' }, ...subcategories.map(s => ({ label: s, value: s }))]

        // 如果有activeTab，过滤文章
        const filtered = this.data.activeTab
          ? allArticles.filter(a => a.subcategory === this.data.activeTab)
          : allArticles

        this.setData({
          articles: allArticles,
          filteredArticles: filtered,
          tabs,
          page: this.data.page + 1,
          hasMore: newArticles.length === this.data.pageSize,
          loading: false
        })
      })
      .catch(err => {
        console.error('加载文章失败:', err)
        this.setData({ loading: false })
      })
  },

  onReachBottom() {
    this.loadArticles()
  },

  // 子分类Tab切换
  onTabChange(e) {
    const value = e.currentTarget.dataset.value
    const filtered = value
      ? this.data.articles.filter(a => a.subcategory === value)
      : this.data.articles
    this.setData({
      activeTab: value,
      filteredArticles: filtered
    })
  },

  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/article-detail/article-detail?id=' + id
    })
  },

  onBackTap() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/knowledge/knowledge' })
      }
    })
  }
})
