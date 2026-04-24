// pages/running-my-reviews/running-my-reviews.js
Page({
  data: {
    statusBarHeight: 0,
    lt: '<',
    loading: true,
    reviews: []
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getSystemInfoSync().statusBarHeight })
  },

  onShow() {
    this.loadReviews()
  },

  async loadReviews() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getMyReviews' }
      })
      if (res.result && res.result.code === 0) {
        const list = (res.result.data || []).map(item => ({
          ...item,
          articleTitle: item.article?.title || '文章已删除',
          createdAtStr: item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : ''
        }))
        this.setData({ reviews: list })
      }
    } catch (err) {
      console.error('加载感受失败:', err)
    }
    this.setData({ loading: false })
  },

  onBack() { wx.navigateBack() },

  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: '/pages/running-article/running-article?id=' + id })
    }
  }
})
