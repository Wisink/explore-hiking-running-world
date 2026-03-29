// pages/knowledge/knowledge.js
const app = getApp()

Page({
  data: {
    loading: true,
    recommended: [],       // 推荐文章（横向滚动）
    categories: [
      { key: '装备选购', icon: '🥾', name: '装备选购' },
      { key: '安全自救', icon: '🆘', name: '安全自救' },
      { key: '户外礼仪', icon: '🤝', name: '户外礼仪' }
    ],
    categorizedArticles: {}  // 按分类组织的文章
  },

  onLoad() {
    this.loadArticles()
  },

  onShow() {
    // 每次显示时刷新（可能从详情页返回）
  },

  onPullDownRefresh() {
    this.loadArticles(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadArticles(callback) {
    this.setData({ loading: true })

    // 尝试从云数据库加载
    if (wx.cloud) {
      const db = wx.cloud.database()
      db.collection('articles')
        .orderBy('order', 'asc')
        .get()
        .then(res => {
          this.processArticles(res.data)
          if (callback) callback()
        })
        .catch(err => {
          console.warn('云数据库加载失败，使用本地数据:', err)
          this.loadLocalArticles()
          if (callback) callback()
        })
    } else {
      this.loadLocalArticles()
      if (callback) callback()
    }
  },

  loadLocalArticles() {
    try {
      const articles = require('../../data/articles.json')
      this.processArticles(articles)
    } catch (e) {
      console.error('本地数据加载失败:', e)
      this.setData({ loading: false })
    }
  },

  processArticles(articles) {
    // 推荐文章（前3篇）
    const recommended = articles.slice(0, 3).map((item, index) => ({
      ...item,
      coverGradient: this.getCoverGradient(index)
    }))

    // 按分类组织
    const categorizedArticles = {}
    this.data.categories.forEach(cat => {
      categorizedArticles[cat.key] = articles
        .filter(a => a.category === cat.key)
        .sort((a, b) => a.order - b.order)
    })

    this.setData({
      loading: false,
      recommended,
      categorizedArticles
    })
  },

  getCoverGradient(index) {
    const gradients = [
      'linear-gradient(135deg, #1B5E20 0%, #43A047 100%)',
      'linear-gradient(135deg, #E65100 0%, #FF8F00 100%)',
      'linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)'
    ]
    return gradients[index % gradients.length]
  },

  // 点击推荐文章
  onRecommendedTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/article-detail/article-detail?id=${id}`
    })
  },

  // 点击文章列表项
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/article-detail/article-detail?id=${id}`
    })
  }
})
