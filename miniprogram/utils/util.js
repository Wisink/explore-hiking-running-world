/**
 * 工具函数库
 */

// ========== 格式化函数 ==========

/**
 * 格式化难度 - 返回难度级别、颜色和文字
 * @param {number|string|object} level - 难度级别(1-5)或字符串('初级')或对象
 * @returns {object} { level, color, text }
 */
function formatDifficulty(level) {
  if (!level) return { level: 0, color: '#9E9E9E', text: '未知' }
  // 如果是对象，提取level字段
  if (typeof level === 'object') {
    return {
      level: level.level || 0,
      color: level.color || getColor(level.level),
      text: level.text || level.label || '未知'
    }
  }
  // 数字级别
  if (typeof level === 'number') {
    return { level, color: getColor(level), text: getText(level) }
  }
  // 字符串映射（兼容本地数据格式）
  const strMap = {
    '初级': { level: 1 },
    '中级': { level: 3 },
    '中级-高级': { level: 4 },
    '高级': { level: 5 },
    '挑战': { level: 5 }
  }
  const mapped = strMap[level]
  if (mapped) return { level: mapped.level, color: getColor(mapped.level), text: getText(mapped.level) }
  return { level: 0, color: '#9E9E9E', text: String(level) }
}

function getColor(level) {
  const colors = { 1: '#4CAF50', 2: '#FFC107', 3: '#FFC107', 4: '#FF9800', 5: '#F44336' }
  return colors[level] || '#9E9E9E'
}

function getText(level) {
  const texts = { 1: '轻松', 2: '适中', 3: '适中', 4: '较难', 5: '困难' }
  return texts[level] || '未知'
}

/**
 * 格式化费用展示
 * @param {string|object} cost - 费用信息
 * @returns {string}
 */
function formatCost(cost) {
  if (!cost) return '免费'
  if (typeof cost === 'object') {
    return cost.type === '免费' ? '免费' : `${cost.note || ''} ${cost.amount ? cost.amount + '元' : ''}`.trim()
  }
  return cost
}

/**
 * 格式化距离展示
 * @param {number} km - 公里数
 * @returns {string}
 */
function formatDistance(km) {
  if (!km) return ''
  km = parseFloat(km)
  if (isNaN(km)) return String(km)
  return km >= 1 ? `${km}公里` : `${Math.round(km * 1000)}米`
}

/**
 * 格式化时间展示
 * @param {number} hours - 小时数
 * @returns {string}
 */
function formatDuration(hours) {
  if (!hours) return ''
  hours = parseFloat(hours)
  if (isNaN(hours)) return String(hours)
  return hours >= 1 ? `${hours}小时` : `${Math.round(hours * 60)}分钟`
}

/**
 * 格式化日期
 * @param {string|Date|number} dateStr - 日期字符串/对象/时间戳
 * @param {string} fmt - 格式模板 YYYY-MM-DD HH:mm:ss
 * @returns {string}
 */
const formatDate = (date, fmt = 'YYYY-MM-DD') => {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')
  
  return fmt
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

/**
 * 格式化相对时间
 */
const formatRelativeTime = (date) => {
  if (!date) return ''
  const now = new Date()
  const d = new Date(date)
  const diff = now - d
  
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  
  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前'
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前'
  } else if (diff < month) {
    return Math.floor(diff / day) + '天前'
  } else {
    return formatDate(date, 'YYYY-MM-DD')
  }
}

/**
 * 防抖函数
 */
const debounce = (fn, delay = 300) => {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 */
const throttle = (fn, delay = 300) => {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last > delay) {
      last = now
      fn.apply(this, args)
    }
  }
}

/**
 * 生成星级显示
 */
const generateStars = (rating) => {
  const fullStars = Math.floor(rating)
  const halfStar = rating % 1 >= 0.5 ? 1 : 0
  const emptyStars = 5 - fullStars - halfStar
  return {
    full: fullStars,
    half: halfStar,
    empty: emptyStars,
    text: `${rating}星`
  }
}

/**
 * 检查字段是否为空（用于隐藏空字段）
 */
const isEmpty = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && Object.keys(value).length === 0) return true
  return false
}

/**
 * 安全访问嵌套对象属性，避免 TypeError
 * @param {Object} obj - 目标对象
 * @param {string} path - 路径字符串，如 'user.profile.name'
 * @param {*} defaultVal - 默认值
 * @returns {any} 属性值或默认值
 */
function safeGet(obj, path, defaultVal) {
  if (!obj || !path) return defaultVal
  const parts = path.split('.')
  let result = obj
  for (const key of parts) {
    if (result == null || typeof result !== 'object') return defaultVal
    result = result[key]
  }
  return result !== undefined ? result : defaultVal
}

/**
 * 显示成功提示
 */
const showSuccess = (title = '操作成功') => {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 */
const showError = (title = '操作失败') => {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 2000
  })
}

/**
 * 显示加载中
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title: title,
    mask: true
  })
}

/**
 * 隐藏加载中
 */
const hideLoading = () => {
  wx.hideLoading()
}

/**
 * 确认对话框
 */
const confirm = (content, title = '提示') => {
  return new Promise((resolve) => {
    wx.showModal({
      title: title,
      content: content,
      success: (res) => {
        resolve(res.confirm)
      }
    })
  })
}

/**
 * 获取当前季节
 */
const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return '春季'
  if (month >= 6 && month <= 8) return '夏季'
  if (month >= 9 && month <= 11) return '秋季'
  return '冬季'
}

/**
 * 跳转页面（支持tab页面）
 */
const navigateTo = (url, isTab = false) => {
  if (isTab) {
    wx.switchTab({ url })
  } else {
    wx.navigateTo({ url })
  }
}

/**
 * 返回上一页
 */
const navigateBack = (delta = 1) => {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack({ delta })
  } else {
    wx.switchTab({ url: '/pages/routes/routes' })
  }
}

module.exports = {
  formatDifficulty,
  formatCost,
  formatDistance,
  formatDuration,
  formatDate,
  formatRelativeTime,
  debounce,
  throttle,
  generateStars,
  isEmpty,
  safeGet,
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  confirm,
  getCurrentSeason,
  navigateTo,
  navigateBack
}
