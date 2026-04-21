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
  1: [{ key: '1.1', name: '跑步前的心理准备' }, { key: '1.2', name: '跑步认知纠偏' }, { key: '1.3', name: '正确的跑绩观' }, { key: '1.4', name: '跑步与健康' }, { key: '1.5', name: '不同人群建议' }],
  2: [{ key: '2.1', name: '第一次出门跑' }, { key: '2.2', name: '走跑交替' }, { key: '2.3', name: '第一个月常见问题' }, { key: '2.4', name: '从能跑到跑得舒服' }],
  3: [{ key: '3.1', name: '跑步关键指标' }, { key: '3.2', name: '训练方法详解' }, { key: '3.3', name: '训练计划设计' }, { key: '3.4', name: '跑步技术' }, { key: '3.5', name: '交叉训练与力量' }],
  4: [{ key: '4.1', name: '听懂身体信号' }, { key: '4.2', name: '损伤预防5原则' }, { key: '4.3', name: '常见损伤详解' }, { key: '4.4', name: '受伤了怎么办' }, { key: '4.5', name: '跑姿与损伤' }],
  5: [{ key: '5.1', name: '跑鞋' }, { key: '5.2', name: '运动服装' }, { key: '5.3', name: '运动手表与心率设备' }, { key: '5.4', name: '其他装备' }],
  6: [{ key: '6.1', name: '跑步历史与故事' }, { key: '6.2', name: '跑步哲学与思考' }, { key: '6.3', name: '全球跑步文化' }, { key: '6.4', name: '跑者故事' }]
}

const DIFFICULTIES = ['入门级', '基础级', '进阶级', '深度级']

Page({
  data: {
    statusBarHeight: 0,
    isEdit: false,
    articleId: '',
    // 表单字段
    title: '',
    channelId: 0,
    channelName: '',
    subcategory: '',
    subcategoryName: '',
    difficulty: '',
    readTime: 5,
    order: 0,
    content: '',
    summary: '',
    tags: '',
    isActive: true,
    // picker数据
    channels: CHANNELS,
    channelNames: CHANNELS.map(c => c.name),
    subcategories: [],
    subcategoryNames: [],
    difficulties: DIFFICULTIES,
    difficultyIndex: -1,
    channelIndex: -1,
    subcategoryIndex: -1,
    saving: false,
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    if (options && options.id) {
      this.setData({ isEdit: true, articleId: options.id })
      this.loadArticle(options.id)
    }
  },

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
        const diffIndex = DIFFICULTIES.indexOf(a.difficulty)
        this.setData({
          title: a.title || '',
          channelId: a.channel || 0,
          channelName: CHANNELS[channelIndex]?.name || '',
          channelIndex: channelIndex,
          subcategory: a.subcategory || '',
          subcategoryName: subs[subIndex]?.name || '',
          subcategories: subs,
          subcategoryNames: subs.map(s => s.name),
          subcategoryIndex: subIndex,
          difficulty: a.difficulty || '',
          difficultyIndex: diffIndex,
          readTime: a.readTime || 5,
          order: a.order || 0,
          content: a.content || '',
          summary: a.summary || '',
          tags: (a.tags || []).join(','),
          isActive: a.isActive !== false
        })
      }
    }).catch(() => {
      wx.hideLoading()
      showNiceToast(this, '加载失败', 'error')
    })
  },

  onChannelChange(e) {
    const idx = e.detail.value
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

  onSubcategoryChange(e) {
    const idx = e.detail.value
    const sub = this.data.subcategories[idx]
    this.setData({
      subcategoryIndex: idx,
      subcategory: sub.key,
      subcategoryName: sub.name
    })
  },

  onDifficultyChange(e) {
    const idx = e.detail.value
    this.setData({
      difficultyIndex: idx,
      difficulty: DIFFICULTIES[idx]
    })
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onContentInput(e) { this.setData({ content: e.detail.value }) },
  onSummaryInput(e) { this.setData({ summary: e.detail.value }) },
  onTagsInput(e) { this.setData({ tags: e.detail.value }) },
  onReadTimeInput(e) { this.setData({ readTime: parseInt(e.detail.value) || 5 }) },
  onOrderInput(e) { this.setData({ order: parseInt(e.detail.value) || 0 }) },
  onActiveChange(e) { this.setData({ isActive: e.detail.value }) },

  saveArticle() {
    const { title, channelId, subcategory, difficulty, content } = this.data
    if (!title.trim()) { showNiceToast(this, '请输入标题', 'error'); return }
    if (!channelId) { showNiceToast(this, '请选择频道', 'error'); return }
    if (!subcategory) { showNiceToast(this, '请选择子分类', 'error'); return }
    if (!difficulty) { showNiceToast(this, '请选择难度等级', 'error'); return }
    if (!content.trim()) { showNiceToast(this, '请输入正文内容', 'error'); return }

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
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        showNiceToast(this, res.result?.msg || '保存失败', 'error')
      }
    }).catch(() => {
      this.setData({ saving: false })
      showNiceToast(this, '保存失败', 'error')
    })
  }
})