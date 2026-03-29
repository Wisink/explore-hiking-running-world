// pages/route-detail/route-detail.js
const app = getApp()

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
      equipment: false
    },
    // 天气
    weather: null
  },

  onLoad: function (options) {
    const trailId = options.id || ''
    this.setData({ trailId })
    this.loadTrailDetail()
  },

  onShow: function () {
    this.checkFavoriteStatus()
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
        console.warn('详情加载超时')
        this.setData({ trail: this.getMockTrail(), loading: false })
        resolve()
      }, 8000)

      wx.cloud.callFunction({
        name: 'trail',
        data: {
          action: 'getDetail',
          id: this.data.trailId
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data) {
            const trail = this.processTrailDetail(res.result.data)
            this.setData({ trail, loading: false })
            this.loadWeather()
          } else {
            this.setData({ trail: this.getMockTrail(), loading: false })
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          this.setData({ trail: this.getMockTrail(), loading: false })
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

    const diffInfo = DIFFICULTY_MAP[data.difficulty] || DIFFICULTY_MAP['中级']

    // 解析距离
    let distanceText = data.distance || ''
    let durationText = ''
    if (distanceText.includes('/')) {
      const parts = distanceText.split('/')
      distanceText = parts[0].trim()
      durationText = parts[1] ? parts[1].trim() : ''
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

    // 默认装备
    const defaultEquipment = {
      must: ['徒步鞋', '饮用水（至少1L）', '干粮/零食', '手机充满电', '少量现金'],
      suggest: ['登山杖', '防晒帽', '防晒霜', '充电宝', '创可贴', '纸巾'],
      noNeed: ['帐篷', '睡袋', '炊具', '专业攀岩装备']
    }

    // 分段路况
    let sections = []
    if (data.route_detail) {
      const parts = data.route_detail.split(/[;；。]/).filter(s => s.trim())
      sections = parts.map((p, i) => ({
        name: `第${i + 1}段`,
        desc: p.trim()
      }))
    }

    return {
      _id: data._id,
      name: data.name,
      description: data.description || '',
      images: images,
      difficulty: data.difficulty || '中级',
      diffStars: diffInfo.stars,
      diffColor: diffInfo.color,
      diffText: diffInfo.text,
      diffIcon: diffInfo.icon,
      distance: distanceText,
      duration: durationText,
      elevation: data.elevation_gain_m || '',
      cost: data.cost || '免费',
      location: data.location || '',
      navAddress: data.navAddress || `导航搜索：${data.name}`,
      publicTransport: data.traffic || '',
      scenery: data.scenery || 4,
      suitableFor: parseArray(data.features),
      bestSeason: parseArray(data.best_season),
      family_friendly: data.family_friendly || false,
      sections: sections,
      highlights: data.highlights || '',
      checkpoints: data.checkpoints || '',
      equipment: data.equipment || defaultEquipment,
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
      view_count: data.view_count || 0
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
  onFavorite: function () {
    const id = this.data.trailId
    let favorites = wx.getStorageSync('route_favorites') || []
    const idx = favorites.indexOf(id)

    if (idx > -1) {
      favorites.splice(idx, 1)
    } else {
      favorites.push(id)
    }

    wx.setStorageSync('route_favorites', favorites)
    this.setData({ isFavorited: idx === -1 })

    // 心形弹跳动画
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
    wx.showToast({
      title: idx === -1 ? '已收藏 ❤️' : '已取消收藏',
      icon: 'none'
    })
  },

  // 检查收藏状态
  checkFavoriteStatus: function () {
    const favorites = wx.getStorageSync('route_favorites') || []
    this.setData({ isFavorited: favorites.includes(this.data.trailId) })
  },

  // 复制导航地址
  onCopyNavAddress: function () {
    const address = this.data.trail.navAddress || ''
    if (address) {
      wx.setClipboardData({
        data: address,
        success: () => {
          wx.showToast({ title: '已复制导航地址', icon: 'success' })
        }
      })
    }
  },

  // 进入行前清单
  onGoChecklist: function () {
    wx.navigateTo({
      url: `/pages/checklist/checklist?id=${this.data.trailId}`
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

  // 分享
  onShareAppMessage: function () {
    const trail = this.data.trail
    return {
      title: `${trail.name} - ${trail.diffText || '徒步路线'}`,
      path: `/pages/route-detail/route-detail?id=${this.data.trailId}`,
      imageUrl: trail.images ? trail.images[0] : ''
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
        { name: '0-2km 入口段', desc: '从乱石川村出发，沿水泥路缓行，两侧农田风光，适合热身。路面平坦，老少皆宜。' },
        { name: '2-5km 爬升段', desc: '转入土路，开始缓慢爬升。穿过松林，空气清新。注意脚下碎石，建议使用登山杖。' },
        { name: '5-7km 山脊段', desc: '到达山脊，视野开阔！可远眺灞河平原，天晴时能看到西安城区。这是全程风景最佳的路段。' },
        { name: '7-8km 下山段', desc: '沿另一侧山路下山，回到公路。可原路返回或联系接驳车。' }
      ],
      highlights: '松林清风、山脊开阔视野、古道遗迹、春季野花',
      checkpoints: '古道石碑、松林观景台、山脊最高点、古驿站遗址',
      equipment: {
        must: ['徒步鞋（防滑）', '饮用水 1.5L', '干粮/路餐', '手机充满电'],
        suggest: ['登山杖', '防晒帽', '防晒霜', '充电宝', '创可贴', '湿纸巾'],
        noNeed: ['帐篷', '睡袋', '炊具', '绳索']
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
      view_count: 5620
    }
  }
})
