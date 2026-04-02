// pages/admin/route-edit.js
Page({
  data: {
    statusBarHeight: 0,
    id: '',
    type: 'route', // route | article
    loading: true,
    saving: false,

    // 路线表单
    form: {
      name: '',
      description: '',
      coverImage: '',
      images: [],
      // location 子字段
      location_direction: '',
      location_address: '',
      location_navAddress: '',
      location_driveLat: '',
      location_driveLng: '',
      location_publicTransport: '',
      distance_km: '',
      duration_hours: '',
      elevation_gain_m: '',
      // difficulty 子字段
      difficulty_level: 1,
      difficulty_label: '',
      difficulty_suitableFor: [],
      // cost 子字段
      cost_type: '免费',
      cost_amount: 0,
      cost_note: '',
      scenery: [],
      sections: [],
      // equipment 子字段
      equipment_must: [],
      equipment_suggest: [],
      equipment_noNeed: [],
      // safety 子字段
      safety_warnings: [],
      safety_emergencyPhone: '',
      best_season: '',
      order: 0
    },

    // equipment/safety 编辑临时输入
    equipmentMustInput: '',
    equipmentSuggestInput: '',
    equipmentNoNeedInput: '',
    safetyWarningInput: '',
    difficultySuitableForInput: '',
    imagesInput: '',

    // 文章表单（全量字段）
    articleForm: {
      title: '',
      category: '',
      content: '',
      author: '',
      summary: '',
      coverImage: '',
      readTime: '',
      difficulty: '',
      subcategory: '',
      tags: [],
      season: [],
      highlights: '',
      priority: 0,
      order: 0
    },

    // 难度选项
    difficultyOptions: ['轻松', '初级', '中级', '高级', '挑战'],

    // 文章难度选项
    difficultyArticleOptions: [
      { value: '', label: '请选择难度' },
      { value: 'beginner', label: '入门' },
      { value: 'intermediate', label: '进阶' },
      { value: 'advanced', label: '高级' }
    ],
    difficultyArticleIndex: 0,

    // 文章分类选项
    categoryOptions: ['装备推荐', '安全自救', '户外礼仪', '新手专区', '其他'],
    categoryIndex: -1,

    // 子分类联动
    subcategoryMap: {
      '装备推荐': ['必备装备', '推荐装备', '进阶装备', '装备管理'],
      '安全自救': ['基础安全', '季节安全', '极端天气', '求生技能', '伤害处理'],
      '户外礼仪': ['LNT无痕山林', '生态尊重', '社区礼仪', '营地规范'],
      '新手专区': ['路线选择', '基础安全', '必备装备', '体能训练'],
      '其他': ['自然科普', '体能训练', '路线选择', '团队协作']
    },
    currentSubcategoryOptions: [],
    subcategoryIndex: -1,

    // 季节选项
    seasonOptions: [
      { value: '春', label: '春', checked: false },
      { value: '夏', label: '夏', checked: false },
      { value: '秋', label: '秋', checked: false },
      { value: '冬', label: '冬', checked: false },
      { value: '全年', label: '全年', checked: false }
    ],

    // 标签编辑
    tagInput: '',

    // 封面图上传状态
    coverUploading: false,

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
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      id,
      type
    })
    if (type === 'article') {
      wx.setNavigationBarTitle({ title: id ? '编辑文章' : '添加文章' })
    } else {
      wx.setNavigationBarTitle({ title: id ? '编辑路线' : '添加路线' })
    }
    if (id) {
      this.loadDetail()
    } else {
      this.setData({ loading: false })
    }
  },

  // 返回
  onBack() {
    wx.navigateBack()
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
          const category = data.category || ''
          const categoryIdx = this.data.categoryOptions.indexOf(category)
          // 子分类联动
          const subcategoryList = this.data.subcategoryMap[category] || []
          const subcategory = data.subcategory || ''
          const subcategoryIdx = subcategoryList.indexOf(subcategory)
          // 难度
          const diffValue = data.difficulty || ''
          const diffIdx = this.data.difficultyArticleOptions.findIndex(d => d.value === diffValue)
          // 季节
          const savedSeasons = data.season || []
          const seasonOpts = this.data.seasonOptions.map(s => ({
            ...s,
            checked: savedSeasons.includes(s.value)
          }))
          this.setData({
            articleForm: {
              title: data.title || '',
              category: category,
              content: data.content || '',
              author: data.author || '',
              summary: data.summary || '',
              coverImage: data.coverImage || '',
              readTime: data.readTime || '',
              difficulty: diffValue,
              subcategory: subcategory,
              tags: data.tags || [],
              season: savedSeasons,
              highlights: data.highlights || '',
              priority: data.priority || 0,
              order: data.order || 0
            },
            categoryIndex: categoryIdx,
            currentSubcategoryOptions: subcategoryList,
            subcategoryIndex: subcategoryIdx,
            difficultyArticleIndex: diffIdx >= 0 ? diffIdx : 0,
            seasonOptions: seasonOpts,
            loading: false
          })
        } else {
          // 标准化路线数据 — 全量加载所有字段
          const loc = data.location || {}
          const diff = data.difficulty || {}
          const cost = data.cost || {}
          const equip = data.equipment || {}
          const safe = data.safety || {}
          this.setData({
            form: {
              name: data.name || '',
              description: data.description || '',
              coverImage: data.coverImage || (data.images && data.images[0]) || '',
              images: data.images || [],
              // location 展开
              location_direction: loc.direction || '',
              location_address: loc.address || (typeof data.location === 'string' ? data.location : ''),
              location_navAddress: loc.navAddress || '',
              location_driveLat: loc.driveLat != null ? String(loc.driveLat) : '',
              location_driveLng: loc.driveLng != null ? String(loc.driveLng) : '',
              location_publicTransport: loc.publicTransport || '',
              distance_km: String(data.distance_km || ''),
              duration_hours: String(data.duration_hours || ''),
              elevation_gain_m: String(data.elevation_gain_m || ''),
              // difficulty 展开
              difficulty_level: diff.level || data.difficultyLevel || 1,
              difficulty_label: diff.label || '',
              difficulty_suitableFor: diff.suitableFor || [],
              // cost 展开
              cost_type: cost.type || '免费',
              cost_amount: cost.amount != null ? String(cost.amount) : '0',
              cost_note: cost.note || '',
              scenery: data.scenery || data.sceneryTags || [],
              sections: (data.sections || []).map(s => ({
                name: s.name || '',
                road: s.road || '',
                desc: s.desc || s.description || '',
                distance: s.distance || '',
                elevation: s.elevation || ''
              })),
              // equipment 展开
              equipment_must: equip.must || [],
              equipment_suggest: equip.suggest || [],
              equipment_noNeed: equip.noNeed || [],
              // safety 展开
              safety_warnings: safe.warnings || [],
              safety_emergencyPhone: safe.emergencyPhone || '',
              best_season: data.best_season || '',
              order: data.order || 0
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

  onCategoryChange(e) {
    const idx = parseInt(e.detail.value)
    const category = this.data.categoryOptions[idx]
    const subcategoryList = this.data.subcategoryMap[category] || []
    this.setData({
      categoryIndex: idx,
      'articleForm.category': category,
      'articleForm.subcategory': '',
      currentSubcategoryOptions: subcategoryList,
      subcategoryIndex: -1
    })
  },

  // 子分类联动
  onSubcategoryChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      subcategoryIndex: idx,
      'articleForm.subcategory': this.data.currentSubcategoryOptions[idx]
    })
  },

  // 文章难度选择
  onArticleDifficultyChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      difficultyArticleIndex: idx,
      'articleForm.difficulty': this.data.difficultyArticleOptions[idx].value
    })
  },

  // ========== 标签编辑 ==========
  onTagInput(e) {
    this.setData({ tagInput: e.detail.value })
  },

  addArticleTag() {
    const val = (this.data.tagInput || '').trim()
    if (!val) return
    const tags = this.data.articleForm.tags.concat([val])
    this.setData({ 'articleForm.tags': tags, tagInput: '' })
  },

  removeArticleTag(e) {
    const idx = e.currentTarget.dataset.index
    const tags = this.data.articleForm.tags.filter((_, i) => i !== idx)
    this.setData({ 'articleForm.tags': tags })
  },

  // ========== 季节多选 ==========
  onSeasonToggle(e) {
    const idx = e.currentTarget.dataset.index
    const options = this.data.seasonOptions.slice()
    const value = options[idx].value

    if (value === '全年') {
      // 选"全年"则清空其他
      const checked = !options[idx].checked
      options.forEach(s => { s.checked = checked && s.value === '全年' })
    } else {
      // 选其他则取消"全年"
      options[idx].checked = !options[idx].checked
      const allYearIdx = options.findIndex(s => s.value === '全年')
      if (allYearIdx >= 0 && options[idx].checked) {
        options[allYearIdx].checked = false
      }
    }

    const seasons = options.filter(s => s.checked).map(s => s.value)
    this.setData({
      seasonOptions: options,
      'articleForm.season': seasons
    })
  },

  // ========== 封面图上传 ==========
  onChooseCoverImage() {
    if (this.data.coverUploading) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadCoverImage(tempFilePath)
      }
    })
  },

  async uploadCoverImage(filePath) {
    this.setData({ coverUploading: true })
    try {
      const ext = filePath.split('.').pop() || 'jpg'
      const cloudPath = `article-covers/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      if (uploadRes.fileID) {
        this.setData({
          'articleForm.coverImage': uploadRes.fileID
        })
        this.showToast('封面图上传成功', 'success')
      } else {
        this.showToast('上传失败', 'error')
      }
    } catch (e) {
      console.error('封面图上传失败:', e)
      this.showToast('上传失败', 'error')
    }
    this.setData({ coverUploading: false })
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
    const sections = this.data.form.sections.concat([{ name: '', road: '', desc: '', distance: '', elevation: '' }])
    this.setData({ 'form.sections': sections })
  },

  removeSection(e) {
    const idx = e.currentTarget.dataset.index
    const sections = this.data.form.sections.filter((_, i) => i !== idx)
    this.setData({ 'form.sections': sections })
  },

  // ========== 通用数组标签编辑 ==========

  _addTagItem(field, inputField) {
    const val = (this.data[inputField] || '').trim()
    if (!val) return
    const list = this.data.form[field].concat([val])
    this.setData({ [`form.${field}`]: list, [inputField]: '' })
  },

  _removeTagItem(field, idx) {
    const list = this.data.form[field].filter((_, i) => i !== idx)
    this.setData({ [`form.${field}`]: list })
  },

  // images
  onImagesInput(e) { this.setData({ imagesInput: e.detail.value }) },
  addImage() { this._addTagItem('images', 'imagesInput') },
  removeImage(e) { this._removeTagItem('images', e.currentTarget.dataset.index) },

  // equipment must
  onEquipmentMustInput(e) { this.setData({ equipmentMustInput: e.detail.value }) },
  addEquipmentMust() { this._addTagItem('equipment_must', 'equipmentMustInput') },
  removeEquipmentMust(e) { this._removeTagItem('equipment_must', e.currentTarget.dataset.index) },

  // equipment suggest
  onEquipmentSuggestInput(e) { this.setData({ equipmentSuggestInput: e.detail.value }) },
  addEquipmentSuggest() { this._addTagItem('equipment_suggest', 'equipmentSuggestInput') },
  removeEquipmentSuggest(e) { this._removeTagItem('equipment_suggest', e.currentTarget.dataset.index) },

  // equipment noNeed
  onEquipmentNoNeedInput(e) { this.setData({ equipmentNoNeedInput: e.detail.value }) },
  addEquipmentNoNeed() { this._addTagItem('equipment_noNeed', 'equipmentNoNeedInput') },
  removeEquipmentNoNeed(e) { this._removeTagItem('equipment_noNeed', e.currentTarget.dataset.index) },

  // safety warnings
  onSafetyWarningInput(e) { this.setData({ safetyWarningInput: e.detail.value }) },
  addSafetyWarning() { this._addTagItem('safety_warnings', 'safetyWarningInput') },
  removeSafetyWarning(e) { this._removeTagItem('safety_warnings', e.currentTarget.dataset.index) },

  // difficulty suitableFor
  onDifficultySuitableForInput(e) { this.setData({ difficultySuitableForInput: e.detail.value }) },
  addDifficultySuitableFor() { this._addTagItem('difficulty_suitableFor', 'difficultySuitableForInput') },
  removeDifficultySuitableFor(e) { this._removeTagItem('difficulty_suitableFor', e.currentTarget.dataset.index) },

  // ========== 保存/发布 ==========

  // 构建更新数据（isActive 由调用方传入）
  _buildUpdateData(isActive) {
    const module = this.data.type === 'article' ? 'articles' : 'routes'
    let updateData

    if (this.data.type === 'article') {
      const f = this.data.articleForm
      if (!f.title.trim()) {
        this.showToast('标题不能为空', 'error')
        return null
      }
      if (!f.category.trim()) {
        this.showToast('请选择分类', 'error')
        return null
      }
      if (!f.content.trim()) {
        this.showToast('文章内容不能为空', 'error')
        return null
      }
      updateData = {
        title: f.title,
        category: f.category,
        content: f.content,
        author: f.author,
        summary: f.summary,
        coverImage: f.coverImage,
        readTime: f.readTime,
        difficulty: f.difficulty,
        subcategory: f.subcategory,
        tags: f.tags,
        season: f.season,
        highlights: f.highlights,
        priority: parseInt(f.priority) || 0,
        order: parseInt(f.order) || 0,
        isActive
      }
    } else {
      const f = this.data.form
      if (!f.name.trim()) {
        this.showToast('路线名称不能为空', 'error')
        return null
      }
      updateData = {
        name: f.name,
        description: f.description,
        coverImage: f.coverImage,
        images: f.images,
        distance_km: parseFloat(f.distance_km) || 0,
        duration_hours: parseFloat(f.duration_hours) || 0,
        elevation_gain_m: parseFloat(f.elevation_gain_m) || 0,
        difficulty: {
          level: f.difficulty_level,
          label: f.difficulty_label,
          suitableFor: f.difficulty_suitableFor
        },
        difficultyLevel: f.difficulty_level,
        cost: {
          type: f.cost_type,
          amount: parseFloat(f.cost_amount) || 0,
          note: f.cost_note
        },
        scenery: f.scenery,
        sections: f.sections,
        location: {
          direction: f.location_direction,
          address: f.location_address,
          navAddress: f.location_navAddress,
          driveLat: parseFloat(f.location_driveLat) || 0,
          driveLng: parseFloat(f.location_driveLng) || 0,
          publicTransport: f.location_publicTransport
        },
        equipment: {
          must: f.equipment_must,
          suggest: f.equipment_suggest,
          noNeed: f.equipment_noNeed
        },
        safety: {
          warnings: f.safety_warnings,
          emergencyPhone: f.safety_emergencyPhone
        },
        best_season: f.best_season,
        order: parseInt(f.order) || 0,
        isActive
      }
    }
    return updateData
  },

  // 通用保存函数
  async _doSave(isActive, successMsg) {
    if (this.data.saving) return
    this.setData({ saving: true })

    const module = this.data.type === 'article' ? 'articles' : 'routes'
    const updateData = this._buildUpdateData(isActive)
    if (!updateData) {
      this.setData({ saving: false })
      return
    }

    try {
      const token = wx.getStorageSync('admin_token') || ''
      if (this.data.id) {
        // 更新
        const res = await wx.cloud.callFunction({
          name: 'admin-api',
          data: {
            module, action: 'update',
            params: { id: this.data.id, data: updateData, token }
          }
        })
        if (res.result.code === 0) {
          this.showToast(successMsg, 'success')
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
            params: { data: updateData, token }
          }
        })
        if (res.result.code === 0) {
          this.showToast(successMsg, 'success')
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

  // 保存草稿（isActive=false）
  onSaveDraft() {
    this._doSave(false, '草稿已保存')
  },

  // 发布（isActive=true）
  onPublish() {
    this._doSave(true, '发布成功')
  },

  // ========== 删除 ==========

  async onDelete() {
    if (this.data.saving) return
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条路线吗？删除后不可恢复。',
      confirmColor: '#F44336',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ saving: true })
        try {
          const token = wx.getStorageSync('admin_token') || ''
          const module = this.data.type === 'article' ? 'articles' : 'routes'
          const delRes = await wx.cloud.callFunction({
            name: 'admin-api',
            data: {
              module, action: 'delete',
              params: { id: this.data.id, token }
            }
          })
          if (delRes.result.code === 0) {
            this.showToast('删除成功', 'success')
            // 通知上一页刷新统计数据
            const pages = getCurrentPages()
            const prevPage = pages[pages.length - 2]
            if (prevPage && prevPage.loadStats) {
              prevPage.loadStats()
            }
            setTimeout(() => wx.navigateBack(), 1500)
          } else {
            this.showToast(delRes.result.message || '删除失败', 'error')
          }
        } catch (e) {
          console.error('删除失败:', e)
          this.showToast('网络错误', 'error')
        }
        this.setData({ saving: false })
      }
    })
  },

  // ========== Toast ==========
  showToast(message, type = 'info', duration = 2000) {
    this.setData({ showToast: true, toastMessage: message, toastType: type })
    setTimeout(() => this.setData({ showToast: false }), duration)
  }
})
