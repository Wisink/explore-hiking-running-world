function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/article-detail/article-detail.js
const app = getApp()

Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    loading: true,
    article: null,
    relatedArticles: [],
    articleId: ''
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    const id = options.id
    if (id) {
      this.setData({ articleId: id })
      this.loadArticle(id)
    } else {
      showNiceToast(this, '文章不存在', 'error', 2000)
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
      // 通过云函数增加阅读次数（绕过客户端安全规则）
      wx.cloud.callFunction({
        name: 'articles',
        data: { action: 'incrementView', articleId: id }
      }).then(res => {
        console.log('[incrementView] 云函数返回:', JSON.stringify(res.result))
        if (res.result && res.result.code !== 0) {
          console.warn('[incrementView] 自增失败:', res.result.message)
        }
      }).catch(err => {
        console.warn('[incrementView] 云函数调用失败:', err)
      }).finally(() => {
        // 无论自增是否成功，都加载文章详情
        wx.cloud.database().collection('articles').doc(id).get().then(res => {
          this.processArticle(res.data)
        }).catch(err => {
          console.warn('获取文章详情失败，使用本地数据:', err)
          this.loadLocalArticle(id)
        })
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
        showNiceToast(this, '文章不存在', 'error', 2000)
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

    // 确保 viewCount 有值（首次阅读的旧文章可能没有该字段）
    const viewCount = typeof article.viewCount === 'number' ? article.viewCount : 1

    this.setData({
      loading: false,
      article: {
        ...article,
        formattedDate,
        viewCount,
        categoryIcon: this.getCategoryIcon(article.category)
      },
      relatedArticles: related
    })

    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: article.title })
  },

  getCategoryIcon(category) {
    const icons = {
      '装备推荐': '🥾',
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
