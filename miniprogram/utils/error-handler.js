/**
 * 统一错误处理工具
 */

function showToast(msg, icon = 'none') {
  wx.showToast({ title: msg, icon, duration: 2000 })
}

function handleError(err, fallback = '操作失败，请稍后重试') {
  console.error('Error:', err)
  if (err && err.message) {
    showToast(err.message)
  } else {
    showToast(fallback)
  }
}

function handleNetworkError(fallback = '网络连接异常，请检查网络') {
  showToast(fallback)
}

function handleSyncError(fallback = '同步失败，将在网络恢复后重试') {
  showToast(fallback, 'info')
}

module.exports = { showToast, handleError, handleNetworkError, handleSyncError }
