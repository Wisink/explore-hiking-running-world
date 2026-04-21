function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}
// pages/checklist/checklist.js
const app = getApp()

Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    headerHeight: 0,
    trailId: '',
    trailName: '路线',
    // 装备清单数据
    equipment: {
      must: [],
      suggest: [],
      noNeed: []
    },
    // 自定义物品
    customItems: [],
    // 勾选状态（key = category-index）
    checkedMap: {},
    // 统计
    totalCount: 0,
    checkedCount: 0,
    // Canvas
    canvasHidden: true,
    // 加载状态
    loading: false,
    loadingMsg: ''
  },

  onLoad: function (options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      headerHeight: wx.getSystemInfoSync().statusBarHeight + 44,
      loading: true,
      loadingMsg: '正在根据路线信息为你推荐装备清单，请稍候...'
    })
    const trailId = options.id || ''
    const trailName = options.name ? decodeURIComponent(options.name) : ''
    // 加载自定义物品缓存
    const customCacheKey = `customItems_${trailId}`
    const customItems = wx.getStorageSync(customCacheKey) || []
    this.setData({ trailId, trailName, customItems })
    this.loadChecklist()
  },

  // 加载清单数据（优先缓存秒开，后台静默刷新）
  loadChecklist: function () {
    const cacheKey = `checklist_${this.data.trailId}`
    const cachedChecked = wx.getStorageSync(cacheKey) || {}

    if (!this.data.trailId) {
      this.setDefaultEquipment(cachedChecked)
      return
    }

    // 尝试从缓存恢复推荐结果（秒开）
    const recCacheKey = `recommendation_${this.data.trailId}`
    const recCache = wx.getStorageSync(recCacheKey)
    const CACHE_TTL = 3600000 // 1小时
    const now = Date.now()

    if (recCache && recCache.data && (now - recCache.timestamp < CACHE_TTL)) {
      // 缓存命中 → 立即展示
      const data = recCache.data
      const equipment = {
        must: (data.must || []).map(item => ({
          name: item.icon ? `${item.icon} ${item.name}` : item.name,
          reason: item.reason || ''
        })),
        suggest: (data.suggested || []).map(item => ({
          name: item.icon ? `${item.icon} ${item.name}` : item.name,
          reason: item.reason || ''
        })),
        noNeed: (data.notNeeded || []).map(item => ({
          name: item.icon ? `${item.icon} ${item.name}` : item.name,
          reason: item.reason || ''
        }))
      }
      this.setData({
        trailName: data.trailName || this.data.trailName,
        loading: false
      })
      this.processEquipment(equipment, cachedChecked)

      // 后台静默刷新（不阻塞UI）
      this._backgroundRefresh(cachedChecked)
      return
    }

    // 无缓存 → 正常加载
    this._callRecommendation(cachedChecked, 2)
  },

  // 后台静默刷新推荐结果
  _backgroundRefresh: function (cachedChecked) {
    wx.cloud.callFunction({
      name: 'getRecommendation',
      data: { trailId: this.data.trailId },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          // 更新缓存
          wx.setStorageSync(`recommendation_${this.data.trailId}`, {
            data: data,
            timestamp: Date.now()
          })
          // 更新UI（仅在数据有变化时）
          const equipment = {
            must: (data.must || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            })),
            suggest: (data.suggested || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            })),
            noNeed: (data.notNeeded || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            }))
          }
          this.setData({
            trailName: data.trailName || this.data.trailName
          })
          this.processEquipment(equipment, cachedChecked)
        }
      },
      fail: () => { /* 静默失败，已有缓存兜底 */ }
    })
  },

  // 带重试的装备推荐请求
  _callRecommendation: function (cachedChecked, retriesLeft) {
    wx.cloud.callFunction({
      name: 'getRecommendation',
      data: { trailId: this.data.trailId },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          const equipment = {
            must: (data.must || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            })),
            suggest: (data.suggested || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            })),
            noNeed: (data.notNeeded || []).map(item => ({
              name: item.icon ? `${item.icon} ${item.name}` : item.name,
              reason: item.reason || ''
            }))
          }
          this.setData({
            trailName: data.trailName || this.data.trailName,
            loading: false
          })
          // 写入本地缓存
          wx.setStorageSync(`recommendation_${this.data.trailId}`, {
            data: data,
            timestamp: Date.now()
          })
          this.processEquipment(equipment, cachedChecked)
        } else if (retriesLeft > 0) {
          setTimeout(() => this._callRecommendation(cachedChecked, retriesLeft - 1), 500)
        } else {
          this.setDefaultEquipment(cachedChecked)
          this.setData({ loading: false })
        }
      },
      fail: () => {
        if (retriesLeft > 0) {
          setTimeout(() => this._callRecommendation(cachedChecked, retriesLeft - 1), 500)
        } else {
          this.setDefaultEquipment(cachedChecked)
          this.setData({ loading: false })
        }
      }
    })
  },

  // 处理装备数据（支持 { name, reason } 对象格式和纯字符串格式）
  processEquipment: function (equipment, cachedChecked) {
    const normalize = (item) => {
      if (typeof item === 'string') return { name: item, reason: '' }
      return { name: item.name || '', reason: item.reason || '' }
    }

    const must = (equipment.must || []).map((raw, i) => {
      const item = normalize(raw)
      return {
        id: `must-${i}`,
        name: item.name,
        reason: item.reason,
        displayName: item.reason ? `${item.name}（${item.reason}）` : item.name,
        checked: !!cachedChecked[`must-${i}`]
      }
    })

    const suggest = (equipment.suggest || []).map((raw, i) => {
      const item = normalize(raw)
      return {
        id: `suggest-${i}`,
        name: item.name,
        reason: item.reason,
        displayName: item.reason ? `${item.name}（${item.reason}）` : item.name,
        checked: !!cachedChecked[`suggest-${i}`]
      }
    })

    const noNeed = (equipment.noNeed || []).map((raw, i) => {
      const item = normalize(raw)
      return {
        id: `noNeed-${i}`,
        name: item.name,
        reason: item.reason,
        displayName: item.reason ? `${item.name}（${item.reason}）` : item.name,
        checked: !!cachedChecked[`noNeed-${i}`]
      }
    })

    // 合并自定义物品
    const customItems = (this.data.customItems || []).map((item, i) => ({
      id: `custom-${i}`,
      name: item.name,
      reason: item.reason || '',
      displayName: item.reason ? `${item.name}（${item.reason}）` : item.name,
      checked: !!cachedChecked[`custom-${i}`],
      isCustom: true
    }))
    // 自定义物品默认加入 suggest 分类
    const allSuggest = [...suggest, ...customItems]

    const totalCount = must.length + allSuggest.length
    const checkedCount = [...must, ...allSuggest, ...noNeed].filter(i => i.checked).length

    this.setData({
      equipment: { must, suggest: allSuggest, noNeed },
      totalCount,
      checkedCount
    })
  },

  // 设置默认装备
  setDefaultEquipment: function (cachedChecked) {
    this.processEquipment(this.getDefaultEquipment(), cachedChecked)
  },

  getDefaultEquipment: function () {
    return {
      must: [
        { name: '防滑运动鞋', reason: '路面有碎石' },
        { name: '饮用水 1.5L', reason: '沿途无补给点' },
        { name: '干粮/路餐', reason: '补充体力' },
        { name: '手机充满电', reason: '导航和紧急联系' },
        { name: '少量现金', reason: '部分区域无网络' },
        { name: '身份证', reason: '景区可能查验' }
      ],
      suggest: [
        { name: '登山杖', reason: '减轻膝盖负担' },
        { name: '防晒帽', reason: '山顶紫外线强' },
        { name: '防晒霜', reason: '长时间户外' },
        { name: '充电宝', reason: '手机续航' },
        { name: '创可贴', reason: '防磨脚' },
        { name: '湿纸巾', reason: '擦汗清洁' },
        { name: '垃圾袋', reason: '无痕山林' }
      ],
      noNeed: [
        { name: '帐篷', reason: '当日往返' },
        { name: '睡袋', reason: '不住宿' },
        { name: '炊具', reason: '带干粮即可' },
        { name: '绳索', reason: '非攀岩路线' },
        { name: '专业攀岩装备', reason: '无需技术攀登' }
      ]
    }
  },

  // 勾选/取消勾选
  onCheckItem: function (e) {
    const id = e.currentTarget.dataset.id
    const category = e.currentTarget.dataset.category
    const index = e.currentTarget.dataset.index

    // 更新勾选状态
    const equipment = { ...this.data.equipment }
    const items = [...equipment[category]]
    items[index] = { ...items[index], checked: !items[index].checked }
    equipment[category] = items

    // 更新统计
    const checkedCount = Object.values(equipment).flat().filter(i => i.checked).length

    // 保存到缓存
    const cacheKey = `checklist_${this.data.trailId}`
    const checkedMap = { ...this.data.checkedMap }
    checkedMap[id] = items[index].checked
    wx.setStorageSync(cacheKey, checkedMap)

    this.setData({ equipment, checkedCount, checkedMap })

    // 同步到云端（B4）
    this.syncChecklistToCloud(checkedMap)
  },

  // 同步勾选状态到云端
  syncChecklistToCloud: function (checkedMap) {
    try {
      const cloudSync = require('../../utils/cloud-sync.js')
      cloudSync.syncChecklist(this.data.trailId, checkedMap, this.data.customItems)
    } catch (err) {
      console.error('同步清单到云端失败：', err)
    }
  },

  // 添加自定义物品（B2）
  onAddCustomItem: function () {
    wx.showModal({
      title: '添加自定义物品',
      editable: true,
      placeholderText: '输入物品名称',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = res.content.trim()
          const customItems = [...this.data.customItems, { name, reason: '' }]
          
          // 保存到缓存
          const customCacheKey = `customItems_${this.data.trailId}`
          wx.setStorageSync(customCacheKey, customItems)

          this.setData({ customItems })

          // 重新处理装备数据
          const cacheKey = `checklist_${this.data.trailId}`
          const cachedChecked = wx.getStorageSync(cacheKey) || {}
          
          // 需要重新加载完整装备数据来重新处理
          const must = this.data.equipment.must.filter(i => !i.isCustom)
          const suggest = this.data.equipment.suggest.filter(i => !i.isCustom)
          const noNeed = this.data.equipment.noNeed
          
          // 重新合并
          const customProcessed = customItems.map((item, i) => ({
            id: `custom-${i}`,
            name: item.name,
            reason: item.reason || '',
            displayName: item.reason ? `${item.name}（${item.reason}）` : item.name,
            checked: !!cachedChecked[`custom-${i}`],
            isCustom: true
          }))

          const allSuggest = [...suggest, ...customProcessed]
          const totalCount = must.length + allSuggest.length
          const checkedCount = [...must, ...allSuggest, ...noNeed].filter(i => i.checked).length

          this.setData({
            equipment: { must, suggest: allSuggest, noNeed },
            totalCount,
            checkedCount
          })

          showNiceToast(this, '已添加', 'success', 2000)
        }
      }
    })
  },

  // 重置清单
  onReset: function () {
    wx.showModal({
      title: '重置清单',
      content: '确定要清除所有勾选状态吗？',
      confirmText: '重置',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          const equipment = { ...this.data.equipment }
          Object.keys(equipment).forEach(category => {
            equipment[category] = equipment[category].map(item => ({
              ...item,
              checked: false
            }))
          })

          // 清除缓存
          const cacheKey = `checklist_${this.data.trailId}`
          wx.removeStorageSync(cacheKey)

          this.setData({
            equipment,
            checkedCount: 0,
            checkedMap: {}
          })

          showNiceToast(this, '已重置', 'success', 2000)
        }
      }
    })
  },

  // 分享清单（生成图片）
  onShareChecklist: function () {
    wx.showLoading({ title: '生成图片中...' })

    const query = wx.createSelectorQuery()
    query.select('#checklist-canvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) {
        wx.hideLoading()
        // 降级方案：使用系统分享
        this.onShareFallback()
        return
      }

      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio

      // 设置画布尺寸
      const width = 600
      const height = this.calculateCanvasHeight()
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      // 绘制背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)

      // 绘制标题区域
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(0, 0, width, 100)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText('🎒 装备清单', 30, 55)

      ctx.font = '16px sans-serif'
      ctx.fillText(this.data.trailName, 30, 82)

      // 提示文案
      ctx.fillStyle = '#FF6D00'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText('⚠️ 请按清单准备，逐项打勾 ✅', 30, 115)

      // 进度条（分享时显示为空白清单）
      ctx.fillStyle = '#E0E0E0'
      ctx.fillRect(30, 130, width - 60, 8)

      ctx.fillStyle = '#333'
      ctx.font = '14px sans-serif'
      ctx.fillText(`共 ${this.data.totalCount} 项`, 30, 158)

      // ===== 先绘制所有内容 =====
      let y = 188
      const categories = [
        { key: 'must', title: '🔴 必须带', color: '#F44336' },
        { key: 'suggest', title: '🟡 建议带', color: '#FF9800' },
        { key: 'noNeed', title: '🟢 不用带', color: '#4CAF50' }
      ]

      // 文字自动换行绘制，返回实际占用行数
      const wrapText = (text, x, startY, maxWidth, lineHeight, font, color) => {
        ctx.font = font
        ctx.fillStyle = color
        let line = ''
        let y = startY
        for (let i = 0; i < text.length; i++) {
          const testLine = line + text[i]
          if (ctx.measureText(testLine).width > maxWidth && line) {
            ctx.fillText(line, x, y)
            line = text[i]
            y += lineHeight
          } else {
            line = testLine
          }
        }
        if (line) {
          ctx.fillText(line, x, y)
          y += lineHeight
        }
        return y - startY // 返回总高度
      }

      categories.forEach(cat => {
        const items = this.data.equipment[cat.key]
        if (items.length === 0) return

        ctx.fillStyle = cat.color
        ctx.font = 'bold 18px sans-serif'
        ctx.fillText(cat.title, 30, y)
        y += 30

        items.forEach(item => {
          // 勾选框
          ctx.strokeStyle = '#CCC'
          ctx.lineWidth = 1
          ctx.strokeRect(40, y - 14, 16, 16)

          // 换行绘制装备名+理由
          const displayText = item.reason ? `${item.name}（${item.reason}）` : item.name
          const textX = 66
          const maxTextWidth = width - textX - 30 // 右边留 30px 间距
          const used = wrapText(displayText, textX, y, maxTextWidth, 22, '15px sans-serif', '#333')
          y += used + 6
        })

        y += 10
      })

      // ===== 动态调整画布高度（裁掉底部空白） =====
      const footerHeight = 55 // 底部留白 + 两行提示文字
      const finalHeight = y + footerHeight

      // 读取已绘制的像素内容
      const imageData = ctx.getImageData(0, 0, canvas.width, Math.min(canvas.height, finalHeight * dpr))

      // 重设画布尺寸
      canvas.height = finalHeight * dpr
      ctx.scale(dpr, dpr)

      // 重绘背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, finalHeight)

      // 还原已绘制的内容
      ctx.putImageData(imageData, 0, 0)

      // 绘制底部提示
      ctx.fillStyle = '#999'
      ctx.font = '14px sans-serif'
      ctx.fillText('长按图片进行分享或保存', width / 2 - 85, finalHeight - 30)

      ctx.fillStyle = '#CCC'
      ctx.font = '12px sans-serif'
      ctx.fillText('秦人徒步 · 安全出行', width / 2 - 60, finalHeight - 10)

      // 导出图片
      wx.canvasToTempFilePath({
        canvas: canvas,
        success: (res) => {
          wx.hideLoading()
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          })
        },
        fail: () => {
          wx.hideLoading()
          this.onShareFallback()
        }
      })
    })
  },

  // 计算画布高度（考虑文字换行，每项按 60px 估算）
  calculateCanvasHeight: function () {
    let height = 178 // 标题区域 + 提示文案
    const categories = ['must', 'suggest', 'noNeed']
    categories.forEach(key => {
      const items = this.data.equipment[key]
      if (items.length > 0) {
        height += 40 // 分类标题
        height += items.length * 60 // 每项按 60px 估算（含换行+间距）
        height += 10 // 间距
      }
    })
    height += 0 // 底部留白
    return height
  },

  // 降级分享方案（B3：文本分享）
  onShareFallback: function () {
    const categories = [
      { key: 'must', title: '🔴 必须带' },
      { key: 'suggest', title: '🟡 建议带' },
      { key: 'noNeed', title: '🟢 不用带' }
    ]

    let text = `🎒 ${this.data.trailName} - 装备清单\n\n⚠️ 请按清单准备，逐项打勾 ✅\n\n`
    categories.forEach(cat => {
      const items = this.data.equipment[cat.key]
      if (items.length === 0) return
      text += `${cat.title}\n`
      items.forEach(item => {
        const displayText = item.reason ? `${item.name}（${item.reason}）` : item.name
        text += `⬜ ${displayText}\n`
      })
      text += '\n'
    })
    text += '— 秦人徒步 · 安全出行 —'

    wx.setClipboardData({
      data: text,
      success: () => {
        showNiceToast(this, '清单已复制，可粘贴分享', 'success', 2000)
      }
    })
  },

  // 返回
  onGoBack: function () {
    wx.navigateBack()
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `${this.data.trailName} - 装备清单`,
      path: `/pages/checklist/checklist?id=${this.data.trailId}`
    }
  }
})
