Component({
  properties: {
    text: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'default'  // difficulty | cost-free | cost-paid | scenery | crowd | primary | accent | default
    },
    size: {
      type: String,
      value: 'md'  // sm | md | lg
    },
    icon: {
      type: String,
      value: ''
    },
    selected: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    },
    dataValue: {
      type: String,
      value: ''
    }
  },

  data: {
    showRipple: false
  },

  methods: {
    onTap() {
      if (this.data.disabled) return;

      // 触发波纹效果
      this.setData({ showRipple: true });
      setTimeout(() => {
        this.setData({ showRipple: false });
      }, 400);

      this.triggerEvent('tap', {
        text: this.data.text,
        type: this.data.type,
        value: this.data.dataValue,
        selected: !this.data.selected
      });
    }
  }
});
