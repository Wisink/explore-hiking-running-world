// pages/running-my-favorites/running-my-favorites.js
Page({
  data: {
    statusBarHeight: 0,
    lt: '<',
    loading: true,
    favorites: []
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getSystemInfoSync().statusBarHeight })
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getMyFavorites' }
      })
      if (res.result && res.result.code === 0) {
        const list = (res.result.data || []).map(item => ({
          ...item,
          title: item.article?.title || '文章已删除',
          channel: item.article?.channel || 0,
          readTime: item.article?.readTime || 5,
          difficulty: item.article?.difficulty || ''
        }))
        this.setData({ favorites: list })
      }
    } catch (err) {
      console.error('加载收藏失败:', err)
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
