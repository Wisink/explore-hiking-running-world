// pages/routes/routes.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')

// 筛选标签配置
const FILTER_TAGS = [
  { id: 'all', label: '全部', icon: '' },
  { id: 'beginner', label: '新手友好', icon: '⭐' },
  { id: 'family', label: '亲子推荐', icon: '👨‍👩‍👧' },
  { id: 'stream', label: '有溪流', icon: '🌊' },
  { id: 'waterfall', label: '有瀑布', icon: '💧' },
  { id: 'forest', label: '森林', icon: '🌲' },
  { id: 'free', label: '免费路线', icon: '💰' },
  { id: 'stone', label: '石阶路', icon: '🪨' },
  { id: 'autumn', label: '秋天去', icon: '🍂' },
  { id: 'hot', label: '本周热门', icon: '🔥' },
  { id: 'east', label: '秦岭东线', icon: '' },
  { id: 'center', label: '秦岭中线', icon: '' },
  { id: 'west', label: '秦岭西线', icon: '' }
]

// 难度映射
const DIFFICULTY_MAP = {
  '初级': { level: 1, color: '#4CAF50', text: '轻松' },
  '中级': { level: 3, color: '#FFC107', text: '适中' },
  '中级-高级': { level: 4, color: '#FF9800', text: '较难' },
  '高级': { level: 5, color: '#F44336', text: '困难' }
}

// 每页条数
const PAGE_SIZE = 10

Page({
  data: {
    // 筛选标签
    filterTags: FILTER_TAGS,
    activeFilter: 'all',
    // 搜索
    searchKeyword: '',
    showSearch: false,
    // 高级筛选
    showAdvancedFilter: false,
    activeDifficulty: '',
    activeCost: '',
    // 路线列表
    routes: [],
    // 分页
    page: 0,
    hasMore: true,
    loading: false,
    // 骨架屏
    showSkeleton: true
  },

  onLoad: function () {
    this.loadRoutes(true)
  },

  onShow: function () {
    // 每次显示时刷新收藏状态
    this.refreshFavoriteStatus()
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadRoutes(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRoutes(false)
    }
  },

  // 加载路线列表
  loadRoutes: function (reset) {
    if (this.data.loading) return Promise.resolve()

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn('路线加载超时，使用本地数据')
        const localData = this.getLocalRoutes()
        this.processRoutes(localData, page, reset)
        resolve()
      }, 8000)

      wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'list',
          filter: this.data.activeFilter,
          keyword: this.data.searchKeyword,
          page: page,
          pageSize: PAGE_SIZE
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
            this.processRoutes(res.result.data.list, page, reset)
          } else {
            // 降级到本地数据
            const localData = this.getLocalRoutes()
            this.processRoutes(localData, page, reset)
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          const localData = this.getLocalRoutes()
          this.processRoutes(localData, page, reset)
          resolve()
        }
      })
    })
  },

  // 处理路线数据
  processRoutes: function (data, page, reset) {
    // 为每条路线添加展示信息
    const processedData = data.map(item => this.processRouteItem(item))

    // 根据筛选条件过滤
    let filteredData = this.applyFilter(processedData)

    // 根据搜索关键词过滤
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredData = filteredData.filter(item =>
        (item.name && item.name.toLowerCase().includes(keyword)) ||
        (item.location && item.location.toLowerCase().includes(keyword)) ||
        (item.description && item.description.toLowerCase().includes(keyword))
      )
    }

    const routes = reset ? filteredData : [...this.data.routes, ...filteredData]
    const hasMore = filteredData.length >= PAGE_SIZE

    this.setData({
      routes: routes,
      page: page + 1,
      hasMore: hasMore,
      loading: false,
      showSkeleton: false
    })
  },

  // 获取当前季节emoji
  getSeasonEmoji: function () {
    const month = new Date().getMonth() + 1
    if (month >= 3 && month <= 5) return '🌸'
    if (month >= 6 && month <= 8) return '☀️'
    if (month >= 9 && month <= 11) return '🍂'
    return '❄️'
  },

  // 获取当前季节
  getCurrentSeason: function () {
    const month = new Date().getMonth() + 1
    if (month >= 3 && month <= 5) return '春'
    if (month >= 6 && month <= 8) return '夏'
    if (month >= 9 && month <= 11) return '秋'
    return '冬'
  },

  // 处理单条路线数据
  processRouteItem: function (item) {
    // 兼容 flat（本地）和 structured（云数据库）两种格式
    const difficultyStr = typeof item.difficulty === 'object' ? (item.difficulty.label || '中级') : (item.difficulty || '中级')
    const diffInfo = DIFFICULTY_MAP[difficultyStr] || { level: 3, color: '#FFC107', text: difficultyStr || '适中' }

    // 解析距离和耗时
    let distanceText, durationText
    if (typeof item.distance === 'string' && item.distance.includes('/')) {
      const parts = item.distance.split('/')
      distanceText = parts[0].trim()
      durationText = parts[1] ? parts[1].trim() : ''
    } else if (item.distance_km) {
      distanceText = `约${item.distance_km}公里`
      durationText = item.duration_hours ? `约${item.duration_hours}小时` : ''
    } else {
      distanceText = item.distance || ''
      durationText = ''
    }

    // location: flat=string, structured=object
    const locationStr = typeof item.location === 'object' ? (item.location.address || '') : (item.location || '')

    // cost: flat=string, structured=object
    const costStr = typeof item.cost === 'object'
      ? (item.cost.type === '免费' ? '免费' : `${item.cost.note || ''} ${item.cost.amount ? item.cost.amount + '元' : ''}`.trim())
      : (item.cost || '免费')

    // 获取封面图
    let coverImage = item.image || item.coverImage || ''
    if (!coverImage && item.features && item.features.length > 0) {
      coverImage = this.getFeatureImage(item.features[0])
    }

    // 检查收藏状态
    const favorites = cloudSync.getLocalFavorites()
    const isFavorited = favorites.includes(item._id)

    // 当季推荐判断
    const currentSeason = this.getCurrentSeason()
    const bestSeason = item.best_season || item.bestSeason || []
    const seasonStr = Array.isArray(bestSeason) ? bestSeason.join(',') : String(bestSeason)
    const isCurrentSeason = seasonStr.includes(currentSeason)

    return {
      ...item,
      coverImage: coverImage,
      difficulty: difficultyStr,
      location: locationStr,
      cost: costStr,
      diffLevel: diffInfo.level,
      diffColor: diffInfo.color,
      diffText: diffInfo.text,
      distanceText: distanceText,
      durationText: durationText,
      isFavorited: isFavorited,
      isFree: costStr.includes('免费'),
      isCurrentSeason: isCurrentSeason,
      seasonEmoji: this.getSeasonEmoji()
    }
  },

  // 根据特色获取图片
  getFeatureImage: function (feature) {
    const imageMap = {
      '森林': '/images/scenery/scenery-forest.jpg',
      '溪流': '/images/scenery/scenery-stream-waterfall.jpg',
      '瀑布': '/images/scenery/scenery-stream-waterfall.jpg',
      '古道': '/images/scenery/scenery-trail.jpg',
      '山脊': '/images/scenery/scenery-trail.jpg',
      '花海': '/images/scenery/scenery-flowers.jpg',
      '云海': '/images/scenery/scenery-cloud-sea.jpg',
      '湖泊': '/images/scenery/scenery-lake.jpg',
      '峡谷': '/images/scenery/scenery-canyon.jpg',
      '田园': '/images/scenery/scenery-pastoral.jpg',
      '古迹': '/images/scenery/scenery-historic.jpg'
    }
    return imageMap[feature] || '/images/scenery/scenery-general.jpg'
  },

  // 应用筛选条件
  applyFilter: function (data) {
    let result = data
    const filter = this.data.activeFilter

    // 标签筛选
    if (filter !== 'all') {
      result = data.filter(item => {
        switch (filter) {
          case 'beginner':
            return item.difficulty === '初级' || item.diffLevel <= 2
          case 'family':
            return item.family_friendly === true
          case 'stream':
            return (item.features || []).some(f => f.includes('溪流'))
          case 'waterfall':
            return (item.features || []).some(f => f.includes('瀑布'))
          case 'forest':
            return (item.features || []).some(f => f.includes('森林') || f.includes('树林'))
          case 'stone':
            return (item.features || []).some(f => f.includes('石阶')) || (item.road_type && item.road_type.includes('石阶'))
          case 'autumn':
            return (item.best_season && item.best_season.includes('秋')) || (item.season && item.season.includes('秋'))
          case 'free':
            return item.isFree
          case 'hot':
            return (item.likes_count || 0) >= 100 || (item.view_count || 0) >= 1000
          case 'east':
            return item.location && (item.location.includes('蓝田') || item.location.includes('临潼') || item.location.includes('华阴') || item.location.includes('渭南'))
          case 'center':
            return item.location && (item.location.includes('长安') || item.location.includes('鄠邑') || item.location.includes('周至'))
          case 'west':
            return item.location && (item.location.includes('眉县') || item.location.includes('宝鸡') || item.location.includes('太白'))
          default:
            return true
        }
      })
    }

    // 高级筛选：难度
    if (this.data.activeDifficulty) {
      result = result.filter(item => item.difficulty === this.data.activeDifficulty)
    }

    // 高级筛选：费用
    if (this.data.activeCost === 'free') {
      result = result.filter(item => item.isFree)
    } else if (this.data.activeCost === 'paid') {
      result = result.filter(item => !item.isFree)
    }

    return result
  },

  // 切换筛选标签
  onFilterTap: function (e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.activeFilter) return

    this.setData({ activeFilter: filter })
    this.loadRoutes(true)
  },

  // 点击路线卡片
  onRouteTap: function (e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/route-detail/route-detail?id=${id}`
      })
    }
  },

  // 收藏/取消收藏
  onFavoriteTap: async function (e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const isFavorited = this.data.routes[index].isFavorited

    // 更新列表状态（即时反馈）
    const key = `routes[${index}].isFavorited`
    this.setData({ [key]: !isFavorited })

    wx.showToast({
      title: !isFavorited ? '已收藏 ❤️' : '已取消收藏',
      icon: 'none',
      duration: 1200
    })

    // 同步到云端
    try {
      if (!isFavorited) {
        await cloudSync.addFavorite(id)
      } else {
        await cloudSync.removeFavorite(id)
      }
    } catch (err) {
      console.error('收藏同步失败:', err)
    }
  },

  // 显示搜索框
  onSearchTap: function () {
    this.setData({ showSearch: true })
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  // 执行搜索
  onSearchConfirm: function () {
    this.loadRoutes(true)
  },

  // 清除搜索
  onSearchClear: function () {
    this.setData({ searchKeyword: '', showSearch: false })
    this.loadRoutes(true)
  },

  // 取消搜索
  onSearchCancel: function () {
    this.setData({ showSearch: false, showAdvancedFilter: false })
  },

  // 切换高级筛选
  onToggleAdvancedFilter: function () {
    this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter })
  },

  // 难度筛选
  onDifficultyFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeDifficulty: value })
    this.loadRoutes(true)
  },

  // 费用筛选
  onCostFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeCost: value })
    this.loadRoutes(true)
  },

  // 刷新收藏状态
  refreshFavoriteStatus: function () {
    const favorites = cloudSync.getLocalFavorites()
    const routes = this.data.routes.map(item => ({
      ...item,
      isFavorited: favorites.includes(item._id)
    }))
    this.setData({ routes })
  },

  // 获取本地路线数据（降级方案）
  getLocalRoutes: function () {
    try {
      const allData = require('../../trails_data.json')
      // 对本地数据做筛选和分页
      let filtered = allData

      // 应用筛选
      const filter = this.data.activeFilter
      if (filter && filter !== 'all') {
        filtered = allData.filter(item => {
          switch (filter) {
            case 'beginner':
              return item.difficulty === '初级'
            case 'family':
              return item.family_friendly === true
            case 'stream':
              return (item.features || []).some(f => f.includes('溪流'))
            case 'waterfall':
              return (item.features || []).some(f => f.includes('瀑布'))
            case 'forest':
              return (item.features || []).some(f => f.includes('森林') || f.includes('树林'))
            case 'stone':
              return (item.features || []).some(f => f.includes('石阶'))
            case 'autumn':
              return (item.best_season || []).some(s => s.includes('秋'))
            case 'free':
              return !item.cost || item.cost.includes('免费')
            case 'hot':
              return (item.likes_count || 0) >= 100 || (item.view_count || 0) >= 1000
            case 'east':
              return item.location && (item.location.includes('蓝田') || item.location.includes('临潼') || item.location.includes('华阴') || item.location.includes('渭南'))
            case 'center':
              return item.location && (item.location.includes('长安') || item.location.includes('鄠邑') || item.location.includes('周至'))
            case 'west':
              return item.location && (item.location.includes('眉县') || item.location.includes('宝鸡') || item.location.includes('太白'))
            default:
              return true
          }
        })
      }

      // 应用搜索
      if (this.data.searchKeyword) {
        const kw = this.data.searchKeyword.toLowerCase()
        filtered = filtered.filter(item =>
          (item.name && item.name.toLowerCase().includes(kw)) ||
          (item.location && item.location.toLowerCase().includes(kw)) ||
          (item.description && item.description.toLowerCase().includes(kw))
        )
      }

      // 分页
      const start = this.data.page * PAGE_SIZE
      return filtered.slice(start, start + PAGE_SIZE)
    } catch (e) {
      console.error('读取本地数据失败:', e)
      return this.getMockRoutes()
    }
  },

  // 模拟数据
  getMockRoutes: function () {
    return [
      {
        _id: 'mock_1', name: '蓝关古道', location: '西安市蓝田县',
        difficulty: '初级', scenery: 4, distance: '约8公里 / 4小时',
        cost: '免费', description: '千年古道，山脊漫步，松林清风',
        features: ['古道', '松林', '山脊'], family_friendly: true,
        likes_count: 328, view_count: 5620
      },
      {
        _id: 'mock_2', name: '翠华山', location: '西安市长安区',
        difficulty: '初级', scenery: 4.5, distance: '约10公里 / 5小时',
        cost: '门票65元', description: '天池、冰洞、奇石，西安后花园',
        features: ['湖泊', '奇石', '森林'], family_friendly: true,
        likes_count: 512, view_count: 8930
      },
      {
        _id: 'mock_3', name: '太平峪', location: '西安市鄠邑区',
        difficulty: '初级', scenery: 3.5, distance: '约6公里 / 3小时',
        cost: '免费', description: '溪水潺潺，夏日避暑胜地',
        features: ['溪流', '森林'], family_friendly: true,
        likes_count: 489, view_count: 7250
      },
      {
        _id: 'mock_4', name: '牛背梁', location: '商洛市柞水县',
        difficulty: '中级', scenery: 4.5, distance: '约12公里 / 6小时',
        cost: '门票90元', description: '高山草甸，原始森林，羚牛栖息地',
        features: ['森林', '草甸', '云海'], family_friendly: false,
        likes_count: 645, view_count: 9100
      },
      {
        _id: 'mock_5', name: '华山', location: '渭南市华阴市',
        difficulty: '高级', scenery: 5, distance: '约15公里 / 1-2天',
        cost: '门票160元', description: '奇险天下第一山，长空栈道',
        features: ['奇石', '云海', '日出'], family_friendly: false,
        likes_count: 856, view_count: 12580
      }
    ]
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '秦人徒步 - 发现西安周边好路线',
      path: '/pages/routes/routes'
    }
  }
})
