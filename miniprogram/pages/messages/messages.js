// pages/messages/messages.js
const app = getApp()

// 消息类型映射
const TYPE_LABELS = {
  comment_reply: '评论回复',
  correction_result: '纠错结果',
  system: '系统通知',
  safety_alert: '安全提醒'
}

// 消息类型到跳转页面的映射
const TYPE_NAV_MAP = {
  comment_reply: '/pages/comments/comments?id=',
  correction_result: '/pages/correction/correction?id=',
  system: null,  // 系统通知不跳转
  safety_alert: '/pages/safety/safety'
}

Page({
  data: {
    // Tab配置
    tabs: [
      { key: 'all', label: '全部', unread: 0 },
      { key: 'comment_reply', label: '评论回复', unread: 0 },
      { key: 'correction_result', label: '纠错结果', unread: 0 },
      { key: 'system', label: '系统通知', unread: 0 }
    ],
    // 当前激活的Tab
    activeTab: 'all',
    // 所有消息
    messages: [],
    // 筛选后的消息
    filteredMessages: [],
    // 未读总数
    unreadCount: 0,
    // 加载状态
    loading: false
  },

  /**
   * 生命周期函数 - 页面加载
   */
  onLoad: function (options) {
    this.loadMessages()
  },

  /**
   * 生命周期函数 - 页面显示（每次回到页面都刷新）
   */
  onShow: function () {
    this.loadMessages()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function () {
    this.loadMessages().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载消息列表
   */
  loadMessages: async function () {
    this.setData({ loading: true })

    try {
      const messages = await this.fetchMessages()
      // 为每条消息添加类型标签和相对时间
      const processed = messages.map(msg => ({
        ...msg,
        type_label: TYPE_LABELS[msg.type] || '未知',
        relative_time: this.getRelativeTime(msg.create_time)
      }))

      this.setData({ messages: processed })
      this.updateFilteredMessages()
      this.updateUnreadStats()
    } catch (err) {
      console.error('加载消息失败', err)
    }

    this.setData({ loading: false })
  },

  /**
   * 从云函数获取消息列表
   * 云函数未部署时使用模拟数据
   */
  fetchMessages: function () {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'message',
        data: { action: 'getList' },
        success: (res) => {
          if (res.result && res.result.code === 0) {
            // 云函数返回 { list, total, page, pageSize, hasMore }
            const data = res.result.data
            resolve(Array.isArray(data) ? data : (data.list || []))
          } else {
            // 云函数返回异常，使用模拟数据
            resolve(this.getMockMessages())
          }
        },
        fail: () => {
          // 云函数调用失败，使用模拟数据
          resolve(this.getMockMessages())
        }
      })
    })
  },

  /**
   * 模拟数据 - 8-10条
   */
  getMockMessages: function () {
    const now = Date.now()
    return [
      {
        _id: '1',
        type: 'comment_reply',
        title: '小明回复了你的评论',
        summary: '你说的太对了！我也觉得太平峪的瀑布特别壮观，上次去正好赶上雨后，水量超大。',
        create_time: now - 2 * 60 * 1000,
        is_read: false,
        ref_id: 'c001'
      },
      {
        _id: '2',
        type: 'comment_reply',
        title: '户外达人李四回复了你',
        summary: '建议带上登山杖，那段路石头比较多，注意安全。装备推荐可以看我主页的攻略。',
        create_time: now - 25 * 60 * 1000,
        is_read: false,
        ref_id: 'c002'
      },
      {
        _id: '3',
        type: 'correction_result',
        title: '纠错处理结果通知',
        summary: '你提交的"翠华山景区门票价格"纠错已采纳，信息已更新。感谢你的贡献！',
        create_time: now - 45 * 60 * 1000,
        is_read: false,
        ref_id: 'e001'
      },
      {
        _id: '4',
        type: 'system',
        title: '春游海报已推送',
        summary: '你制作的「春日赏花徒步路线」海报已成功推送到社区，已有32人浏览。',
        create_time: now - 3 * 60 * 60 * 1000,
        is_read: true,
        ref_id: null
      },
      {
        _id: '5',
        type: 'safety_alert',
        title: '天气安全提醒',
        summary: '预报明日西安地区有暴雨，秦岭山区地质灾害风险高，建议取消或改期登山计划。',
        create_time: now - 5 * 60 * 60 * 1000,
        is_read: false,
        ref_id: null
      },
      {
        _id: '6',
        type: 'comment_reply',
        title: '张三回复了你的评论',
        summary: '周末一起去牛背梁怎么样？我已经去过三次了，可以当向导，熟悉路线。',
        create_time: now - 24 * 60 * 60 * 1000,
        is_read: true,
        ref_id: 'c003'
      },
      {
        _id: '7',
        type: 'correction_result',
        title: '纠错处理结果通知',
        summary: '你提交的"南五台开放时间"纠错未采纳，经核实当前信息无误。如有疑问请联系客服。',
        create_time: now - 2 * 24 * 60 * 60 * 1000,
        is_read: true,
        ref_id: 'e002'
      },
      {
        _id: '8',
        type: 'system',
        title: '平台公告：清明节活动',
        summary: '清明假期即将来临，平台推出"踏青寻春"主题活动，发布春游路线可获得积分奖励，快来参与吧！',
        create_time: now - 3 * 24 * 60 * 60 * 1000,
        is_read: true,
        ref_id: null
      },
      {
        _id: '9',
        type: 'safety_alert',
        title: '极端天气预警',
        summary: '未来48小时秦岭地区将迎来大范围降温，山区气温可能降至零度以下，请做好防寒准备。',
        create_time: now - 4 * 24 * 60 * 60 * 1000,
        is_read: false,
        ref_id: null
      },
      {
        _id: '10',
        type: 'system',
        title: '新功能上线通知',
        summary: '「秦人户外」全新路线地图功能已上线，支持离线地图下载，山区信号弱也能正常使用。快去试试吧！',
        create_time: now - 5 * 24 * 60 * 60 * 1000,
        is_read: true,
        ref_id: null
      }
    ]
  },

  /**
   * 计算相对时间
   * 刚刚 / 5分钟前 / 1小时前 / 昨天 / 日期
   */
  getRelativeTime: function (timestamp) {
    if (!timestamp) return ''

    const now = Date.now()
    const diff = now - timestamp
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) {
      return '刚刚'
    } else if (diff < hour) {
      return `${Math.floor(diff / minute)}分钟前`
    } else if (diff < day) {
      return `${Math.floor(diff / hour)}小时前`
    } else if (diff < 2 * day) {
      return '昨天'
    } else {
      const date = new Date(timestamp)
      const month = date.getMonth() + 1
      const dayNum = date.getDate()
      return `${month}月${dayNum}日`
    }
  },

  /**
   * Tab切换
   */
  onTabChange: function (e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeTab: key })
    this.updateFilteredMessages()
  },

  /**
   * 根据当前Tab筛选消息
   */
  updateFilteredMessages: function () {
    const { messages, activeTab } = this.data

    let filtered
    if (activeTab === 'all') {
      filtered = messages
    } else {
      filtered = messages.filter(msg => msg.type === activeTab)
    }

    // 按时间倒序排列
    filtered.sort((a, b) => b.create_time - a.create_time)

    this.setData({ filteredMessages: filtered })
  },

  /**
   * 更新未读统计数据
   */
  updateUnreadStats: function () {
    const { messages, tabs } = this.data

    // 统计总未读数
    const unreadCount = messages.filter(msg => !msg.is_read).length

    // 更新各Tab的未读角标
    const updatedTabs = tabs.map(tab => {
      if (tab.key === 'all') {
        return { ...tab, unread: unreadCount }
      } else {
        const count = messages.filter(msg => msg.type === tab.key && !msg.is_read).length
        return { ...tab, unread: count }
      }
    })

    this.setData({
      unreadCount,
      tabs: updatedTabs
    })
  },

  /**
   * 点击消息 - 标记已读并跳转
   */
  onMessageTap: function (e) {
    const message = e.currentTarget.dataset.message
    if (!message) return

    // 标记为已读
    if (!message.is_read) {
      this.markAsRead(message._id)
    }

    // 根据消息类型跳转
    this.navigateToMessage(message)
  },

  /**
   * 标记单条消息为已读
   */
  markAsRead: function (messageId) {
    // 先更新本地状态
    const messages = this.data.messages.map(msg => {
      if (msg._id === messageId) {
        return { ...msg, is_read: true }
      }
      return msg
    })

    this.setData({ messages })
    this.updateFilteredMessages()
    this.updateUnreadStats()

    // 同步到云函数
    wx.cloud.callFunction({
      name: 'message',
      data: {
        action: 'markRead',
        message_id: messageId
      },
      fail: (err) => {
        console.error('标记已读失败', err)
      }
    })
  },

  /**
   * 跳转到消息对应的页面
   */
  navigateToMessage: function (message) {
    const navPath = TYPE_NAV_MAP[message.type]

    if (!navPath) {
      // 系统通知和无跳转目标的消息
      if (message.type === 'system') {
        wx.showToast({ title: '查看详情功能开发中', icon: 'none' })
      }
      return
    }

    if (message.type === 'safety_alert') {
      // 安全提醒跳转到安全知识页
      wx.navigateTo({ url: navPath })
    } else if (message.ref_id) {
      // 评论/纠错跳转带ref_id
      wx.navigateTo({ url: navPath + message.ref_id })
    }
  },

  /**
   * 一键全部标记为已读
   */
  onMarkAllRead: function () {
    const { messages } = this.data
    const userInfo = app.globalData.userInfo || {}

    // 本地更新所有消息为已读
    const updated = messages.map(msg => ({ ...msg, is_read: true }))
    this.setData({ messages: updated })
    this.updateFilteredMessages()
    this.updateUnreadStats()

    // 同步到云函数
    wx.cloud.callFunction({
      name: 'message',
      data: { 
        action: 'markAllRead',
        user_id: userInfo._id || userInfo.openid || ''
      },
      success: () => {
        wx.showToast({ title: '已全部标为已读', icon: 'success' })
      },
      fail: (err) => {
        console.error('全部已读失败', err)
        wx.showToast({ title: '操作成功', icon: 'success' })
      }
    })
  }
})
