// pages/admin/route-edit.js
Page({
  data: {
    statusBarHeight: 0,
    id: '',
    type: 'route', // route | article
    loading: true,
    saving: false,

    // ===== 路线表单（与云数据库 routes 集合字段一一对应） =====
    form: {
      // 基本信息
      name: '',
      shortDesc: '',
      fullDesc: '',
      coverImage: '',
      images: [],
      status: 'open', // open | closed
      dataSource: '',
      // 位置
      location_district: '',
      location_lat: '',
      location_lng: '',
      // 路线参数
      distance: '',
      durationMin: '',
      durationMax: '',
      elevationGain: '',
      elevationMax: '',
      elevationMin: '',
      difficulty: 1,
      // 路况特征
      technicalGrade: 1,
      terrainTypes: [],
      routeDNA: [],
      // 适配评估
      waterSupply: 2,
      safetyLevel: 3,
      cellCoverage: 2,
      trailMarking: 2,
      // 补给信息
      trailhead_startName: '',
      trailhead_startFacilities: [],
      trailhead_endName: '',
      trailhead_endFacilities: [],
      // 交通信息
      transport_hasParking: true,
      transport_parkingNote: '',
      transport_publicTransport: '',
      transport_drivingGuide: '',
      // 附加属性
      bestSeasons: [],
      restPoints: 0,
      familyFriendly: 3,
      estimatedCalories: '',
      order: 0
    },

    // 选项数据
    difficultyOptions: [
      { value: 1, label: '轻松' },
      { value: 2, label: '初级' },
      { value: 3, label: '中级' },
      { value: 4, label: '高级' },
      { value: 5, label: '挑战' }
    ],
    difficultyIndex: 0,

    technicalGradeOptions: [
      { value: 1, label: '1级 平路为主' },
      { value: 2, label: '2级 有攀爬' },
      { value: 3, label: '3级 大量攀爬' },
      { value: 4, label: '4级 需要绳索' },
      { value: 5, label: '5级 技术攀登' }
    ],
    technicalGradeIndex: 0,

    waterSupplyOptions: [
      { value: 1, label: '无补给' },
      { value: 2, label: '部分季节有' },
      { value: 3, label: '沿途有补给' }
    ],
    waterSupplyIndex: 1,

    safetyLevelOptions: [
      { value: 1, label: '偏远无信号' },
      { value: 2, label: '较偏远' },
      { value: 3, label: '一般' },
      { value: 4, label: '较安全' },
      { value: 5, label: '非常安全' }
    ],
    safetyLevelIndex: 2,

    cellCoverageOptions: [
      { value: 1, label: '全程无信号' },
      { value: 2, label: '部分区域有' },
      { value: 3, label: '全程有信号' }
    ],
    cellCoverageIndex: 1,

    trailMarkingOptions: [
      { value: 1, label: '完全无标记' },
      { value: 2, label: '少量标记' },
      { value: 3, label: '标记清晰' }
    ],
    trailMarkingIndex: 1,

    familyFriendlyOptions: [
      { value: 1, label: '不适合亲子' },
      { value: 2, label: '不太适合' },
      { value: 3, label: '一般' },
      { value: 4, label: '比较适合' },
      { value: 5, label: '非常适合' }
    ],
    familyFriendlyIndex: 2,

    // terrainTypes 选项
    terrainTypeOptions: [
      { value: 'paved', label: '铺装路' },
      { value: 'mountain_path', label: '山路' },
      { value: 'forest', label: '林间路' },
      { value: 'rock_scramble', label: '攀岩路' },
      { value: 'stream', label: '涉水路' },
      { value: 'ridge', label: '山脊' },
      { value: 'grassland', label: '草甸' }
    ],

    // routeDNA 选项
    routeDNAOptions: [
      { value: 'significant_climb', label: '大爬升' },
      { value: 'technical', label: '技术路线' },
      { value: 'remote', label: '偏远路线' },
      { value: 'water_crossing', label: '需要过河' },
      { value: 'forest_shade', label: '林荫遮蔽' },
      { value: 'exposed_ridge', label: '无遮挡山脊' },
      { value: 'wet_environment', label: '潮湿环境' },
      { value: 'high_altitude', label: '高海拔' }
    ],

    // bestSeasons 选项
    seasonOptions: [
      { value: 'spring', label: '春季', checked: false },
      { value: 'summer', label: '夏季', checked: false },
      { value: 'autumn', label: '秋季', checked: false },
      { value: 'winter', label: '冬季', checked: false }
    ],

    // 起点设施选项
    facilityOptions: ['停车场', '小卖部', '厕所', '公交站', '游客中心', '农家乐'],

    // 图片输入
    imagesInput: '',

    // 文章相关选项
    articleForm: {
      title: '', category: '', content: '', author: '', summary: '',
      coverImage: '', readTime: '', difficulty: '', subcategory: '',
      tags: [], season: [], highlights: '', priority: 0, order: 0
    },
    categoryOptions: ['装备推荐', '安全自救', '户外礼仪', '新手专区', '其他'],
    categoryIndex: -1,
    subcategoryMap: {
      '装备推荐': ['必备装备', '推荐装备', '进阶装备', '装备管理'],
      '安全自救': ['基础安全', '季节安全', '极端天气', '求生技能', '伤害处理'],
      '户外礼仪': ['LNT无痕山林', '生态尊重', '社区礼仪', '营地规范'],
      '新手专区': ['路线选择', '基础安全', '必备装备', '体能训练'],
      '其他': ['自然科普', '体能训练', '路线选择', '团队协作']
    },
    currentSubcategoryOptions: [],
    subcategoryIndex: -1,
    difficultyArticleOptions: [
      { value: '', label: '请选择难度' },
      { value: 'beginner', label: '入门' },
      { value: 'intermediate', label: '进阶' },
      { value: 'advanced', label: '高级' }
    ],
    difficultyArticleIndex: 0,
    tagInput: '',

    // 多选预计算状态（WXML 不能调 indexOf，需 JS 预计算）
    terrainChecked: [],
    dnaChecked: [],
    seasonChecked: [],
    startFacilityChecked: [],
    endFacilityChecked: [],

    // 脏标记
    formChanged: false,

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

  // ========== 脏标记 ==========
  markChanged() {
    if (!this.data.formChanged) {
      this.setData({ formChanged: true })
      // 拦截系统返回手势
      wx.enableAlertBeforeUnload && wx.enableAlertBeforeUnload({ message: '内容已修改，确定离开吗？' })
    }
  },

  onBack() {
    if (this.data.formChanged) {
      wx.showModal({
        title: '提示',
        content: '内容已修改，是否保存草稿？',
        cancelText: '不保存',
        confirmText: '保存草稿',
        success: (res) => {
          if (res.confirm) {
            this.onSaveDraft()
          } else {
            wx.navigateBack()
          }
        }
      })
    } else {
      wx.navigateBack()
    }
  },

  // ========== 预计算多选状态 ==========
  _refreshChecked() {
    const f = this.data.form
    this.setData({
      terrainChecked: this.data.terrainTypeOptions.map(o => f.terrainTypes.indexOf(o.value) >= 0),
      dnaChecked: this.data.routeDNAOptions.map(o => f.routeDNA.indexOf(o.value) >= 0),
      seasonChecked: this.data.seasonOptions.map(o => f.bestSeasons.indexOf(o.value) >= 0),
      startFacilityChecked: this.data.facilityOptions.map(o => f.trailhead_startFacilities.indexOf(o) >= 0),
      endFacilityChecked: this.data.facilityOptions.map(o => f.trailhead_endFacilities.indexOf(o) >= 0)
    })
  },

  // ========== 通用字段输入 ==========
  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`form.${field}`]: value })
    this.markChanged()
  },

  // ========== Picker 选择 ==========
  onDifficultyChange(e) {
    const idx = e.detail.value
    this.setData({ difficultyIndex: idx, 'form.difficulty': this.data.difficultyOptions[idx].value })
    this.markChanged()
  },
  onTechnicalGradeChange(e) {
    const idx = e.detail.value
    this.setData({ technicalGradeIndex: idx, 'form.technicalGrade': this.data.technicalGradeOptions[idx].value })
    this.markChanged()
  },
  onWaterSupplyChange(e) {
    const idx = e.detail.value
    this.setData({ waterSupplyIndex: idx, 'form.waterSupply': this.data.waterSupplyOptions[idx].value })
    this.markChanged()
  },
  onSafetyLevelChange(e) {
    const idx = e.detail.value
    this.setData({ safetyLevelIndex: idx, 'form.safetyLevel': this.data.safetyLevelOptions[idx].value })
    this.markChanged()
  },
  onCellCoverageChange(e) {
    const idx = e.detail.value
    this.setData({ cellCoverageIndex: idx, 'form.cellCoverage': this.data.cellCoverageOptions[idx].value })
    this.markChanged()
  },
  onTrailMarkingChange(e) {
    const idx = e.detail.value
    this.setData({ trailMarkingIndex: idx, 'form.trailMarking': this.data.trailMarkingOptions[idx].value })
    this.markChanged()
  },
  onFamilyFriendlyChange(e) {
    const idx = e.detail.value
    this.setData({ familyFriendlyIndex: idx, 'form.familyFriendly': this.data.familyFriendlyOptions[idx].value })
    this.markChanged()
  },
  onStatusChange(e) {
    const idx = e.detail.value
    this.setData({ 'form.status': idx == 0 ? 'open' : 'closed' })
    this.markChanged()
  },

  // ========== 地形类型选择 ==========
  onTerrainToggle(e) {
    const val = e.currentTarget.dataset.value
    const list = [...this.data.form.terrainTypes]
    const idx = list.indexOf(val)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(val)
    }
    this.setData({ 'form.terrainTypes': list })
    this._refreshChecked()
    this.markChanged()
  },

  // ========== 路线DNA选择 ==========
  onDNAToggle(e) {
    const val = e.currentTarget.dataset.value
    const list = [...this.data.form.routeDNA]
    const idx = list.indexOf(val)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(val)
    }
    this.setData({ 'form.routeDNA': list })
    this._refreshChecked()
    this.markChanged()
  },

  // ========== 最佳季节选择 ==========
  onSeasonToggle(e) {
    const val = e.currentTarget.dataset.value
    const list = [...this.data.form.bestSeasons]
    const idx = list.indexOf(val)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(val)
    }
    this.setData({ 'form.bestSeasons': list })
    this._refreshChecked()
    this.markChanged()
  },

  // ========== 起点设施选择 ==========
  onStartFacilityToggle(e) {
    const val = e.currentTarget.dataset.value
    const list = [...this.data.form.trailhead_startFacilities]
    const idx = list.indexOf(val)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(val)
    }
    this.setData({ 'form.trailhead_startFacilities': list })
    this._refreshChecked()
    this.markChanged()
  },
  onEndFacilityToggle(e) {
    const val = e.currentTarget.dataset.value
    const list = [...this.data.form.trailhead_endFacilities]
    const idx = list.indexOf(val)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(val)
    }
    this.setData({ 'form.trailhead_endFacilities': list })
    this._refreshChecked()
    this.markChanged()
  },

  // ========== 图片管理 ==========
  onImagesInput(e) { this.setData({ imagesInput: e.detail.value }) },
  addImage() {
    const val = (this.data.imagesInput || '').trim()
    if (!val) return
    const list = this.data.form.images.concat([val])
    this.setData({ 'form.images': list, imagesInput: '' })
    this.markChanged()
  },
  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const list = this.data.form.images.filter((_, i) => i !== idx)
    this.setData({ 'form.images': list })
    this.markChanged()
  },
  onChooseImages() {
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.showToast('图片已选择，请在云存储中上传后填写URL', 'info')
      }
    })
  },

  // ========== 停车开关 ==========
  onParkingToggle() {
    this.setData({ 'form.transport_hasParking': !this.data.form.transport_hasParking })
    this.markChanged()
  },

  // ========== Toast ==========
  showToast(msg, type = 'info') {
    this.setData({ showToast: true, toastMessage: msg, toastType: type })
    setTimeout(() => this.setData({ showToast: false }), 2000)
  },

  // ========== 加载详情 ==========
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
          this._loadArticleDetail(data)
        } else {
          this._loadRouteDetail(data)
        }
      }
    } catch (e) {
      console.error('加载失败:', e)
      this.showToast('加载失败', 'error')
    }
    this.setData({ loading: false })
  },

  _loadRouteDetail(data) {
    const loc = data.location || {}
    const trailhead = data.trailhead || {}
    const transport = data.transport || {}

    // 查找 picker 索引
    const findIdx = (options, val) => {
      const i = options.findIndex(o => o.value === val)
      return i >= 0 ? i : 0
    }

    // bestSeasons: ['spring','autumn'] -> ['春','夏'] 用于 display
    this.setData({
      form: {
        name: data.name || '',
        shortDesc: data.shortDesc || '',
        fullDesc: data.fullDesc || '',
        coverImage: data.coverImage || '',
        images: data.images || [],
        status: data.status || 'open',
        dataSource: data.dataSource || '',
        location_district: loc.district || '',
        location_lat: loc.lat != null ? String(loc.lat) : '',
        location_lng: loc.lng != null ? String(loc.lng) : '',
        distance: data.distance != null ? String(data.distance) : '',
        durationMin: data.durationMin != null ? String(data.durationMin) : '',
        durationMax: data.durationMax != null ? String(data.durationMax) : '',
        elevationGain: data.elevationGain != null ? String(data.elevationGain) : '',
        elevationMax: data.elevationMax != null ? String(data.elevationMax) : '',
        elevationMin: data.elevationMin != null ? String(data.elevationMin) : '',
        difficulty: data.difficulty || 1,
        technicalGrade: data.technicalGrade || 1,
        terrainTypes: data.terrainTypes || [],
        routeDNA: data.routeDNA || [],
        waterSupply: data.waterSupply || 2,
        safetyLevel: data.safetyLevel || 3,
        cellCoverage: data.cellCoverage || 2,
        trailMarking: data.trailMarking || 2,
        trailhead_startName: trailhead.startName || '',
        trailhead_startFacilities: trailhead.startFacilities || [],
        trailhead_endName: trailhead.endName || '',
        trailhead_endFacilities: trailhead.endFacilities || [],
        transport_hasParking: transport.hasParking !== false,
        transport_parkingNote: transport.parkingNote || '',
        transport_publicTransport: transport.publicTransport || '',
        transport_drivingGuide: transport.drivingGuide || '',
        bestSeasons: data.bestSeasons || [],
        restPoints: data.restPoints || 0,
        familyFriendly: data.familyFriendly || 3,
        estimatedCalories: data.estimatedCalories != null ? String(data.estimatedCalories) : '',
        order: data.order || 0
      },
      difficultyIndex: findIdx(this.data.difficultyOptions, data.difficulty || 1),
      technicalGradeIndex: findIdx(this.data.technicalGradeOptions, data.technicalGrade || 1),
      waterSupplyIndex: findIdx(this.data.waterSupplyOptions, data.waterSupply || 2),
      safetyLevelIndex: findIdx(this.data.safetyLevelOptions, data.safetyLevel || 3),
      cellCoverageIndex: findIdx(this.data.cellCoverageOptions, data.cellCoverage || 2),
      trailMarkingIndex: findIdx(this.data.trailMarkingOptions, data.trailMarking || 2),
      familyFriendlyIndex: findIdx(this.data.familyFriendlyOptions, data.familyFriendly || 3),
      formChanged: false
    })
    this._refreshChecked()
  },

  _loadArticleDetail(data) {
    // 文章详情加载逻辑（保持不变）
    const categoryOptions = ['装备推荐', '安全自救', '户外礼仪', '新手专区', '其他']
    const subcategoryMap = {
      '装备推荐': ['必备装备', '推荐装备', '进阶装备', '装备管理'],
      '安全自救': ['基础安全', '季节安全', '极端天气', '求生技能', '伤害处理'],
      '户外礼仪': ['LNT无痕山林', '生态尊重', '社区礼仪', '营地规范'],
      '新手专区': ['路线选择', '基础安全', '必备装备', '体能训练'],
      '其他': ['自然科普', '体能训练', '路线选择', '团队协作']
    }
    const diffOptions = [
      { value: '', label: '请选择难度' },
      { value: 'beginner', label: '入门' },
      { value: 'intermediate', label: '进阶' },
      { value: 'advanced', label: '高级' }
    ]

    this.setData({
      articleForm: {
        title: data.title || '',
        category: data.category || '',
        content: data.content || '',
        author: data.author || '',
        summary: data.summary || '',
        coverImage: data.coverImage || '',
        readTime: data.readTime || '',
        difficulty: data.difficulty || '',
        subcategory: data.subcategory || '',
        tags: data.tags || [],
        season: data.season || [],
        highlights: data.highlights || '',
        priority: data.priority || 0,
        order: data.order || 0
      },
      categoryIndex: categoryOptions.indexOf(data.category || ''),
      currentSubcategoryOptions: subcategoryMap[data.category] || [],
      subcategoryIndex: (subcategoryMap[data.category] || []).indexOf(data.subcategory || ''),
      difficultyArticleIndex: diffOptions.findIndex(d => d.value === (data.difficulty || '')),
      difficultyArticleOptions: diffOptions
    })
  },

  // ========== 构建路线更新数据 ==========
  _buildRouteData(isActive) {
    const f = this.data.form
    if (!f.name.trim()) {
      this.showToast('路线名称不能为空', 'error')
      return null
    }

    return {
      name: f.name,
      shortDesc: f.shortDesc,
      fullDesc: f.fullDesc,
      coverImage: f.coverImage,
      images: f.images,
      status: f.status,
      dataSource: f.dataSource,
      isActive,
      location: {
        district: f.location_district,
        lat: parseFloat(f.location_lat) || 0,
        lng: parseFloat(f.location_lng) || 0
      },
      distance: parseFloat(f.distance) || 0,
      durationMin: parseFloat(f.durationMin) || 0,
      durationMax: parseFloat(f.durationMax) || 0,
      elevationGain: parseInt(f.elevationGain) || 0,
      elevationMax: parseInt(f.elevationMax) || 0,
      elevationMin: parseInt(f.elevationMin) || 0,
      difficulty: f.difficulty,
      technicalGrade: f.technicalGrade,
      terrainTypes: f.terrainTypes,
      routeDNA: f.routeDNA,
      waterSupply: f.waterSupply,
      safetyLevel: f.safetyLevel,
      cellCoverage: f.cellCoverage,
      trailMarking: f.trailMarking,
      trailhead: {
        startName: f.trailhead_startName,
        startFacilities: f.trailhead_startFacilities,
        endName: f.trailhead_endName,
        endFacilities: f.trailhead_endFacilities
      },
      transport: {
        hasParking: f.transport_hasParking,
        parkingNote: f.transport_parkingNote,
        publicTransport: f.transport_publicTransport,
        drivingGuide: f.transport_drivingGuide
      },
      bestSeasons: f.bestSeasons,
      restPoints: parseInt(f.restPoints) || 0,
      familyFriendly: f.familyFriendly,
      estimatedCalories: parseInt(f.estimatedCalories) || 0,
      order: parseInt(f.order) || 0
    }
  },

  _buildArticleData(isActive) {
    const f = this.data.articleForm
    if (!f.title.trim()) { this.showToast('标题不能为空', 'error'); return null }
    if (!f.category.trim()) { this.showToast('请选择分类', 'error'); return null }
    if (!f.content.trim()) { this.showToast('文章内容不能为空', 'error'); return null }
    return {
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
  },

  // ========== 保存 ==========
  async _doSave(isActive, successMsg) {
    if (this.data.saving) return
    this.setData({ saving: true })

    const module = this.data.type === 'article' ? 'articles' : 'routes'
    const updateData = this.data.type === 'article'
      ? this._buildArticleData(isActive)
      : this._buildRouteData(isActive)
    if (!updateData) {
      this.setData({ saving: false })
      return
    }

    try {
      const token = wx.getStorageSync('admin_token') || ''
      if (this.data.id) {
        const res = await wx.cloud.callFunction({
          name: 'admin-api',
          data: { module, action: 'update', params: { id: this.data.id, data: updateData, token } }
        })
        if (res.result.code === 0) {
          this.showToast(successMsg, 'success')
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          this.showToast(res.result.message || '保存失败', 'error')
        }
      } else {
        const res = await wx.cloud.callFunction({
          name: 'admin-api',
          data: { module, action: 'add', params: { data: updateData, token } }
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

  onSaveDraft() { this._doSave(false, '草稿已保存') },
  onPublish() { this._doSave(true, '发布成功') },

  // ========== 删除 ==========
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？此操作不可撤销。',
      confirmColor: '#F44336',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const module = this.data.type === 'article' ? 'articles' : 'routes'
          const token = wx.getStorageSync('admin_token') || ''
          const result = await wx.cloud.callFunction({
            name: 'admin-api',
            data: { module, action: 'delete', params: { id: this.data.id, token } }
          })
          if (result.result.code === 0) {
            this.showToast('删除成功', 'success')
            setTimeout(() => wx.navigateBack(), 1500)
          } else {
            this.showToast(result.result.message || '删除失败', 'error')
          }
        } catch (e) {
          console.error('删除失败:', e)
          this.showToast('网络错误', 'error')
        }
      }
    })
  },

  // ========== 文章字段 ==========
  onArticleFieldInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`articleForm.${field}`]: e.detail.value })
    this.markChanged()
  },

  onCategoryChange(e) {
    const idx = e.detail.value
    const category = this.data.categoryOptions[idx]
    const subcategoryList = this.data.subcategoryMap[category] || []
    this.setData({
      'articleForm.category': category,
      categoryIndex: idx,
      currentSubcategoryOptions: subcategoryList,
      subcategoryIndex: -1,
      'articleForm.subcategory': ''
    })
    this.markChanged()
  },

  onSubcategoryChange(e) {
    const idx = e.detail.value
    const sub = this.data.currentSubcategoryOptions[idx]
    this.setData({ 'articleForm.subcategory': sub, subcategoryIndex: idx })
    this.markChanged()
  },

  onArticleDifficultyChange(e) {
    const idx = e.detail.value
    this.setData({
      difficultyArticleIndex: idx,
      'articleForm.difficulty': this.data.difficultyArticleOptions[idx].value
    })
    this.markChanged()
  },

  // 文章季节选择
  onArticleSeasonToggle(e) {
    const idx = e.currentTarget.dataset.index
    const opts = this.data.seasonOptions
    opts[idx].checked = !opts[idx].checked
    const selected = opts.filter(s => s.checked).map(s => s.value)
    this.setData({ seasonOptions: opts, 'articleForm.season': selected })
    this.markChanged()
  },

  // 文章标签
  onTagInput(e) { this.setData({ tagInput: e.detail.value }) },
  addArticleTag() {
    const val = (this.data.tagInput || '').trim()
    if (!val) return
    const list = this.data.articleForm.tags.concat([val])
    this.setData({ 'articleForm.tags': list, tagInput: '' })
    this.markChanged()
  },
  removeArticleTag(e) {
    const idx = e.currentTarget.dataset.index
    const list = this.data.articleForm.tags.filter((_, i) => i !== idx)
    this.setData({ 'articleForm.tags': list })
    this.markChanged()
  },

  // 文章封面图上传
  onChooseCoverImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: () => { this.showToast('请选择已上传到云存储的图片URL', 'info') }
    })
  }
})
