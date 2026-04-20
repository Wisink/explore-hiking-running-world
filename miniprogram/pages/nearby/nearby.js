// pages/nearby/nearby.js

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

Page({
  data: {
    lt: '<',
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

    function getLocation() {
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
        fail: function (err) {
          console.warn('getLocation fail:', err)
          that.setData({ loading: false })
          that.showLocationFailModal()
        }
      })
    }

    // 先尝试授权
    wx.authorize({
      scope: 'scope.userLocation',
      success: function () {
        getLocation()
      },
      fail: function () {
        // 授权被拒绝，检查是否已永久拒绝
        wx.getSetting({
          success: function (res) {
            if (res.authSetting['scope.userLocation'] === false) {
              // 用户永久拒绝了授权，引导去设置页开启
              wx.showModal({
                title: '需要位置权限',
                content: '您已拒绝位置权限，请在设置中开启后重试',
                confirmText: '去设置',
                cancelText: '手动选择',
                success: function (modal) {
                  if (modal.confirm) {
                    wx.openSetting({
                      success: function (settingRes) {
                        if (settingRes.authSetting['scope.userLocation']) {
                          getLocation()
                        }
                      }
                    })
                  } else {
                    that.openChooseLocation()
                  }
                }
              })
            } else {
              // 首次拒绝，降级为手动选择
              that.showLocationFailModal()
            }
          },
          fail: function () {
            that.showLocationFailModal()
          }
        })
      }
    })
  },

  // 定位失败弹窗
  showLocationFailModal: function () {
    const that = this
    wx.showModal({
      title: '定位失败',
      content: '无法获取您的位置，请手动选择一个位置',
      confirmText: '手动选择',
      cancelText: '返回',
      success: function (modal) {
        if (modal.confirm) {
          that.openChooseLocation()
        }
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
    const that = this
    this.setData({ loading: true, showSkeleton: true })

    wx.cloud.callFunction({
      name: 'routes',
      data: { action: 'list', filterType: 'all', filter: 'all', page: 0, pageSize: 200 },
      success: (res) => {
        let list = []
        if (res.result && res.result.data && res.result.data.list) {
          list = res.result.data.list
        }

        // 计算距离
        const { userLat, userLng } = that.data
        const routesWithDist = list
          .filter(r => r.latitude && r.longitude)
          .map(r => {
            const dist = calcDistance(userLat, userLng, r.latitude, r.longitude)

            // 新版数据处理
            const difficultyLevel = typeof r.difficulty === 'number' ? r.difficulty : 3
            const DIFFICULTY_COLOR = { 1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF9800', 5: '#F44336' }
            const DIFFICULTY_ZH = { 1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难' }

            // 封面图
            let coverImage = r.image || r.coverImage || ''
            if (!coverImage) coverImage = '/images/scenery/scenery-general.jpg'

            // 距离文本
            let distanceText = r.distance ? `约${r.distance}km` : ''
            let durationText = ''
            if (r.durationMin !== undefined) {
              if (r.durationMax !== undefined && r.durationMax > r.durationMin) {
                durationText = `${r.durationMin}-${r.durationMax}小时`
              } else {
                durationText = `${r.durationMin || r.durationMax}小时`
              }
            }

            // 费用
            let isFree = true
            let cost = '免费'
            if (r.cost && typeof r.cost === 'object') {
              isFree = r.cost.type === '免费'
              cost = isFree ? '免费' : `${r.cost.note || ''} ${r.cost.amount ? r.cost.amount + '元' : ''}`.trim()
            } else {
              isFree = String(r.cost || '').includes('免费')
              cost = r.cost || '免费'
            }

            // 区县
            const district = (r.location && typeof r.location === 'object') ? r.location.district : (r.district || '')

            return {
              ...r,
              _id: r._id,
              distanceToUser: dist.toFixed(1),
              diffLevel: difficultyLevel,
              diffColor: DIFFICULTY_COLOR[difficultyLevel] || '#FFC107',
              diffText: DIFFICULTY_ZH[difficultyLevel] || '适中',
              coverImage,
              distanceText,
              durationText,
              isFree,
              cost,
              district,
              name: r.name,
              description: r.shortDesc || r.description || '',
            }
          })

        routesWithDist.sort((a, b) => parseFloat(a.distanceToUser) - parseFloat(b.distanceToUser))

        that.setData({ routes: routesWithDist, loading: false, showSkeleton: false })
      },
      fail: () => {
        that.setData({ routes: [], loading: false, showSkeleton: false })
      }
    })
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
