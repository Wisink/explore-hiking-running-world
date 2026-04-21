// pages/running-article-list/running-article-list.js
const db = wx.cloud.database()

Page({
  data: {
    statusBarHeight: 0,
    subcategory: '',
    subcategoryName: '',
    lt: '<',
    articles: [],
    page: 0,
    pageSize: 10,
    hasMore: true,
    loading: false,
    totalCount: 0
  },

  onLoad(options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 接收参数
    const subcategory = options.subcategory || '1.1';
    const subcategoryName = options.name || '跑步前的心理准备';
    
    this.setData({
      subcategory,
      subcategoryName
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: subcategoryName
    });

    // 加载文章
    this.loadArticles();
  },

  // 加载文章
  async loadArticles() {
    if (this.data.loading || !this.data.hasMore) return;
    
    this.setData({ loading: true });
    
    try {
      const { subcategory, page, pageSize } = this.data;
      
      // 从云数据库查询文章
      const result = await db.collection('running_articles')
        .where({ 
          subcategory: subcategory,
          isActive: true 
        })
        .orderBy('order', 'asc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();
      
      const newArticles = result.data || [];
      
      // 更新数据
      this.setData({
        articles: [...this.data.articles, ...newArticles],
        page: page + 1,
        hasMore: newArticles.length === pageSize,
        loading: false,
        totalCount: this.data.articles.length + newArticles.length
      });
      
    } catch (err) {
      console.error('加载文章失败:', err);
      this.setData({ loading: false });
      
      // 如果是第一次加载失败，显示模拟数据
      if (this.data.page === 0) {
        this.loadMockData();
      }
    }
  },

  // 加载模拟数据（开发阶段使用）
  loadMockData() {
    const mockArticles = [
      { _id: '1', title: '为什么跑步前要调整心态', icon: '💭', difficulty: '入门级', readTime: 5, readCount: 128 },
      { _id: '2', title: '跑步新手常见心理误区', icon: '💭', difficulty: '入门级', readTime: 4, readCount: 95 },
      { _id: '3', title: '如何建立跑步自信心', icon: '💭', difficulty: '入门级', readTime: 6, readCount: 87 },
      { _id: '4', title: '跑步前的心理准备工作', icon: '💭', difficulty: '入门级', readTime: 3, readCount: 112 },
      { _id: '5', title: '克服跑步惰性的方法', icon: '💭', difficulty: '基础级', readTime: 5, readCount: 76 },
      { _id: '6', title: '设定合理的跑步目标', icon: '🎯', difficulty: '基础级', readTime: 7, readCount: 68 },
      { _id: '7', title: '跑步与冥想的关系', icon: '🧘', difficulty: '进阶级', readTime: 8, readCount: 45 },
      { _id: '8', title: '跑步中的自我对话', icon: '💭', difficulty: '进阶级', readTime: 6, readCount: 52 },
      { _id: '9', title: '如何保持跑步动力', icon: '🔥', difficulty: '基础级', readTime: 5, readCount: 89 },
      { _id: '10', title: '跑步前的视觉化训练', icon: '👁️', difficulty: '进阶级', readTime: 7, readCount: 34 }
    ];
    
    this.setData({
      articles: mockArticles,
      page: 1,
      hasMore: false,
      loading: false,
      totalCount: mockArticles.length
    });
  },

  // 触底加载更多
  onReachBottom() {
    this.loadArticles();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      articles: [],
      page: 0,
      hasMore: true,
      totalCount: 0
    });
    this.loadArticles().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onBackTap() {
    wx.navigateBack();
  },

  onSearchTap() {
    wx.navigateTo({
      url: '/pages/running-search/running-search'
    });
  },

  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/running-article/running-article?id=${id}`
    });
  }
})