// pages/route-detail/route-detail.js
const app = getApp()
const cloudSync = require('../../utils/cloud-sync')

// 难度映射
const DIFFICULTY_MAP = {
  '初级': { level: 1, stars: 1, color: '#4CAF50', text: '新手也能轻松走', icon: '🟢' },
  '中级': { level: 3, stars: 3, color: '#FFC107', text: '需要一定体力', icon: '🟡' },
  '中级-高级': { level: 4, stars: 4, color: '#FF9800', text: '有经验者推荐', icon: '🟠' },
  '高级': { level: 5, stars: 5, color: '#F44336', text: '挑战者专属', icon: '🔴' }
}

Page({
  data: {
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
      equipment: false
    },
    // 天气
    weather: null,
    // 已走过
    isCompleted: false,
    completedRecords: [],
    showCompletePanel: false,
    completeWeather: '',
    completeFeeling: '',
    completeDifficulty: 'normal',
    completeDate: '',
    today: '',
    completeCompanions: '',
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
    this.setData({ trailId })
    this.checkNetworkStatus()
    this.loadTrailDetail()
  },

  onShow: function () {
    this.checkFavoriteStatus()
    this.checkCompletedStatus()
    this.loadChecklistProgress()
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadTrailDetail().then(() => {
      wx.stopPullDownRefresh()
    })
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

      const timeoutId = setTimeout(() => {
        console.warn('详情加载超时，尝试本地数据')
        this.loadFromLocalData()
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
            const trail = this.processTrailDetail(res.result.data)
            this.setData({ trail, loading: false })
            // 缓存详情数据
            const cacheKey = `trail_detail_${this.data.trailId}`
            wx.setStorageSync(cacheKey, { data: res.result.data, timestamp: Date.now() })
            this.loadWeather()
          } else {
            // 降级到本地数据
            this.loadFromLocalData()
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          // 降级到本地数据
          this.loadFromLocalData()
          resolve()
        }
      })
    })
  },

  // 处理详情数据
  processTrailDetail: function (data) {
    const parseArray = (val) => {
      if (Array.isArray(val)) return val
      if (typeof val === 'string' && val.trim()) {
        return val.split(/[;；,，。]/).filter(s => s.trim()).map(s => s.trim())
      }
      return []
    }

    // 兼容两种数据格式：flat（本地trails_data.json）和 structured（云数据库）
    // difficulty: flat="高级", structured={level:1, label:"第一次也能走", suitableFor:[...]}
    let difficultyStr = typeof data.difficulty === 'object' ? (data.difficulty.label || '中级') : (data.difficulty || '中级')
    const diffInfo = DIFFICULTY_MAP[difficultyStr] || DIFFICULTY_MAP['中级']

    // location: flat="陕西省华阴市", structured={direction, address, navAddress, publicTransport}
    let locationStr = typeof data.location === 'object' ? (data.location.address || '') : (data.location || '')
    let navAddress = typeof data.location === 'object' ? (data.location.navAddress || '') : (data.navAddress || '')
    let publicTransport = typeof data.location === 'object' ? (data.location.publicTransport || '') : (data.traffic || '')

    // cost: flat="门票160元", structured={type:"收费", amount:160, note:"..."}
    let costStr = typeof data.cost === 'object'
      ? (data.cost.type === '免费' ? '免费' : `${data.cost.note || ''} ${data.cost.amount ? data.cost.amount + '元' : ''}`.trim())
      : (data.cost || '免费')

    // distance: flat="全程徒步约15公里 / 1-2天", structured=distance_km:15, duration_hours:4
    let distanceText, durationText
    if (typeof data.distance === 'string' && data.distance.includes('/')) {
      const parts = data.distance.split('/')
      distanceText = parts[0].trim()
      durationText = parts[1] ? parts[1].trim() : ''
    } else if (data.distance_km) {
      distanceText = `约${data.distance_km}公里`
      durationText = data.duration_hours ? `约${data.duration_hours}小时` : ''
    } else {
      distanceText = data.distance || ''
      durationText = ''
    }

    // 季节动态时间规划
    const month = new Date().getMonth() + 1
    let timeplanAdvice = {}
    if (month >= 6 && month <= 8) {
      timeplanAdvice = { depart: '7:00 - 8:00', return: '14:00 前', tip: '夏季天长，建议早出发避开午后高温' }
    } else if (month >= 12 || month <= 2) {
      timeplanAdvice = { depart: '9:00 - 10:00', return: '13:00 前', tip: '⚠️ 冬季17:00天黑，建议天黑前2小时返程' }
    } else {
      timeplanAdvice = { depart: '8:00 - 9:00', return: '14:00 前', tip: '春秋舒适，建议按计划出发' }
    }

    // 获取图片列表
    let images = []
    if (data.image) images.push(data.image)
    if (data.images && Array.isArray(data.images)) {
      images = images.concat(data.images)
    }
    if (images.length === 0) {
      images = ['/images/scenery/scenery-general.jpg']
    }

    // 默认装备（带原因）
    const defaultEquipment = {
      must: [
        { name: '防滑运动鞋', reason: '路面有碎石和土路，防滑很重要' },
        { name: '饮用水（至少1L）', reason: '山里没有补给点，必须自带' },
        { name: '干粮/零食', reason: '及时补充体力，避免低血糖' },
        { name: '手机充满电', reason: '导航、拍照、紧急联络都需要' },
        { name: '少量现金', reason: '部分山里停车/小摊只收现金' }
      ],
      suggest: [
        { name: '登山杖', reason: '上下坡减轻膝盖压力约30%' },
        { name: '防晒帽', reason: '山脊段无遮挡，容易晒伤' },
        { name: '防晒霜', reason: '海拔高紫外线更强' },
        { name: '充电宝', reason: '拍照+导航耗电快' },
        { name: '创可贴', reason: '碎石路段容易擦伤' },
        { name: '纸巾', reason: '山上没有卫生间' }
      ],
      noNeed: [
        { name: '专业登山鞋', reason: '运动鞋够了，路况不复杂' },
        { name: '帐篷', reason: '一日往返，不需要露营' },
        { name: '睡袋', reason: '同上，不留宿' },
        { name: '炊具', reason: '带即食干粮即可' }
      ]
    }

    // 分段路况（带颜色编码和surface/scenery）
    let sections = []
    let routeSurfaceSummary = ''
    if (data.route_detail) {
      const parts = data.route_detail.split(/[;；。]/).filter(s => s.trim())
      const defaultSurfaces = ['土路70% + 砂石路30%', '土路50% + 碎石路50%', '土路60% + 草地40%', '砂石路80% + 石阶20%']
      const defaultSceneries = ['村口出发，农田风光', '沿溪流走，树荫好', '山脊开阔，视野极佳', '松林穿行，空气清新']
      const defaultDifficulties = [2, 2, 3, 2]

      sections = parts.map((p, i) => {
        const difficulty = defaultDifficulties[i % defaultDifficulties.length]
        let diffColor, diffLabel
        if (difficulty <= 2) { diffColor = '#4CAF50'; diffLabel = '轻松' }
        else if (difficulty === 3) { diffColor = '#FFC107'; diffLabel = '适中' }
        else { diffColor = '#F44336'; diffLabel = '较难' }

        return {
          name: `第${i + 1}段`,
          desc: p.trim(),
          difficulty: difficulty,
          diffColor: diffColor,
          diffLabel: diffLabel,
          surface: data.route_surfaces ? (data.route_surfaces[i] || defaultSurfaces[i % defaultSurfaces.length]) : defaultSurfaces[i % defaultSurfaces.length],
          scenery: data.route_sceneries ? (data.route_sceneries[i] || defaultSceneries[i % defaultSceneries.length]) : defaultSceneries[i % defaultSceneries.length],
          percent: Math.round(100 / parts.length)
        }
      })

      // 路况总结
      const surfaceAll = data.route_surfaces ? data.route_surfaces.join(' + ') : '土路60% + 砂石路40%'
      routeSurfaceSummary = `全程：${surfaceAll}，无悬崖、无涉水`
    }

    return {
      _id: data._id,
      name: data.name,
      description: data.description || '',
      images: images,
      difficulty: difficultyStr,
      diffStars: diffInfo.stars,
      diffColor: diffInfo.color,
      diffText: diffInfo.text,
      diffIcon: diffInfo.icon,
      distance: distanceText,
      duration: durationText,
      elevation: data.elevation_gain_m || '',
      cost: costStr,
      location: locationStr,
      navAddress: navAddress || `导航搜索：${data.name}`,
      publicTransport: publicTransport,
      scenery: data.scenery || 4,
      suitableFor: parseArray(data.features),
      bestSeason: parseArray(data.best_season),
      family_friendly: data.family_friendly || false,
      sections: sections,
      routeSurfaceSummary: routeSurfaceSummary,
      highlights: data.highlights || '',
      checkpoints: data.checkpoints || '',
      equipment: (() => {
      const eq = data.equipment || defaultEquipment
      // 兼容旧格式：如果 equipment 项是字符串，转为 {name, reason} 格式
      const normalize = (list) => {
        if (!Array.isArray(list)) return []
        return list.map(item => {
          if (typeof item === 'string') return { name: item, reason: '' }
          return item
        })
      }
      return {
        must: normalize(eq.must),
        suggest: normalize(eq.suggest),
        noNeed: normalize(eq.noNeed)
      }
    })(),
      safety_tips: parseArray(data.safety_tips),
      law_tips: parseArray(data.law_tips),
      eco_tips: parseArray(data.eco_tips),
      emergencyPhone: data.emergencyPhone || '西安救援：029-12345',
      ticket_info: data.ticket_info || '',
      food: data.food || '',
      pitfall: data.pitfall || '',
      tips: data.tips || '',
      best_time: data.best_time || '',
      likes_count: data.likes_count || 0,
      favorites_count: data.favorites_count || 0,
      view_count: data.view_count || 0,
      timeplanAdvice: timeplanAdvice,
      updatedAt: data.updatedAt ? (typeof data.updatedAt === 'string' ? data.updatedAt.split('T')[0] : '') : ''
    }
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

  // 收藏/取消收藏
  onFavorite: async function () {
    const id = this.data.trailId
    const isFavorited = this.data.isFavorited

    // 即时反馈
    this.setData({ isFavorited: !isFavorited })

    // 心形弹跳动画
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
    wx.showToast({
      title: !isFavorited ? '已收藏 ❤️ → 我的页面可查看' : '已取消收藏',
      icon: 'none'
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
          wx.showToast({ title: '已复制导航地址，请前往地图软件粘贴并进行导航', icon: 'none' })
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

  // 点击导航 → 弹出选项
  onNavTap: function () {
    wx.showActionSheet({
      itemList: ['📋 复制地址', '🧭 开始导航'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0: this.onCopyNavAddress(); break
          case 1: this.openNavigation(); break
        }
      }
    })
  },

  // 打开微信内置地图导航
  openNavigation: function () {
    const trail = this.data.trail
    // 先复制地址作为备用
    wx.setClipboardData({
      data: trail.navAddress || trail.name,
      success: () => {}
    })
    wx.openLocation({
      latitude: 0,
      longitude: 0,
      name: trail.name,
      address: trail.navAddress || trail.location,
      scale: 15,
      fail: () => {
        wx.showToast({ title: '已复制导航地址，请前往地图软件粘贴并进行导航', icon: 'none' })
      }
    })
  },

  // 进入行前清单
  onGoChecklist: function () {
    wx.navigateTo({
      url: `/pages/checklist/checklist?id=${this.data.trailId}`
    })
  },

  // 加载清单完成度
  loadChecklistProgress: function () {
    if (!this.data.trailId) return
    const cacheKey = `checklist_${this.data.trailId}`
    const checkedMap = wx.getStorageSync(cacheKey) || {}
    const trail = this.data.trail

    // 计算装备总数
    let total = 0
    if (trail.equipment) {
      total = (trail.equipment.must || []).length +
              (trail.equipment.suggest || []).length
    }

    // 计算已勾选数
    const done = Object.values(checkedMap).filter(v => v).length

    this.setData({ checklistDone: done, checklistTotal: total })
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
            wx.showToast({ title: '请点击右上角 ··· 分享给朋友', icon: 'none', duration: 2000 })
            break
          case 1:
            this.generateShareImage()
            break
        }
      }
    })
  },

  // 生成分享图片
  generateShareImage: function () {
    wx.showLoading({ title: '生成图片中...' })

    const trail = this.data.trail
    if (!trail.name) {
      wx.hideLoading()
      wx.showToast({ title: '路线信息加载中', icon: 'none' })
      return
    }

    const query = wx.createSelectorQuery()
    query.select('#share-canvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) {
        wx.hideLoading()
        this.generateShareText()
        return
      }

      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio
      const width = 600
      const height = 800

      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      // 背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)

      // 顶部绿色条
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(0, 0, width, 120)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 32px sans-serif'
      ctx.fillText(trail.name, 30, 55)
      ctx.font = '18px sans-serif'
      ctx.fillText(trail.difficulty + ' · ' + trail.distance, 30, 90)

      // 路线信息
      let y = 160
      ctx.fillStyle = '#333'
      ctx.font = '16px sans-serif'

      if (trail.description) {
        ctx.fillText(trail.description.substring(0, 60) + '...', 30, y)
        y += 40
      }

      // 核心数据
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = '#999'
      ctx.fillText('📏 距离: ' + (trail.distance || '-'), 30, y)
      ctx.fillText('⏱ 耗时: ' + (trail.duration || '-'), 200, y)
      ctx.fillText('📈 爬升: ' + (trail.elevation || '-'), 370, y)
      y += 40

      ctx.fillText('📍 位置: ' + (trail.location || '-'), 30, y)
      y += 40
      ctx.fillText('💰 费用: ' + (trail.cost || '-'), 30, y)
      y += 60

      // 装备摘要
      ctx.fillStyle = '#333'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText('🎒 必带装备', 30, y)
      y += 30
      ctx.font = '15px sans-serif'
      const mustItems = trail.equipment.must || []
      mustItems.forEach(item => {
        ctx.fillText('• ' + item.name, 40, y)
        y += 26
      })
      y += 20

      // 底部
      ctx.fillStyle = '#CCC'
      ctx.font = '12px sans-serif'
      ctx.fillText('秦人徒步 · 安全出行', width / 2 - 60, height - 20)
      ctx.fillText('长按图片进行分享或保存', width / 2 - 85, height - 45)

      // 导出
      wx.canvasToTempFilePath({
        canvas: canvas,
        success: (res) => {
          wx.hideLoading()
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          })
        },
        fail: () => {
          wx.hideLoading()
          this.generateShareText()
        }
      })
    })
  },

  // 文本分享（降级方案）
  generateShareText: function () {
    const trail = this.data.trail
    const text = `🥾 ${trail.name}\n难度：${trail.difficulty} · 距离：${trail.distance}\n📍 ${trail.location}\n💰 ${trail.cost}\n\n秦人徒步 · 安全出行`
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '路线信息已复制，可粘贴分享', icon: 'none' })
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
    this.setData({
      isCompleted: records.length > 0,
      completedRecords: records
    })
  },

  // 点击标记已走过按钮（允许重复标记）
  onCompleteTrail: function () {
    // 允许重复标记，不 return
    // 自动填入天气和日期
    const weather = this.data.weather ? (this.data.weather.desc || '晴') : '晴'
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    this.setData({
      showCompletePanel: true,
      completeWeather: weather,
      completeDate: dateStr,
      today: dateStr,
      completeFeeling: '',
      completeDifficulty: 'normal',
      completeCompanions: ''
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
      completeCompanions: item.companions || ''
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

  // 修改日期
  onDateChange: function (e) {
    this.setData({ completeDate: e.detail.value })
  },

  // 修改天气
  onInputWeather: function (e) {
    this.setData({ completeWeather: e.detail.value })
  },

  // 输入同行人
  onInputCompanions: function (e) {
    this.setData({ completeCompanions: e.detail.value })
  },

  // 保存已走过记录
  onSaveComplete: async function () {
    const { trailId, completeDate, completeWeather, completeFeeling, completeDifficulty, completeCompanions, isEditMode, editingCompletedAt } = this.data
    try {
      if (isEditMode) {
        // 编辑模式：更新已有记录
        const result = cloudSync.updateCompleted(trailId, editingCompletedAt, {
          date: completeDate,
          weather: completeWeather,
          feeling: completeFeeling,
          difficultyFeeling: completeDifficulty,
          companions: completeCompanions
        })
        if (result === false) return
        wx.showToast({ title: '✏️ 记录已更新！', icon: 'none' })
      } else {
        // 新增模式（原有逻辑）
        const result = await cloudSync.addCompleted(trailId, completeDate, {
          weather: completeWeather,
          feeling: completeFeeling,
          difficultyFeeling: completeDifficulty,
          companions: completeCompanions,
          name: this.data.trail.name
        })
        if (result === false) return
        wx.showToast({ title: '🎉 记录已保存！', icon: 'none' })
      }
      this.setData({
        isCompleted: true,
        showCompletePanel: false,
        isEditMode: false,
        editingCompletedAt: ''
      })
      // 刷新已走过记录列表
      this.checkCompletedStatus()
    } catch (err) {
      console.error('保存已走过记录失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // 相关知识链接
  onGoKnowledge: function (e) {
    const category = e.currentTarget.dataset.category
    wx.navigateTo({
      url: `/pages/knowledge/knowledge?category=${category}`
    })
  },

  // 从本地数据加载详情（降级方案）
  loadFromLocalData: function () {
    try {
      const allTrails = require('../../trails_data.json')
      const trail = allTrails.find(t => t._id === this.data.trailId)
      if (trail) {
        const processed = this.processTrailDetail(trail)
        this.setData({ trail: processed, loading: false })
      } else {
        this.setData({ trail: this.getMockTrail(), loading: false })
      }
    } catch (e) {
      console.error('读取本地路线数据失败:', e)
      this.setData({ trail: this.getMockTrail(), loading: false })
    }
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
