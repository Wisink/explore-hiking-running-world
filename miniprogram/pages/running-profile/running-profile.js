function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}

// pages/running-profile/running-profile.js
const app = getApp()

Page({
  // 轮循欢迎语列表（20条）
  greetings: [
    '每一步都是向前的力量。',                          // [0] 首次访问展示
    '跑过的路，都算数。',                              // [1]
    '不是因为看到了终点才坚持，是因为坚持了才看到终点。', // [2]
    '今天不想跑，所以才要去跑。——村上春树',            // [3]
    '跑步是孤独的运动，但跑者从不孤独。',              // [4]
    '每一次跑步，都是与自己的对话。',                  // [5]
    '用脚步丈量世界，用汗水书写人生。',                // [6]
    '跑得慢没关系，重要的是不停下脚步。',              // [7]
    '晨跑迎接朝阳，夜跑告别疲惫。',                    // [8]
    '三公里专治各种不爽，五公里治愈一切，十公里内心全是坦荡。', // [9]
    '跑步的真谛是越跑越快，而不是越跑越累。',          // [10]
    '当你开始跑步，全世界都会为你让路。',              // [11]
    '没有跑不到的终点，只有不肯迈开的脚步。',          // [12]
    '风里雨里，赛道等你。',                            // [13]
    '跑步是最简单的运动，也是最难坚持的艺术。',        // [14]
    '每一次呼吸都是对生命的热爱。',                    // [15]
    '跑过四季，跑过自己。',                            // [16]
    '脚步不停，梦想不灭。',                            // [17]
    '用汗水浇灌梦想，用坚持铸就辉煌。',                // [18]
    '跑步不只是运动，更是一种生活态度。',              // [19]
  ],

  data: {
    // 状态栏高度
    statusBarHeight: 0,
    // 头像和昵称
    avatarUrl: '',
    runnerNickname: '',
    // 用户信息（编号、昵称、访问次数）
    userInfo: null,
    // 管理员权限
    isAdmin: false,
    // 统计数据
    readArticleCount: 0,
    visitCount: 0,
    // 轮循欢迎语
    greetingText: '',
    // Toast
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    // 初始化头像和昵称
    this.initRunnerProfile()
    // 检查管理员权限（非管理员静默忽略）
    wx.cloud.callFunction({
      name: 'admin-api',
      data: { module: 'check-admin' }
    }).then(res => {
      if (res.result && res.result.data && res.result.data.isAdmin) {
        this.setData({ isAdmin: true })
      }
    }).catch(() => {
      // 非管理员用户，静默忽略
    })
  },

  onShow() {
    // 设置自定义tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    
    // 加载统计数据
    this.loadStats()

    // 轮循欢迎语：首次访问→greetings[0]（首访语），之后在greetings[1]-[19]之间轮循
    let hasVisited = wx.getStorageSync('running_greetingHasVisited')
    if (!hasVisited) {
      wx.setStorageSync('running_greetingHasVisited', true)
      wx.setStorageSync('running_greetingRotateIndex', -1)
      this.setData({ greetingText: this.greetings[0] })
    } else {
      let rotateIndex = wx.getStorageSync('running_greetingRotateIndex') || 0
      rotateIndex = (rotateIndex + 1) % 20  // 0-19 对应 greetings[1]-[19]
      wx.setStorageSync('running_greetingRotateIndex', rotateIndex)
      this.setData({ greetingText: this.greetings[rotateIndex + 1] })
    }

    // 从全局数据加载用户信息（等待 app.js initUser 完成）
    const app = getApp()
    if (app.globalData && app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo })
      // 同步昵称为云端用户编号
      if (app.globalData.userInfo.nickName) {
        this.setData({ runnerNickname: app.globalData.userInfo.nickName })
      }
    } else if (app._userInitPromise) {
      // initUser 后台异步执行中，监听其完成结果
      app._userInitPromise.then(() => {
        if (app.globalData && app.globalData.userInfo) {
          this.setData({ userInfo: app.globalData.userInfo })
          if (app.globalData.userInfo.nickName) {
            this.setData({ runnerNickname: app.globalData.userInfo.nickName })
          }
        }
      }).catch(() => {
        // 用户初始化失败，静默忽略（已使用本地头像昵称）
      })
    }
  },

  onPullDownRefresh() {
    this.loadStats().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 初始化跑步者头像和昵称
   * 首次进入随机生成，再次进入从缓存读取
   */
  initRunnerProfile() {
    let runnerNumber = wx.getStorageSync('runnerNumber')
    let avatarIndex = wx.getStorageSync('runnerAvatarIndex')

    if (!runnerNumber) {
      runnerNumber = this.generateNumber(3)
      wx.setStorageSync('runnerNumber', runnerNumber)
    }

    if (!avatarIndex) {
      avatarIndex = Math.floor(Math.random() * 8) + 1
      wx.setStorageSync('runnerAvatarIndex', avatarIndex)
    }

    const paddedIndex = String(avatarIndex).padStart(2, '0')
    this.setData({
      avatarUrl: `/images/avatars/avatar-${paddedIndex}.jpg`,
      runnerNickname: `${runnerNumber}号跑步爱好者`
    })
  },

  /**
   * 生成随机编号（支持扩展位数）
   * @param {number} digits - 编号位数，默认3位
   * @returns {string} 补零后的编号字符串
   */
  generateNumber(digits = 3) {
    const max = Math.pow(10, digits) - 1
    const number = Math.floor(Math.random() * max) + 1
    return String(number).padStart(digits, '0')
  },

  // ========== 数据加载 ==========

  /**
   * 加载个人统计
   */
  async loadStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getMyStats' }
      })
      
      if (res.result && res.result.code === 0) {
        const stats = res.result.data || {}
        this.setData({
          readArticleCount: stats.readArticleCount || 0,
          visitCount: stats.visitCount || 0
        })
      }
    } catch (err) {
      console.error('加载统计失败：', err)
    }
  },

  // ========== 页面跳转 ==========

  goToMyFavorites() {
    wx.navigateTo({
      url: '/pages/running-my-favorites/running-my-favorites'
    })
  },

  goToMyReviews() {
    wx.navigateTo({
      url: '/pages/running-my-reviews/running-my-reviews'
    })
  },

  switchToHiking() {
    wx.setStorageSync('world', 'hiking')
    wx.switchTab({
      url: '/pages/home/home'
    })
  },

  goToAdmin() {
    wx.navigateTo({
      url: '/pages/running-admin/running-admin'
    })
  },

  // 备案号查询
  onIcpTap: function () {
    wx.setClipboardData({
      data: '陕ICP备2026006901号'
    })
  },

  // Toast 方法
  showToast(message, type = 'info') {
    showNiceToast(this, message, type)
  }
})