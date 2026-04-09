function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/routes/routes.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')
const { handleError } = require('../../utils/error-handler')
const { formatDifficulty, formatCost, formatDistance, formatDuration, debounce } = require('../../utils/util')

// ========== 中英文对照 Map（与云函数 / 新版数据集保持一致） ==========
const DIFFICULTY_ZH = {
  1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难'
}
const TERRAIN_ZH = {
  mountain_path: '山间小路', forest: '穿越森林', stream: '溪流路段',
  ridge: '山脊行走', rock_scramble: '岩石攀爬', grassland: '高山草甸', paved: '景区步道'
}
const ROUTEDNA_ZH = {
  wet_environment: '亲水栈道', forest_shade: '林荫清凉', significant_climb: '持续爬升',
  technical: '技术路段', high_altitude: '高海拔', water_crossing: '涉水过河',
  exposed_ridge: '悬岩峭壁', long_distance: '长距离', remote: '人迹罕至',
  paved_comfort: '舒适步道', scenic_viewpoint: '观景台'
}
const SEASON_ZH = {
  spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季'
}
const DIFFICULTY_COLOR = {
  1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF9800', 5: '#F44336'
}

// ========== 当前季节判断（用于筛选标签动态高亮） ==========
function getCurrentSeason() {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}
function getSeasonEmoji(season) {
  return { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' }[season] || ''
}
const currentSeason = getCurrentSeason()
const seasonLabel = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }[currentSeason]

// ========== 筛选标签配置（新设计，适配新版 routes 数据集） ==========
const FILTER_TAGS = [
  { id: 'all', label: '全部', icon: '🏔️' },
  { id: 'beginner', label: '新手友好', icon: '🌱', desc: '难度1-2星，8km以内' },
  { id: 'family', label: '亲子休闲', icon: '👨‍👩‍👧', desc: '难度1-2星，适合带娃' },
  { id: 'scenic', label: '观景路线', icon: '🌅', desc: '含观景台/草甸' },
  { id: 'stream', label: '亲水溯溪', icon: '💧', desc: '溪流瀑布路线' },
  { id: 'forest', label: '森林漫步', icon: '🌲', desc: '穿越森林路线' },
  { id: 'climb', label: '挑战爬升', icon: '⛰️', desc: '爬升800m以上' },
  { id: currentSeason, label: seasonLabel + '推荐', icon: getSeasonEmoji(currentSeason), isSeason: true },
  { id: 'advanced', label: '进阶挑战', icon: '🔥', desc: '难度4-5星' },
]

// ========== 辅助函数 ==========
function terrainToZh(terrains) {
  if (!terrains || !Array.isArray(terrains)) return []
  return terrains.map(t => TERRAIN_ZH[t] || t).filter(Boolean).slice(0, 3)
}

function dnaToZh(dnas) {
  if (!dnas || !Array.isArray(dnas)) return []
  return dnas.map(d => ROUTEDNA_ZH[d] || d).filter(Boolean).slice(0, 2)
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
    // 防抖搜索函数（创建一次）
    this._debouncedSearch = debounce((keyword) => {
      if (keyword.trim().length < 2 && keyword.trim().length > 0) {
        wx.showToast({ title: '请输入至少2个字符', icon: 'none', duration: 1500 })
        return
      }
      if (keyword !== this.data.searchKeyword) {
        this.setData({ searchKeyword: keyword })
      }
    }, 300)
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
      let keyword = ''
      if (this.data.searchKeyword) {
        filterType = 'search'
        keyword = this.data.searchKeyword
      } else if (this.data.activeFilter !== 'all') {
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
          keyword: keyword,
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
           this.data.activeCost || this.data.activeSeason
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
        // 最终降级：尝试使用缓存
        const cached = cloudSync.getRoutesCache()
        if (cached && cached.length > 0) {
          this.processRoutes(cached, page, reset, true)
          wx.showToast({ title: '当前离线，显示缓存数据', icon: 'none', duration: 2000 })
        } else {
          wx.showToast({ title: '网络异常，请检查网络连接', icon: 'none', duration: 2000 })
        }
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
  // 支持两种数据格式：
  // 1. 新版 routes 数据集（数字字段）：difficulty=数字, distance=浮点数, elevationGain=数字等
  // 2. 旧版 structured 格式：difficulty={level,label}, distance_km, elevation_gain_m 等
  processRouteItem: function (item) {
    // ---------- 难度处理 ----------
    let diffLevel, diffColor, diffText, difficultyLevel
    if (typeof item.difficulty === 'number') {
      // 新版数字字段
      difficultyLevel = item.difficulty
      diffLevel = difficultyLevel
      diffText = DIFFICULTY_ZH[difficultyLevel] || '适中'
      diffColor = DIFFICULTY_COLOR[difficultyLevel] || '#FFC107'
    } else if (typeof item.difficulty === 'object' && item.difficulty.level) {
      // 旧版 structured：difficulty={level, label}
      difficultyLevel = item.difficulty.level
      diffLevel = difficultyLevel
      diffText = DIFFICULTY_ZH[difficultyLevel] || (item.difficulty.label || '适中')
      diffColor = DIFFICULTY_COLOR[difficultyLevel] || '#FFC107'
    } else {
      // fallback
      const diffStr = typeof item.difficulty === 'string' ? item.difficulty : '适中'
      const diffInfo = DIFFICULTY_MAP ? DIFFICULTY_MAP[diffStr] : null
      diffLevel = diffInfo ? diffInfo.level : 3
      diffText = diffInfo ? diffInfo.text : diffStr
      diffColor = diffInfo ? diffInfo.color : '#FFC107'
      difficultyLevel = diffLevel
    }

    // ---------- 距离处理 ----------
    let distance, distanceText
    if (typeof item.distance === 'number') {
      // 新版数字字段
      distance = item.distance
      distanceText = `约${item.distance}km`
    } else if (item.distance !== undefined) {
      // 旧版字段
      const km = item.distance
      distance = typeof km === 'number' ? km : parseFloat(km) || 0
      distanceText = `约${distance}km`
    } else if (typeof item.distance === 'string' && item.distance.includes('/')) {
      // 旧版 flat 格式 "8km/4h"
      const parts = item.distance.split('/')
      distance = parseFloat(parts[0]) || 0
      distanceText = parts[0].trim()
    } else {
      distance = 0
      distanceText = item.distance || ''
    }

    // ---------- 时长处理 ----------
    let durationMin, durationMax, durationText
    if (item.durationMin !== undefined || item.durationMax !== undefined) {
      // 新版
      durationMin = item.durationMin
      durationMax = item.durationMax
      if (durationMin !== undefined && durationMax !== undefined && durationMax > 0) {
        if (String(durationMin) !== String(durationMax)) {
          durationText = `${durationMin}-${durationMax}小时`
        } else {
          durationText = `${durationMax}小时`
        }
      } else if (durationMin !== undefined && durationMin > 0) {
        durationText = `${durationMin}小时`
      } else if (durationMax !== undefined && durationMax > 0) {
        durationText = `${durationMax}小时`
      }
    } else if (item.duration_hours !== undefined) {
      // 旧版
      durationMin = item.duration_hours
      durationMax = item.duration_hours
      durationText = `约${item.duration_hours}小时`
    }

    // ---------- 爬升处理 ----------
    let elevationGain
    if (item.elevationGain !== undefined) {
      elevationGain = item.elevationGain
    } else {
      elevationGain = item.elevationGain || 0
    }

    // ---------- 封面图 ----------
    let coverImage = item.image || item.coverImage || ''
    if (!coverImage) {
      coverImage = '/images/scenery/scenery-general.jpg'
    }

    // ---------- 区县 ----------
    const district = (item.location && typeof item.location === 'object' && item.location.district)
      ? item.location.district
      : (item.district || '')

    // ---------- cost ----------
    let costStr
    if (item.cost && typeof item.cost === 'object') {
      costStr = item.cost.type === '免费' ? '免费' : `${item.cost.note || ''} ${item.cost.amount ? item.cost.amount + '元' : ''}`.trim()
    } else {
      costStr = item.cost || '免费'
    }

    // ---------- 地形（新版英文数组 -> 中文标签） ----------
    let terrainLabels
    if (Array.isArray(item.terrainLabels)) {
      terrainLabels = item.terrainLabels
    } else if (Array.isArray(item.terrainTypes)) {
      terrainLabels = terrainToZh(item.terrainTypes)
    } else if (Array.isArray(item.scenery)) {
      terrainLabels = item.scenery.slice(0, 3)
    } else if (typeof item.scenery === 'string') {
      terrainLabels = item.scenery.split(/[|,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    } else {
      terrainLabels = []
    }

    // ---------- 路线DNA（新版英文数组 -> 中文标签） ----------
    let dnaLabels
    if (Array.isArray(item.dnaLabels)) {
      dnaLabels = item.dnaLabels
    } else if (Array.isArray(item.routeDNA)) {
      dnaLabels = dnaToZh(item.routeDNA)
    } else {
      dnaLabels = []
    }

    // ---------- 季节 ----------
    let bestSeasons
    if (Array.isArray(item.bestSeasons)) {
      bestSeasons = item.bestSeasons
    } else if (Array.isArray(item.bestSeason) || Array.isArray(item.best_season)) {
      bestSeasons = item.bestSeason || item.best_season
    } else {
      bestSeasons = []
    }

    // ---------- family_friendly ----------
    let isFamily = false, familyLabel = ''
    if (diffLevel <= 1 && distance > 0 && distance <= 5) {
      isFamily = true; familyLabel = '亲子5岁+'
    } else if (diffLevel <= 2 && distance > 0 && distance <= 10) {
      isFamily = true; familyLabel = '亲子8岁+'
    }

    // ---------- 收藏状态 ----------
    const favorites = cloudSync.getLocalFavorites()
    const isFavorited = favorites.includes(item._id)

    return {
      ...item,
      _id: item._id,
      name: item.name,
      shortDesc: item.shortDesc || '',
      coverImage: coverImage,
      difficulty: difficultyLevel,
      difficultyLevel: diffLevel,
      diffLevel: diffLevel,
      diffText: diffText,
      diffColor: diffColor,
      distance: distance,
      distanceText: distanceText,
      durationMin: durationMin,
      durationMax: durationMax,
      durationText: durationText || '',
      elevationGain: elevationGain,
      terrainTypes: item.terrainTypes || [],
      terrainLabels: terrainLabels,
      routeDNA: item.routeDNA || [],
      dnaLabels: dnaLabels,
      bestSeasons: bestSeasons,
      district: district,
      location: district,
      cost: costStr,
      isFree: costStr.includes('免费'),
      isFavorited: isFavorited,
      family_friendly: isFamily,
      familyLabel: familyLabel,
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

    // 标签筛选（适配新版 routes 数据集字段）
    if (filter !== 'all') {
      result = data.filter(item => {
        switch (filter) {
          case 'beginner':
            // 新版 difficulty 是数字 1~5，难度 1-2 星
            return (item.difficulty || 3) <= 2 && (item.distance || 0) <= 8
          case 'family':
            return (item.difficulty || 3) <= 2 && (item.distance || 0) <= 10
          case 'scenic':
            // routeDNA 含 scenic_viewpoint / exposed_ridge / paved_comfort
            return (item.routeDNA || []).some(d =>
              d === 'scenic_viewpoint' || d === 'exposed_ridge' || d === 'paved_comfort'
            ) || (item.terrainTypes || []).includes('grassland')
          case 'stream':
            // terrainTypes 含 stream
            return (item.terrainTypes || []).includes('stream')
          case 'forest':
            // terrainTypes 含 forest
            return (item.terrainTypes || []).includes('forest')
          case 'climb':
            // elevationGain >= 800m
            return (item.elevationGain || 0) >= 800
          case 'spring':
            return (item.bestSeasons || []).includes('spring')
          case 'summer':
            return (item.bestSeasons || []).includes('summer')
          case 'autumn':
            return (item.bestSeasons || []).includes('autumn')
          case 'winter':
            return (item.bestSeasons || []).includes('winter')
          case 'advanced':
            // 难度 4-5 星
            return (item.difficulty || 3) >= 4
          case 'season':
            // 动态当季推荐
            const curSeason = this.getCurrentSeason()
            const bs = item.bestSeasons || item.bestSeason || []
            return bs.includes(curSeason)
          default:
            return true
        }
      })
    }

    // 高级筛选：难度（基于实际数据：level 1=第一次也能走, level 2=稍微有点挑战）
    if (this.data.activeDifficulty) {
      result = result.filter(item => {
        const level = item.difficulty || 0
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
        const dist = item.distance || parseFloat((item.distanceText || '').replace(/[^0-9.]/g, '')) || 0
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
        const ele = item.elevationGain || parseFloat((item.elevation || '').replace(/[^0-9.]/g, '')) || 0
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

    // 搜索关键词过滤（按匹配度排序）
    if (this.data.searchKeyword) {
      result = this._searchWithRank(result, this.data.searchKeyword)
    }

    return result
  },

  // 搜索排序：按匹配度评分（名称全匹配 > 名称包含 > 标签匹配 > 描述/地址包含）
  _searchWithRank: function (data, keyword) {
    const kw = keyword.trim()
    if (!kw) return data
    // 搜索"免费"特殊处理
    if (kw === '免费') {
      wx.showToast({ title: '所有路线均为免费', icon: 'none', duration: 2000 })
      return data
    }
    const lowerKw = kw.toLowerCase()

    const scored = data.map(item => {
      let score = 0
      const name = (item.name || '').toLowerCase()
      const loc = (item.location || '').toLowerCase()
      const desc = (item.description || '').toLowerCase()
      const scenery = (item.scenery || []).join('').toLowerCase()
      const features = (item.features || []).join('').toLowerCase()
      const tags = [...(item.scenery || []), ...(item.bestSeason || []), ...(item.features || [])].join('').toLowerCase()

      // 名称完全匹配（权重最高）
      if (name === lowerKw) score = 100
      // 名称包含
      else if (name.includes(lowerKw)) score = 80
      // 标签匹配
      else if (tags.includes(lowerKw)) score = 50
      // 描述/地址包含
      else if (desc.includes(lowerKw) || loc.includes(lowerKw)) score = 30
      // 风景/特色包含
      else if (scenery.includes(lowerKw) || features.includes(lowerKw)) score = 10

      return { ...item, _searchScore: score }
    })

    // 过滤出有匹配的结果，按分数降序
    return scored.filter(item => item._searchScore > 0).sort((a, b) => b._searchScore - a._searchScore)
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
      handleError(err, '收藏同步失败，请稍后重试')
    }
  },

  // 显示搜索框
  onSearchTap: function () {
    this.setData({ showSearch: true })
  },

  // 搜索输入（debounce 300ms 实时匹配）
  onSearchInput: function (e) {
    const keyword = e.detail.value || ''
    this._debouncedSearch(keyword)
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
