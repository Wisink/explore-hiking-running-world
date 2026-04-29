function showNiceToast(that, message, type = 'info', duration = 2000) {
  that.setData({ showToast: true, toastMessage: message, toastType: type })
  setTimeout(function() { that.setData({ showToast: false }) }, duration)
}

// pages/running-article/running-article.js
const app = getApp()
const _ = wx.cloud.database().command

Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    headerHeight: 0,
    loading: true,
    article: null,
    relatedArticles: [],
    articleId: '',
    isFavorited: false,
    myReview: null,
    showReviewInput: false,
    reviewText: '',
    paragraphs: [],
    isHtmlContent: false
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      headerHeight: wx.getSystemInfoSync().statusBarHeight + 44
    })
    const id = options.id
    if (id) {
      this.setData({ articleId: id })
      this.loadArticle(id)
    } else {
      showNiceToast(this, '文章不存在', 'error', 2000)
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onShareAppMessage() {
    const article = this.data.article
    return {
      title: article ? article.title : '跑步知识',
      path: `/pages/running-article/running-article?id=${this.data.articleId}`
    }
  },

  loadArticle(id) {
    this.setData({ loading: true })

    if (wx.cloud) {
      // 调用云函数获取文章详情（自动处理阅读历史、阅读数累加）
      wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getArticle', id }
      }).then(res => {
        if (res.result && res.result.code === 0) {
          const data = res.result.data
          this.processArticle(data)
          // 云函数已自动记录阅读历史和累加阅读数
          // 设置收藏状态和用户感受（云函数已返回）
          this.setData({
            isFavorited: data.isFavorited || false,
            myReview: data.userReview ? this.formatReview(data.userReview) : null,
            reviewText: data.userReview ? data.userReview.content : ''
          })
        } else {
          console.warn('获取文章失败:', res.result?.message)
          this.setData({ loading: false })
          showNiceToast(this, res.result?.message || '文章加载失败', 'error', 2000)
          setTimeout(() => wx.navigateBack(), 1500)
        }
      }).catch(err => {
        console.error('调用云函数失败:', err)
        this.setData({ loading: false })
        showNiceToast(this, '文章加载失败', 'error', 2000)
        setTimeout(() => wx.navigateBack(), 1500)
      })
    } else {
      this.setData({ loading: false })
      showNiceToast(this, '请先登录', 'error')
    }
  },

  processArticle(article) {
    // 格式化时间（兼容 Date 对象和字符串）
    let formattedDate = ''
    if (article.createdAt) {
      if (typeof article.createdAt === 'string') {
        formattedDate = article.createdAt.replace(/-/g, '.')
      } else if (article.createdAt instanceof Date) {
        const d = article.createdAt
        formattedDate = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
      }
    }

    // 获取相关文章
    let related = []
    if (article.viewCount && article.viewCount > 10) {
      // 热门文章，从直连数据库查询相关文章（同频道）
      const db = wx.cloud.database()
      const _ = db.command
      db.collection('running_articles')
        .where({ channel: article.channel, _id: _.neq(article._id) })
        .limit(4)
        .get()
        .then(res => {
          related = res.data.filter(a => a._id !== article._id).slice(0, 3)
          this.setData({ relatedArticles: related })
        })
        .catch(() => {})
    }

    this.setData({
      loading: false,
      article: {
        ...article,
        formattedDate,
        viewCount: article.viewCount || 0
      },
      relatedArticles: related,
      // 检测是否为HTML内容（富文本编辑器创建）
      isHtmlContent: this.isHtmlContent(article.content || ''),
      paragraphs: (article.content || '').split('\n').filter(p => p.trim())
    })


    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: article.title })
  },

  // 检测内容是否为HTML格式
  isHtmlContent(content) {
    // 检查是否包含常见HTML标签
    return /<[a-z][\s\S]*>/i.test(content)
  },

  // 格式化感受时间
  formatReview(review) {
    let formattedTime = ''
    if (review.createdAt) {
      if (typeof review.createdAt === 'string') {
        formattedTime = review.createdAt.replace(/-/g, '.').substring(0, 16)
      } else if (review.createdAt instanceof Date) {
        const d = review.createdAt
        formattedTime = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      }
    }
    return { ...review, formattedTime }
  },

  // 切换收藏
  onToggleFavorite() {
    if (!wx.cloud) {
      showNiceToast(this, '请先登录', 'error')
      return
    }

    wx.cloud.callFunction({
      name: 'running-api',
      data: { action: 'toggleFavorite', articleId: this.data.articleId }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        const isFavorited = res.result.data.isFavorited
        this.setData({ isFavorited })
        showNiceToast(this, isFavorited ? '已收藏' : '已取消收藏', 'success')
      } else {
        showNiceToast(this, res.result?.message || '操作失败', 'error')
      }
    }).catch(err => {
      console.error('收藏操作失败:', err)
      showNiceToast(this, '操作失败', 'error')
    })
  },

  // 写感受按钮
  onWriteReview() {
    this.setData({ showReviewInput: true })
  },

  // 编辑感受
  onEditReview() {
    this.setData({ showReviewInput: true })
  },

  // 取消写感受
  onCancelReview() {
    this.setData({ 
      showReviewInput: false,
      reviewText: this.data.myReview ? this.data.myReview.content : ''
    })
  },

  // 删除感受
  onDeleteReview() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条阅读感受吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#e53935',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'running-api',
            data: {
              action: 'deleteReview',
              articleId: this.data.articleId
            }
          }).then(res => {
            if (res.result && res.result.code === 0) {
              this.setData({
                myReview: null,
                showReviewInput: false,
                reviewText: ''
              })
              showNiceToast(this, '已删除', 'success')
            } else {
              showNiceToast(this, '删除失败', 'error')
            }
          }).catch(err => {
            console.error('删除感受失败:', err)
            showNiceToast(this, '删除失败', 'error')
          })
        }
      }
    })
  },

  // 感受输入
  onReviewInput(e) {
    this.setData({ reviewText: e.detail.value })
  },

  // 保存感受
  onSaveReview() {
    const reviewText = this.data.reviewText.trim()
    if (!reviewText) {
      showNiceToast(this, '请输入感受内容', 'error')
      return
    }

    if (!wx.cloud) {
      showNiceToast(this, '请先登录', 'error')
      return
    }

    wx.cloud.callFunction({
      name: 'running-api',
      data: {
        action: 'saveReview',
        articleId: this.data.articleId,
        content: reviewText
      }
    }).then(res => {
      if (res.result && res.result.code === 0) {
        const review = res.result.data
        // 兼容 Date 对象和字符串，fallback 用当前时间
        let formattedTime = ''
        if (review.createdAt) {
          if (typeof review.createdAt === 'string') {
            formattedTime = review.createdAt.replace(/-/g, '.').substring(0, 16)
          } else if (review.createdAt instanceof Date) {
            const d = review.createdAt
            formattedTime = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
          }
        } else {
          // 云函数没返回 createdAt，用当前时间
          const now = new Date()
          formattedTime = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
        }
        this.setData({
          myReview: { ...review, formattedTime },
          showReviewInput: false
        })
        showNiceToast(this, '保存成功', 'success')
      } else {
        showNiceToast(this, res.result?.message || '保存失败', 'error')
      }
    }).catch(err => {
      console.error('保存感受失败:', err)
      showNiceToast(this, '保存失败', 'error')
    })
  },

  // 分享按钮（触发系统分享）
  onShare() {
    // 微信小程序会自动调用 onShareAppMessage
    showNiceToast(this, '请点击右上角分享', 'info')
  },

  // 点击相关文章
  onRelatedTap(e) {
    const id = e.currentTarget.dataset.id
    wx.redirectTo({
      url: `/pages/running-article/running-article?id=${id}`
    })
  },

  // 返回上一页
  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      // 没有上一页，跳转到首页
      wx.switchTab({ url: '/pages/running-home/running-home' })
    }
  }
})