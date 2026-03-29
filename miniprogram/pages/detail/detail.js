// pages/detail/detail.js
const app = getApp()

Page({
  data: {
    trailId: '',
    trail: {},
    isLiked: false,
    isFavorited: false,
    loading: true,
    showLoginPopup: false,
    loginDesc: '',
    pendingAction: null,
    // 默认安全提示
    defaultSafetyTips: [
      '出行前查看天气预报，避免恶劣天气出行',
      '结伴同行，不要单独行动',
      '携带足够的水和食物',
      '穿着适合徒步的鞋子和服装',
      '保持手机电量充足，携带充电宝',
      '告知家人或朋友你的行程'
    ],
    // 默认法律法规提醒
    defaultLawTips: [
      '遵守当地森林防火规定',
      '不携带火种进入林区',
      '遵守景区管理规定',
      '不破坏植被和野生动物'
    ],
    // 默认环保提醒
    defaultEcoTips: [
      '带走自己产生的所有垃圾',
      '不采摘花草，不破坏植被',
      '不惊扰野生动物',
      '使用已有步道，不走捷径'
    ]
  },

  onLoad: function (options) {
    const trailId = options.id || ''
    this.setData({ trailId })
    this.loadTrailDetail()
  },

  onShow: function () {
    // 每次显示时刷新收藏和点赞状态
    if (this.data.trailId) {
      this.checkLikeStatus()
      this.checkFavoriteStatus()
    }
  },

  // 加载路线详情
  loadTrailDetail: function () {
    this.setData({ loading: true })

    if (!this.data.trailId) {
      this.setData({ trail: this.getMockTrail(), loading: false })
      return
    }

    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: 'getDetail',
        id: this.data.trailId
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          // 将云函数返回的数据转换为页面需要的格式
          const data = res.result.data
          
          // 处理数组字段（可能是字符串或数组）
          const parseArray = (val) => {
            if (Array.isArray(val)) return val
            if (typeof val === 'string' && val.trim()) {
              // 尝试按分号、句号、逗号分割
              return val.split(/[;；,，。]/).filter(s => s.trim()).map(s => s.trim())
            }
            return []
          }
          
          // 获取风景图片（优先使用数据库中的图片，否则根据风景类型加载）
          const getSceneryImage = (data) => {
            if (data.image) return data.image
            // 从 reserve_02 获取风景图片路径
            if (data.reserve_02) return data.reserve_02
            // 默认图片
            return '/images/scenery/scenery-general.png'
          }
          
          const trail = {
            _id: data._id,
            name: data.name,
            image: getSceneryImage(data),
            scenery: data.scenery || 0,
            difficulty: data.difficulty || '',
            distance: data.distance || '',
            duration: data.duration || '',
            location: data.location || '',
            family_friendly: data.family_friendly || false,
            family_index: data.family_index || '',
            suitable_age: data.suitable_age || '',
            features: parseArray(data.features),
            best_season: parseArray(data.best_season),
            highlights: data.highlights || '',
            classic_route: data.classic_route || '',
            cost: data.cost || '',
            traffic: data.traffic || '',
            ticket_info: data.ticket_info || '',
            description: data.description || '',
            best_time: data.best_time || '',
            route_detail: data.route_detail || '',
            checkpoints: data.checkpoints || '',
            food: data.food || '',
            pitfall: data.pitfall || '',
            tips: data.tips || '',
            safety_tips: parseArray(data.safety_tips),
            law_tips: parseArray(data.law_tips),
            eco_tips: parseArray(data.eco_tips),
            likes_count: data.likes_count || 0,
            favorites_count: data.favorites_count || 0,
            comments_count: data.comments_count || 0,
            view_count: data.view_count || 0
          }
          this.setData({ trail, loading: false })
        } else {
          // 使用模拟数据
          this.setData({ trail: this.getMockTrail(), loading: false })
        }
      },
      fail: () => {
        // 使用模拟数据
        this.setData({ trail: this.getMockTrail(), loading: false })
      }
    })
  },

  // 获取模拟数据
  getMockTrail: function () {
    return {
      _id: this.data.trailId || '1',
      name: '华山',
      image: '',
      scenery: 5,
      difficulty: '高级',
      distance: '全程徒步约15公里',
      duration: '1-2天',
      location: '陕西省华阴市',
      family_friendly: false,
      family_index: '1',
      suitable_age: '12岁以上（专业级路线，不建议带小孩）',
      features: ['奇石', '日出', '日落', '云海', '雪景'],
      best_season: ['春季', '秋季'],
      highlights: '长空栈道、鹞子翻身、苍龙岭、华山论剑、绝壁千仞',
      classic_route: '西峰上北峰下（索道+徒步）',
      cost: '门票160元 + 西峰索道140元',
      traffic: '西安北站乘高铁至华山北站（约30分钟/54.5元），转公交/出租至游客中心；自驾走西潼高速至华阴约1.5小时；城东客运站有直达大巴（约2小时/28元）',
      ticket_info: '旺季（3-11月）160元，淡季（12-2月）100元；西峰索道140元（旺季），北峰索道80元（旺季）；长空栈道/鹞子翻身另收30元安全绳费；西峰摆渡车40元单程',
      description: '华山古称"西岳"，为中国五岳之一，以险峻著称。位于陕西省华阴市，距西安120公里。华山有东、西、南、北、中五峰，主峰南峰海拔2154米。华山不仅有壮丽的自然风光，更有丰富的历史文化内涵，是中华文明的发祥地之一。',
      best_time: '4-5月春花烂漫，9-10月秋高气爽最佳；夏季避暑亦可但多雨；冬季雪景绝美但路面结冰需冰爪',
      route_detail: '经典西上北下（约5-6小时）：西峰索道上→南峰（最高峰2154m）→东峰（看日出）→中峰→北峰索道下；夜爬路线：玉泉院→北峰→东峰看日出（约5-8小时）；纯徒步全程约15公里',
      checkpoints: '长空栈道（华山最险）、东峰日出、西峰绝壁莲花石、苍龙岭、华山论剑碑、南峰最高点',
      food: '山上物价贵（挑山工运输成本），建议自带干粮和水；山下华阴市/玉泉路餐馆多且实惠，推荐当地biangbiang面、肉夹馍',
      pitfall: '节假日索道排队2-3小时，建议工作日或早出发；山顶住宿贵且条件差（东峰最贵/最难订），提前预约；西峰住宿相对便宜可观日落',
      tips: '带手套（抓铁链）、头灯（夜爬必带）、防风外套（山顶风大）；穿登山鞋别穿新鞋；体力一般选索道上下，想挑战选西上北下，纯徒步需评估体力',
      safety_tips: [
        '长空栈道和鹞子翻身有一定危险性，恐高者慎选',
        '需恐高评估',
        '出行前查看天气预报，避免恶劣天气出行',
        '结伴同行，不要单独行动'
      ],
      law_tips: [
        '遵守当地森林防火规定',
        '不携带火种进入林区',
        '遵守景区管理规定'
      ],
      eco_tips: [
        '带走自己产生的所有垃圾',
        '不采摘花草，不破坏植被',
        '不惊扰野生动物'
      ],
      likes_count: 856,
      favorites_count: 432,
      comments_count: 234,
      view_count: 12580
    }
  },

  // 检查点赞状态
  checkLikeStatus: function () {
    const userInfo = app.globalData.userInfo
    if (!userInfo) return

    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: 'checkLike',
        trail_id: this.data.trailId,
        user_id: userInfo._id
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const data = res.result.data
          // 兼容返回格式：可能是布尔值或对象 { liked: true/false }
          const isLiked = typeof data === 'boolean' ? data : (data && data.liked)
          this.setData({ isLiked: !!isLiked })
        }
      },
      fail: () => {
        // 云函数未部署，保持默认状态
      }
    })
  },

  // 检查收藏状态
  checkFavoriteStatus: function () {
    const userInfo = app.globalData.userInfo
    if (!userInfo) return

    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: 'checkFavorite',
        trail_id: this.data.trailId,
        user_id: userInfo._id
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const data = res.result.data
          // 兼容返回格式：可能是布尔值或对象 { favorited: true/false }
          const isFavorited = typeof data === 'boolean' ? data : (data && data.favorited)
          this.setData({ isFavorited: !!isFavorited })
        }
      },
      fail: () => {
        // 云函数未部署，保持默认状态
      }
    })
  },

  // 点赞
  onLike: function () {
    if (!app.globalData.isLogin) {
      this.setData({
        showLoginPopup: true,
        loginDesc: '登录后可以点赞喜欢的路线',
        pendingAction: 'like'
      })
      return
    }

    const userInfo = app.globalData.userInfo
    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: 'like',
        trail_id: this.data.trailId,
        user_id: userInfo._id
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({
            isLiked: !this.data.isLiked,
            'trail.likes_count': this.data.isLiked ? 
              (this.data.trail.likes_count || 0) - 1 : 
              (this.data.trail.likes_count || 0) + 1
          })
        }
      }
    })
  },

  // 收藏
  onFavorite: function () {
    if (!app.globalData.isLogin) {
      this.setData({
        showLoginPopup: true,
        loginDesc: '登录后可以收藏喜欢的路线',
        pendingAction: 'favorite'
      })
      return
    }

    const userInfo = app.globalData.userInfo
    const action = this.data.isFavorited ? 'unfavorite' : 'favorite'
    
    wx.cloud.callFunction({
      name: 'trail',
      data: {
        action: action,
        trail_id: this.data.trailId,
        user_id: userInfo._id
      },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          this.setData({ isFavorited: !this.data.isFavorited })
          wx.showToast({
            title: this.data.isFavorited ? '已收藏' : '已取消收藏',
            icon: 'success'
          })
        }
      }
    })
  },

  // 评论
  onComment: function () {
    if (!app.globalData.isLogin) {
      this.setData({
        showLoginPopup: true,
        loginDesc: '登录后可以评论路线',
        pendingAction: 'comment'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/comments/comments?id=${this.data.trailId}&name=${encodeURIComponent(this.data.trail.name)}`
    })
  },

  // 纠错
  onCorrection: function () {
    if (!app.globalData.isLogin) {
      this.setData({
        showLoginPopup: true,
        loginDesc: '登录后可以提交纠错',
        pendingAction: 'correction'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/correction/correction?id=${this.data.trailId}&name=${encodeURIComponent(this.data.trail.name)}&location=${encodeURIComponent(this.data.trail.location || '')}`
    })
  },

  // 关闭登录弹窗
  onLoginClose: function () {
    this.setData({
      showLoginPopup: false,
      pendingAction: null
    })
  },

  // 登录成功
  onLoginSuccess: function () {
    this.setData({
      showLoginPopup: false
    })
    
    // 执行待处理的操作
    const action = this.data.pendingAction
    if (action) {
      this.setData({ pendingAction: null })
      if (action === 'like') {
        this.onLike()
      } else if (action === 'favorite') {
        this.onFavorite()
      } else if (action === 'comment') {
        this.onComment()
      } else if (action === 'correction') {
        this.onCorrection()
      }
    }
  }
})
