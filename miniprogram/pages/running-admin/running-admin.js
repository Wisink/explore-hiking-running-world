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
    
    // 数据导入状态
    importState: {
      status: '',  // idle | uploading | importing | done
      progress: '',
      progressPct: 0,
      result: ''
    },
    
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

  // ========== 数据导入 ==========

  async onImportArticles() {
    // 防止重复操作
    if (this.data.importState.status === 'uploading' || this.data.importState.status === 'importing') {
      return
    }

    try {
      // 1. 选择文件
      const chooseRes = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['json'],
          success: resolve,
          fail: reject
        })
      })

      const file = chooseRes.tempFiles[0]
      if (!file) return

      // 检查文件大小（上限 10MB）
      if (file.size > 10 * 1024 * 1024) {
        this.showToast('文件过大，请选择 10MB 以内的文件', 'error')
        return
      }

      this.setData({
        'importState.status': 'uploading',
        'importState.progress': '上传文件到云存储...',
        'importState.progressPct': 10,
        'importState.result': ''
      })

      // 2. 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `imports/articles_${Date.now()}.json`,
        filePath: file.path
      })

      const fileID = uploadRes.fileID
      console.log('文件上传成功:', fileID)

      this.setData({
        'importState.status': 'importing',
        'importState.progress': '正在导入文章到数据库...',
        'importState.progressPct': 50
      })

      // 3. 调用云函数导入
      const importRes = await wx.cloud.callFunction({
        name: 'import-data',
        data: {
          action: 'import-articles-from-cloud',
          fileID: fileID
        }
      })

      console.log('导入结果:', importRes.result)

      if (importRes.result && importRes.result.code === 0) {
        const data = importRes.result.data || {}
        this.setData({
          'importState.status': 'done',
          'importState.progress': `✅ 成功导入 ${data.imported} 篇，跳过重复 ${data.skipped || 0} 篇`,
          'importState.progressPct': 100,
          'importState.result': importRes.result.message
        })
        this.showToast(importRes.result.message, 'success')
        
        // 刷新概览数据
        this.loadDashboard()
        this.loadArticles()
      } else {
        this.setData({
          'importState.status': 'done',
          'importState.progress': '',
          'importState.progressPct': 0,
          'importState.result': '❌ ' + (importRes.result?.message || '导入失败')
        })
        this.showToast(importRes.result?.message || '导入失败', 'error')
      }

      // 清理云存储临时文件（可选）
      try {
        await wx.cloud.deleteFile({ fileList: [fileID] })
      } catch (e) {
        console.log('清理临时文件失败（不影响导入）:', e)
      }

    } catch (err) {
      console.error('导入文章失败:', err)
      
      // 用户取消选择文件不算错误
      if (err.errMsg && err.errMsg.includes('cancel')) {
        this.setData({
          'importState.status': '',
          'importState.progress': '',
          'importState.progressPct': 0
        })
        return
      }

      this.setData({
        'importState.status': 'done',
        'importState.progress': '',
        'importState.progressPct': 0,
        'importState.result': '❌ 导入失败：' + (err.errMsg || err.message || '未知错误')
      })
      this.showToast('导入失败', 'error')
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