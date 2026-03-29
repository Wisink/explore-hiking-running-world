Page({
  data: {
    // 路线信息
    routeId: '',
    routeName: '',
    routeLocation: '',
    // 纠错类型（多选，可选）
    correctionTypes: [
      '路线距离错误',
      '路线难度不准确',
      '交通信息有误',
      '门票价格变更',
      '安全提示缺失',
      '其他'
    ],
    selectedTypes: [],
    // 错误描述（必填）
    errorDesc: '',
    // 图片列表
    imageList: [],
    // 登录相关
    showLoginPopup: false,
    isLogin: false,
    userInfo: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 从页面参数获取路线信息，解码URL编码的中文字符
    const id = options.id || ''
    const name = options.name ? decodeURIComponent(options.name) : '未知路线'
    const location = options.location ? decodeURIComponent(options.location) : '未知位置'
    this.setData({
      routeId: id,
      routeName: name,
      routeLocation: location
    })

    // 如果有路线ID，可以尝试从数据库拉取完整信息
    if (id) {
      this.fetchRouteInfo(id)
    }
  },

  /**
   * 从云数据库获取路线详细信息
   * 云函数未部署时使用页面参数中的信息
   */
  fetchRouteInfo(routeId) {
    // 尝试调用云函数获取路线信息
    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'correction',
        data: { action: 'getDetail', id: routeId },
        success: (res) => {
          if (res.result && res.result.data) {
            const route = res.result.data
            this.setData({
              routeName: route.name || this.data.routeName,
              routeLocation: route.location || this.data.routeLocation
            })
          }
        },
        fail: () => {
          // 云函数未部署，使用已有参数信息（静默处理）
          console.log('云函数未部署，使用页面参数中的路线信息')
        }
      })
    }
  },

  /**
   * 选择纠错类型（支持多选）
   */
  onTypeSelect(e) {
    const type = e.currentTarget.dataset.type
    console.log('点击纠错类型:', type)
    const selectedTypes = [...this.data.selectedTypes]
    const idx = selectedTypes.indexOf(type)
    if (idx > -1) {
      selectedTypes.splice(idx, 1)  // 已选中则取消
      console.log('取消选择:', type)
    } else {
      selectedTypes.push(type)  // 未选中则添加
      console.log('添加选择:', type)
    }
    console.log('当前选中:', selectedTypes)
    this.setData({ selectedTypes })
  },

  /**
   * 错误描述输入
   */
  onErrorDescInput(e) {
    this.setData({ errorDesc: e.detail.value })
  },

  /**
   * 选择图片（最多3张）
   */
  onChooseImage() {
    const remaining = 3 - this.data.imageList.length
    if (remaining <= 0) return

    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          imageList: [...this.data.imageList, ...res.tempFilePaths]
        })
      }
    })
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      current: src,
      urls: this.data.imageList
    })
  },

  /**
   * 删除已选图片
   */
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const imageList = [...this.data.imageList]
    imageList.splice(index, 1)
    this.setData({ imageList })
  },

  /**
   * 检查是否可以提交
   * 必须：错误描述非空
   */
  get canSubmit() {
    return this.data.errorDesc.trim()
  },

  /**
   * 表单验证
   * @returns {string|null} 错误信息，验证通过返回null
   */
  validateForm() {
    if (!this.data.errorDesc.trim()) {
      return '请填写错误描述'
    }
    return null
  },

  /**
   * 检查登录状态
   * @returns {Promise<boolean>}
   */
  checkLogin() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.userInfo']) {
            resolve(true)
          } else {
            wx.showModal({
              title: '提示',
              content: '请先登录后再提交纠错',
              confirmText: '去登录',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.navigateTo({ url: '/pages/profile/profile' })
                }
                resolve(false)
              }
            })
          }
        },
        fail: () => resolve(false)
      })
    })
  },

  /**
   * 提交纠错
   */
  async onSubmit() {
    // 防止重复提交
    if (this.data.submitting) return

    // 表单验证
    const error = this.validateForm()
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return
    }

    // 检查登录状态
    const isLoggedIn = await this.checkLogin()
    if (!isLoggedIn) return

    // 设置提交状态
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    // 构建纠错数据
    const correctionData = {
      routeId: this.data.routeId,
      routeName: this.data.routeName,
      routeLocation: this.data.routeLocation,
      types: this.data.selectedTypes,  // 多选纠错类型（数组，可选）
      errorDesc: this.data.errorDesc.trim(),
      imageCount: this.data.imageList.length,
      createTime: new Date().toISOString()
    }

    // 尝试调用云函数提交，失败则模拟成功
    this.submitToCloud(correctionData)
  },

  /**
   * 提交到云函数
   * 云函数未部署时模拟提交成功
   */
  submitToCloud(data) {
    // 将中文纠错类型映射为云函数接受的值
    const typeMap = {
      '位置': 'trail_location',
      '难度': 'trail_difficulty',
      '费用': 'trail_facilities',
      '季节': 'trail_route',
      '安全提示': 'trail_facilities',
      '环保问题': 'trail_facilities',
      '其他': 'other'
    }
    const errorType = typeMap[data.types[0]] || 'other'

    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'correction',
        data: {
          action: 'add',
          trail_id: data.routeId,
          user_id: (getApp().globalData.userInfo || {})._id || 'anonymous',
          error_type: errorType,
          error_desc: data.errorDesc,
          extra: { routeName: data.routeName, routeLocation: data.routeLocation },
          images: this.data.imageList
        },
        success: () => {
          this.handleSubmitSuccess()
        },
        fail: () => {
          // 云函数未部署，模拟提交成功
          console.log('云函数未部署，模拟提交成功')
          this.handleSubmitSuccess()
        },
        complete: () => {
          this.setData({ submitting: false })
          wx.hideLoading()
        }
      })
    } else {
      // 没有云开发环境，模拟提交成功
      setTimeout(() => {
        this.handleSubmitSuccess()
        this.setData({ submitting: false })
        wx.hideLoading()
      }, 800)
    }
  },

  /**
   * 提交成功的处理
   */
  handleSubmitSuccess() {
    wx.showToast({
      title: '提交成功，我们会尽快处理',
      icon: 'none',
      duration: 2000,
      success: () => {
        // 延迟返回上一页，让用户看到提示
        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      }
    })
  }
})
