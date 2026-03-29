// components/login-popup/login-popup.js
const app = getApp()

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    desc: {
      type: String,
      value: '请先登录后再操作'
    }
  },

  data: {},

  methods: {
    // 点击遮罩关闭
    onClose: function () {
      this.triggerEvent('close')
    },

    // 阻止冒泡
    onStop: function () {},

    // 点击登录
    onLogin: function () {
      const that = this
      app.login().then(() => {
        that.triggerEvent('success')
      }).catch((err) => {
        console.error('登录失败', err)
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        })
      })
    }
  }
})
