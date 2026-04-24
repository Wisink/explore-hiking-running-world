// pages/running-search/running-search.js
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    statusBarHeight: 0,
    headerHeight: 0,
    lt: '<',
    keyword: '',
    history: [],
    searching: false,
    searched: false,
    results: [],
    loading: false,
    hasMore: true,
    hotKeywords: ['热身', '拉伸', '配速', '呼吸', '跑姿', '心率', '马拉松', '半马']
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    // 标题栏高度需要超过胶囊按钮底部：statusBarHeight + 胶囊按钮高度 + 上下边距
    const headerHeight = menuButton.bottom + (menuButton.top - systemInfo.statusBarHeight)
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      headerHeight: headerHeight
    })
    
    // 加载搜索历史
    this.loadHistory()
  },

  // 加载搜索历史
  loadHistory() {
    try {
      const history = wx.getStorageSync('running_search_history') || []
      this.setData({ history })
    } catch (e) {
      console.error('加载搜索历史失败:', e)
    }
  },

  // 保存搜索历史
  saveHistory(keyword) {
    if (!keyword || !keyword.trim()) return
    
    keyword = keyword.trim()
    let history = this.data.history || []
    
    // 移除重复项
    history = history.filter(item => item !== keyword)
    
    // 添加到开头
    history.unshift(keyword)
    
    // 限制最多10条
    if (history.length > 10) {
      history = history.slice(0, 10)
    }
    
    this.setData({ history })
    
    // 保存到本地缓存
    try {
      wx.setStorageSync('running_search_history', history)
    } catch (e) {
      console.error('保存搜索历史失败:', e)
    }
  },

  // 清除搜索历史
  onClearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] })
          try {
            wx.removeStorageSync('running_search_history')
          } catch (e) {
            console.error('清除搜索历史失败:', e)
          }
        }
      }
    })
  },

  // 输入框输入（WXML 绑定 onKeywordInput）
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  // 清除输入框
  onClearInput() {
    this.setData({ 
      keyword: '',
      searched: false,
      results: []
    })
  },

  // 搜索
  onSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword) return
    
    this.setData({ 
      searching: true,
      searched: false,
      loading: true
    })
    
    // 保存到搜索历史
    this.saveHistory(keyword)
    
    // 调用云函数搜索
    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'running-api',
        data: { 
          action: 'search', 
          keyword: keyword
        }
      }).then(res => {
        console.log('[search] 云函数返回:', JSON.stringify(res.result))
        if (res.result && res.result.code === 0) {
          this.setData({
            searching: false,
            searched: true,
            loading: false,
            results: res.result.data || [],
            hasMore: false
          })
        } else {
          console.warn('[search] 搜索失败:', res.result?.message)
          this.setData({
            searching: false,
            searched: true,
            loading: false,
            results: [],
            hasMore: false
          })
        }
      }).catch(err => {
        console.error('[search] 云函数调用失败:', err)
        // 如果云函数失败，尝试本地搜索
        this.localSearch(keyword)
      })
    } else {
      this.localSearch(keyword)
    }
  },

  // 本地搜索（备用方案）
  localSearch(keyword) {
    try {
      const articles = require('../../data/running-articles.json')
      const keywordLower = keyword.toLowerCase()
      
      const results = articles.filter(article => {
        const title = (article.title || '').toLowerCase()
        const content = (article.content || '').toLowerCase()
        const summary = (article.summary || '').toLowerCase()
        
        return title.includes(keywordLower) || 
               content.includes(keywordLower) || 
               summary.includes(keywordLower)
      })
      
      this.setData({
        searching: false,
        searched: true,
        loading: false,
        results: results,
        hasMore: false
      })
    } catch (e) {
      console.error('本地搜索失败:', e)
      this.setData({
        searching: false,
        searched: true,
        loading: false,
        results: [],
        hasMore: false
      })
    }
  },

  // 点击热门搜索标签
  onHotTagTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.onSearch()
  },

  // 点击搜索历史
  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.onSearch()
  },

  // 点击搜索结果（WXML 绑定 onArticleTap）
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/running-article/running-article?id=${id}`
    })
  },

  // 滚动到底部（加载更多，暂不实现分页）
  onScrollToLower() {
    // 当前不分页，直接返回
  },

  // 返回（WXML 绑定 onBack）
  onBack() {
    wx.navigateBack()
  }
})
