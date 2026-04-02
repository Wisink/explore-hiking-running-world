// pages/knowledge/knowledge.js
const app = getApp()

// 根据文章标题和子分类精准匹配emoji图标
function getArticleIcon(article) {
  const title = (article.title || '').toLowerCase()
  const sub = article.subcategory || ''

  // 装备推荐类
  if (article.category === '装备推荐') {
    if (/徒步鞋|鞋/.test(title)) return '👟'
    if (/登山杖|杖/.test(title)) return '🏔️'
    if (/背包/.test(title)) return '🎒'
    if (/水壶|水袋|饮水|补水/.test(title)) return '💧'
    if (/帐篷/.test(title)) return '⛺'
    if (/头灯/.test(title)) return '🔦'
    if (/手套|护膝|护踝/.test(title)) return '🧤'
    if (/服装|冲锋衣|速干|袜子|内衣|分层/.test(title)) return '👕'
    if (/睡袋|防潮垫/.test(title)) return '🛏️'
    if (/炊具/.test(title)) return '🍳'
    if (/对讲机/.test(title)) return '📻'
    if (/相机|运动相机/.test(title)) return '📷'
    if (/手表/.test(title)) return '⌚'
    if (/急救毯/.test(title)) return '🩹'
    if (/雨衣|雨裤/.test(title)) return '🌂'
    if (/收纳/.test(title)) return '📦'
    if (/清单/.test(title)) return '✅'
    return '🎒' // 通用装备
  }

  // 安全自救类
  if (article.category === '安全自救') {
    if (/急救|急救包|急救基本/.test(title)) return '🩹'
    if (/中暑|晒伤/.test(title)) return '🌡️'
    if (/失温|冻伤/.test(title)) return '🥶'
    if (/蛇虫|动物伤害/.test(title)) return '🐍'
    if (/扭伤/.test(title)) return '🦴'
    if (/溺水/.test(title)) return '🌊'
    if (/雷电/.test(title)) return '⛈️'
    if (/暴风雪/.test(title)) return '❄️'
    if (/山洪/.test(title)) return '🏔️'
    if (/迷路|导航/.test(title)) return '🧭'
    if (/信号|求救/.test(title)) return '🆘'
    if (/高原/.test(title)) return '🏔️'
    if (/低血糖/.test(title)) return '🍬'
    if (/脱水|补水/.test(title)) return '💧'
    if (/植物中毒/.test(title)) return '☠️'
    if (/热身|拉伸/.test(title)) return '🏃'
    if (/检查清单/.test(title)) return '✅'
    if (/季节/.test(title)) return '🍂'
    if (/安全须知/.test(title)) return '🛡️'
    return '🛡️' // 通用安全
  }

  // 户外礼仪类
  if (article.category === '户外礼仪') {
    if (/无痕山林|LNT|Leave No Trace|环保/.test(title)) return '🌱'
    if (/野生动物/.test(title)) return '🦎'
    if (/步道|礼让/.test(title)) return '🏘️'
    if (/营地|防火/.test(title)) return '🏕️'
    if (/垃圾/.test(title)) return '♻️'
    if (/如厕/.test(title)) return '🚻'
    if (/团队/.test(title)) return '👥'
    return '🌿' // 通用礼仪
  }

  // 其他类
  if (article.category === '其他') {
    if (/路线|选择/.test(title)) return '🗺️'
    if (/体能|训练/.test(title)) return '💪'
    if (/团队/.test(title)) return '👥'
    if (/动植物|自然|科普/.test(title)) return '🍃'
    return '📚' // 通用其他
  }

  return '📖'
}

// 获取分类代表性图标
function getCategoryIcon(category) {
  const icons = {
    '装备推荐': '🎒',
    '安全自救': '🛡️',
    '户外礼仪': '🌿',
    '其他': '📚'
  }
  return icons[category] || '📖'
}

Page({
  data: {
    loading: true,
    statusBarHeight: 0,
    activeCategory: '',
    categoryCount: { equipment: 0, safety: 0, etiquette: 0 },
    grouped: {},
    filteredArticles: [],
    recommended: [],
    categories: [
      { key: '装备推荐', icon: '🎒', name: '装备推荐' },
      { key: '安全自救', icon: '🛡️', name: '安全自救' },
      { key: '户外礼仪', icon: '🌿', name: '户外礼仪' },
      { key: '其他', icon: '📚', name: '其他' }
    ],
    categorizedArticles: {},
    showAll: {},
    isCategoryMode: false
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
    if (options && options.category) {
      this.setData({ 
        activeCategory: options.category,
        isCategoryMode: true
      })
    }
    this.loadArticles()
  },

  onShow() {
    // 从globalData读取待切换的分类（通过switchTab从详情页跳转过来）
    const app = getApp()
    if (app.globalData && app.globalData.pendingCategory) {
      const category = app.globalData.pendingCategory
      app.globalData.pendingCategory = null
      this.setData({ activeCategory: category, isCategoryMode: true })
      this.loadArticles()
    }
  },

  onPullDownRefresh() {
    this.loadArticles(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadArticles(callback) {
    this.setData({ loading: true })

    // 从云数据库分页加载全部文章
    if (wx.cloud) {
      const db = wx.cloud.database()
      const MAX = 20
      const allArticles = []
      const fetchPage = (skip) => {
        db.collection('articles')
          .where({ isActive: true })
          .orderBy('order', 'asc')
          .skip(skip)
          .limit(MAX)
          .get()
          .then(res => {
            allArticles.push(...res.data)
            if (res.data.length === MAX) {
              fetchPage(skip + MAX)
            } else {
              this.processArticles(allArticles)
              if (callback) callback()
            }
          })
          .catch(err => {
            console.warn('云数据库加载失败，使用本地数据:', err)
            if (allArticles.length > 0) {
              this.processArticles(allArticles)
            } else {
              this.loadLocalArticles()
            }
            if (callback) callback()
          })
      }
      fetchPage(0)
    } else {
      this.loadLocalArticles()
      if (callback) callback()
    }
  },

  loadLocalArticles() {
    try {
      const articles = require('../../data/articles.json')
      this.processArticles(articles)
    } catch (e) {
      console.error('本地数据加载失败:', e)
      this.setData({ loading: false })
    }
  },

  processArticles(articles) {
    // 保存原始文章列表
    this._allArticles = articles

    // 为每篇文章添加精准图标
    const articlesWithIcon = articles.map(a => ({
      ...a,
      icon: getArticleIcon(a)
    }))

    // 按分类过滤
    let filtered = articlesWithIcon
    if (this.data.activeCategory) {
      filtered = articlesWithIcon.filter(a => a.category === this.data.activeCategory)
    }

    // 推荐文章：均衡推荐，从每个子分类取1篇优先级最高的
    const recommended = this.getRecommendedArticles(articlesWithIcon).map((item, index) => ({
      ...item,
      coverGradient: this.getCoverGradient(index)
    }))

    // 按分类组织（如果有activeCategory，只保留该分类）
    const categorizedArticles = {}
    this.data.categories.forEach(cat => {
      if (this.data.activeCategory && cat.key !== this.data.activeCategory) {
        return
      }
      categorizedArticles[cat.key] = articlesWithIcon
        .filter(a => a.category === cat.key)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    })

    // 构建显示用的文章列表（默认每类5篇）
    this._allCategorizedArticles = categorizedArticles
    const displayedCategorizedArticles = this._rebuildDisplayed(categorizedArticles, this.data.showAll)

    // 按分类分组
    const grouped = {}
    articlesWithIcon.forEach(a => {
      if (!grouped[a.category]) grouped[a.category] = []
      grouped[a.category].push(a)
    })

    // 统计各分类数量
    const categoryCount = {
      equipment: (grouped['装备推荐'] || []).length,
      safety: (grouped['安全自救'] || []).length,
      etiquette: (grouped['户外礼仪'] || []).length,
      other: (grouped['其他'] || []).length
    }

    this.setData({
      loading: false,
      articles: filtered,
      grouped,
      categoryCount,
      recommended,
      categorizedArticles,
      displayedCategorizedArticles
    })
  },

  getCoverGradient(index) {
    const gradients = [
      'linear-gradient(135deg, #0d47a1 0%, #1976d2 100%)',  // 路线选择 - 蓝色
      'linear-gradient(135deg, #1B5E20 0%, #43A047 100%)',  // 装备清单 - 绿色
      'linear-gradient(135deg, #b71c1c 0%, #e53935 100%)',  // 安全须知 - 红色
      'linear-gradient(135deg, #4a148c 0%, #7b1fa2 100%)'   // LNT礼仪 - 紫色
    ]
    return gradients[index % gradients.length]
  },

  // 分类卡片点击 - 跳转到专题页面
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    if (!category) return
    wx.navigateTo({
      url: '/pages/topic/topic?category=' + encodeURIComponent(category)
    })
  },

  // 点击推荐文章
  onRecommendedTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/article-detail/article-detail?id=${id}`
    })
  },

  // 点击文章列表项
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/article-detail/article-detail?id=${id}`
    })
  },

  // 查看全部 - 跳转到专题页
  onViewAll(e) {
    const category = e.currentTarget.dataset.category
    if (!category) return
    wx.navigateTo({
      url: '/pages/topic/topic?category=' + encodeURIComponent(category)
    })
  },

  // 推荐逻辑：硬编码新手精选4篇，固定顺序
  getRecommendedArticles(articles) {
    const RECOMMENDED_IDS = [
      'article_052', // 如何选择适合自己的第一条徒步路线
      'article_050', // 新手徒步必备装备清单
      'article_051', // 户外徒步安全须知
      'article_054'  // 户外环保礼仪（Leave No Trace）
    ]
    const idMap = {}
    articles.forEach(a => { idMap[a._id] = a })
    return RECOMMENDED_IDS.map(id => idMap[id]).filter(Boolean)
  },

  // 新手入门路径点击
  onStepTap(e) {
    const dataset = e.currentTarget.dataset
    // 第三步和第四步：跳转到路线查询页
    if (dataset.type === 'routes') {
      wx.switchTab({ url: '/pages/routes/routes' })
      return
    }
    // 第一步和第二步：跳转到对应分类
    const category = dataset.category
    if (category) {
      wx.navigateTo({
        url: `/pages/topic/topic?category=${encodeURIComponent(category)}`
      })
    }
  },

  // 根据showAll状态构建显示列表
  _rebuildDisplayed(categorizedArticles, showAll) {
    const displayed = {}
    for (const key in categorizedArticles) {
      const all = categorizedArticles[key]
      displayed[key] = (showAll && showAll[key]) ? all : all.slice(0, 5)
    }
    return displayed
  }
})
