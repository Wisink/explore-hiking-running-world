// pages/admin/route-edit.js
Page({
  data: {
    id: '',
    type: 'route', // route | article
    loading: true,
    saving: false,

    // 路线表单
    form: {
      name: '',
      description: '',
      coverImage: '',
      location: '',
      distance_km: '',
      duration_hours: '',
      difficulty_level: 1,
      cost: '',
      scenery: [],
      sections: []
    },

    // 文章表单
    articleForm: {
      title: '',
      category: '',
      content: '',
      author: ''
    },

    // 难度选项
    difficultyOptions: ['轻松', '初级', '中级', '高级', '挑战'],

    // scenery 编辑
    sceneryInput: '',

    // Toast
    showToast: false,
    toastMessage: '',
    toastType: 'info'
  },

  onLoad(options) {
    const id = options.id || ''
    const type = options.type || 'route'
    this.setData({ id, type })
    if (type === 'article') {
      wx.setNavigationBarTitle({ title: '编辑文章' })
    }
    if (id) {
      this.loadDetail()
    } else {
      this.setData({ loading: false })
    }
  },

  async loadDetail() {
    const module = this.data.type === 'article' ? 'articles' : 'routes'
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin-api',
        data: { module, action: 'detail', params: { id: this.data.id } }
      })
      const data = res.result.data
      if (res.result.code === 0 && data) {
        if (this.data.type === 'article') {
          this.setData({
            articleForm: {
              title: data.title || '',
              category: data.category || '',
              content: data.content || '',
              author: data.author || ''
            },
            loading: false
          })
        } else {
          // 标准化路线数据
          const location = typeof data.location === 'object' ? (data.location.address || '') : (data.location || '')
          const difficultyLevel = data.difficulty?.level || data.difficultyLevel || 1
          this.setData({
            form: {
              name: data.name || '',
              description: data.description || '',
              coverImage: data.coverImage || (data.images && data.images[0]) || '',
              location,
              distance_km: String(data.distance_km || ''),
              duration_hours: String(data.duration_hours || ''),
              difficulty_level: difficultyLevel,
              cost: String(data.cost || ''),
              scenery: data.scenery || data.sceneryTags || [],
              sections: data.sections || []
            },
            loading: false
          })
        }
      } else {
        this.showToast(res.result.message || '加载失败', 'error')
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('加载详情失败:', e)
      this.showToast('网络错误', 'error')
      this.setData({ loading: false })
    }
  },

  // ========== 表单输入 ==========

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onArticleFieldInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`articleForm.${field}`]: e.detail.value })
  },

  onDifficultyChange(e) {
    this.setData({ 'form.difficulty_level': parseInt(e.detail.value) + 1 })
  },

  // ========== Scenery 编辑 ==========

  onSceneryInput(e) {
    this.setData({ sceneryInput: e.detail.value })
  },

  addScenery() {
    const val = this.data.sceneryInput.trim()
    if (!val) return
    const scenery = this.data.form.scenery.concat([val])
    this.setData({ 'form.scenery': scenery, sceneryInput: '' })
  },

  removeScenery(e) {
    const idx = e.currentTarget.dataset.index
    const scenery = this.data.form.scenery.filter((_, i) => i !== idx)
    this.setData({ 'form.scenery': scenery })
  },

  // ========== Sections 编辑 ==========

  onSectionInput(e) {
    const idx = e.currentTarget.dataset.index
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.sections[${idx}].${field}`]: e.detail.value })
  },

  addSection() {
    const sections = this.data.form.sections.concat([{ name: '', distance: '', elevation: '', description: '' }])
    this.setData({ 'form.sections': sections })
  },

  removeSection(e) {
    const idx = e.currentTarget.dataset.index
    const sections = this.data.form.sections.filter((_, i) => i !== idx)
    this.setData({ 'form.sections': sections })
  },

  // ========== 保存 ==========

  async onSave() {
    if (this.data.saving) return
    this.setData({ saving: true })

    const module = this.data.type === 'article' ? 'articles' : 'routes'
    let updateData

    if (this.data.type === 'article') {
      const f = this.data.articleForm
      if (!f.title.trim()) {
        this.showToast('标题不能为空', 'error')
        this.setData({ saving: false })
        return
      }
      updateData = { ...f }
    } else {
      const f = this.data.form
      if (!f.name.trim()) {
        this.showToast('路线名称不能为空', 'error')
        this.setData({ saving: false })
        return
      }
      updateData = {
        name: f.name,
        description: f.description,
        coverImage: f.coverImage,
        distance_km: parseFloat(f.distance_km) || 0,
        duration_hours: parseFloat(f.duration_hours) || 0,
        difficulty: { level: f.difficulty_level },
        difficultyLevel: f.difficulty_level,
        cost: parseFloat(f.cost) || 0,
        scenery: f.scenery,
        sections: f.sections
      }
      // location 保持为对象格式
      if (f.location) {
        updateData.location = { address: f.location }
      }
    }

    try {
      if (this.data.id) {
        // 更新
        const res = await wx.cloud.callFunction({
          name: 'admin-api',
          data: {
            module, action: 'update',
            params: { id: this.data.id, data: updateData }
          }
        })
        if (res.result.code === 0) {
          this.showToast('保存成功', 'success')
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          this.showToast(res.result.message || '保存失败', 'error')
        }
      } else {
        // 新增
        const res = await wx.cloud.callFunction({
          name: 'admin-api',
          data: {
            module, action: 'add',
            params: { data: updateData }
          }
        })
        if (res.result.code === 0) {
          this.showToast('添加成功', 'success')
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          this.showToast(res.result.message || '添加失败', 'error')
        }
      }
    } catch (e) {
      console.error('保存失败:', e)
      this.showToast('网络错误', 'error')
    }
    this.setData({ saving: false })
  },

  // ========== Toast ==========
  showToast(message, type = 'info', duration = 2000) {
    this.setData({ showToast: true, toastMessage: message, toastType: type })
    setTimeout(() => this.setData({ showToast: false }), duration)
  }
})
