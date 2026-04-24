// pages/running-admin/article-edit.js

function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function () { that.setData({ showToast: false }) }, duration)
}

const CHANNELS = [
  { id: 1, name: '跑步观念' },
  { id: 2, name: '从零开始跑' },
  { id: 3, name: '训练方法' },
  { id: 4, name: '无伤跑步' },
  { id: 5, name: '装备指南' },
  { id: 6, name: '跑步文化' }
]

const SUBCATEGORIES = {
  1: [
    { key: '1.1', name: '跑步前的心理准备' },
    { key: '1.2', name: '跑步认知纠偏' },
    { key: '1.3', name: '正确的跑绩观' },
    { key: '1.4', name: '跑步与健康' },
    { key: '1.5', name: '不同人群建议' }
  ],
  2: [
    { key: '2.1', name: '第一次出门跑' },
    { key: '2.2', name: '走跑交替' },
    { key: '2.3', name: '第一个月常见问题' },
    { key: '2.4', name: '从能跑到跑得舒服' }
  ],
  3: [
    { key: '3.1', name: '跑步关键指标' },
    { key: '3.2', name: '训练方法详解' },
    { key: '3.3', name: '训练计划设计' },
    { key: '3.4', name: '跑步技术' },
    { key: '3.5', name: '交叉训练与力量' }
  ],
  4: [
    { key: '4.1', name: '听懂身体信号' },
    { key: '4.2', name: '损伤预防5原则' },
    { key: '4.3', name: '常见损伤详解' },
    { key: '4.4', name: '受伤了怎么办' },
    { key: '4.5', name: '跑姿与损伤' }
  ],
  5: [
    { key: '5.1', name: '跑鞋' },
    { key: '5.2', name: '运动服装' },
    { key: '5.3', name: '运动手表与心率设备' },
    { key: '5.4', name: '其他装备' }
  ],
  6: [
    { key: '6.1', name: '跑步历史与故事' },
    { key: '6.2', name: '跑步哲学与思考' },
    { key: '6.3', name: '全球跑步文化' },
    { key: '6.4', name: '跑者故事' }
  ]
}

const DIFFICULTY_LEVELS = ['入门级', '基础级', '进阶级', '深度级']

Page({
  data: {
    statusBarHeight: 44,
    isEdit: false,
    articleId: '',
    // 表单字段 - 直接绑定到 data
    title: '',
    channelId: 0,
    channelName: '',
    channelIndex: -1,
    subcategory: '',
    subcategoryName: '',
    subcategoryIndex: -1,
    difficulty: '',
    difficultyIndex: -1,
    readTime: 5,
    order: 0,
    content: '',
    summary: '',
    tags: '',
    isActive: true,
    // 富文本编辑器
    editorCtx: null,
    formatStatus: {},
    // picker 数据源
    channels: CHANNELS,
    channelNames: CHANNELS.map(c => c.name),
    subcategories: [],
    subcategoryNames: [],
    difficultyLevels: DIFFICULTY_LEVELS,
    saving: false,
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 44
    })
    
    if (options && options.id) {
      this.setData({ isEdit: true, articleId: options.id })
      this.loadArticle(options.id)
    }
  },

  // editor 组件初始化完成
  onEditorReady() {
    wx.createSelectorQuery()
      .in(this)
      .select('#editor')
      .context(res => {
        this.editorCtx = res.context
        // 如果是编辑模式，内容已在 loadArticle 阶段暂存
        // 延迟设置以确保 context 就绪
        if (this.data._pendingContent !== undefined) {
          this.editorCtx.setContents({ html: this.data._pendingContent })
          this.setData({ _pendingContent: undefined })
        }
      })
      .exec()
  },

  // 返回按钮
  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/running-admin/running-admin' })
      }
    })
  },

  // 加载文章数据
  loadArticle(id) {
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'running-admin',
      data: { action: 'getArticle', id: id }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        const a = res.result.data
        const channelIndex = CHANNELS.findIndex(c => c.id === a.channel)
        const subs = SUBCATEGORIES[a.channel] || []
        const subIndex = subs.findIndex(s => s.key === a.subcategory)
        const diffIndex = DIFFICULTY_LEVELS.indexOf(a.difficulty)
        
        const content = a.content || ''
        this.setData({
          title: a.title || '',
          channelId: a.channel || 0,
          channelName: CHANNELS[channelIndex]?.name || '',
          channelIndex: channelIndex >= 0 ? channelIndex : -1,
          subcategory: a.subcategory || '',
          subcategoryName: subs[subIndex]?.name || '',
          subcategories: subs,
          subcategoryNames: subs.map(s => s.name),
          subcategoryIndex: subIndex >= 0 ? subIndex : -1,
          difficulty: a.difficulty || '',
          difficultyIndex: diffIndex >= 0 ? diffIndex : -1,
          readTime: a.readTime || 5,
          order: a.order || 0,
          content: content,
          summary: a.summary || '',
          tags: (a.tags || []).join(','),
          isActive: a.isActive !== false,
          // 如果 editor 尚未 ready，暂存内容待 onEditorReady 时写入
          _pendingContent: content
        })
      }
    }).catch(() => {
      wx.hideLoading()
      showNiceToast(this, '加载失败', 'error')
    })
  },

  // 频道选择
  onChannelChange(e) {
    const idx = parseInt(e.detail.value)
    const channel = CHANNELS[idx]
    const subs = SUBCATEGORIES[channel.id] || []
    this.setData({
      channelIndex: idx,
      channelId: channel.id,
      channelName: channel.name,
      subcategories: subs,
      subcategoryNames: subs.map(s => s.name),
      subcategoryIndex: -1,
      subcategory: '',
      subcategoryName: ''
    })
  },

  // 子分类选择
  onSubcategoryChange(e) {
    const idx = parseInt(e.detail.value)
    const sub = this.data.subcategories[idx]
    this.setData({
      subcategoryIndex: idx,
      subcategory: sub.key,
      subcategoryName: sub.name
    })
  },

  // 难度选择
  onDifficultyChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      difficultyIndex: idx,
      difficulty: DIFFICULTY_LEVELS[idx]
    })
  },

  // 输入事件
  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onSummaryInput(e) { this.setData({ summary: e.detail.value }) },
  onTagsInput(e) { this.setData({ tags: e.detail.value }) },
  onReadTimeInput(e) { this.setData({ readTime: parseInt(e.detail.value) || 5 }) },
  onOrderInput(e) { this.setData({ order: parseInt(e.detail.value) || 0 }) },
  onActiveChange(e) { this.setData({ isActive: e.detail.value }) },

  // 富文本编辑器 - 内容变化
  onEditorInput(e) {
    this.setData({ content: e.detail.html })
  },

  // 富文本编辑器 - 格式状态变化（更新工具栏激活态）
  onEditorStatusChange(e) {
    this.setData({ formatStatus: e.detail })
  },

  // 富文本编辑器 - 格式化操作
  onFormatTap(e) {
    const { format, value } = e.currentTarget.dataset
    if (!this.editorCtx) return
    this.editorCtx.format(format, value || true)
  },

  // 富文本编辑器 - 插入图片
  onInsertImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePath = res.tempFilePaths[0]
        wx.showLoading({ title: '上传中...' })
        wx.cloud.uploadFile({
          cloudPath: `article-images/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.jpg`,
          filePath: tempFilePath,
          success: uploadRes => {
            wx.hideLoading()
            this.editorCtx.insertImage({
              src: uploadRes.fileID,
              alt: '图片',
              width: '100%'
            })
          },
          fail: () => {
            wx.hideLoading()
            showNiceToast(this, '图片上传失败', 'error')
          }
        })
      }
    })
  },

  // 保存文章
  onSave() {
    if (this.data.saving) return
    
    const { title, channelId, subcategory, difficulty, content } = this.data
    
    // 验证必填项
    if (!title || !title.trim()) {
      showNiceToast(this, '请输入标题', 'error')
      return
    }
    if (channelId < 0 || this.data.channelIndex < 0) {
      showNiceToast(this, '请选择频道', 'error')
      return
    }
    if (!subcategory || this.data.subcategoryIndex < 0) {
      showNiceToast(this, '请选择子分类', 'error')
      return
    }
    if (this.data.difficultyIndex < 0) {
      showNiceToast(this, '请选择难度等级', 'error')
      return
    }
    if (!content || !content.trim()) {
      showNiceToast(this, '请输入正文内容', 'error')
      return
    }

    this.setData({ saving: true })
    const tags = this.data.tags.split(',').map(t => t.trim()).filter(Boolean)

    wx.cloud.callFunction({
      name: 'running-admin',
      data: {
        action: 'saveArticle',
        id: this.data.isEdit ? this.data.articleId : undefined,
        title: title.trim(),
        channel: channelId,
        subcategory: subcategory,
        difficulty: difficulty,
        readTime: this.data.readTime,
        order: this.data.order,
        content: content,
        summary: this.data.summary.trim().slice(0, 60),
        tags: tags,
        isActive: this.data.isActive
      }
    }).then(res => {
      this.setData({ saving: false })
      if (res.result && res.result.code === 0) {
        showNiceToast(this, '保存成功', 'success')
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: '/pages/running-admin/running-admin' })
            }
          })
        }, 1500)
      } else {
        showNiceToast(this, res.result?.message || '保存失败', 'error')
      }
    }).catch(() => {
      this.setData({ saving: false })
      showNiceToast(this, '保存失败', 'error')
    })
  }
})
