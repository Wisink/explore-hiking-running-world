// pages/knowledge/knowledge.js
const app = getApp()

Page({
  data: {
    loading: true,
    statusBarHeight: 0,
    activeCategory: '',
    categoryCount: { equipment: 0, safety: 0, etiquette: 0 },
    grouped: {},
    filteredArticles: [],
    recommended: [],
    categories: [
      { key: '装备推荐', icon: '🥾', name: '装备推荐' },
      { key: '安全自救', icon: '🆘', name: '安全自救' },
      { key: '户外礼仪', icon: '🤝', name: '户外礼仪' }
    ],
    categorizedArticles: {},
    showAll: {},
    isCategoryMode: false
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    if (options && options.category) {
      this.setData({ 
        activeCategory: options.category,
        isCategoryMode: true
      })
    }
    this.loadArticles()
  },

  onShow() {
    // 从globalData读取待切换的分类（通过switchTab从详情页跳转过来）
    const app = getApp()
    if (app.globalData && app.globalData.pendingCategory) {
      const category = app.globalData.pendingCategory
      app.globalData.pendingCategory = null
      this.setData({ activeCategory: category, isCategoryMode: true })
      this.loadArticles()
    }
  },

  onPullDownRefresh() {
    this.loadArticles(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadArticles(callback) {
    this.setData({ loading: true })

    // 从云数据库分页加载全部文章
    if (wx.cloud) {
      const db = wx.cloud.database()
      const MAX = 20
      const allArticles = []
      const fetchPage = (skip) => {
        db.collection('articles')
          .orderBy('order', 'asc')
          .skip(skip)
          .limit(MAX)
          .get()
          .then(res => {
            allArticles.push(...res.data)
            if (res.data.length === MAX) {
              fetchPage(skip + MAX)
            } else {
              this.processArticles(allArticles)
              if (callback) callback()
            }
          })
          .catch(err => {
            console.warn('云数据库加载失败，使用本地数据:', err)
            if (allArticles.length > 0) {
              this.processArticles(allArticles)
            } else {
              this.loadLocalArticles()
            }
            if (callback) callback()
          })
      }
      fetchPage(0)
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
    // 保存原始文章列表
    this._allArticles = articles

    // 按分类过滤
    let filtered = articles
    if (this.data.activeCategory) {
      filtered = articles.filter(a => a.category === this.data.activeCategory)
    }

    // 推荐文章：均衡推荐，从每个子分类取1篇优先级最高的
    const recommended = this.getRecommendedArticles(articles).map((item, index) => ({
      ...item,
      coverGradient: this.getCoverGradient(index)
    }))

    // 按分类组织（如果有activeCategory，只保留该分类）
    const categorizedArticles = {}
    this.data.categories.forEach(cat => {
      if (this.data.activeCategory && cat.key !== this.data.activeCategory) {
        return
      }
      categorizedArticles[cat.key] = articles
        .filter(a => a.category === cat.key)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    })

    // 构建显示用的文章列表（默认每类5篇）
    this._allCategorizedArticles = categorizedArticles
    const displayedCategorizedArticles = this._rebuildDisplayed(categorizedArticles, this.data.showAll)

    // 按分类分组
    const grouped = {}
    articles.forEach(a => {
      if (!grouped[a.category]) grouped[a.category] = []
      grouped[a.category].push(a)
    })

    // 统计各分类数量
    const categoryCount = {
      equipment: (grouped['装备推荐'] || []).length,
      safety: (grouped['安全自救'] || []).length,
      etiquette: (grouped['户外礼仪'] || []).length
    }

    this.setData({
      loading: false,
      articles: filtered,
      grouped,
      categoryCount,
      recommended,
      categorizedArticles,
      displayedCategorizedArticles
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

  // 分类卡片点击 - 跳转到专题页面
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    if (!category) return
    wx.navigateTo({
      url: '/pages/topic/topic?category=' + encodeURIComponent(category)
    })
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
  },

  // 展开/收起某个分类的全部文章
  onToggleShowAll(e) {
    const category = e.currentTarget.dataset.category
    const showAll = { ...this.data.showAll }
    showAll[category] = !showAll[category]
    const displayedCategorizedArticles = this._rebuildDisplayed(this._allCategorizedArticles, showAll)
    this.setData({ showAll, displayedCategorizedArticles })
  },

  // 新的推荐逻辑：从每个子分类取1篇优先级最高的
  getRecommendedArticles(articles) {
    const subcategoryMap = {}
    const recommended = []

    articles.forEach(article => {
      const sub = article.subcategory || '其他'
      if (!subcategoryMap[sub]) {
        subcategoryMap[sub] = []
      }
      subcategoryMap[sub].push(article)
    })

    // 每个子分类按priority排序，取第一篇
    Object.keys(subcategoryMap).forEach(sub => {
      subcategoryMap[sub].sort((a, b) => (a.priority || 99) - (b.priority || 99))
      if (subcategoryMap[sub][0]) {
        recommended.push(subcategoryMap[sub][0])
      }
    })

    // 最多取6篇，确保覆盖面
    return recommended.slice(0, 6)
  },

  // 新手入门路径点击
  onStepTap(e) {
    const category = e.currentTarget.dataset.category
    if (category === '实践') {
      wx.switchTab({ url: '/pages/routes/routes' })
      return
    }
    wx.navigateTo({
      url: `/pages/topic/topic?category=${encodeURIComponent(category)}`
    })
  },

  // 根据showAll状态构建显示列表
  _rebuildDisplayed(categorizedArticles, showAll) {
    const displayed = {}
    for (const key in categorizedArticles) {
      const all = categorizedArticles[key]
      displayed[key] = (showAll && showAll[key]) ? all : all.slice(0, 5)
    }
    return displayed
  }
})
