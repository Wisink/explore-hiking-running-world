// app.js - 秦人徒步路线分享
const cloudSync = require('./utils/cloud-sync')

// 全局拦截 wx.navigateBack，处理安卓物理返回键等非按钮触发的返回
const _origNavBack = wx.navigateBack
wx.navigateBack = function (opts = {}) {
  if (opts._bypass) return _origNavBack.call(wx, opts)
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  if (cur && cur.data && cur.data.formChanged && cur.onBack) {
    cur.onBack()
    return
  }
  _origNavBack.call(wx, opts)
}

App({
  onLaunch: function () {
    // 初始化云开发 - 使用动态环境，避免硬编码
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV, // 动态获取当前云环境
        traceUser: true,
      })
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo
    this.globalData.statusBarHeight = systemInfo.statusBarHeight
    this.globalData.screenWidth = systemInfo.screenWidth
    this.globalData.screenHeight = systemInfo.screenHeight

    // 用户数据同步和初始化均异步执行，不阻塞启动
    this._syncUserDataPromise = this.syncUserData()
    this._userInitPromise = this.initUser()
  },

  // 初始化用户编号和访问次数（通过云函数服务端分配，保证编号唯一递增）
  initUser: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'user-data',
        data: { action: 'init-user' }
      }).then(res => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          this.globalData.userInfo = {
            userNumber: data.userNumber,
            nickName: data.nickName,
            visitCount: data.visitCount
          }
          console.log('initUser: 用户信息', data.userNumber, data.nickName, '访问次数', data.visitCount)
        } else {
          console.log('initUser: 未获取到用户信息', res)
        }
        resolve()
      }).catch(err => {
        console.error('initUser: 调用云函数失败:', err)
        resolve() // 不阻塞启动
      })
    })
  },

  // 同步用户数据（收藏和已走过）
  syncUserData: async function () {
    try {
      console.log('开始同步用户数据...')
      const data = await cloudSync.pullFromCloud()
      this.globalData.favorites = data.favorites
      this.globalData.completed = data.completed
      console.log('用户数据同步完成:', data)
    } catch (err) {
      console.error('用户数据同步失败，使用本地缓存:', err)
      // 同步失败时使用本地缓存
      this.globalData.favorites = cloudSync.getLocalFavorites()
      this.globalData.completed = cloudSync.getLocalCompleted()
    }
  },

  globalData: {
    favorites: [],
    completed: [],
    systemInfo: null,
    statusBarHeight: 0,
    screenWidth: 0,
    screenHeight: 0
  }
})
