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

  methods: {
    onTap() {
      if (this.data.disabled) return;
      this.triggerEvent('tap', {
        text: this.data.text,
        type: this.data.type,
        value: this.data.dataValue,
        selected: !this.data.selected
      });
    }
  }
});
