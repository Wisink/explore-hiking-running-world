// pages/checklist/checklist.js
const app = getApp()

Page({
  data: {
    trailId: '',
    trailName: '路线',
    // 装备清单数据
    equipment: {
      must: [],
      suggest: [],
      noNeed: []
    },
    // 勾选状态（key = category-index）
    checkedMap: {},
    // 统计
    totalCount: 0,
    checkedCount: 0,
    // Canvas
    canvasHidden: true
  },

  onLoad: function (options) {
    const trailId = options.id || ''
    const trailName = options.name ? decodeURIComponent(options.name) : ''
    this.setData({ trailId, trailName })
    this.loadChecklist()
  },

  // 加载清单数据
  loadChecklist: function () {
    // 先尝试从缓存恢复勾选状态
    const cacheKey = `checklist_${this.data.trailId}`
    const cachedChecked = wx.getStorageSync(cacheKey) || {}

    if (!this.data.trailId) {
      this.setDefaultEquipment(cachedChecked)
      return
    }

    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: 'getDetail',
        id: this.data.trailId
      },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const data = res.result.data
          const equipment = data.equipment || this.getDefaultEquipment()
          this.setData({ trailName: data.name || this.data.trailName })
          this.processEquipment(equipment, cachedChecked)
        } else {
          this.setDefaultEquipment(cachedChecked)
        }
      },
      fail: () => {
        this.setDefaultEquipment(cachedChecked)
      }
    })
  },

  // 处理装备数据
  processEquipment: function (equipment, cachedChecked) {
    const must = (equipment.must || []).map((name, i) => ({
      id: `must-${i}`,
      name: name,
      checked: !!cachedChecked[`must-${i}`]
    }))

    const suggest = (equipment.suggest || []).map((name, i) => ({
      id: `suggest-${i}`,
      name: name,
      checked: !!cachedChecked[`suggest-${i}`]
    }))

    const noNeed = (equipment.noNeed || []).map((name, i) => ({
      id: `noNeed-${i}`,
      name: name,
      checked: !!cachedChecked[`noNeed-${i}`]
    }))

    const totalCount = must.length + suggest.length + noNeed.length
    const checkedCount = [...must, ...suggest, ...noNeed].filter(i => i.checked).length

    this.setData({
      equipment: { must, suggest, noNeed },
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
      must: ['徒步鞋（防滑）', '饮用水 1.5L', '干粮/路餐', '手机充满电', '少量现金', '身份证'],
      suggest: ['登山杖', '防晒帽', '防晒霜', '充电宝', '创可贴', '湿纸巾', '垃圾袋'],
      noNeed: ['帐篷', '睡袋', '炊具', '绳索', '专业攀岩装备']
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

          wx.showToast({ title: '已重置', icon: 'success' })
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
      ctx.fillText('🎒 行前清单', 30, 55)

      ctx.font = '16px sans-serif'
      ctx.fillText(this.data.trailName, 30, 82)

      // 进度条
      const progress = this.data.totalCount > 0 ? this.data.checkedCount / this.data.totalCount : 0
      ctx.fillStyle = '#E0E0E0'
      ctx.fillRect(30, 115, width - 60, 8)
      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(30, 115, (width - 60) * progress, 8)

      ctx.fillStyle = '#333'
      ctx.font = '14px sans-serif'
      ctx.fillText(`已准备 ${this.data.checkedCount}/${this.data.totalCount} 项`, 30, 145)

      // 绘制清单项
      let y = 170
      const categories = [
        { key: 'must', title: '🔴 必须带', color: '#F44336' },
        { key: 'suggest', title: '🟡 建议带', color: '#FF9800' },
        { key: 'noNeed', title: '🟢 不用带', color: '#4CAF50' }
      ]

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

          if (item.checked) {
            ctx.fillStyle = '#2E7D32'
            ctx.fillRect(42, y - 12, 12, 12)
            ctx.fillStyle = '#999'
          } else {
            ctx.fillStyle = '#333'
          }

          ctx.font = '15px sans-serif'
          ctx.fillText(item.name, 66, y)
          y += 28
        })

        y += 10
      })

      // 底部水印
      ctx.fillStyle = '#CCC'
      ctx.font = '12px sans-serif'
      ctx.fillText('秦人徒步 · 安全出行', width / 2 - 60, height - 20)

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

  // 计算画布高度
  calculateCanvasHeight: function () {
    let height = 160 // 标题区域
    const categories = ['must', 'suggest', 'noNeed']
    categories.forEach(key => {
      const items = this.data.equipment[key]
      if (items.length > 0) {
        height += 40 // 分类标题
        height += items.length * 28 // 每项
        height += 10 // 间距
      }
    })
    height += 40 // 底部
    return height
  },

  // 降级分享方案
  onShareFallback: function () {
    const categories = [
      { key: 'must', title: '🔴 必须带' },
      { key: 'suggest', title: '🟡 建议带' },
      { key: 'noNeed', title: '🟢 不用带' }
    ]

    let text = `🎒 ${this.data.trailName} - 行前清单\n\n`
    categories.forEach(cat => {
      const items = this.data.equipment[cat.key]
      if (items.length === 0) return
      text += `${cat.title}\n`
      items.forEach(item => {
        text += `${item.checked ? '✅' : '⬜'} ${item.name}\n`
      })
      text += '\n'
    })
    text += '— 秦人徒步 · 安全出行 —'

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '清单已复制，可粘贴分享', icon: 'none' })
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
      title: `${this.data.trailName} - 行前清单`,
      path: `/pages/checklist/checklist?id=${this.data.trailId}`
    }
  }
})
