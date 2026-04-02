Page({
  data: {
    category: '',
    icon: '',
    subtitle: '',
    themeColor: '',
    articles: [],
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
      .where({ category: this.data.category })
      .orderBy('order', 'asc')
      .skip(skip)
      .limit(this.data.pageSize)
      .get()
      .then(res => {
        const newArticles = res.data || []
        this.setData({
          articles: this.data.articles.concat(newArticles),
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
