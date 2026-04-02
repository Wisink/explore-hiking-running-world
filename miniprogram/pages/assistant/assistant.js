// pages/assistant/assistant.js
const routesData = require('../../data/routes-data')

// 难度映射
const DIFFICULTY_MAP = {
  '第一次也能走': { level: 1, color: '#4CAF50', text: '轻松' },
  '稍微有点挑战': { level: 2, color: '#FFC107', text: '适中' }
}

// Step1 选项 → 筛选条件
const PLAY_OPTIONS = {
  easy: { maxDist: 5, maxDiffLevel: 1, label: '轻松散步' },
  serious: { minDist: 5, maxDist: 20, maxDiffLevel: 2, label: '认真徒步' },
  family: { maxDist: 3, maxDiffLevel: 1, familyFriendly: true, label: '亲子徒步' }
}

// Step2 选项 → 关键词
const SCENERY_OPTIONS = {
  stream: { keywords: ['溪', '水', '河', '瀑布', '溪流', '溪水'], label: '溪水' },
  forest: { keywords: ['林', '森林', '竹', '山林', '原始森林'], label: '森林' },
  mountain: { keywords: ['山', '峰', '顶', '塬', '草甸', '山脊'], label: '山顶' },
  historic: { keywords: ['古', '寺', '庙', '遗址', '陵', '城墙', '古迹', '古寺'], label: '古迹' },
  any: { keywords: [], label: '都行' }
}

// Step3 选项 → 距离范围
const DURATION_OPTIONS = {
  half: { maxDist: 5, label: '半天' },
  most: { minDist: 5, maxDist: 10, label: '大半天' },
  all: { minDist: 10, label: '一整天' },
  flexible: { label: '看情况' }
}

// 推荐理由模板
const REASON_TEMPLATES = {
  easy: '难度低，轻松好走，适合放松',
  serious: '距离适中，挑战与风景兼得',
  family: '距离短、路况好，适合带小朋友',
  stream: '沿途有溪水相伴，清凉惬意',
  forest: '穿行林间，满目绿意，洗肺之旅',
  mountain: '登高望远，山巅风景绝美',
  historic: '沿途有古迹遗址，边走边感受历史',
  any: '风景多样，不虚此行',
  half: '半天时间刚刚好，不赶不累',
  most: '时间充裕，可以慢慢欣赏风景',
  all: '一日行程，充实又满足',
  flexible: '时间灵活，随心而行'
}

Page({
  data: {
    statusBarHeight: 0,
    currentStep: 1,
    step1Choice: '',
    step2Choice: '',
    step3Choice: '',
    showResult: false,
    results: [],
    allMatched: [],
    resultReason: ''
  },

  onLoad: function () {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight
    })
  },

  // 选择Step1
  onStep1Tap: function (e) {
    const choice = e.currentTarget.dataset.value
    this.setData({
      step1Choice: choice,
      currentStep: 2
    })
  },

  // 选择Step2
  onStep2Tap: function (e) {
    const choice = e.currentTarget.dataset.value
    this.setData({
      step2Choice: choice,
      currentStep: 3
    })
  },

  // 选择Step3
  onStep3Tap: function (e) {
    const choice = e.currentTarget.dataset.value
    this.setData({ step3Choice: choice })
    this.doRecommend()
  },

  // 执行推荐
  doRecommend: function () {
    const { step1Choice, step2Choice, step3Choice } = this.data

    // 预处理所有路线
    const processed = routesData.map(r => {
      const diffStr = (r.difficulty && r.difficulty.label) || '稍微有点挑战'
      const diffInfo = DIFFICULTY_MAP[diffStr] || DIFFICULTY_MAP['稍微有点挑战']

      const sceneryArr = Array.isArray(r.scenery) ? r.scenery : (typeof r.scenery === 'string' ? r.scenery.split(/[|,，、]/).map(s => s.trim()).filter(Boolean) : [])

      const costStr = typeof r.cost === 'object'
        ? (r.cost.type === '免费' ? '免费' : `${r.cost.amount ? r.cost.amount + '元' : ''}`.trim())
        : (r.cost || '免费')

      const isFamily = r.difficulty && r.difficulty.suitableFor && r.difficulty.suitableFor.some(s => s.includes('亲子'))

      let coverImage = r.image || r.coverImage || ''
      if (!coverImage && sceneryArr.length > 0) {
        coverImage = this.getFeatureImage(sceneryArr[0])
      }

      return {
        ...r,
        diffLevel: diffInfo.level,
        diffColor: diffInfo.color,
        diffText: diffInfo.text,
        scenery: sceneryArr,
        features: sceneryArr.slice(0, 3),
        isFree: costStr.includes('免费'),
        cost: costStr,
        family_friendly: isFamily,
        coverImage,
        distanceText: r.distance_km ? `约${r.distance_km}公里` : '',
        durationText: r.duration_hours ? `约${r.duration_hours}小时` : ''
      }
    })

    // 筛选
    let matched = processed

    // Step1 难度+距离筛选
    const playRule = PLAY_OPTIONS[step1Choice]
    if (playRule) {
      matched = matched.filter(r => {
        if (playRule.maxDiffLevel && r.diffLevel > playRule.maxDiffLevel) return false
        if (playRule.maxDist && r.distance_km > playRule.maxDist) return false
        if (playRule.minDist && r.distance_km < playRule.minDist) return false
        if (playRule.familyFriendly && !r.family_friendly) return false
        return true
      })
    }

    // Step2 风景关键词筛选
    const sceneryRule = SCENERY_OPTIONS[step2Choice]
    if (sceneryRule && sceneryRule.keywords.length > 0) {
      const kws = sceneryRule.keywords
      matched = matched.filter(r => {
        // 匹配风景标签、路线名称、描述
        const sceneryText = (r.scenery || []).join('')
        const nameText = r.name || ''
        const descText = r.description || ''
        const fullText = sceneryText + nameText + descText
        return kws.some(kw => fullText.includes(kw))
      })
    }

    // Step3 距离筛选
    const durationRule = DURATION_OPTIONS[step3Choice]
    if (durationRule) {
      if (durationRule.maxDist) {
        matched = matched.filter(r => r.distance_km <= durationRule.maxDist)
      }
      if (durationRule.minDist) {
        matched = matched.filter(r => r.distance_km >= durationRule.minDist)
      }
    }

    // 排序：距离短、难度低优先
    matched.sort((a, b) => {
      const scoreA = (a.distance_km || 0) + (a.diffLevel - 1) * 3
      const scoreB = (b.distance_km || 0) + (b.diffLevel - 1) * 3
      return scoreA - scoreB
    })

    // 如果匹配太少，放宽条件
    if (matched.length < 3) {
      // 只保留Step1的条件
      let fallback = processed
      if (playRule) {
        fallback = fallback.filter(r => {
          if (playRule.maxDiffLevel && r.diffLevel > playRule.maxDiffLevel) return false
          if (playRule.familyFriendly && !r.family_friendly) return false
          return true
        })
      }
      fallback.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
      matched = fallback
    }

    // 生成推荐理由
    let reason = REASON_TEMPLATES[step1Choice] || ''
    if (sceneryRule && sceneryRule.label !== '都行') {
      reason += '，' + (REASON_TEMPLATES[step2Choice] || '')
    }
    if (durationRule && durationRule.label !== '看情况') {
      reason += '，' + (REASON_TEMPLATES[step3Choice] || '')
    }

    this.setData({
      showResult: true,
      allMatched: matched,
      results: matched.slice(0, 3),
      resultReason: reason
    })
  },

  // 换一批
  onRefresh: function () {
    const { allMatched } = this.data
    if (allMatched.length <= 3) {
      wx.showToast({ title: '已经全部推荐了', icon: 'none' })
      return
    }

    // 从剩余结果中随机选3条
    const remaining = allMatched.filter(r => !this.data.results.find(x => x._id === r._id))
    if (remaining.length === 0) {
      // 循环使用
      const shuffled = [...allMatched].sort(() => Math.random() - 0.5)
      this.setData({ results: shuffled.slice(0, 3) })
    } else {
      const shuffled = [...remaining].sort(() => Math.random() - 0.5)
      this.setData({ results: shuffled.slice(0, 3) })
    }
  },

  // 重新选
  onRestart: function () {
    this.setData({
      currentStep: 1,
      step1Choice: '',
      step2Choice: '',
      step3Choice: '',
      showResult: false,
      results: [],
      allMatched: []
    })
  },

  // 返回上一步
  onPrevStep: function () {
    if (this.data.currentStep > 1) {
      this.setData({ currentStep: this.data.currentStep - 1 })
    }
  },

  // 点击路线卡片
  onRouteTap: function (e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/route-detail/route-detail?id=${id}`
      })
    }
  },

  // 根据特色获取图片
  getFeatureImage: function (feature) {
    const imageMap = {
      '森林': '/images/scenery/scenery-forest.jpg',
      '溪流': '/images/scenery/scenery-stream-waterfall.jpg',
      '瀑布': '/images/scenery/scenery-stream-waterfall.jpg',
      '古道': '/images/scenery/scenery-trail.jpg',
      '山脊': '/images/scenery/scenery-trail.jpg',
      '花海': '/images/scenery/scenery-flowers.jpg',
      '云海': '/images/scenery/scenery-cloud-sea.jpg',
      '湖泊': '/images/scenery/scenery-lake.jpg',
      '峡谷': '/images/scenery/scenery-canyon.jpg',
      '田园': '/images/scenery/scenery-pastoral.jpg',
      '古迹': '/images/scenery/scenery-historic.jpg',
      '盘山公路': '/images/scenery/scenery-general.jpg',
      '古寺': '/images/scenery/scenery-historic.jpg'
    }
    return imageMap[feature] || '/images/scenery/scenery-general.jpg'
  },

  // 返回
  onGoBack: function () {
    wx.navigateBack()
  }
})
