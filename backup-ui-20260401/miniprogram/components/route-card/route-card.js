Component({
  properties: {
    route: {
      type: Object,
      value: {}
    },
    isFavorited: {
      type: Boolean,
      value: false
    }
  },

  data: {
    difficultyText: ''
  },

  observers: {
    'route.difficulty.level': function(level) {
      const labels = ['', '轻松入门', '新手友好', '需要体力', '富有挑战', '硬核路线'];
      this.setData({
        difficultyText: labels[level] || ''
      });
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { route: this.data.route });
    },

    onFavTap() {
      this.triggerEvent('fav', { route: this.data.route });
    },

    onImageError() {
      this.triggerEvent('imageerror', { route: this.data.route });
    }
  }
});
