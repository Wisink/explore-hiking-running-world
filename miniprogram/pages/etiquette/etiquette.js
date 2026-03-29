// pages/etiquette/etiquette.js
Page({
  data: {
    activeTab: 0,
    tabs: [
      { name: '社交礼仪', icon: '💬' },
      { name: '环境保护', icon: '🌿' },
      { name: '安全意识', icon: '🛡️' },
      { name: '尊重生命', icon: '🦌' },
      { name: '文明出行', icon: '🥾' }
    ],
    // 社交礼仪
    socialRules: [
      {
        icon: '🤝',
        title: '保持社交边界',
        content: '山野相遇是缘分，但不是社交场合。不要主动询问他人的职业、收入、婚姻状况等私人问题。让每个人都能享受独处的宁静。',
        important: true
      },
      {
        icon: '🤫',
        title: '安静徒步',
        content: '山林是大家的，不是你的KTV。大声喧哗、外放音乐都会破坏他人的体验。用耳朵听风声，用眼睛看风景。',
        important: true
      },
      {
        icon: '👋',
        title: '离队要打招呼',
        content: '临时有事需要离开队伍？一定要告知队友！不要让别人为你担心，更不要让救援队满山找你。',
        important: true
      },
      {
        icon: '🙏',
        title: '说声谢谢',
        content: '别人帮你拍照、分享食物、搀扶你过险路，一句简单的"谢谢"，让善意传递下去。'
      },
      {
        icon: '🎒',
        title: '不歧视装备',
        content: '有人穿专业冲锋衣，有人穿普通运动鞋，装备不同，热爱相同。不要评判别人的装备，尊重每个人的选择。'
      },
      {
        icon: '📸',
        title: '拍照不影响他人',
        content: '想拍美照？很好！但不要长时间占据最佳观景点，不要让路人等你摆pose。美景是大家的。'
      }
    ],
    // 环境保护
    envRules: [
      {
        icon: '🗑️',
        title: '带走所有垃圾',
        content: '你带来的，你带走。包括果皮、纸巾、包装袋。降解一个橘子皮需要2年，一个塑料袋需要数百年。',
        important: true
      },
      {
        icon: '🚯',
        title: '不留下任何痕迹',
        content: '无痕山野不是口号，是行动。不刻字、不堆石堆、不系彩带。让后来者看到的，是你看到的原始之美。'
      },
      {
        icon: '🔥',
        title: '不在野外用火',
        content: '一根烟头、一堆篝火，可能引发一场山火。在野外，火是最危险的东西。抽烟？请忍到山下。',
        important: true
      },
      {
        icon: '🚰',
        title: '保护水源',
        content: '不在水源处洗漱、不向溪流丢垃圾。水是山林的血脉，也是徒步者的生命线。'
      },
      {
        icon: '💩',
        title: '文明如厕',
        content: '远离水源至少60米，挖坑掩埋，带走纸巾。听起来尴尬？但这是每个户外人的必修课。'
      }
    ],
    // 安全意识
    safetyRules: [
      {
        icon: '👨‍👩‍👧‍👦',
        title: '告知家人行程',
        content: '出发前告诉家人你去哪里、预计什么时候回来。万一出事，这是救命的信息。',
        important: true
      },
      {
        icon: '🚶',
        title: '不要单独行动',
        content: '独行侠很酷，但结伴更安全。至少3人同行，互相照应。如果一定要独行，请选择成熟路线。',
        important: true
      },
      {
        icon: '🎒',
        title: '带齐安全装备',
        content: '急救包、哨子、手电、充电宝，这些不是累赘，是保命的工具。宁可备而不用，不可用而不备。'
      },
      {
        icon: '⏰',
        title: '量力而行',
        content: '天黑前下山！身体不适及时下撤！逞强不是勇敢，是愚蠢。山永远在那里，命只有一条。',
        important: true
      },
      {
        icon: '📱',
        title: '保持通讯畅通',
        content: '手机充满电，带充电宝。遇到危险，一个电话可能救你一命。记住：110、119、120。'
      },
      {
        icon: '🌤️',
        title: '关注天气变化',
        content: '出发前看天气预报，山里天气多变，遇到暴雨、雷电、大雾，立即下撤！'
      }
    ],
    // 尊重生命
    natureRules: [
      {
        icon: '🐿️',
        title: '不投喂野生动物',
        content: '你的零食对它们来说是毒药。投喂会让它们失去觅食能力，也会让它们对人类产生依赖。',
        important: true
      },
      {
        icon: '🦎',
        title: '不捕捉野生动物',
        content: '它们是山林的主人，我们是过客。不捉虫、不抓蛙、不捡鸟蛋。让生命自由生长。'
      },
      {
        icon: '🌺',
        title: '不采摘花草',
        content: '路边的野花不要采。它们是蜜蜂的食物，是风景的一部分。带回家的花，几天就枯萎了。'
      },
      {
        icon: '📏',
        title: '保持安全距离',
        content: '遇到野生动物，保持距离，静静观察。不要追赶、不要惊吓。它们怕你，比你怕它们更怕。'
      },
      {
        icon: '🔇',
        title: '减少噪音干扰',
        content: '大声喧哗会惊扰野生动物。在山林里，学会用眼睛和耳朵感受自然，而不是用嘴巴。'
      }
    ],
    // 文明出行
    civilRules: [
      {
        icon: '⬇️',
        title: '下山让上山',
        content: '上山的人更累，下山的人更轻松。侧身让路，一个微笑，一次点头，温暖彼此。',
        important: true
      },
      {
        icon: '🏋️',
        title: '轻装让重装',
        content: '背大包的人更辛苦，体谅他们的不容易。让路、帮忙，户外人互助的传统。'
      },
      {
        icon: '🤫',
        title: '控制音量',
        content: '山林不是你的客厅。聊天可以，但请降低音量。让更多人享受山林的宁静。'
      },
      {
        icon: '🅿️',
        title: '有序停车',
        content: '山脚下的停车位有限，不要乱停乱放。留出通道，方便他人。'
      },
      {
        icon: '🤝',
        title: '互帮互助',
        content: '看到有人需要帮助，主动伸出援手。今天你帮别人，明天别人帮你。'
      },
      {
        icon: '🙏',
        title: '尊重当地',
        content: '尊重当地的风俗习惯，不乱闯民宅，不破坏农田。我们是客人，要有客人的礼貌。'
      }
    ]
  },

  // 切换 Tab
  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ activeTab: index })
  }
})
