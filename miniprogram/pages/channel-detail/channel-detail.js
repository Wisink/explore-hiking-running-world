// pages/channel-detail/channel-detail.js
Page({
  data: {
    statusBarHeight: 0,
    channel: 1,
    channelName: '',
    lt: '<',
    subcategories: []
  },

  // 子分类映射数据
  subcategoryMap: {
    1: [
      { key: '1.1', name: '跑步前的心理准备', count: 4 },
      { key: '1.2', name: '跑步认知纠偏', count: 7 },
      { key: '1.3', name: '正确的跑绩观', count: 6 },
      { key: '1.4', name: '跑步与健康', count: 3 },
      { key: '1.5', name: '不同人群建议', count: 5 }
    ],
    2: [
      { key: '2.1', name: '第一次出门跑', count: 4 },
      { key: '2.2', name: '走跑交替', count: 2 },
      { key: '2.3', name: '第一个月常见问题', count: 5 },
      { key: '2.4', name: '从能跑到跑得舒服', count: 4 }
    ],
    3: [
      { key: '3.1', name: '跑步关键指标', count: 4 },
      { key: '3.2', name: '训练方法详解', count: 6 },
      { key: '3.3', name: '训练计划设计', count: 4 },
      { key: '3.4', name: '跑步技术', count: 3 },
      { key: '3.5', name: '交叉训练与力量', count: 4 }
    ],
    4: [
      { key: '4.1', name: '听懂身体信号', count: 3 },
      { key: '4.2', name: '损伤预防5原则', count: 5 },
      { key: '4.3', name: '常见损伤详解', count: 5 },
      { key: '4.4', name: '受伤了怎么办', count: 4 },
      { key: '4.5', name: '跑姿与损伤', count: 3 }
    ],
    5: [
      { key: '5.1', name: '跑鞋', count: 5 },
      { key: '5.2', name: '运动服装', count: 3 },
      { key: '5.3', name: '运动手表与心率设备', count: 3 },
      { key: '5.4', name: '其他装备', count: 3 }
    ],
    6: [
      { key: '6.1', name: '跑步历史与故事', count: 4 },
      { key: '6.2', name: '跑步哲学与思考', count: 4 },
      { key: '6.3', name: '全球跑步文化', count: 2 },
      { key: '6.4', name: '跑者故事', count: 5 }
    ],
    7: [
      { key: '7.1', name: '新手入门专题', count: 3 },
      { key: '7.2', name: '马拉松备赛专题', count: 4 },
      { key: '7.3', name: '减脂跑步专题', count: 3 },
      { key: '7.4', name: '跑步装备选购专题', count: 3 },
      { key: '7.5', name: '跑步损伤专题', count: 3 },
      { key: '7.6', name: '跑步与营养专题', count: 3 },
      { key: '7.7', name: '跑步心理专题', count: 3 },
      { key: '7.8', name: '跑步与社交专题', count: 3 },
      { key: '7.9', name: '跑步与工作平衡专题', count: 3 },
      { key: '7.10', name: '跑步数据解读专题', count: 3 }
    ]
  },

  onLoad(options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 接收参数
    const channel = parseInt(options.channel) || 1;
    const channelName = options.name || '跑步观念';
    
    // 获取对应的子分类
    const subcategories = this.subcategoryMap[channel] || [];
    
    this.setData({
      channel,
      channelName,
      subcategories
    });

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: channelName
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

  onSubcategoryTap(e) {
    const { subcategory, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/running-article-list/running-article-list?subcategory=${subcategory}&name=${name}`
    });
  }
})