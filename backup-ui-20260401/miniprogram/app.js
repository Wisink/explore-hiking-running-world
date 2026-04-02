// app.js - 秦人徒步路线分享
const cloudSync = require('./utils/cloud-sync')

App({
  onLaunch: async function () {
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

    // 从云端同步用户数据
    await this.syncUserData()
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
