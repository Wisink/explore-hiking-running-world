// pages/welcome/welcome.js
Page({
  data: {},

  onLoad: function () {
    // 检查是否首次打开
    const hasLaunched = wx.getStorageSync('hasLaunched')
    if (hasLaunched) {
      // 非首次打开，直接跳转首页
      wx.switchTab({
        url: '/pages/home/home'
      })
    }
  },

  // 点击开始探索
  onStart: function () {
    // 标记已看过欢迎页
    wx.setStorageSync('hasLaunched', true)
    
    // 跳转到首页
    wx.switchTab({
      url: '/pages/home/home'
    })
  }
})
