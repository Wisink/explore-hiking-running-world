Component({
  data: {
    selected: 0,
    list: [
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
    ]
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      if (this.data.selected === index) return;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
})
