function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}

// pages/running-admin/running-admin.js
Page({
  data: {
    // 状态栏高度
    statusBarHeight: 0,
    
    // 数据概览
    dashboard: {
      totalArticles: 0,
      totalUsers: 0,
      totalReads: 0,
      totalFavorites: 0
    },
    
    // 趋势维度
    trendDimension: 'day',
    
    // 趋势面板展开状态
    userTrendExpanded: true,
    readTrendExpanded: true,
    favoriteTrendExpanded: true,
    reviewTrendExpanded: true,
    shareTrendExpanded: true,
    
    // 趋势数据
    userTrendList: [],
    readTrendList: [],
    favoriteTrendList: [],
    reviewTrendList: [],
    shareTrendList: [],
    
    // 频道分类
    channels: ['跑步观念', '从零开始跑', '训练方法', '无伤跑步', '装备指南', '跑步文化', '专题合集'],
    activeChannel: 0,
    
    // Top文章
    topArticles: [],
    
    // 文章列表
    articles: [],
    articlesLoading: false,
    articlesPage: 1,
    articlesHasMore: true,
    
    // Toast
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    
    // 加载所有数据
    this.loadDashboard()
    this.loadTrendData()
    this.loadTopArticles()
    this.loadArticles()
  },

  onShow() {
    // 从编辑页返回时刷新数据
    this.loadArticles()
    this.loadDashboard()
  },

  // 返回
  onBack() {
    wx.navigateBack()
  },

  // ========== 数据加载 ==========

  async loadDashboard() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-admin',
        data: { action: 'getDashboard' }
      })
      
      if (res.result && res.result.code === 0) {
        this.setData({ dashboard: res.result.data || {} })
      }
    } catch (err) {
      console.error('加载概览数据失败：', err)
    }
  },

  async loadTrendData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-admin',
        data: { 
          action: 'getTrendData',
          dimension: this.data.trendDimension
        }
      })
      
      if (res.result && res.result.code === 0) {
        const data = res.result.data || {}
        
        // 计算柱状图百分比
        const calcBarPct = (list) => {
          if (!list || list.length === 0) return []
          const maxVal = Math.max(...list.map(item => item.value))
          return list.map(item => ({
            ...item,
            barPct: maxVal > 0 ? (item.value / maxVal * 100) : 0
          }))
        }
        
        this.setData({
          userTrendList: calcBarPct(data.userTrend),
          readTrendList: calcBarPct(data.readTrend),
          favoriteTrendList: calcBarPct(data.favoriteTrend),
          reviewTrendList: calcBarPct(data.reviewTrend),
          shareTrendList: calcBarPct(data.shareTrend)
        })
      }
    } catch (err) {
      console.error('加载趋势数据失败：', err)
    }
  },

  async loadTopArticles() {
    try {
      const channel = this.data.activeChannel + 1
      const res = await wx.cloud.callFunction({
        name: 'running-admin',
        data: { 
          action: 'getTopArticles',
          channel: channel
        }
      })
      
      if (res.result && res.result.code === 0) {
        this.setData({ topArticles: res.result.data || [] })
      }
    } catch (err) {
      console.error('加载Top文章失败：', err)
    }
  },

  async loadArticles(loadMore = false) {
    if (this.data.articlesLoading) return
    
    try {
      this.setData({ articlesLoading: true })
      
      const page = loadMore ? this.data.articlesPage + 1 : 1
      
      const res = await wx.cloud.callFunction({
        name: 'running-admin',
        data: { 
          action: 'getArticleList',
          page: page,
          pageSize: 20
        }
      })
      
      if (res.result && res.result.code === 0) {
        const data = res.result.data || {}
        const articles = data.list || []
        
        this.setData({
          articles: loadMore ? [...this.data.articles, ...articles] : articles,
          articlesPage: page,
          articlesHasMore: articles.length >= 20,
          articlesLoading: false
        })
      }
    } catch (err) {
      console.error('加载文章列表失败：', err)
      this.setData({ articlesLoading: false })
    }
  },

  // ========== 事件处理 ==========

  onTrendDimensionChange(e) {
    const dimension = e.currentTarget.dataset.value
    if (dimension !== this.data.trendDimension) {
      this.setData({ trendDimension: dimension })
      this.loadTrendData()
    }
  },

  toggleTrendPanel(e) {
    const field = e.currentTarget.dataset.field
    const expandedKey = field + 'Expanded'
    this.setData({
      [expandedKey]: !this.data[expandedKey]
    })
  },

  onChannelChange(e) {
    const index = e.currentTarget.dataset.index
    if (index !== this.data.activeChannel) {
      this.setData({ activeChannel: index })
      this.loadTopArticles()
    }
  },

  onAddArticle() {
    wx.navigateTo({
      url: '/pages/running-admin/article-edit'
    })
  },

  onEditArticle(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/running-admin/article-edit?id=${id}`
    })
  },

  async onDeleteArticle(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这篇文章吗？删除后不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'running-admin',
              data: { 
                action: 'deleteArticle',
                id: id
              }
            })
            
            if (result.result && result.result.code === 0) {
              this.showToast('删除成功', 'success')
              this.loadArticles()
              this.loadDashboard()
            } else {
              this.showToast(result.result?.message || '删除失败', 'error')
            }
          } catch (err) {
            console.error('删除文章失败：', err)
            this.showToast('删除失败', 'error')
          }
        }
      }
    })
  },

  async onToggleArticle(e) {
    const id = e.currentTarget.dataset.id
    const isActive = e.currentTarget.dataset.active === 'true'
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'running-admin',
        data: { 
          action: 'toggleArticle',
          id: id,
          isActive: !isActive
        }
      })
      
      if (result.result && result.result.code === 0) {
        this.showToast(isActive ? '已下架' : '已上架', 'success')
        this.loadArticles()
      } else {
        this.showToast(result.result?.message || '操作失败', 'error')
      }
    } catch (err) {
      console.error('切换文章状态失败：', err)
      this.showToast('操作失败', 'error')
    }
  },

  onScrollToLower() {
    if (this.data.articlesHasMore && !this.data.articlesLoading) {
      this.loadArticles(true)
    }
  },

  // Toast 方法
  showToast(message, type = 'info') {
    showNiceToast(this, message, type)
  }
})