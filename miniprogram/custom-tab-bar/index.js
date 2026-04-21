Component({
  data: {
    selected: 0,
    world: 'hiking',
    list: []
  },
  lifetimes: {
    attached() {
      this._updateWorld();
    }
  },
  pageLifetimes: {
    show() {
      this._updateWorld();
    }
  },
  methods: {
    _updateWorld() {
      const world = wx.getStorageSync('world') || 'hiking';
      const list = world === 'hiking' ? [
        {
          pagePath: '/pages/routes/routes',
          text: '路线查询',
          iconPath: '/images/tabbar/trail.png',
          selectedIconPath: '/images/tabbar/trail-active.png'
        },
        {
          pagePath: '/pages/knowledge/knowledge',
          text: '徒步知识',
          iconPath: '/images/tabbar/knowledge.png',
          selectedIconPath: '/images/tabbar/knowledge-active.png'
        },
        {
          pagePath: '/pages/profile/profile',
          text: '个人中心',
          iconPath: '/images/tabbar/profile.png',
          selectedIconPath: '/images/tabbar/profile-active.png'
        }
      ] : [
        {
          pagePath: '/pages/running-home/running-home',
          text: '跑步知识',
          iconPath: '/images/tabbar/knowledge.png',
          selectedIconPath: '/images/tabbar/knowledge-active.png'
        },
        {
          pagePath: '/pages/running-profile/running-profile',
          text: '个人中心',
          iconPath: '/images/tabbar/profile.png',
          selectedIconPath: '/images/tabbar/profile-active.png'
        }
      ];
      
      this.setData({ world, list });
    },
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      if (this.data.selected === index) return;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    },
    switchWorld() {
      const newWorld = this.data.world === 'hiking' ? 'running' : 'hiking';
      wx.setStorageSync('world', newWorld);
      
      // 更新全局状态
      const app = getApp();
      app.globalData.world = newWorld;
      
      // 更新组件状态
      this._updateWorld();
      
      // 切换到新世界的第一个tab
      if (this.data.list.length > 0) {
        this.setData({ selected: 0 });
        wx.switchTab({ url: this.data.list[0].pagePath });
      }
    }
  }
})
