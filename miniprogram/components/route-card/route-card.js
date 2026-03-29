Component({
  properties: {
    route: {
      type: Object,
      value: {}
    }
  },

  data: {
    difficultyText: ''
  },

  observers: {
    'route.difficulty.level': function(level) {
      const labels = ['', '第一次也能走', '新手友好', '需要体力', '有挑战', '硬核玩家'];
      this.setData({
        difficultyText: labels[level] || ''
      });
    }
  },

  methods: {
    onTap() {
      const id = this.data.route._id;
      if (id) {
        wx.navigateTo({
          url: `/pages/detail/detail?id=${id}`
        });
      }
      this.triggerEvent('tap', { route: this.data.route });
    },

    onImageError() {
      this.triggerEvent('imageerror', { route: this.data.route });
    }
  }
});
