/**
 * 修复数据库中负数点赞数和收藏数
 * 在微信开发者工具的控制台中运行此代码
 */

// 调用云函数修复负数问题
wx.cloud.callFunction({
  name: 'trail',
  data: {
    action: 'fixNegativeCounts'
  },
  success: (res) => {
    console.log('修复结果:', res.result)
    if (res.result.code === 0) {
      wx.showToast({
        title: res.result.msg,
        icon: 'success'
      })
    } else {
      wx.showToast({
        title: res.result.msg,
        icon: 'none'
      })
    }
  },
  fail: (err) => {
    console.error('修复失败:', err)
    wx.showToast({
      title: '修复失败，请重试',
      icon: 'none'
    })
  }
})
