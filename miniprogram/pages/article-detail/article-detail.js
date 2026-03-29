// pages/article-detail/article-detail.js
const app = getApp()

Page({
  data: {
    loading: true,
    article: null,
    relatedArticles: [],
    articleId: ''
  },

  onLoad(options) {
    const id = options.id
    if (id) {
      this.setData({ articleId: id })
      this.loadArticle(id)
    } else {
      wx.showToast({ title: '文章不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onShareAppMessage() {
    const article = this.data.article
    return {
      title: article ? article.title : '户外知识',
      path: `/pages/article-detail/article-detail?id=${this.data.articleId}`
    }
  },

  loadArticle(id) {
    this.setData({ loading: true })

    if (wx.cloud) {
      const db = wx.cloud.database()
      db.collection('articles').doc(id).get()
        .then(res => {
          this.processArticle(res.data)
        })
        .catch(err => {
          console.warn('云数据库加载失败，使用本地数据:', err)
          this.loadLocalArticle(id)
        })
    } else {
      this.loadLocalArticle(id)
    }
  },

  loadLocalArticle(id) {
    try {
      const articles = require('../../data/articles.json')
      const article = articles.find(a => a._id === id)
      if (article) {
        this.processArticle(article, articles)
      } else {
        wx.showToast({ title: '文章不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (e) {
      console.error('本地数据加载失败:', e)
      this.setData({ loading: false })
    }
  },

  processArticle(article, allArticles) {
    // 格式化时间
    const dateStr = article.createdAt || ''
    const formattedDate = dateStr ? dateStr.replace(/-/g, '.') : ''

    // 获取相关文章（同分类的其他文章，最多3篇）
    let related = []
    if (allArticles) {
      related = allArticles
        .filter(a => a.category === article.category && a._id !== article._id)
        .slice(0, 3)
    } else {
      // 从本地数据获取
      try {
        const articles = require('../../data/articles.json')
        related = articles
          .filter(a => a.category === article.category && a._id !== article._id)
          .slice(0, 3)
      } catch (e) {}
    }

    this.setData({
      loading: false,
      article: {
        ...article,
        formattedDate,
        categoryIcon: this.getCategoryIcon(article.category)
      },
      relatedArticles: related
    })

    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: article.title })
  },

  getCategoryIcon(category) {
    const icons = {
      '装备选购': '🥾',
      '安全自救': '🆘',
      '户外礼仪': '🤝'
    }
    return icons[category] || '📖'
  },

  // 点击相关文章
  onRelatedTap(e) {
    const id = e.currentTarget.dataset.id
    wx.redirectTo({
      url: `/pages/article-detail/article-detail?id=${id}`
    })
  },

  // 返回上一页
  onBack() {
    wx.navigateBack()
  }
})
