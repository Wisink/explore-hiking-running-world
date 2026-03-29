// pages/comments/comments.js

const app = getApp()

/**
 * 模拟评论数据 - 云函数未部署时使用
 * 包含多种场景：有图/无图、已去过/未去、环保标记等
 */
const MOCK_COMMENTS = [
  {
    _id: 'mock_1',
    userId: 'user_001',
    nickName: '山野行者',
    avatarUrl: '',
    levelBadge: '林间行者',
    rating: 5,
    content: '风景绝美！秋天去的，满山红叶，空气清新，难度适中，非常适合周末户外。建议早上去，避开人流高峰。',
    images: [],
    hasVisited: true,
    hasEco: true,
    likeCount: 12,
    isLiked: false,
    timeAgo: '3天前',
    createdAt: Date.now() - 3 * 86400000
  },
  {
    _id: 'mock_2',
    userId: 'user_002',
    nickName: '小溪',
    avatarUrl: '',
    levelBadge: '溪涧旅人',
    rating: 4,
    content: '路线标识清晰，沿途有溪流相伴。唯一不足的是停车场有点小，周末去晚了要停很远。',
    images: [],
    hasVisited: true,
    hasEco: false,
    likeCount: 5,
    isLiked: false,
    timeAgo: '1周前',
    createdAt: Date.now() - 7 * 86400000
  },
  {
    _id: 'mock_3',
    userId: 'user_003',
    nickName: '云中漫步',
    avatarUrl: '',
    levelBadge: '云岭漫步者',
    rating: 5,
    content: '第二次来了，这次带了朋友一起来，大家都说好。山上的云海太震撼了！',
    images: [],
    hasVisited: true,
    hasEco: true,
    likeCount: 23,
    isLiked: false,
    timeAgo: '2周前',
    createdAt: Date.now() - 14 * 86400000
  },
  {
    _id: 'mock_4',
    userId: 'user_004',
    nickName: '新手小白',
    avatarUrl: '',
    levelBadge: '初行者',
    rating: 3,
    content: '对新手来说有点累，后半段比较陡。不过风景值得，建议带够水和干粮。',
    images: [],
    hasVisited: true,
    hasEco: false,
    likeCount: 8,
    isLiked: false,
    timeAgo: '3周前',
    createdAt: Date.now() - 21 * 86400000
  },
  {
    _id: 'mock_5',
    userId: 'user_005',
    nickName: '花径姑娘',
    avatarUrl: '',
    levelBadge: '花径行者',
    rating: 4,
    content: '春天去的，沿途花开得很美。推荐4月中旬去，杜鹃花海真的绝了！记得带相机。',
    images: [],
    hasVisited: true,
    hasEco: true,
    likeCount: 18,
    isLiked: false,
    timeAgo: '1个月前',
    createdAt: Date.now() - 30 * 86400000
  },
  {
    _id: 'mock_6',
    userId: 'user_006',
    nickName: '四季行者',
    avatarUrl: '',
    levelBadge: '四季行者',
    rating: 5,
    content: '一年四季都来过，每次都有不同的感受。秋天红叶最佳，冬天雪景也别有韵味。秦岭最美路线之一，强烈推荐！',
    images: [],
    hasVisited: true,
    hasEco: true,
    likeCount: 35,
    isLiked: false,
    timeAgo: '1个月前',
    createdAt: Date.now() - 32 * 86400000
  },
  {
    _id: 'mock_7',
    userId: 'user_007',
    nickName: '背包客阿明',
    avatarUrl: '',
    levelBadge: '山麓客',
    rating: 4,
    content: '周末带孩子来的，整体不错。下山的时候发现不少垃圾，希望大家都自觉带走。',
    images: [],
    hasVisited: true,
    hasEco: true,
    likeCount: 11,
    isLiked: false,
    timeAgo: '2个月前',
    createdAt: Date.now() - 60 * 86400000
  }
]

Page({
  data: {
    routeId: '',                    // 路线ID
    comments: [],                   // 评论列表
    avgRating: '0.0',              // 平均评分
    loading: false,                 // 加载状态

    // 登录状态
    isLogin: false,
    showLoginPopup: false,

    // 发表评论相关
    rating: 0,                      // 当前评分
    ratingTexts: ['很差', '一般', '还行', '不错', '超赞'],
    commentText: '',                // 评论内容
    hasVisited: false,              // 是否已去过
    hasEco: false,                  // 环保标记
    uploadImages: [],               // 已上传图片
    submitting: false,              // 提交中

    // 回复相关
    showReplyPanel: false,          // 回复弹窗
    replyTarget: {},                // 回复目标
    replyText: '',                  // 回复内容
    replySubmitting: false,         // 回复提交中
  },

  /**
   * 生命周期函数 - 页面加载
   */
  onLoad(options) {
    const routeId = options.routeId || options.id || ''
    this.setData({ routeId })

    // 检查登录状态
    this.checkLoginStatus()

    // 加载评论列表
    this.loadComments()
  },

  /**
   * 检查用户登录状态
   */
  checkLoginStatus() {
    const isLogin = app.globalData.isLogin || false
    this.setData({ isLogin })
  },

  /**
   * 加载评论列表
   * 优先调用云函数，失败时使用模拟数据
   */
  loadComments() {
    this.setData({ loading: true })

    const { routeId } = this.data

    wx.cloud.callFunction({
      name: 'comment',
      data: {
        action: 'getList',
        trail_id: routeId
      },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          // 云函数返回 { list, total, page, pageSize, hasMore }
          this.processComments(res.result.data.list || [])
        } else {
          // 云函数返回异常，使用模拟数据
          this.processComments(MOCK_COMMENTS)
        }
      },
      fail: () => {
        // 云函数未部署，使用模拟数据
        console.warn('云函数未部署，使用模拟数据')
        this.processComments(MOCK_COMMENTS)
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  /**
   * 处理评论数据，计算平均评分等
   */
  processComments(comments) {
    if (!comments || comments.length === 0) {
      this.setData({
        comments: [],
        avgRating: '0.0'
      })
      return
    }

    // 计算平均评分
    const totalRating = comments.reduce((sum, c) => sum + (c.rating || 0), 0)
    const avgRating = (totalRating / comments.length).toFixed(1)

    this.setData({
      comments,
      avgRating
    })
  },

  /**
   * 评分点击
   */
  onRatingTap(e) {
    const rating = e.currentTarget.dataset.index
    this.setData({ rating })
  },

  /**
   * 评论输入
   */
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  /**
   * 切换"已去过"状态
   */
  toggleVisited() {
    this.setData({ hasVisited: !this.data.hasVisited })
  },

  /**
   * 切换"我带走了垃圾"状态
   */
  toggleEco() {
    this.setData({ hasEco: !this.data.hasEco })
  },

  /**
   * 选择图片上传（最多3张）
   */
  chooseImage() {
    const remaining = 3 - this.data.uploadImages.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => f.tempFilePath)
        this.setData({
          uploadImages: [...this.data.uploadImages, ...newImages]
        })
      }
    })
  },

  /**
   * 删除已选图片
   */
  deleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.uploadImages]
    images.splice(index, 1)
    this.setData({ uploadImages: images })
  },

  /**
   * 发布评论
   */
  submitComment() {
    // 检查登录状态
    if (!this.data.isLogin) {
      this.setData({ showLoginPopup: true })
      return
    }

    const { rating, commentText, hasVisited, hasEco, uploadImages, routeId } = this.data

    // 校验评分
    if (rating === 0) {
      wx.showToast({ title: '请选择评分', icon: 'none' })
      return
    }

    // 校验评论内容
    if (!commentText.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    const commentData = {
      routeId,
      rating,
      content: commentText.trim(),
      hasVisited,
      hasEco,
      images: uploadImages
    }

    // 上传图片后提交评论
    this.uploadImagesAndSubmit(commentData)
  },

  // 关闭登录弹窗
  onLoginClose() {
    this.setData({ showLoginPopup: false })
  },

  // 登录成功
  onLoginSuccess() {
    this.setData({
      showLoginPopup: false,
      isLogin: true
    })
  },

  /**
   * 先上传图片，再提交评论
   */
  uploadImagesAndSubmit(commentData) {
    const { images } = commentData

    // 无图片直接提交
    if (images.length === 0) {
      this.doSubmitComment(commentData)
      return
    }

    // 有图片，先上传到云存储
    const uploadTasks = images.map((filePath, index) => {
      const cloudPath = `comments/${this.data.routeId}/${Date.now()}_${index}.jpg`
      return wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
    })

    Promise.all(uploadTasks)
      .then((results) => {
        commentData.images = results.map(r => r.fileID)
        this.doSubmitComment(commentData)
      })
      .catch(() => {
        wx.showToast({ title: '图片上传失败', icon: 'none' })
        this.setData({ submitting: false })
      })
  },

  /**
   * 调用云函数提交评论
   */
  doSubmitComment(commentData) {
    const userInfo = app.globalData.userInfo || {}
    wx.cloud.callFunction({
      name: 'comment',
      data: {
        action: 'add',
        trail_id: commentData.routeId,
        user_id: userInfo._id || 'anonymous',
        content: commentData.content,
        rating: commentData.rating,
        visited: commentData.hasVisited,
        eco_mark: commentData.hasEco,
        images: commentData.images || []
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '评论成功', icon: 'success' })
          // 清空表单
          this.setData({
            rating: 0,
            commentText: '',
            hasVisited: false,
            hasEco: false,
            uploadImages: []
          })
          // 刷新评论列表
          this.loadComments()
        } else {
          wx.showToast({ title: '评论失败，请重试', icon: 'none' })
        }
      },
      fail: () => {
        // 云函数未部署，模拟提交成功
        const userInfo = app.globalData.userInfo || {}
        const newComment = {
          _id: 'mock_' + Date.now(),
          userId: userInfo._id || 'current_user',
          nickName: userInfo.nickName || '我',
          avatarUrl: userInfo.avatarUrl || '',
          levelBadge: '初行者',
          rating: commentData.rating,
          content: commentData.content,
          images: commentData.images || [],
          hasVisited: commentData.hasVisited,
          hasEco: commentData.hasEco,
          likeCount: 0,
          isLiked: false,
          timeAgo: '刚刚',
          createdAt: Date.now()
        }

        // 添加到列表头部
        const comments = [newComment, ...this.data.comments]
        this.processComments(comments)

        wx.showToast({ title: '评论成功', icon: 'success' })
        this.setData({
          rating: 0,
          commentText: '',
          hasVisited: false,
          hasEco: false,
          uploadImages: []
        })
      },
      complete: () => {
        this.setData({ submitting: false })
      }
    })
  },

  /**
   * 点赞评论（防重复点赞）
   */
  likeComment(e) {
    const commentId = e.currentTarget.dataset.id
    const { comments } = this.data
    const comment = comments.find(c => c._id === commentId)

    if (!comment) return

    // 已点赞，取消点赞
    if (comment.isLiked) {
      this.updateLike(commentId, false)
      return
    }

    // 防重复点击
    if (this._likeLock) return
    this._likeLock = true
    setTimeout(() => { this._likeLock = false }, 500)

    this.updateLike(commentId, true)
  },

  /**
   * 更新点赞状态
   */
  updateLike(commentId, isLiked) {
    const { comments } = this.data
    const updatedComments = comments.map(c => {
      if (c._id === commentId) {
        return {
          ...c,
          isLiked,
          likeCount: (c.likeCount || 0) + (isLiked ? 1 : -1)
        }
      }
      return c
    })

    this.setData({ comments: updatedComments })

    // 调用云函数同步点赞状态
    const userInfo = app.globalData.userInfo || {}
    wx.cloud.callFunction({
      name: 'comment',
      data: {
        action: 'like',
        comment_id: commentId,
        user_id: userInfo._id || 'anonymous'
      },
      fail: () => {
        // 云函数未部署，本地状态已更新
      }
    })
  },

  /**
   * 预览评论图片
   */
  previewImage(e) {
    const { src, list } = e.currentTarget.dataset
    wx.previewImage({
      current: src,
      urls: list
    })
  },

  /**
   * 打开回复弹窗
   */
  replyComment(e) {
    if (!this.data.isLogin) {
      this.setData({ showLoginPopup: true })
      return
    }

    const comment = e.currentTarget.dataset.comment
    this.setData({
      showReplyPanel: true,
      replyTarget: comment,
      replyText: ''
    })
  },

  /**
   * 关闭回复弹窗
   */
  closeReplyPanel() {
    this.setData({
      showReplyPanel: false,
      replyTarget: {},
      replyText: ''
    })
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {},

  /**
   * 回复输入
   */
  onReplyInput(e) {
    this.setData({ replyText: e.detail.value })
  },

  /**
   * 提交回复
   */
  submitReply() {
    const { replyTarget, replyText } = this.data

    if (!replyText.trim()) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' })
      return
    }

    this.setData({ replySubmitting: true })

    wx.cloud.callFunction({
      name: 'comments',
      data: {
        action: 'reply',
        commentId: replyTarget._id,
        content: replyText.trim()
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '回复成功', icon: 'success' })
          this.closeReplyPanel()
        } else {
          wx.showToast({ title: '回复失败', icon: 'none' })
        }
      },
      fail: () => {
        // 云函数未部署，模拟回复成功
        wx.showToast({ title: '回复成功', icon: 'success' })
        this.closeReplyPanel()
      },
      complete: () => {
        this.setData({ replySubmitting: false })
      }
    })
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadComments()
    wx.stopPullDownRefresh()
  },

  /**
   * 用户分享
   */
  onShareAppMessage() {
    return {
      title: '看看这条路线的评价',
      path: `/pages/comments/comments?routeId=${this.data.routeId}`
    }
  }
})
