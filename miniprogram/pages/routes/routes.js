function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/routes/routes.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')

// 筛选标签配置
// 获取当前季节标签
function getSeasonTag() {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return { label: '春天去', icon: '🌸' }
  if (month >= 6 && month <= 8) return { label: '夏天去', icon: '☀️' }
  if (month >= 9 && month <= 11) return { label: '秋天去', icon: '🍂' }
  return { label: '冬天去', icon: '❄️' }
}

const FILTER_TAGS = [
  { id: 'all', label: '全部', icon: '' },
  { id: 'beginner', label: '新手友好', icon: '⭐' },
  { id: 'family', label: '亲子推荐', icon: '👨‍👩‍👧' },
  { id: 'season', label: getSeasonTag().label, icon: getSeasonTag().icon },
  { id: 'stream', label: '有溪流', icon: '🌊' },
  { id: 'waterfall', label: '有瀑布', icon: '💧' },
  { id: 'forest', label: '森林', icon: '🌲' },
  { id: 'free', label: '免费路线', icon: '💰' }
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
    showFavHint: false,
    showAdvancedFilter: false,
    activeDifficulty: '',
    activeDistance: '',
    activeElevation: '',
    activeSurface: '',
    activeScenery: '',
    activeCost: '',
    activeSeason: '',
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
        console.warn('路线加载超时')
        if (reset) {
          this.setData({ routes: [], loading: false })
        }
        showNiceToast(this, '加载超时，请重试', 'error', 2000)
        resolve()
      }, 8000)

      // 如果已有全量缓存，直接筛选
      if (!reset && this._allProcessedData) {
        clearTimeout(timeoutId)
        this.processRoutes(this._allProcessedData, page, false, true)
        resolve()
        return
      }

      wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'list',
          filter: 'all',
          keyword: '',
          page: 0,
          pageSize: 2000 // 拉取全量数据供客户端筛选
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
            this.processRoutes(res.result.data.list, page, reset)
          } else {
            // 数据加载异常
            if (reset) {
              this.setData({ routes: [], loading: false })
            }
            showNiceToast(this, '数据加载失败，请重试', 'error', 2000)
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          if (reset) {
            this.setData({ routes: [], loading: false })
          }
          showNiceToast(this, '网络错误，请重试', 'error', 2000)
          resolve()
        }
      })
    })
  },

  // 处理路线数据
  processRoutes: function (data, page, reset, fromCache) {
    // 为每条路线添加展示信息（首次处理后缓存）
    if (!fromCache) {
      const processedData = data.map(item => this.processRouteItem(item))
      this._allProcessedData = processedData
    }

    const allData = this._allProcessedData || []

    // 根据筛选条件过滤（包含关键词、标签、高级筛选，统一处理）
    let filteredData = this.applyFilter(allData)

    // 分页：只显示当前页的数据
    const showCount = (page + 1) * PAGE_SIZE
    const visibleData = filteredData.slice(0, showCount)
    const hasMore = visibleData.length < filteredData.length

    this.setData({
      routes: visibleData,
      page: page + 1,
      hasMore: hasMore,
      loading: false,
      showSkeleton: false
    })
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

    // scenery: 支持数组和字符串（"瀑布|溪流"）两种格式
    let sceneryArr = []
    if (Array.isArray(item.scenery)) {
      sceneryArr = item.scenery
    } else if (typeof item.scenery === 'string' && item.scenery) {
      // 字符串格式，按 | 或 , 分割
      sceneryArr = item.scenery.split(/[|,，、]/).map(s => s.trim()).filter(Boolean)
    }

    // sections: 云端是数组，供路面筛选用
    const sectionsArr = Array.isArray(item.sections) ? item.sections : []

    // suitableFor: 从 difficulty.suitableFor 提取，供family筛选用
    const suitableForArr = (typeof item.difficulty === 'object' && item.difficulty.suitableFor)
      ? item.difficulty.suitableFor
      : []

    // family_friendly: 检查suitableFor是否包含亲子
    const isFamily = suitableForArr.some(s => s.includes('亲子'))

    // location_direction: 从 location.direction 提取
    const locationDirection = typeof item.location === 'object' ? (item.location.direction || '') : ''

    // 获取封面图
    let coverImage = item.image || item.coverImage || ''
    if (!coverImage && sceneryArr.length > 0) {
      coverImage = this.getFeatureImage(sceneryArr[0])
    }

    // bestSeason: 支持数组和字符串格式
    const bestSeason = item.bestSeason || item.best_season || []

    // 检查收藏状态
    const favorites = cloudSync.getLocalFavorites()
    const isFavorited = favorites.includes(item._id)

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

      scenery: sceneryArr,
      sections: sectionsArr,
      suitableFor: suitableForArr,
      bestSeason: bestSeason,
      family_friendly: isFamily,
      location_direction: locationDirection
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
          case 'beginner': {
            const dist = item.distance_km || parseFloat((item.distanceText || '').replace(/[^0-9.]/g, '')) || 0
            return (item.diffLevel <= 2 || (item.suitableFor || []).some(s => s.includes('新人') || s.includes('新手')))
              && (dist === 0 || dist <= 8)
          }
          case 'family': {
            const dist = item.distance_km || parseFloat((item.distanceText || '').replace(/[^0-9.]/g, '')) || 0
            return item.family_friendly === true && item.diffLevel <= 2
              && (dist === 0 || dist <= 6)
          }
          case 'stream':
            return (item.scenery || []).some(f => f.includes('溪流') || f.includes('溪水'))
          case 'waterfall':
            return (item.scenery || []).some(f => f.includes('瀑布'))
          case 'forest':
            return (item.scenery || []).some(f => f.includes('森林') || f.includes('山林'))
          case 'season':
            const curSeason = this.getCurrentSeason() // '春'/'夏'/'秋'/'冬'
            const bestSeason = item.bestSeason || item.best_season || []
            const seasonStr = Array.isArray(bestSeason) ? bestSeason.join(',') : String(bestSeason)
            return seasonStr.includes(curSeason) || (curSeason === '秋' && (item.scenery || []).some(f => f.includes('红叶') || f.includes('银杏') || f.includes('金黄')))
          case 'free':
            return item.isFree
          default:
            return true
        }
      })
    }

    // 高级筛选：难度（基于 diffLevel 数值：轻松<=2, 适中3-4, 困难>=5）
    if (this.data.activeDifficulty) {
      result = result.filter(item => {
        const level = item.diffLevel || 0
        switch (this.data.activeDifficulty) {
          case 'easy': return level > 0 && level <= 2
          case 'medium': return level >= 3 && level <= 4
          case 'hard': return level >= 5
          default: return true
        }
      })
    }

    // 高级筛选：距离
    if (this.data.activeDistance) {
      result = result.filter(item => {
        const dist = item.distance_km || parseFloat((item.distanceText || '').replace(/[^0-9.]/g, '')) || 0
        switch (this.data.activeDistance) {
          case '0-5': return dist > 0 && dist <= 5
          case '5-10': return dist > 5 && dist <= 10
          case '10-20': return dist > 10 && dist <= 20
          case '20+': return dist > 20
          default: return true
        }
      })
    }

    // 高级筛选：爬升
    if (this.data.activeElevation) {
      result = result.filter(item => {
        const ele = item.elevation_gain_m || parseFloat((item.elevation || '').replace(/[^0-9.]/g, '')) || 0
        switch (this.data.activeElevation) {
          case '0-300': return ele >= 0 && ele <= 300
          case '300-800': return ele > 300 && ele <= 800
          case '800+': return ele > 800
          default: return true
        }
      })
    }

    // 高级筛选：路面
    if (this.data.activeSurface) {
      result = result.filter(item => {
        const surface = this.data.activeSurface
        return (item.sections || []).some(s => s.road && s.road.includes(surface)) ||
               (item.scenery || []).some(f => f.includes(surface))
      })
    }

    // 高级筛选：风景
    if (this.data.activeScenery) {
      result = result.filter(item => {
        const scenery = this.data.activeScenery
        return (item.scenery || []).some(f => f.includes(scenery))
      })
    }

    // 高级筛选：费用
    if (this.data.activeCost === 'free') {
      result = result.filter(item => item.isFree)
    } else if (this.data.activeCost === 'paid') {
      result = result.filter(item => !item.isFree)
    }

    // 高级筛选：季节
    if (this.data.activeSeason) {
      result = result.filter(item => {
        if (this.data.activeSeason === '全年') return true
        const bestSeason = item.best_season || item.bestSeason || []
        const seasonStr = Array.isArray(bestSeason) ? bestSeason.join(',') : String(bestSeason)
        return seasonStr.includes(this.data.activeSeason)
      })
    }

    // 搜索关键词过滤（统一在这里处理，确保与标签/高级筛选一致）
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      result = result.filter(item =>
        (item.name && item.name.toLowerCase().includes(keyword)) ||
        (item.location && item.location.toLowerCase().includes(keyword)) ||
        (item.description && item.description.toLowerCase().includes(keyword)) ||
        (item.scenery && item.scenery.some(s => s.includes(keyword))) ||
        (item.features && item.features.some(f => f.includes(keyword))) ||
        (item.bestSeason && (Array.isArray(item.bestSeason) ? item.bestSeason : [item.bestSeason]).some(s => s.includes(keyword)))
      )
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

    if (!isFavorited) {
      this.setData({ showFavHint: true })
    } else {
      showNiceToast(this, '已取消收藏', 'info', 2000)
    }

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

  // 关闭收藏提示弹窗
  onCloseFavHint: function () {
    this.setData({ showFavHint: false })
  },

  // 重置所有筛选条件
  onResetFilters: function () {
    this.setData({
      searchKeyword: '',
      activeDifficulty: '',
      activeDistance: '',
      activeElevation: '',
      activeSurface: '',
      activeScenery: '',
      activeCost: '',
      activeSeason: ''
    })
    this.loadRoutes(true)
    showNiceToast(this, '已重置所有筛选条件', 'success', 1500)
  },

  // 查看结果（收起高级筛选并刷新）
  onViewResults: function () {
    this.setData({ showAdvancedFilter: false })
    this.loadRoutes(true)
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

  // 距离筛选
  onDistanceFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeDistance: value })
    this.loadRoutes(true)
  },

  // 爬升筛选
  onElevationFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeElevation: value })
    this.loadRoutes(true)
  },

  // 路面筛选
  onSurfaceFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeSurface: value })
    this.loadRoutes(true)
  },

  // 风景筛选
  onSceneryFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeScenery: value })
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
