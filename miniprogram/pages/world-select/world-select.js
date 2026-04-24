// pages/world-select/world-select.js
Page({
  data: {
    statusBarHeight: 0
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
  },

  selectWorld(e) {
    const world = e.currentTarget.dataset.world
    // 保存选择
    wx.setStorageSync('world', world)
    getApp().globalData.world = world
    this._navigateToWorld(world)
  },

  _navigateToWorld(world) {
    if (world === 'running') {
      wx.switchTab({ url: '/pages/running-home/running-home' })
    } else {
      wx.switchTab({ url: '/pages/routes/routes' })
    }
  }
})