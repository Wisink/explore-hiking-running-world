Component({
  properties: {
    filters: {
      type: Array,
      value: []
    },
    activeValue: {
      type: String,
      value: 'all'
    },
    showAdvanced: {
      type: Boolean,
      value: true
    }
  },

  data: {
    activeIndex: 0
  },

  observers: {
    'activeValue': function(val) {
      const idx = this.data.filters.findIndex(f => f.value === val);
      if (idx >= 0) {
        this.setData({ activeIndex: idx });
      }
    }
  },

  methods: {
    onTap(e) {
      const { value, index } = e.currentTarget.dataset;
      this.setData({ activeIndex: index });
      this.triggerEvent('change', { value, index });
    },

    onAdvanced() {
      this.triggerEvent('advanced');
    }
  }
});
