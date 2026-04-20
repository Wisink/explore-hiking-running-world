function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/route-detail/route-detail.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')
const { processTrailDetail } = require('../../utils/route-data-processor')
const { DIFFICULTY_COLORS, isNewRouteData } = require('../../utils/route-constants')

Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    headerHeight: 0,
    trailId: '',
    trail: {},
    loading: true,
    // 图片轮播
    currentSwiperIndex: 0,
    // 收藏状态
    isFavorited: false,
    // Accordion 展开状态
    sectionOpen: {
      sections: false,
      scenery: false,
      traffic: false,
      timeplan: false,
      equipment: false,
      basic: false
    },
    // 路线描述展开状态
    descExpanded: false,
    // 天气
    weather: null,
    // 已走过
    isCompleted: false,
    completedRecords: [],
    completedToday: false,
    completedCount: 0,
    showTodayHint: false,
    scrollToRecords: false,
    showFavHint: false,
    showSavedHint: false,
    showCompletePanel: false,
    completeWeather: '',
    completeDistance: '',
    showDistancePicker: false,
    distancePickerValue: [0, 0, 0],
    weatherOptions: ['☀️ 晴天', '☁️ 阴天', '🌧️ 小雨', '❄️ 小雪', '🌫️ 雾天'],
    showWeatherPicker: false,
    weatherPickerValue: [0],
    completeFeeling: '',
    completeDifficulty: 'normal',
    completeDate: '',
    today: '',
    completeCompanions: '',
    // 日期选择器
    showDatePicker: false,
    datePickerValue: [0, 0, 0],
    dateYears: [2024, 2025, 2026],
    dateMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    dateDays: [],
    // 编辑模式
    isEditMode: false,
    editingCompletedAt: '',
    // 离线缓存
    isOffline: false,
    networkType: '',
    fromCache: false,
    // 装备清单完成度
    checklistDone: 0,
    checklistTotal: 0
  },

  onLoad: function (options) {
    const trailId = options.id || ''
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      headerHeight: wx.getSystemInfoSync().statusBarHeight + 44,
      trailId,
      scrollToRecords: options.scrollToRecords === '1'
    })
    this.checkNetworkStatus()
    this.loadTrailDetail()
  },

  // 分享
  onShareTap: function () {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    wx.showToast({ title: '转发给好友吧', icon: 'none', duration: 1500 })
  },

  // 返回上一页
  onBack() {
    wx.navigateBack()
  },

  onShow: function () {
    this.checkFavoriteStatus()
    this.checkCompletedStatus()
    this.loadChecklistProgress()
    // 从已走过卡片进来时自动滚动到徒步记录
    if (this.data.scrollToRecords) {
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#records-section', duration: 300 })
        this.setData({ scrollToRecords: false })
      }, 800)
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadTrailDetail().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 从本地缓存加载路线详情（离线降级方案）
  _loadFromCache: function () {
    const cacheKey = `trail_detail_${this.data.trailId}`
    try {
      const cached = wx.getStorageSync(cacheKey)
      if (cached && cached.data) {
        const trail = this.processTrailDetail(cached.data)
        this.setData({ trail, loading: false, isOffline: true, fromCache: true })
        this._resolveCloudImages()
        showNiceToast(this, '当前为离线数据', 'info', 2000)
      } else {
        this.setData({ loading: false })
        showNiceToast(this, '网络不可用且无缓存', 'error', 2000)
      }
    } catch (e) {
      this.setData({ loading: false })
      showNiceToast(this, '路线信息加载失败', 'error', 2000)
    }
  },

  // 加载路线详情
  loadTrailDetail: function () {
    this.setData({ loading: true })

    return new Promise((resolve) => {
      if (!this.data.trailId) {
        const mock = this.getMockTrail()
        this.setData({ trail: mock, loading: false })
        resolve()
        return
      }

      const cacheKey = `trail_detail_${this.data.trailId}`
      let hasShownCache = false

      // 先尝试显示缓存（优化加载体验）
      try {
        const cached = wx.getStorageSync(cacheKey)
        if (cached && cached.data) {
          const trail = this.processTrailDetail(cached.data)
          this.setData({ trail, loading: false, isOffline: true, fromCache: true })
          this._resolveCloudImages()
          hasShownCache = true
        }
      } catch (e) {}

      // 同时请求云端最新数据
      const timeoutId = setTimeout(() => {
        console.warn('详情加载超时')
        if (!hasShownCache) {
          this.setData({ loading: false })
          showNiceToast(this, '加载超时，请重试', 'error', 2000)
        }
        resolve()
      }, 8000)

      wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'detail',
          routeId: this.data.trailId
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data) {
            const cloudData = res.result.data
            const trail = this.processTrailDetail(cloudData)

            // 校验缓存是否最新
            let cacheIsStale = true
            try {
              const cached = wx.getStorageSync(cacheKey)
              if (cached && cached.data) {
                // 比较关键字段判断是否一致
                const cachedStr = JSON.stringify(cached.data)
                const cloudStr = JSON.stringify(cloudData)
                if (cachedStr === cloudStr) {
                  cacheIsStale = false
                }
              }
            } catch (e) {}

            if (cacheIsStale || !hasShownCache) {
              // 云端有更新 或 首次加载 → 显示最新数据
              this.setData({ trail, loading: false, isOffline: false, fromCache: false })
              this._resolveCloudImages()
              if (hasShownCache && cacheIsStale) {
                showNiceToast(this, '已更新为最新数据', 'success', 1500)
              }
            }
            // 缓存云端数据
            wx.setStorageSync(cacheKey, { data: cloudData, timestamp: Date.now() })
            this.loadWeather()
          } else {
            // 云端返回异常
            if (!hasShownCache) {
              this.setData({ loading: false })
              showNiceToast(this, '路线信息加载失败', 'error', 2000)
            }
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          // 网络失败
          if (!hasShownCache) {
            this._loadFromCache()
          }
          resolve()
        }
      })
    })
  },

  // 处理详情数据（提取到 utils/route-data-processor.js）
  processTrailDetail: processTrailDetail,

  // 解析云存储路径为临时URL
  _resolveCloudImages: function () {
    const trail = this.data.trail
    if (!trail._cloudPaths || trail._cloudPaths.length === 0) return

    wx.cloud.getTempFileURL({
      fileList: trail._cloudPaths,
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          const resolvedUrls = res.fileList
            .filter(f => f.tempFileURL)
            .map(f => f.tempFileURL)
          if (resolvedUrls.length > 0) {
            const newImages = trail.images.concat(resolvedUrls)
            // 过滤掉默认图片（如果有真实图片的话）
            const hasDefault = newImages.includes('/images/scenery/scenery-general.jpg')
            const finalImages = (hasDefault && newImages.length > 1)
              ? newImages.filter(img => img !== '/images/scenery/scenery-general.jpg')
              : newImages
            this.setData({
              'trail.images': finalImages,
              'trail._cloudPaths': []
            })
          }
        }
      },
      fail: (err) => {
        console.warn('云存储图片路径解析失败:', err)
      }
    })
  },

  // 轮播切换
  onSwiperChange: function (e) {
    this.setData({ currentSwiperIndex: e.detail.current })
  },

  // 预览大图
  onPreviewImage: function (e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      current: src,
      urls: this.data.trail.images
    })
  },

  // 切换 Accordion
  onToggleSection: function (e) {
    const key = e.currentTarget.dataset.key
    const sectionOpen = { ...this.data.sectionOpen }
    sectionOpen[key] = !sectionOpen[key]
    this.setData({ sectionOpen })
  },

  // 切换路线描述展开/收起
  onToggleDesc: function () {
    this.setData({ descExpanded: !this.data.descExpanded })
  },

  // 收藏/取消收藏
  onFavorite: async function () {
    const id = this.data.trailId
    const isFavorited = this.data.isFavorited

    // 即时反馈
    this.setData({ isFavorited: !isFavorited })

    // 心形弹跳动画
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
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
      // 收藏操作成功后，重新加载路线详情以刷新统计数字
      this._refreshRouteCounts()
    } catch (err) {
      console.error('收藏同步失败:', err)
    }
  },

  // 重新加载路线统计数字（收藏数、已走过数）
  _refreshRouteCounts: function () {
    if (!this.data.trailId) return
    wx.cloud.callFunction({
      name: 'routes',
      data: {
        action: 'detail',
        routeId: this.data.trailId
      },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          this.setData({
            'trail.favoriteCount': data.favoriteCount || 0,
            'trail.completedCount_global': data.completedCount || 0
          })
        }
      },
      fail: (err) => {
        console.error('刷新统计数字失败:', err)
      }
    })
  },

  // 检查收藏状态
  checkFavoriteStatus: function () {
    const isFavorited = cloudSync.isFavorited(this.data.trailId)
    this.setData({ isFavorited })
  },

  // 复制导航地址
  onCopyNavAddress: function () {
    const address = this.data.trail.navAddress || ''
    if (address) {
      wx.setClipboardData({
        data: address,
        success: () => {
          showNiceToast(this, '已复制导航地址，请前往地图软件粘贴并进行导航', 'success', 2000)
        }
      })
    }
  },

  // 检查网络状态
  checkNetworkStatus: function () {
    wx.getNetworkType({
      success: (res) => {
        this.setData({
          networkType: res.networkType,
          isOffline: res.networkType === 'none'
        })
      }
    })
    // 监听网络变化
    wx.onNetworkStatusChange((res) => {
      this.setData({
        networkType: res.networkType,
        isOffline: !res.isConnected
      })
    })
  },

  // 点击导航 → 直接打开地图
  onNavTap: function () {
    this.openNavigation()
  },

  // 打开微信内置地图导航
  openNavigation: function () {
    const trail = this.data.trail
    if (trail.latitude && trail.longitude) {
      // 优先使用 wx.openRoute 直接调起导航
      if (wx.openRoute) {
        wx.openRoute({
          destination: {
            latitude: trail.latitude,
            longitude: trail.longitude,
            name: trail.name
          },
          mode: 'driving',
          success: () => {},
          fail: () => {
            // openRoute 失败时降级为 openLocation
            wx.openLocation({
              latitude: trail.latitude,
              longitude: trail.longitude,
              name: trail.name,
              address: trail.navAddress || trail.location,
              scale: 15
            })
          }
        })
      } else {
        // 不支持 openRoute，使用 openLocation
        wx.openLocation({
          latitude: trail.latitude,
          longitude: trail.longitude,
          name: trail.name,
          address: trail.navAddress || trail.location,
          scale: 15
        })
      }
    } else {
      // 没有经纬度，用地址打开
      wx.openLocation({
        latitude: 0,
        longitude: 0,
        name: trail.name,
        address: trail.navAddress || trail.location,
        scale: 15,
        fail: () => {
          // 降级方案：复制地址
          wx.setClipboardData({
            data: trail.navAddress || trail.name,
            success: () => {
              showNiceToast(this, '地址已复制，请到地图软件粘贴', 'success', 2000)
            }
          })
        }
      })
    }
  },

  // 进入装备清单
  onGoChecklist: function () {
    wx.navigateTo({
      url: `/pages/checklist/checklist?id=${this.data.trailId}`
    })
  },

  // 缓存路线详情到本地
  onCacheTap: function () {
    if (!this.data.trailId || !this.data.trail || !this.data.trail.name) {
      showNiceToast(this, '请先加载路线详情', 'error', 2000)
      return
    }
    const cacheKey = `trail_detail_${this.data.trailId}`
    const dataToCache = this.data.trail._rawData || this.data.trail
    try {
      wx.setStorageSync(cacheKey, {
        data: dataToCache,
        timestamp: Date.now()
      })
      showNiceToast(this, '路线详情已缓存，可离线查看', 'success', 2500)
    } catch (e) {
      showNiceToast(this, '缓存失败，请重试', 'error', 2000)
    }
  },


  // 加载清单完成度（调用智能推荐获取装备数量）
  loadChecklistProgress: function () {
    if (!this.data.trailId) return
    const cacheKey = `checklist_${this.data.trailId}`
    const checkedMap = wx.getStorageSync(cacheKey) || {}
    const done = Object.values(checkedMap).filter(v => v).length

    // 调用智能推荐获取装备总数
    wx.cloud.callFunction({
      name: 'getRecommendation',
      data: { trailId: this.data.trailId },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          const total = (data.must || []).length + (data.suggested || []).length
          // 缓存智能推荐结果供分享图使用
          this._recommendEquip = data
          this.setData({ checklistDone: done, checklistTotal: total })
        } else {
          this.setData({ checklistDone: done, checklistTotal: 0 })
        }
      },
      fail: () => {
        this.setData({ checklistDone: done, checklistTotal: 0 })
      }
    })
  },

  // 拨打紧急电话
  onCallEmergency: function () {
    wx.showModal({
      title: '拨打紧急电话',
      content: this.data.trail.emergencyPhone,
      confirmText: '拨打',
      success: (res) => {
        if (res.confirm) {
          // 提取电话号码
          const phone = this.data.trail.emergencyPhone.match(/\d[\d-]+/g)
          if (phone && phone[0]) {
            wx.makePhoneCall({ phoneNumber: phone[0] })
          }
        }
      }
    })
  },

  // 加载天气
  loadWeather: function () {
    wx.cloud.callFunction({
      name: 'weather',
      data: { city: '西安' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({ weather: res.result.data })
        }
      },
      fail: () => {
        // 使用默认天气
        const month = new Date().getMonth() + 1
        let weather = { icon: '☀️', temp: '22', desc: '晴天' }
        if (month >= 6 && month <= 8) weather = { icon: '☀️', temp: '32', desc: '高温' }
        else if (month >= 12 || month <= 2) weather = { icon: '❄️', temp: '5', desc: '低温' }
        else if (month >= 3 && month <= 5) weather = { icon: '🌸', temp: '18', desc: '宜人' }
        else weather = { icon: '🍂', temp: '15', desc: '秋高气爽' }
        this.setData({ weather })
      }
    })
  },

  // 分享（点击分享按钮）
  onShareTap: function () {
    wx.showActionSheet({
      itemList: ['📤 分享给朋友', '🖼️ 生成分享图片'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            showNiceToast(this, '请点击右上角 ··· 分享给朋友', 'info', 2000)
            break
          case 1:
            this.generateShareImage()
            break
        }
      }
    })
  },

  // 文本自动换行辅助函数
  _wrapText: function (ctx, text, maxWidth, x, startY, lineHeight) {
    let y = startY
    let line = ''
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i]
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, y)
        line = text[i]
        y += lineHeight
      } else {
        line = testLine
      }
    }
    ctx.fillText(line, x, y)
    return y
  },

  // 绘制带省略号的单行文本
  _drawEllipsisText: function (ctx, text, maxWidth, x, y) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y)
      return
    }
    let t = text
    while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1)
    }
    ctx.fillText(t + '…', x, y)
  },

  // 生成分享图片
  generateShareImage: function () {
    wx.showLoading({ title: '生成图片中...' })

    const trail = this.data.trail
    if (!trail.name) {
      wx.hideLoading()
      showNiceToast(this, '路线信息加载中', 'info', 2000)
      return
    }

    // 延迟一帧确保 canvas 节点就绪
    setTimeout(() => {
    const query = wx.createSelectorQuery()
    query.select('#share-canvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        wx.hideLoading()
        this.generateShareText()
        return
      }

      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio
      const width = 600
      let height = 1500
      const padding = 30

      // 覆盖 roundRect（兼容不同版本）
      ctx.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r]
        ctx.beginPath()
        ctx.moveTo(x + r[0], y)
        ctx.lineTo(x + w - r[1], y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + r[1])
        ctx.lineTo(x + w, y + h - r[2])
        ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h)
        ctx.lineTo(x + r[3], y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - r[3])
        ctx.lineTo(x, y + r[0])
        ctx.quadraticCurveTo(x, y, x + r[0], y)
        ctx.closePath()
      }

      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      let bottomY = 0
      try {

      // ===== 背景 =====
      ctx.fillStyle = '#FAFAFA'
      ctx.fillRect(0, 0, width, height)

      // ===== 顶部绿色条 =====
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(0, 0, width, 120)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 26px sans-serif'
      const topTitle = '徒步路线分享'
      const topTitleW = ctx.measureText(topTitle).width
      ctx.fillText(topTitle, (width - topTitleW) / 2, 45)
      ctx.font = '13px sans-serif'
      const subHeader = '欢迎使用「秦人徒步路线分享」微信小程序搜索徒步路线'
      ctx.fillText(subHeader, padding, 78)
      ctx.font = '12px sans-serif'
      const motto = '安全出行 · 快乐徒步'
      ctx.fillText(motto, padding, 100)

      // ===== 路线名称（自动换行） =====
      let y = 150
      ctx.fillStyle = '#1B5E20'
      ctx.font = 'bold 26px sans-serif'
      y = this._wrapText(ctx, trail.name, width - padding * 2, padding, y, 34)
      y += 10

      // ===== 难度标签 =====
      ctx.font = 'bold 15px sans-serif'
      const diffLabel = (trail.difficulty || '中级') + ' · ' + (trail.distance || '') + ' · ' + (trail.duration || '')
      const tagWidth = ctx.measureText(diffLabel).width + 24
      const tagHeight = 26
      const tagX = padding
      const tagY = y
      ctx.fillStyle = (trail.diffColor || '#FF9800') + '20'
      ctx.beginPath()
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 6)
      ctx.fill()
      ctx.fillStyle = trail.diffColor || '#FF9800'
      ctx.fillText(diffLabel, tagX + 12, tagY + 19)
      y += tagHeight + 20

      // ===== 分隔线 =====
      y += 5
      ctx.strokeStyle = '#E0E0E0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(width - padding, y)
      ctx.stroke()
      y += 20

      // ===== 详细信息区 =====
      ctx.font = 'bold 15px sans-serif'
      ctx.fillStyle = '#333'
      ctx.fillText('📋 路线信息', padding, y)
      y += 28

      ctx.font = '14px sans-serif'
      ctx.fillStyle = '#555'

      const infoItems = []
      if (trail.location) infoItems.push({ icon: '📍', label: '位置', value: trail.location })
      if (trail.distance) infoItems.push({ icon: '📏', label: '距离', value: trail.distance })
      if (trail.duration) infoItems.push({ icon: '⏱', label: '预计耗时', value: trail.duration })
      if (trail.elevation) infoItems.push({ icon: '📈', label: '爬升', value: trail.elevation })
      if (trail.cost) infoItems.push({ icon: '💰', label: '费用', value: trail.cost })
      if (trail.scenery) infoItems.push({ icon: '🌄', label: '风景评分', value: '⭐'.repeat(trail.scenery) })
      if (trail.suitableFor && trail.suitableFor.length > 0) {
        infoItems.push({ icon: '👥', label: '适合人群', value: trail.suitableFor.join('、') })
      }
      if (trail.bestSeason && trail.bestSeason.length > 0) {
        infoItems.push({ icon: '📅', label: '最佳季节', value: trail.bestSeason.join('、') })
      }

      infoItems.forEach(item => {
        const text = `${item.icon} ${item.label}：${item.value}`
        this._drawEllipsisText(ctx, text, width - padding * 2, padding, y)
        y += 26
      })
      y += 10

      // ===== 必带装备（前3项，使用智能推荐结果） =====
      const recommendData = this._recommendEquip || {}
      const mustItems = (recommendData.must || []).slice(0, 3)
      if (mustItems.length > 0) {
        ctx.strokeStyle = '#E0E0E0'
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
        y += 20

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = '#333'
        ctx.fillText('🎒 必带装备', padding, y)
        y += 28

        ctx.font = '14px sans-serif'
        ctx.fillStyle = '#555'
        mustItems.forEach(item => {
          const icon = item.icon || '🥾'
          this._drawEllipsisText(ctx, `${icon} ${item.name}`, width - padding * 2, padding, y)
          y += 24
        })
        y += 10
      }

      // ===== 分段路况（前3段） =====
      const sections = (trail.sections || []).slice(0, 3)
      if (sections.length > 0) {
        ctx.strokeStyle = '#E0E0E0'
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
        y += 20

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = '#333'
        ctx.fillText('🗺️ 分段路况', padding, y)
        y += 28

        ctx.font = '13px sans-serif'
        sections.forEach(seg => {
          if (y > height - 80) return
          ctx.fillStyle = seg.diffColor || '#FF9800'
          const segText = `• ${seg.name}（${seg.diffLabel || ''}）${seg.desc || ''}`
          this._drawEllipsisText(ctx, segText, width - padding * 2, padding, y)
          y += 26
        })
        y += 10
      }

      // ===== 交通方案 =====
      if (true) {
        const hasTraffic = trail.navAddress || trail.publicTransport
        if (hasTraffic) {
          ctx.strokeStyle = '#E0E0E0'
          ctx.beginPath()
          ctx.moveTo(padding, y)
          ctx.lineTo(width - padding, y)
          ctx.stroke()
          y += 20

          ctx.font = 'bold 15px sans-serif'
          ctx.fillStyle = '#333'
          ctx.fillText('🚗 交通方案', padding, y)
          y += 28

          ctx.font = '13px sans-serif'
          ctx.fillStyle = '#555'
          if (trail.navAddress) {
            this._drawEllipsisText(ctx, `🚘 自驾：${trail.navAddress}`, width - padding * 2, padding, y)
            y += 26
          }
          if (trail.publicTransport) {
            this._drawEllipsisText(ctx, `🚌 公交：${trail.publicTransport}`, width - padding * 2, padding, y)
            y += 26
          }
          y += 10
        }
      }

      // ===== 时间规划 =====
      if (trail.timeplanAdvice) {
        ctx.strokeStyle = '#E0E0E0'
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
        y += 20

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = '#333'
        ctx.fillText('⏰ 时间规划', padding, y)
        y += 28

        ctx.font = '13px sans-serif'
        ctx.fillStyle = '#555'
        const tp = trail.timeplanAdvice
        if (tp.depart) {
          this._drawEllipsisText(ctx, `出发：${tp.depart}`, width - padding * 2, padding + 12, y)
          y += 26
        }
        if (tp.return) {
          this._drawEllipsisText(ctx, `返程：${tp.return}`, width - padding * 2, padding + 12, y)
          y += 26
        }
        if (tp.tip) {
          ctx.fillStyle = '#E65100'
          this._drawEllipsisText(ctx, tp.tip, width - padding * 2, padding + 12, y)
          y += 26
        }
        y += 10
      }

      // ===== 安全提示（前2项） =====
      const safetyTips = (trail.safety_tips || []).slice(0, 2)
      if (safetyTips.length > 0) {
        ctx.strokeStyle = '#E0E0E0'
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
        y += 20

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = '#E65100'
        ctx.fillText('⚠️ 安全提示', padding, y)
        y += 28

        ctx.font = '13px sans-serif'
        ctx.fillStyle = '#666'
        safetyTips.forEach(tip => {
          y = this._wrapText(ctx, `⚠ ${tip}`, width - padding * 2, padding, y, 50)
          y += 18
        })
        y += 10
      }

      // ===== 底部品牌标识 =====
      y += 20
      bottomY = y
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, bottomY, width, 70)
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(0, bottomY, width, 3)

      ctx.fillStyle = '#333'
      ctx.font = 'bold 18px sans-serif'
      const brandText = '秦人徒步 · 安全出行'
      const brandWidth = ctx.measureText(brandText).width
      ctx.fillText(brandText, (width - brandWidth) / 2, bottomY + 35)

      ctx.fillStyle = '#666'
      ctx.font = '14px sans-serif'
      const subText = '长按图片进行分享或保存'
      const subWidth = ctx.measureText(subText).width
      ctx.fillText(subText, (width - subWidth) / 2, bottomY + 58)

      } catch (drawErr) {
        wx.hideLoading()
        console.error('Canvas 绘制出错:', drawErr)
        this.generateShareText()
        return
      }

      // ===== 导出（裁剪到实际内容高度） =====
      const exportHeight = Math.min(bottomY + 70, height)
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'png',
        x: 0,
        y: 0,
        width: width,
        height: exportHeight,
        success: (res) => {
          wx.hideLoading()
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          })
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('canvasToTempFilePath 失败:', err)
          this.generateShareText()
        }
      }, this)
    })
    }, 100) // setTimeout 延迟
  },

  // 文本分享（降级方案）
  generateShareText: function () {
    const trail = this.data.trail
    const text = `🥾 ${trail.name}\n难度：${trail.difficulty} · 距离：${trail.distance}\n📍 ${trail.location}\n💰 ${trail.cost}\n\n秦人徒步 · 安全出行`
    wx.setClipboardData({
      data: text,
      success: () => {
        showNiceToast(this, '路线信息已复制，可粘贴分享', 'success', 2000)
      }
    })
  },

  // 分享
  onShareAppMessage: function () {
    const trail = this.data.trail
    return {
      title: `${trail.name} - ${trail.diffText || '徒步路线'}`,
      path: `/pages/route-detail/route-detail?id=${this.data.trailId}`,
      imageUrl: trail.images ? trail.images[0] : ''
    }
  },

  // ===== 已走过功能 =====

  // 检查是否已走过
  checkCompletedStatus: function () {
    if (!this.data.trailId) return
    const allCompleted = cloudSync.getLocalCompleted()
    const records = allCompleted.filter(item => item.routeId === this.data.trailId)
    // 按日期倒序排列
    records.sort((a, b) => b.date > a.date ? 1 : -1)

    // 检查今天是否已标记
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const completedToday = records.some(item => item.date === todayStr)

    this.setData({
      isCompleted: records.length > 0,
      completedRecords: records,
      completedCount: records.length,
      completedToday: completedToday
    })
  },

  // 关闭今日提示弹窗
  onCloseTodayHint: function () {
    this.setData({ showTodayHint: false })
  },

  // 关闭收藏提示弹窗
  onCloseFavHint: function () {
    this.setData({ showFavHint: false })
  },

  // 关闭保存成功提示弹窗
  onCloseSavedHint: function () {
    this.setData({ showSavedHint: false })
  },

  // 点击标记已走过按钮
  onCompleteTrail: function () {
    // 如果今天已经标记过，显示自定义提示
    if (this.data.completedToday) {
      this.setData({ showTodayHint: true })
      return
    }
    // 自动填入天气和日期
    const weather = this.data.weather ? (this.data.weather.desc || '☀️ 晴天') : '☀️ 晴天'
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    this.setData({
      showCompletePanel: true,
      completeWeather: weather,
      completeDate: dateStr,
      today: dateStr,
      completeFeeling: '',
      completeDifficulty: 'normal',
      completeCompanions: '',
      completeDistance: String(this.data.trail.distanceKm || ''),
      isEditMode: false,
      editingCompletedAt: ''
    })
  },

  // 编辑已走过记录
  onEditCompletedRecord: function (e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    this.setData({
      showCompletePanel: true,
      isEditMode: true,
      editingCompletedAt: item.completedAt,
      completeWeather: item.weather || '',
      completeDate: item.date || '',
      today: item.date || new Date().toISOString().split('T')[0],
      completeFeeling: item.feeling || '',
      completeDifficulty: item.difficultyFeeling || 'normal',
      completeCompanions: item.companions || '',
      completeDistance: String(item.distance || this.data.trail.distanceKm || '')
    })
  },

  // 关闭已走过面板
  onCloseCompletePanel: function () {
    this.setData({
      showCompletePanel: false,
      isEditMode: false,
      editingCompletedAt: ''
    })
  },

  // 选择难度感受
  onCompleteDifficulty: function (e) {
    this.setData({ completeDifficulty: e.currentTarget.dataset.value })
  },

  // 输入一句话感受
  onInputFeeling: function (e) {
    this.setData({ completeFeeling: e.detail.value })
  },

  // 打开日期选择器
  onOpenDatePicker: function () {
    // 解析当前日期
    const dateStr = this.data.completeDate || this.data.today
    let yearIdx = 1 // 默认2025
    let monthIdx = 0
    let dayIdx = 0
    if (dateStr) {
      const parts = dateStr.split('-')
      const y = parseInt(parts[0])
      const m = parseInt(parts[1])
      const d = parseInt(parts[2])
      yearIdx = this.data.dateYears.indexOf(y)
      if (yearIdx < 0) yearIdx = 1
      monthIdx = m - 1
      // 生成该月天数
      const days = this._generateDays(this.data.dateYears[yearIdx], m)
      dayIdx = Math.min(d - 1, days.length - 1)
      this.setData({ dateDays: days })
    } else {
      const days = this._generateDays(this.data.dateYears[1], 1)
      this.setData({ dateDays: days })
    }
    this.setData({
      showDatePicker: true,
      datePickerValue: [yearIdx, monthIdx, dayIdx]
    })
  },

  // 生成指定年月的天数数组
  _generateDays: function (year, month) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
  },

  // 日期选择器变化
  onDatePickerChange: function (e) {
    const val = e.detail.value
    const year = this.data.dateYears[val[0]]
    const month = val[1] + 1
    const oldDays = this.data.dateDays.length
    const days = this._generateDays(year, month)
    // 如果天数变了，修正日的索引
    if (days.length !== oldDays) {
      val[2] = Math.min(val[2], days.length - 1)
      this.setData({ dateDays: days, datePickerValue: val })
    } else {
      this.setData({ datePickerValue: val })
    }
  },

  // 确认日期选择
  onConfirmDate: function () {
    const [yi, mi, di] = this.data.datePickerValue
    const year = this.data.dateYears[yi]
    const month = mi + 1
    const day = di + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    this.setData({
      completeDate: dateStr,
      showDatePicker: false
    })
  },

  // 取消日期选择
  onCancelDate: function () {
    this.setData({ showDatePicker: false })
  },

  // 打开天气选择器
  onOpenWeatherPicker: function () {
    const current = this.data.completeWeather
    let idx = 0
    if (current) {
      const found = this.data.weatherOptions.indexOf(current)
      if (found >= 0) idx = found
    }
    this.setData({
      showWeatherPicker: true,
      weatherPickerValue: [idx]
    })
  },

  // 天气选择器变化
  onWeatherPickerChange: function (e) {
    this.setData({ weatherPickerValue: e.detail.value })
  },

  // 确认天气选择
  onConfirmWeather: function () {
    const idx = this.data.weatherPickerValue[0]
    this.setData({
      completeWeather: this.data.weatherOptions[idx],
      showWeatherPicker: false
    })
  },

  // 取消天气选择
  onCancelWeather: function () {
    this.setData({ showWeatherPicker: false })
  },

  // 输入徒步距离
  onInputDistance: function (e) {
    this.setData({ completeDistance: e.detail.value })
  },

  // 打开距离选择器
  onOpenDistancePicker: function () {
    const dist = parseFloat(this.data.completeDistance) || 0
    const tens = Math.floor(dist / 10) % 10
    const ones = Math.floor(dist) % 10
    const tenths = Math.round((dist % 1) * 10)
    this.setData({
      showDistancePicker: true,
      distancePickerValue: [tens, ones, tenths]
    })
  },

  // 距离选择器变化
  onDistancePickerChange: function (e) {
    this.setData({ distancePickerValue: e.detail.value })
  },

  // 确认距离选择
  onConfirmDistance: function () {
    const [tens, ones, tenths] = this.data.distancePickerValue
    const dist = tens * 10 + ones + tenths / 10
    this.setData({
      completeDistance: dist > 0 ? String(dist) : '0',
      showDistancePicker: false
    })
  },

  // 取消距离选择
  onCancelDistance: function () {
    this.setData({ showDistancePicker: false })
  },

  // 输入同行人
  onInputCompanions: function (e) {
    this.setData({ completeCompanions: e.detail.value })
  },

  // 保存已走过记录
  onSaveComplete: async function () {
    const { trailId, completeDate, completeWeather, completeFeeling, completeDifficulty, completeCompanions, completeDistance, isEditMode, editingCompletedAt } = this.data
    try {
      if (isEditMode) {
        // 编辑模式：更新已有记录
        const result = cloudSync.updateCompleted(trailId, editingCompletedAt, {
          date: completeDate,
          weather: completeWeather,
          feeling: completeFeeling,
          difficultyFeeling: completeDifficulty,
          companions: completeCompanions,
          distance: parseFloat(completeDistance) || 0
        })
        if (result === false) return
      } else {
        // 新增模式（原有逻辑）
        const result = await cloudSync.addCompleted(trailId, completeDate, {
          weather: completeWeather,
          feeling: completeFeeling,
          difficultyFeeling: completeDifficulty,
          companions: completeCompanions,
          distance: parseFloat(completeDistance) || 0,
          name: this.data.trail.name
        })
        if (result === false) return
      }
      // 先关闭面板，再显示提示弹窗（避免同一次 setData 合批导致弹窗被覆盖）
      this.setData({
        isCompleted: true,
        showCompletePanel: false,
        isEditMode: false,
        editingCompletedAt: ''
      })
      // 延迟一帧再弹提示，确保面板关闭完成
      setTimeout(() => {
        this.setData({ showSavedHint: true })
      }, 300)
      // 刷新已走过记录列表
      this.checkCompletedStatus()
      // 刷新路线统计数字（全局已走过数）
      this._refreshRouteCounts()
    } catch (err) {
      console.error('保存已走过记录失败:', err)
      showNiceToast(this, '保存失败，请重试', 'error', 2000)
    }
  },

  // 删除徒步记录
  onDeleteCompletedRecord: function () {
    const that = this
    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条徒步记录吗？删除后不可恢复。',
      confirmText: '确认删除',
      confirmColor: '#E74C3C',
      success(res) {
        if (res.confirm) {
          const { trailId, editingCompletedAt } = that.data
          const result = cloudSync.deleteCompleted(trailId, editingCompletedAt)
          if (result === false) {
            showNiceToast(that, '删除失败', 'error', 2000)
            return
          }
          that.setData({
            showCompletePanel: false,
            isEditMode: false,
            editingCompletedAt: ''
          })
          that.checkCompletedStatus()
          // 刷新路线统计数字（全局已走过数）
          that._refreshRouteCounts()
          showNiceToast(that, '🗑️ 记录已删除', 'success', 2000)
        }
      }
    })
  },

  // 相关知识链接
  onGoKnowledge: function (e) {
    const category = e.currentTarget.dataset.category
    if (!category) return
    // 专题页是普通页面，直接navigateTo，可以返回路线详情
    wx.navigateTo({
      url: '/pages/topic/topic?category=' + encodeURIComponent(category),
      fail: function (err) {
        console.error('navigateTo topic fail:', err)
        showNiceToast(this, '跳转失败', 'error', 2000)
      }
    })
  },

  // 模拟数据
  getMockTrail: function () {
    return {
      _id: this.data.trailId || 'mock',
      name: '蓝关古道',
      description: '千年古道，从蓝田县城通往商洛的古驿道。沿途松林茂密，山脊开阔，可以看到灞河平原全景。适合新手和亲子家庭，是西安周边最经典的入门级徒步路线之一。',
      images: ['/images/scenery/scenery-trail.jpg', '/images/scenery/scenery-forest.jpg', '/images/scenery/scenery-pastoral.jpg'],
      difficulty: '初级',
      diffStars: 1,
      diffColor: '#4CAF50',
      diffText: '新手也能轻松走',
      diffIcon: '🟢',
      distance: '约8公里',
      duration: '约4小时',
      durationVal: 4,
      elevation: '约400米',
      cost: '免费（停车约10元）',
      location: '西安市蓝田县蓝关镇',
      navAddress: '导航搜索：乱石川',
      publicTransport: '地铁2号线→韦曲南站→换乘920路公交→蓝田县城',
      scenery: 4,
      suitableFor: ['新手', '亲子5岁+', '摄影爱好者'],
      bestSeason: ['春季（3-5月）', '秋季（9-11月）'],
      family_friendly: true,
      sections: [
        { name: '0-2km 入口段', desc: '从乱石川村出发，沿水泥路缓行，两侧农田风光，适合热身。路面平坦，老少皆宜。', difficulty: 1, diffColor: '#4CAF50', diffLabel: '轻松', surface: '水泥路80% + 土路20%', scenery: '村口出发，农田风光', percent: 25 },
        { name: '2-5km 爬升段', desc: '转入土路，开始缓慢爬升。穿过松林，空气清新。注意脚下碎石，建议使用登山杖。', difficulty: 3, diffColor: '#FFC107', diffLabel: '适中', surface: '土路60% + 碎石路40%', scenery: '松林穿行，空气清新', percent: 25 },
        { name: '5-7km 山脊段', desc: '到达山脊，视野开阔！可远眺灞河平原，天晴时能看到西安城区。这是全程风景最佳的路段。', difficulty: 2, diffColor: '#4CAF50', diffLabel: '轻松', surface: '土路70% + 草地30%', scenery: '山脊开阔，视野极佳', percent: 25 },
        { name: '7-8km 下山段', desc: '沿另一侧山路下山，回到公路。可原路返回或联系接驳车。', difficulty: 2, diffColor: '#4CAF50', diffLabel: '轻松', surface: '砂石路50% + 土路50%', scenery: '下山回到公路', percent: 25 }
      ],
      routeSurfaceSummary: '全程：水泥路20% + 土路50% + 碎石路20% + 草地10%，无悬崖、无涉水',
      highlights: '松林清风、山脊开阔视野、古道遗迹、春季野花',
      checkpoints: '古道石碑、松林观景台、山脊最高点、古驿站遗址',
      equipment: {
        must: [
          { name: '防滑运动鞋', reason: '路面有碎石和土路，防滑很重要' },
          { name: '饮用水 1.5L', reason: '山里没有补给点，必须自带' },
          { name: '干粮/路餐', reason: '及时补充体力，避免低血糖' },
          { name: '手机充满电', reason: '导航、拍照、紧急联络都需要' }
        ],
        suggest: [
          { name: '登山杖', reason: '上下坡减轻膝盖压力约30%' },
          { name: '防晒帽', reason: '山脊段无遮挡，容易晒伤' },
          { name: '防晒霜', reason: '海拔高紫外线更强' },
          { name: '充电宝', reason: '拍照+导航耗电快' },
          { name: '创可贴', reason: '碎石路段容易擦伤' },
          { name: '湿纸巾', reason: '山上没有卫生间' }
        ],
        noNeed: [
          { name: '专业登山鞋', reason: '运动鞋够了，路况不复杂' },
          { name: '帐篷', reason: '一日往返，不需要露营' },
          { name: '睡袋', reason: '同上，不留宿' },
          { name: '炊具', reason: '带即食干粮即可' }
        ]
      },
      safety_tips: [
        '雨天路滑，建议晴天前往',
        '部分路段手机信号较弱，建议结伴同行',
        '山上无补给点，提前备好水和食物',
        '注意脚下碎石，下山时尤其小心'
      ],
      law_tips: ['遵守当地森林防火规定', '不携带火种进入林区'],
      eco_tips: ['带走自己产生的所有垃圾', '不采摘花草，不破坏植被'],
      emergencyPhone: '蓝田县救援：029-82751234',
      ticket_info: '免费开放',
      food: '蓝田县城有美食街，推荐蓝田饸饹、神仙粉',
      pitfall: '雨天不建议前往；部分路段较窄，周末人多时注意错行',
      tips: '建议早上8-9点出发，中午前到达山脊；下午2点前开始下山',
      best_time: '春秋两季最佳，夏季建议早晚出行',
      likes_count: 328,
      favorites_count: 156,
      view_count: 5620,
      timeplanAdvice: (() => {
        const month = new Date().getMonth() + 1
        if (month >= 6 && month <= 8) return { depart: '7:00 - 8:00', return: '14:00 前', tip: '夏季天长，建议早出发避开午后高温' }
        if (month >= 12 || month <= 2) return { depart: '9:00 - 10:00', return: '13:00 前', tip: '⚠️ 冬季17:00天黑，建议天黑前2小时返程' }
        return { depart: '8:00 - 9:00', return: '14:00 前', tip: '春秋舒适，建议按计划出发' }
      })(),
      updatedAt: ''
    }
  }
})
