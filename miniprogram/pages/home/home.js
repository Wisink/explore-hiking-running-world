// pages/home/home.js
const app = getApp()

Page({
  data: {
    // 天气信息
    weather: {
      icon: '☀️',
      temp: '--',
      desc: '获取天气中...',
      advice: '正在检查天气...',
      updateTime: '--'
    },
    // 今日推荐路线
    todayTrail: null,
    // 热门路线
    hotTrails: [],
    // 加载状态
    loading: true,
    loadError: false
  },

  onLoad: function () {
    this.loadData()
  },

  onShow: function () {
    // 每次显示时刷新数据
  },

  onPullDownRefresh: function () {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true, loadError: false })
    
    try {
      // 并行加载，添加超时处理
      await Promise.all([
        this.loadWeather(),
        this.loadTodayRecommend(),
        this.loadHotTrails()
      ])
    } catch (err) {
      console.error('加载数据失败', err)
      this.setData({ loadError: true })
    }
    
    this.setData({ loading: false })
  },

  // 加载天气（调用云函数）
  loadWeather: function () {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn('天气加载超时，使用默认数据')
        this.setDefaultWeather()
        resolve()
      }, 5000)

      wx.cloud.callFunction({
        name: 'weather',
        data: { city: '西安' },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0) {
            const data = res.result.data
            this.setData({
              weather: {
                icon: data.icon || '☀️',
                temp: data.temp || '--',
                desc: data.desc || '晴天',
                advice: data.suitable ? '✅ 今日适合户外活动' : '⚠️ 建议室内活动',
                updateTime: this.formatTime(new Date())
              }
            })
          } else {
            this.setDefaultWeather()
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          this.setDefaultWeather()
          resolve()
        }
      })
    })
  },

  // 设置默认天气
  setDefaultWeather: function () {
    const month = new Date().getMonth() + 1
    let weather = {
      icon: '☀️',
      temp: '22',
      desc: '晴天',
      advice: '✅ 今日适合户外活动',
      updateTime: this.formatTime(new Date())
    }
    
    if (month >= 6 && month <= 8) {
      weather = { icon: '☀️', temp: '32', desc: '夏季高温', advice: '⚠️ 注意防暑，建议早晚出行', updateTime: this.formatTime(new Date()) }
    } else if (month >= 12 || month <= 2) {
      weather = { icon: '❄️', temp: '5', desc: '冬季低温', advice: '⚠️ 注意保暖，防滑防冻', updateTime: this.formatTime(new Date()) }
    } else if (month >= 3 && month <= 5) {
      weather = { icon: '🌸', temp: '18', desc: '春季宜人', advice: '✅ 春花盛开，适合赏花徒步', updateTime: this.formatTime(new Date()) }
    } else {
      weather = { icon: '🍂', temp: '15', desc: '秋高气爽', advice: '✅ 红叶季节，风景正好', updateTime: this.formatTime(new Date()) }
    }
    
    this.setData({ weather })
  },

  // 加载今日推荐路线
  loadTodayRecommend: function () {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn('今日推荐加载超时')
        resolve()
      }, 5000)

      // 从数据库随机获取一条初级路线
      wx.cloud.callFunction({
        name: 'trail',
        data: {
          action: 'recommend',
          limit: 1
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data && res.result.data.length > 0) {
            const trail = res.result.data[0]
            trail.reason = this.generateRecommendReason(trail)
            this.setData({ todayTrail: trail })
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          resolve()
        }
      })
    })
  },

  // 生成推荐理由
  generateRecommendReason: function (trail) {
    const reasons = [
      `${trail.name}是一条适合新手的路线，难度适中，风景优美，适合周末放松。`,
      `推荐${trail.name}，这里有美丽的自然风光，难度${trail.difficulty}，非常适合初次徒步的朋友。`,
      `${trail.name}位于${trail.location}，是一条非常受欢迎的路线，${trail.difficulty}难度，适合全家出游。`,
      `今天推荐${trail.name}，这条路线风景评分${trail.scenery}星，是一条不可错过的好路线。`
    ]
    return reasons[Math.floor(Math.random() * reasons.length)]
  },

  // 刷新今日推荐
  refreshTodayRecommend: function () {
    this.setData({ todayTrail: null })
    this.loadTodayRecommend()
  },

  // 加载热门路线（20条）
  loadHotTrails: function () {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn('热门路线加载超时')
        this.setData({ hotTrails: this.getMockHotTrails() })
        resolve()
      }, 5000)

      wx.cloud.callFunction({
        name: 'trail',
        data: {
          action: 'hot',
          limit: 20
        },
        success: (res) => {
          clearTimeout(timeoutId)
          if (res.result && res.result.code === 0 && res.result.data) {
            this.setData({ hotTrails: res.result.data })
          } else {
            this.setData({ hotTrails: this.getMockHotTrails() })
          }
          resolve()
        },
        fail: () => {
          clearTimeout(timeoutId)
          this.setData({ hotTrails: this.getMockHotTrails() })
          resolve()
        }
      })
    })
  },

  // 模拟热门路线数据
  getMockHotTrails: function () {
    return [
      { _id: '1', name: '华山', location: '渭南市华阴市', difficulty: '高级', likes_count: 856 },
      { _id: '2', name: '太白山', location: '宝鸡市眉县', difficulty: '高级', likes_count: 723 },
      { _id: '3', name: '牛背梁', location: '商洛市柞水县', difficulty: '中级', likes_count: 645 },
      { _id: '4', name: '翠华山', location: '西安市长安区', difficulty: '初级', likes_count: 512 },
      { _id: '5', name: '太平峪', location: '西安市鄠邑区', difficulty: '初级', likes_count: 489 }
    ]
  },

  // 快速入口点击
  onQuickTap: function (e) {
    const action = e.currentTarget.dataset.action
    
    switch (action) {
      case 'beginner':
        // 跳转到搜索页，筛选初级路线
        wx.switchTab({ url: '/pages/search/search' })
        break
      case 'family':
        // 跳转到搜索页，筛选亲子路线
        wx.switchTab({ url: '/pages/search/search' })
        break
      case 'equipment':
        // 跳转到装备清单页
        wx.navigateTo({ url: '/pages/equipment/equipment' })
        break
      case 'etiquette':
        // 跳转到户外礼仪页
        wx.navigateTo({ url: '/pages/etiquette/etiquette' })
        break
      case 'safety':
        // 跳转到安全知识页
        wx.navigateTo({ url: '/pages/safety/safety' })
        break
    }
  },

  // 点击天气横幅
  onWeatherTap: function () {
    wx.showToast({
      title: '天气详情开发中',
      icon: 'none'
    })
  },

  // 点击路线
  onTrailTap: function (e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${id}`
      })
    }
  },

  // 格式化时间
  formatTime: function (date) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }
})
