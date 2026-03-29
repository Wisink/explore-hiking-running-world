// app.js
App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-1ghoxvn859e9d0df', // 云开发环境ID
        traceUser: true,
      })
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo
    this.globalData.statusBarHeight = systemInfo.statusBarHeight
    this.globalData.screenWidth = systemInfo.screenWidth
    this.globalData.screenHeight = systemInfo.screenHeight

    // 获取用户信息
    this.checkUserLogin()

    // 检查是否首次打开，跳转欢迎页
    const hasLaunched = wx.getStorageSync('hasLaunched')
    if (!hasLaunched) {
      this.globalData.isFirstLaunch = true
      // 延迟跳转，确保页面加载完成
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/welcome/welcome'
        })
      }, 100)
    } else {
      this.globalData.isFirstLaunch = false
    }
  },

  // 检查用户登录状态
  checkUserLogin: function () {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.isLogin = true
    } else {
      this.globalData.isLogin = false
    }
  },

  // 用户登录
  login: function () {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '登录中...' })
      
      // 直接调用云函数登录（云函数会自动获取openid）
      wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'login',
          userInfo: null
        },
        success: (result) => {
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            this.globalData.userInfo = result.result.data
            this.globalData.isLogin = true
            wx.setStorageSync('userInfo', result.result.data)
            resolve(result.result.data)
          } else {
            reject(result.result)
          }
        },
        fail: (err) => {
          wx.hideLoading()
          reject(err)
        }
      })
    })
  },

  globalData: {
    userInfo: null,
    isLogin: false,
    isFirstLaunch: false,
    systemInfo: null,
    statusBarHeight: 0,
    screenWidth: 0,
    screenHeight: 0,
    // 配置信息
    config: {
      // 难度选项
      difficulties: ['初级', '中级', '高级'],
      // 地区选项
      regions: ['华东', '华北', '华中', '华南', '西南', '西北', '东北'],
      // 季节选项
      seasons: ['春季', '夏季', '秋季', '冬季'],
      // 费用区间
      costRanges: ['免费', '100以内', '100-300', '300+'],
      // 适合天数
      dayOptions: ['一日游', '两日', '多日'],
      // 景色特点
      features: ['云海', '日出', '日落', '瀑布', '溪流', '湖泊', '森林', '草甸', '花海', '红叶', '雪景', '峡谷', '古道', '寺庙', '遗址'],
      // 纠错类型
      correctionTypes: ['位置', '难度', '费用', '季节', '安全提示', '环保问题', '其他'],
      // 等级系统
      levels: [
        { level: 1, title: '初行者', badge: '嫩芽', requirement: '注册即获得' },
        { level: 2, title: '山麓客', badge: '登山鞋', requirement: '完成3条路线' },
        { level: 3, title: '林间行者', badge: '松树', requirement: '完成8条路线' },
        { level: 4, title: '溪涧旅人', badge: '溪流', requirement: '完成15条路线' },
        { level: 5, title: '花径行者', badge: '花朵', requirement: '完成25条路线' },
        { level: 6, title: '云岭漫步者', badge: '云朵', requirement: '完成40条路线' },
        { level: 7, title: '四季行者', badge: '彩虹', requirement: '完成60条+四季各3条' },
        { level: 8, title: '秦岭守护者', badge: '山峰', requirement: '完成100条+10条纠错' },
        { level: 9, title: '自然使者', badge: '星辰', requirement: '完成150条+社区贡献' }
      ]
    }
  }
})
