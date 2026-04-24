// pages/running-home/running-home.js
Page({
  data: {
    statusBarHeight: 0,
    channels: [
      { id: 1, icon: '💭', name: '跑步观念', count: 25 },
      { id: 2, icon: '🚀', name: '从零开始跑', count: 20 },
      { id: 3, icon: '🎯', name: '训练方法', count: 25 },
      { id: 4, icon: '🛡️', name: '无伤跑步', count: 25 },
      { id: 5, icon: '👟', name: '装备指南', count: 18 },
      { id: 6, icon: '🌍', name: '跑步文化', count: 17 },
      { id: 7, icon: '📚', name: '专题合集', count: 10 }
    ]
  },

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 加载频道文章统计
    this.loadChannelStats();
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  onSearchTap() {
    wx.navigateTo({
      url: '/pages/running-search/running-search'
    });
  },

  onChannelTap(e) {
    const { channel, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/channel-detail/channel-detail?channel=${channel}&name=${name}`
    });
  },

  // 加载频道文章统计
  async loadChannelStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'running-api',
        data: { action: 'getChannelStats' }
      });
      if (res.result.code === 0) {
        const stats = res.result.data;
        const channels = this.data.channels.map(ch => ({
          ...ch,
          count: stats[ch.id] || ch.count
        }));
        this.setData({ channels });
      }
    } catch (err) {
      console.error('加载频道统计失败:', err);
      // 失败时保留原硬编码值
    }
  }
})