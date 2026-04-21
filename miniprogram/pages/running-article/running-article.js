function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}

// pages/running-article/running-article.js
const app = getApp()

Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    headerHeight: 0,
    loading: true,
    article: null,
    relatedArticles: [],
    articleId: '',
    isFavorited: false,
    myReview: null,
    showReviewInput: false,
    reviewText: ''
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      headerHeight: wx.getSystemInfoSync().statusBarHeight + 44
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
      title: article ? article.title : '跑步知识',
      path: `/pages/running-article/running-article?id=${this.data.articleId}`
    }
  },

  loadArticle(id) {
    this.setData({ loading: true })

    if (wx.cloud) {
      // 调用云函数获取文章详情（含阅读数自增）
      wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getArticle', id: id }
      }).then(res => {
        console.log('[getArticle] 云函数返回:', JSON.stringify(res.result))
        if (res.result && res.result.code === 0) {
          this.processArticle(res.result.data)
        } else {
          console.warn('[getArticle] 获取失败:', res.result?.message)
          this.loadLocalArticle(id)
        }
      }).catch(err => {
        console.warn('[getArticle] 云函数调用失败:', err)
        this.loadLocalArticle(id)
      })
    } else {
      this.loadLocalArticle(id)
    }
  },

  loadLocalArticle(id) {
    try {
      const articles = require('../../data/running-articles.json')
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

    // 获取相关文章（同频道的其他文章，最多3篇）
    let related = []
    if (allArticles) {
      related = allArticles
        .filter(a => a.channel === article.channel && a._id !== article._id)
        .slice(0, 3)
    } else {
      // 从本地数据获取
      try {
        const articles = require('../../data/running-articles.json')
        related = articles
          .filter(a => a.channel === article.channel && a._id !== article._id)
          .slice(0, 3)
      } catch (e) {}
    }

    // 确保 viewCount 有值
    const viewCount = typeof article.viewCount === 'number' ? article.viewCount : 1

    this.setData({
      loading: false,
      article: {
        ...article,
        formattedDate,
        viewCount
      },
      relatedArticles: related
    })

    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: article.title })

    // 加载收藏状态和用户感受
    this.loadFavoriteStatus()
    this.loadMyReview()
  },

  // 加载收藏状态
  loadFavoriteStatus() {
    if (!wx.cloud) return
    
    wx.cloud.callFunction({
      name: 'running-api',
      data: { action: 'checkFavorite', articleId: this.data.articleId }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        this.setData({ isFavorited: res.result.data.isFavorited })
      }
    }).catch(err => {
      console.warn('加载收藏状态失败:', err)
    })
  },

  // 加载我的感受
  loadMyReview() {
    if (!wx.cloud) return
    
    wx.cloud.callFunction({
      name: 'running-api',
      data: { action: 'getMyReview', articleId: this.data.articleId }
    }).then(res => {
      if (res.result && res.result.code === 0 && res.result.data) {
        const review = res.result.data
        const formattedTime = review.createdAt ? review.createdAt.replace(/-/g, '.').substring(0, 16) : ''
        this.setData({
          myReview: { ...review, formattedTime },
          reviewText: review.content
        })
      }
    }).catch(err => {
      console.warn('加载感受失败:', err)
    })
  },

  // 切换收藏
  onToggleFavorite() {
    if (!wx.cloud) {
      showNiceToast(this, '请先登录', 'error')
      return
    }

    wx.cloud.callFunction({
      name: 'running-api',
      data: { action: 'toggleFavorite', articleId: this.data.articleId }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        const isFavorited = res.result.data.isFavorited
        this.setData({ isFavorited })
        showNiceToast(this, isFavorited ? '已收藏' : '已取消收藏', 'success')
      } else {
        showNiceToast(this, res.result?.message || '操作失败', 'error')
      }
    }).catch(err => {
      console.error('收藏操作失败:', err)
      showNiceToast(this, '操作失败', 'error')
    })
  },

  // 写感受按钮
  onWriteReview() {
    this.setData({ showReviewInput: true })
  },

  // 编辑感受
  onEditReview() {
    this.setData({ showReviewInput: true })
  },

  // 取消写感受
  onCancelReview() {
    this.setData({ 
      showReviewInput: false,
      reviewText: this.data.myReview ? this.data.myReview.content : ''
    })
  },

  // 感受输入
  onReviewInput(e) {
    this.setData({ reviewText: e.detail.value })
  },

  // 保存感受
  onSaveReview() {
    const reviewText = this.data.reviewText.trim()
    if (!reviewText) {
      showNiceToast(this, '请输入感受内容', 'error')
      return
    }

    if (!wx.cloud) {
      showNiceToast(this, '请先登录', 'error')
      return
    }

    wx.cloud.callFunction({
      name: 'running-api',
      data: { 
        action: 'saveReview', 
        articleId: this.data.articleId, 
        content: reviewText 
      }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        const review = res.result.data
        const formattedTime = review.createdAt ? review.createdAt.replace(/-/g, '.').substring(0, 16) : ''
        this.setData({
          myReview: { ...review, formattedTime },
          showReviewInput: false
        })
        showNiceToast(this, '保存成功', 'success')
      } else {
        showNiceToast(this, res.result?.message || '保存失败', 'error')
      }
    }).catch(err => {
      console.error('保存感受失败:', err)
      showNiceToast(this, '保存失败', 'error')
    })
  },

  // 分享按钮（触发系统分享）
  onShare() {
    // 微信小程序会自动调用 onShareAppMessage
    showNiceToast(this, '请点击右上角分享', 'info')
  },

  // 点击相关文章
  onRelatedTap(e) {
    const id = e.currentTarget.dataset.id
    wx.redirectTo({
      url: `/pages/running-article/running-article?id=${id}`
    })
  },

  // 返回上一页
  onBack() {
    wx.navigateBack()
  }
})