// pages/nearby/nearby.js
const routesData = require('../../data/routes.json')

// Haversine公式计算两点间距离（km）
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// 难度映射
const DIFFICULTY_MAP = {
  '第一次也能走': { level: 1, color: '#4CAF50', text: '轻松' },
  '稍微有点挑战': { level: 2, color: '#FFC107', text: '适中' }
}

Page({
  data: {
    statusBarHeight: 0,
    userLat: null,
    userLng: null,
    userLocationName: '',
    hasLocation: false,
    routes: [],
    showSkeleton: true,
    loading: false,
    showLocationModal: false
  },

  onLoad: function (options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })

    // 如果从路由页传入了位置，直接使用
    if (options.lat && options.lng) {
      this.setData({
        userLat: parseFloat(options.lat),
        userLng: parseFloat(options.lng),
        userLocationName: options.name || '已选位置',
        hasLocation: true
      })
      this.loadNearbyRoutes()
    }
  },

  // 点击"从当前位置出发"按钮
  onUseCurrentLocation: function () {
    this.setData({ showLocationModal: true })
  },

  // 确认使用当前位置
  onConfirmLocation: function () {
    this.setData({ showLocationModal: false })
    this.requestLocation()
  },

  // 取消定位弹窗
  onCancelLocation: function () {
    this.setData({ showLocationModal: false })
  },

  // 手动选择位置
  onChooseLocation: function () {
    this.setData({ showLocationModal: false })
    this.openChooseLocation()
  },

  // 请求定位权限
  requestLocation: function () {
    const that = this
    this.setData({ loading: true, showSkeleton: true })

    wx.getLocation({
      type: 'gcj02',
      success: function (res) {
        that.setData({
          userLat: res.latitude,
          userLng: res.longitude,
          userLocationName: '当前位置',
          hasLocation: true,
          loading: false
        })
        that.loadNearbyRoutes()
      },
      fail: function () {
        // 授权失败，降级为手动选择
        wx.showModal({
          title: '定位失败',
          content: '无法获取您的位置，请手动选择一个位置',
          confirmText: '手动选择',
          cancelText: '返回',
          success: function (modal) {
            that.setData({ loading: false })
            if (modal.confirm) {
              that.openChooseLocation()
            }
          }
        })
      }
    })
  },

  // 打开位置选择器
  openChooseLocation: function () {
    const that = this
    wx.chooseLocation({
      success: function (res) {
        that.setData({
          userLat: res.latitude,
          userLng: res.longitude,
          userLocationName: res.name || '已选位置',
          hasLocation: true,
          loading: false,
          showSkeleton: true
        })
        that.loadNearbyRoutes()
      },
      fail: function () {
        that.setData({ loading: false })
      }
    })
  },

  // 加载附近路线
  loadNearbyRoutes: function () {
    const { userLat, userLng } = this.data
    if (!userLat || !userLng) return

    this.setData({ loading: true, showSkeleton: true })

    // 计算距离并排序
    const routesWithDist = routesData
      .filter(r => r.latitude && r.longitude)
      .map(r => {
        const dist = calcDistance(userLat, userLng, r.latitude, r.longitude)
        const diffStr = (r.difficulty && r.difficulty.label) || '稍微有点挑战'
        const diffInfo = DIFFICULTY_MAP[diffStr] || DIFFICULTY_MAP['稍微有点挑战']

        // 距离文本
        let distanceText = r.distance_km ? `约${r.distance_km}公里` : ''
        let durationText = r.duration_hours ? `约${r.duration_hours}小时` : ''

        // 封面图
        let coverImage = r.image || r.coverImage || ''
        if (!coverImage && r.scenery && r.scenery.length > 0) {
          coverImage = this.getFeatureImage(r.scenery[0])
        }

        // 费用
        const costStr = typeof r.cost === 'object'
          ? (r.cost.type === '免费' ? '免费' : `${r.cost.note || ''} ${r.cost.amount ? r.cost.amount + '元' : ''}`.trim())
          : (r.cost || '免费')

        // 风景标签
        const sceneryArr = Array.isArray(r.scenery) ? r.scenery : (typeof r.scenery === 'string' ? r.scenery.split(/[|,，、]/).map(s => s.trim()).filter(Boolean) : [])

        return {
          ...r,
          distanceToUser: Math.round(dist * 10) / 10,
          distanceText,
          durationText,
          diffColor: diffInfo.color,
          diffText: diffInfo.text,
          diffLevel: diffInfo.level,
          coverImage,
          cost: costStr,
          isFree: costStr.includes('免费'),
          scenery: sceneryArr,
          features: sceneryArr.slice(0, 3),
          family_friendly: r.difficulty && r.difficulty.suitableFor && r.difficulty.suitableFor.some(s => s.includes('亲子'))
        }
      })
      .sort((a, b) => {
        // 综合排序：距离权重 + 难度权重
        const scoreA = a.distanceToUser + (a.diffLevel - 1) * 3
        const scoreB = b.distanceToUser + (b.diffLevel - 1) * 3
        return scoreA - scoreB
      })

    setTimeout(() => {
      this.setData({
        routes: routesWithDist,
        showSkeleton: false,
        loading: false
      })
    }, 300)
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
      '古迹': '/images/scenery/scenery-historic.jpg',
      '盘山公路': '/images/scenery/scenery-general.jpg',
      '古寺': '/images/scenery/scenery-historic.jpg'
    }
    return imageMap[feature] || '/images/scenery/scenery-general.jpg'
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

  // 返回
  onGoBack: function () {
    wx.navigateBack()
  }
})
