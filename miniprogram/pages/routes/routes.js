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
  { id: 'beginner', label: '新手入门', icon: '🌿' },
  { id: 'advanced', label: '进阶挑战', icon: '⛰️' },
  { id: 'stream-waterfall', label: '溪流瀑布', icon: '💧' },
  { id: 'redleaf', label: '红叶秋色', icon: '🍂' },
  { id: 'meadow', label: '高山草甸', icon: '🌾' },
  { id: 'culture', label: '人文古迹', icon: '🏛️' },
  { id: 'nearby', label: '西安市区', icon: '📍' },
  { id: 'season', label: getSeasonTag().label, icon: getSeasonTag().icon }
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
    activeDirection: '',
    activeCost: '',
    activeSeason: '',
    // 路线列表
    routes: [],
    // 分页
    page: 0,
    hasMore: true,
    loading: false,
    // 骨架屏
    showSkeleton: true,
    // 状态栏高度
    statusBarHeight: 0
  },

  onLoad: function () {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    this.loadRoutes(true)
  },

  onShow: function () {
    // 设置自定义tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
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

  // 加载路线列表（服务端分页）
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

      // 根据当前筛选状态构建请求参数
      let filterType = 'all'
      let filterVal = 'all'
      if (this.data.activeFilter !== 'all') {
        filterType = 'tag'
        filterVal = this.data.activeFilter
      } else if (this._hasAdvancedFilters()) {
        filterType = 'advanced'
        filterVal = this._buildAdvancedFilter()
      }

      wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'list',
          filterType: filterType,
          filter: filterVal,
          page: page,
          pageSize: PAGE_SIZE
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
            const pageData = res.result.data
            // 服务端返回的分页数据，缓存追加（reset 时全量替换）
            if (reset) {
              cloudSync.saveRoutesCache(pageData.list)
              this._serverTotal = pageData.total
            } else {
              const cached = cloudSync.getRoutesCache() || []
              cloudSync.saveRoutesCache(cached.concat(pageData.list))
            }
            this._processServerPage(pageData.list, page, reset)
          } else {
            // 数据加载异常，降级
            this._fallbackToFullLoad(reset, page, resolve)
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          // 降级：走缓存或全量加载
          this._tryFallbackCacheForPage(reset, page, resolve)
        }
      })
    })
  },

  // 检查是否有高级筛选条件
  _hasAdvancedFilters: function () {
    return this.data.activeDifficulty || this.data.activeDistance ||
           this.data.activeElevation || this.data.activeSurface ||
           this.data.activeScenery || this.data.activeDirection ||
           this.data.activeCost || this.data.activeSeason ||
           this.data.searchKeyword
  },

  // 构建高级筛选对象
  _buildAdvancedFilter: function () {
    const f = {}
    if (this.data.activeDifficulty) {
      if (this.data.activeDifficulty === 'easy') f.difficulty = [1]
      else if (this.data.activeDifficulty === 'medium') f.difficulty = [2]
      else if (this.data.activeDifficulty === 'hard') f.difficulty = [3, 4, 5]
    }
    if (this.data.activeDistance) f.distance = this.data.activeDistance
    if (this.data.activeElevation) f.elevation = this.data.activeElevation
    if (this.data.activeSurface) f.surface = this.data.activeSurface
    if (this.data.activeScenery) f.scenery = this.data.activeScenery
    if (this.data.activeDirection) f.direction = this.data.activeDirection
    if (this.data.activeCost) f.cost = this.data.activeCost
    if (this.data.activeSeason) f.season = this.data.activeSeason
    return f
  },

  // 处理服务端分页数据
  _processServerPage: function (serverList, page, reset) {
    const processedData = serverList.map(item => this.processRouteItem(item))

    // accumulate or replace
    let allData = reset ? processedData : (this._allProcessedData || []).concat(processedData)
    // 客户端二次筛选兜底
    let filteredData = this.applyFilter(allData)

    // 用服务端 total 判断是否还有更多页
    const hasMore = filteredData.length < (this._serverTotal || Infinity)

    this.setData({
      routes: filteredData,
      page: page + 1,
      hasMore: hasMore,
      loading: false,
      showSkeleton: false
    })
    this._allProcessedData = filteredData
  },

  // 降级方案：尝试使用缓存
  _tryFallbackCacheForPage: function (reset, page, resolve) {
    const cache = cloudSync.getRoutesCache()
    if (cache && cache.length > 0) {
      console.log('使用本地缓存路线数据（服务端失败降级）')
      this.processRoutes(cache, page, reset, true)
      wx.showToast({ title: '当前离线，显示缓存数据', icon: 'none', duration: 2000 })
    } else {
      this._fallbackToFullLoad(reset, page, resolve)
    }
    resolve()
  },

  // 最终降级：尝试全量加载（兼容旧行为）
  _fallbackToFullLoad: function (reset, page, resolve) {
    wx.cloud.callFunction({
      name: 'routes',
      data: {
        action: 'list',
        filter: 'all',
        keyword: '',
        page: 0,
        pageSize: 2000
      },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.list) {
          cloudSync.saveRoutesCache(res.result.data.list)
          this.processRoutes(res.result.data.list, page, reset)
        } else {
          if (reset) {
            this.setData({ routes: [], loading: false })
          }
          showNiceToast(this, '数据加载失败，请重试', 'error', 2000)
        }
      },
      fail: () => {
        if (reset) {
          this.setData({ routes: [], loading: false })
        }
        showNiceToast(this, '网络错误，请重试', 'error', 2000)
      }
    })
    resolve()
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
    // 优先使用 difficulty.level 数值（云数据库），其次查映射表（本地数据）
    let diffLevel, diffColor, diffText
    if (typeof item.difficulty === 'object' && item.difficulty.level) {
      diffLevel = item.difficulty.level
      // 根据 level 推导颜色和文案
      if (diffLevel <= 1) { diffColor = '#4CAF50'; diffText = '轻松' }
      else if (diffLevel <= 2) { diffColor = '#FFC107'; diffText = '适中' }
      else if (diffLevel <= 4) { diffColor = '#FF9800'; diffText = '较难' }
      else { diffColor = '#F44336'; diffText = '困难' }
    } else {
      const diffInfo = DIFFICULTY_MAP[difficultyStr] || { level: 3, color: '#FFC107', text: difficultyStr || '适中' }
      diffLevel = diffInfo.level
      diffColor = diffInfo.color
      diffText = diffInfo.text
    }

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

    // family_friendly: 检查suitableFor是否包含亲子，或原始数据已有family_friendly标记
    const isFamily = suitableForArr.some(s => s.includes('亲子')) || item.family_friendly === true

    // location_direction: 从 location.direction 提取
    const locationDirection = typeof item.location === 'object' ? (item.location.direction || '') : ''

    // 获取封面图
    let coverImage = item.image || item.coverImage || ''
    if (!coverImage && sceneryArr.length > 0) {
      coverImage = this.getFeatureImage(sceneryArr[0])
    }

    // bestSeason: 处理数组、字符串（逗号分隔）两种格式，统一转为数组
    let rawSeason = item.bestSeason || item.best_season || ''
    let bestSeason = []
    if (Array.isArray(rawSeason)) {
      bestSeason = rawSeason
    } else if (typeof rawSeason === 'string' && rawSeason) {
      bestSeason = rawSeason.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
    }

    // 检查收藏状态
    const favorites = cloudSync.getLocalFavorites()
    const isFavorited = favorites.includes(item._id)

    return {
      ...item,
      coverImage: coverImage,
      difficulty: difficultyStr,
      location: locationStr,
      cost: costStr,
      diffLevel: diffLevel,
      diffColor: diffColor,
      diffText: diffText,
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
        const sf = item.scenery || []
        switch (filter) {
          case 'beginner':
            // level <= 1（第一次也能走）
            return item.diffLevel <= 1
          case 'advanced':
            // level >= 2（稍微有点挑战及以上）
            return item.diffLevel >= 2
          case 'stream-waterfall':
            // 合并：scenery含 瀑布/溪流/溪水/峡谷
            return sf.some(f => f.includes('瀑布') || f.includes('溪流') || f.includes('溪水') || f.includes('峡谷'))
          case 'redleaf':
            // scenery含 红叶/金黄/秋色/彩林/银杏 或 best_season含秋
            const bs1 = item.bestSeason || item.best_season || []
            const bs1Str = Array.isArray(bs1) ? bs1.join(',') : String(bs1 || '')
            return sf.some(f => f.includes('红叶') || f.includes('金黄') || f.includes('秋色') || f.includes('彩林') || f.includes('银杏')) || bs1Str.includes('秋')
          case 'meadow':
            // scenery含 草甸/高山草甸
            return sf.some(f => f.includes('草甸'))
          case 'culture':
            // scenery含 古寺/古道/历史遗迹/古迹/遗址/古建筑/石窟/佛像/壁塑/历史
            return sf.some(f => f.includes('古寺') || f.includes('古道') || f.includes('历史遗迹') || f.includes('古迹') || f.includes('遗址') || f.includes('古建筑') || f.includes('石窟') || f.includes('佛像') || f.includes('壁塑'))
          case 'nearby':
            // direction含"中线"或"中西线"（离西安最近的核心区域）
            const dir = item.location_direction || (typeof item.location === 'object' ? (item.location.direction || '') : '')
            return dir.includes('中线') || dir.includes('中西线')
          case 'season':
            // 修复匹配逻辑：best_season 支持逗号分隔格式，同时匹配 scenery 关键词
            const curSeason = this.getCurrentSeason()
            const bs5 = item.bestSeason || item.best_season || []
            const bs5Str = Array.isArray(bs5) ? bs5.join(',') : String(bs5 || '')
            // 同时匹配逗号分隔的格式
            if (curSeason === '秋') {
              return bs5Str.includes('秋') || sf.some(f => f.includes('红叶') || f.includes('银杏') || f.includes('金黄'))
            }
            if (curSeason === '春') {
              return bs5Str.includes('春') || sf.some(f => f.includes('山花') || f.includes('桃花') || f.includes('花海') || f.includes('赏花') || f.includes('绿柳') || f.includes('梨花') || f.includes('杏花') || f.includes('草甸') || f.includes('野花'))
            }
            if (curSeason === '夏') {
              return bs5Str.includes('夏') || sf.some(f => f.includes('溪流') || f.includes('溪水') || f.includes('瀑布') || f.includes('森林') || f.includes('避暑'))
            }
            // 冬季
            return bs5Str.includes('冬') || sf.some(f => f.includes('雪') || f.includes('冰') || f.includes('温泉'))
          default:
            return true
        }
      })
    }

    // 高级筛选：难度（基于实际数据：level 1=第一次也能走, level 2=稍微有点挑战）
    if (this.data.activeDifficulty) {
      result = result.filter(item => {
        const level = item.diffLevel || 0
        switch (this.data.activeDifficulty) {
          case 'easy': return level === 1        // 第一次也能走
          case 'medium': return level === 2      // 稍微有点挑战
          case 'hard': return level >= 3         // 未来扩展
          default: return true
        }
      })
    }

    // 高级筛选：距离
    if (this.data.activeDistance) {
      result = result.filter(item => {
        const dist = item.distance_km || parseFloat((item.distanceText || '').replace(/[^0-9.]/g, '')) || 0
        switch (this.data.activeDistance) {
          case '0-3': return dist > 0 && dist <= 3
          case '3-5': return dist > 3 && dist <= 5
          case '5-8': return dist > 5 && dist <= 8
          case '8-12': return dist > 8 && dist <= 12
          case '12-20': return dist > 12 && dist <= 20
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
          case '0-100': return ele >= 0 && ele <= 100
          case '100-300': return ele > 100 && ele <= 300
          case '300-1000': return ele > 300 && ele <= 1000
          case '1000+': return ele > 1000
          default: return true
        }
      })
    }

    // 高级筛选：路面（基于实际数据：土路/步道、水泥路/土路、山间小道、山脊/林间路）
    if (this.data.activeSurface) {
      result = result.filter(item => {
        const surface = this.data.activeSurface
        return (item.sections || []).some(s => {
          const road = s.road || ''
          switch (surface) {
            case '步道/土路': return road === '土路/步道'
            case '水泥路为主': return road.includes('水泥路')
            case '山间小道': return road.includes('山间小道')
            case '山脊/林间路': return road.includes('山脊') || road.includes('林间路')
            default: return false
          }
        })
      })
    }

    // 高级筛选：风景
    if (this.data.activeScenery) {
      result = result.filter(item => {
        const scenery = this.data.activeScenery
        return (item.scenery || []).some(f => f.includes(scenery))
      })
    }

    // 高级筛选：方向
    if (this.data.activeDirection) {
      result = result.filter(item => {
        const dir = item.location_direction || (typeof item.location === 'object' ? (item.location.direction || '') : '')
        // 精确匹配方向值，避免子串误匹配（如中西线包含西线）
        return dir === this.data.activeDirection
      })
    }

    // 高级筛选：费用（已隐藏，保留逻辑兼容）
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
      activeDirection: '',
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

  // 方向筛选
  onDirectionFilter: function (e) {
    const value = e.currentTarget.dataset.value
    this.setData({ activeDirection: value })
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
  },

  // 点击「附近路线」入口
  onNearbyTap: function () {
    wx.showActionSheet({
      itemList: ['使用当前位置', '手动选择地点'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.requestLocationAndGo()
        } else if (res.tapIndex === 1) {
          this.chooseLocationAndGo()
        }
      }
    })
  },

  // 请求定位并跳转附近页面
  requestLocationAndGo: function () {
    wx.authorize({
      scope: 'scope.userLocation',
      success: () => {
        wx.getLocation({
          type: 'gcj02',
          success: (res) => {
            wx.navigateTo({
              url: `/pages/nearby/nearby?lat=${res.latitude}&lng=${res.longitude}`
            })
          },
          fail: () => {
            wx.showToast({ title: '定位失败，请手动选择', icon: 'none' })
            this.chooseLocationAndGo()
          }
        })
      },
      fail: () => {
        wx.getSetting({
          success: (settingRes) => {
            if (!settingRes.authSetting['scope.userLocation']) {
              wx.showModal({
                title: '需要位置权限',
                content: '请在设置中开启位置权限，或选择手动选择地点',
                confirmText: '去设置',
                cancelText: '手动选择',
                success: (r) => {
                  if (r.confirm) {
                    wx.openSetting()
                  } else {
                    this.chooseLocationAndGo()
                  }
                }
              })
            }
          }
        })
      }
    })
  },

  // 手动选择地点并跳转附近页面
  chooseLocationAndGo: function () {
    wx.chooseLocation({
      success: (res) => {
        wx.navigateTo({
          url: `/pages/nearby/nearby?lat=${res.latitude}&lng=${res.longitude}`
        })
      },
      fail: () => {
        wx.showToast({ title: '已取消', icon: 'none' })
      }
    })
  },

  // 点击「徒步助手」入口
  onAssistantTap: function () {
    wx.navigateTo({
      url: '/pages/assistant/assistant'
    })
  }
})
