// pages/routes/routes.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')

// 筛选标签配置
const FILTER_TAGS = [
  { id: 'all', label: '全部', icon: '' },
  { id: 'beginner', label: '新手友好', icon: '⭐' },
  { id: 'family', label: '亲子推荐', icon: '👨‍👩‍👧' },
  { id: 'free', label: '免费路线', icon: '💰' },
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
        name: 'trail',
        data: {
          action: 'list',
          filter: this.data.activeFilter,
          keyword: this.data.searchKeyword,
          page: page,
          pageSize: PAGE_SIZE
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data) {
            this.processRoutes(res.result.data, page, reset)
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

  // 处理单条路线数据
  processRouteItem: function (item) {
    const diffInfo = DIFFICULTY_MAP[item.difficulty] || { level: 3, color: '#FFC107', text: item.difficulty || '适中' }

    // 解析距离和耗时
    let distanceText = item.distance || ''
    let durationText = ''
    if (distanceText && distanceText.includes('/')) {
      const parts = distanceText.split('/')
      distanceText = parts[0].trim()
      durationText = parts[1] ? parts[1].trim() : ''
    }

    // 获取封面图
    let coverImage = item.image || item.coverImage || ''
    if (!coverImage && item.features && item.features.length > 0) {
      coverImage = this.getFeatureImage(item.features[0])
    }

    // 检查收藏状态
    const favorites = cloudSync.getLocalFavorites()
    const isFavorited = favorites.includes(item._id)

    return {
      ...item,
      coverImage: coverImage,
      diffLevel: diffInfo.level,
      diffColor: diffInfo.color,
      diffText: diffInfo.text,
      distanceText: distanceText,
      durationText: durationText,
      isFavorited: isFavorited,
      isFree: !item.cost || item.cost.includes('免费') || item.cost === '0' || item.cost === '0元'
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
    const filter = this.data.activeFilter
    if (filter === 'all') return data

    return data.filter(item => {
      switch (filter) {
        case 'beginner':
          return item.difficulty === '初级' || item.diffLevel <= 2
        case 'family':
          return item.family_friendly === true
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
    this.setData({ showSearch: false })
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
      const data = require('../../../trails_data.json')
      return data
    } catch (e) {
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
