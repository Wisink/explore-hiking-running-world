// pages/assistant/assistant.js
Page({
  data: {
    lt: '<',
    statusBarHeight: 0,
    headerHeight: 0,
    currentStep: 1,
    step1Choice: '',
    step2Choice: '',
    step3Choice: '',
    showResult: false,
    results: [],
    allMatched: [],
    resultReason: '',
    loading: false
  },

  onLoad: function () {
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      headerHeight: wx.getSystemInfoSync().statusBarHeight + 44
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
    const that = this
    const { step1Choice, step2Choice, step3Choice } = this.data
    this.setData({ showResult: false, loading: true })

    wx.cloud.callFunction({
      name: 'routes',
      data: { action: 'list', filterType: 'all', filter: 'all', page: 0, pageSize: 200 },
      success: (res) => {
        let list = []
        if (res.result && res.result.data && res.result.data.list) {
          list = res.result.data.list
        }

        // 预处理所有路线（新格式）
        const DIFFICULTY_MAP = {
          1: { level: 1, color: '#4CAF50', text: '轻松' },
          2: { level: 2, color: '#8BC34A', text: '简单' },
          3: { level: 3, color: '#FFC107', text: '适中' },
          4: { level: 4, color: '#FF9800', text: '较难' },
          5: { level: 5, color: '#F44336', text: '困难' }
        }

        const processed = list.map(r => {
          const difficultyLevel = typeof r.difficulty === 'number' ? r.difficulty : 3
          const diffInfo = DIFFICULTY_MAP[difficultyLevel] || DIFFICULTY_MAP[3]

          // terrainLabels（英文数组 -> 中文）
          const TERRAIN_ZH = {
            mountain_path: '山间小路', forest: '穿越森林', stream: '溪流路段',
            ridge: '山脊行走', rock_scramble: '岩石攀爬', grassland: '高山草甸', paved: '景区步道'
          }
          const terrainLabels = (r.terrainTypes || []).map(t => TERRAIN_ZH[t] || t)
          const sceneryArr = terrainLabels

          // 封面图
          let coverImage = r.image || r.coverImage || ''
          if (!coverImage) coverImage = '/images/scenery/scenery-general.jpg'

          // 距离/时长
          let distanceText = r.distance ? `约${r.distance}km` : ''
          let durationText = ''
          if (r.durationMin !== undefined) {
            if (r.durationMax !== undefined && r.durationMax > r.durationMin) {
              durationText = `${r.durationMin}-${r.durationMax}小时`
            } else {
              durationText = `${r.durationMin || r.durationMax}小时`
            }
          }

          // 费用
          let isFree = true
          let costStr = '免费'
          if (r.cost && typeof r.cost === 'object') {
            isFree = r.cost.type === '免费'
            costStr = isFree ? '免费' : `${r.cost.note || ''} ${r.cost.amount ? r.cost.amount + '元' : ''}`.trim()
          } else {
            isFree = String(r.cost || '').includes('免费')
            costStr = r.cost || '免费'
          }

          return {
            ...r,
            diffLevel: difficultyLevel,
            diffColor: diffInfo.color,
            diffText: diffInfo.text,
            scenery: sceneryArr,
            features: sceneryArr.slice(0, 3),
            isFree,
            cost: costStr,
            family_friendly: difficultyLevel <= 2,
            coverImage,
            distanceText,
            durationText,
            _id: r._id
          }
        })

        // ========== 筛选逻辑 ==========
        let matched = processed

        // Step1 难度+距离筛选
        const PLAY_OPTIONS = {
          easy: { maxDist: 5, maxDiffLevel: 2 },
          serious: { minDist: 5, maxDist: 20, maxDiffLevel: 3 },
          family: { maxDist: 5, maxDiffLevel: 2, familyFriendly: true }
        }
        const playRule = PLAY_OPTIONS[step1Choice]
        if (playRule) {
          matched = matched.filter(r => {
            if (playRule.maxDiffLevel && r.diffLevel > playRule.maxDiffLevel) return false
            if (playRule.maxDist && r.distance > playRule.maxDist) return false
            if (playRule.minDist && r.distance < playRule.minDist) return false
            if (playRule.familyFriendly && !r.family_friendly) return false
            return true
          })
        }

        // Step2 风景筛选
        const SCENERY_OPTIONS = {
          stream: ['stream', '溪流', '溪'],
          forest: ['forest', '森林', '林'],
          mountain: ['mountain_path', 'ridge', '草甸', '山'],
          historic: ['historic', '古', '寺'],
          any: []
        }
        const sceneryRule = SCENERY_OPTIONS[step2Choice]
        if (sceneryRule && sceneryRule.length > 0) {
          matched = matched.filter(r => {
            const all = [...(r.terrainTypes || []), ...(r.scenery || []), r.name || ''].join('')
            return sceneryRule.some(kw => all.includes(kw))
          })
        }

        // Step3 距离筛选
        const DURATION_OPTIONS = {
          half: { maxDist: 5 },
          most: { minDist: 5, maxDist: 10 },
          all: { minDist: 10 },
          flexible: {}
        }
        const durationRule = DURATION_OPTIONS[step3Choice]
        if (durationRule) {
          if (durationRule.maxDist) matched = matched.filter(r => (r.distance || 0) <= durationRule.maxDist)
          if (durationRule.minDist) matched = matched.filter(r => (r.distance || 0) >= durationRule.minDist)
        }

        // 排序
        matched.sort((a, b) => {
          const scoreA = (a.distance || 0) + (a.diffLevel - 1) * 3
          const scoreB = (b.distance || 0) + (b.diffLevel - 1) * 3
          return scoreA - scoreB
        })

        // 生成推荐理由
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
        let reason = REASON_TEMPLATES[step1Choice] || ''
        if (step2Choice !== 'any') reason += '，' + (REASON_TEMPLATES[step2Choice] || '')
        if (step3Choice !== 'flexible') reason += '，' + (REASON_TEMPLATES[step3Choice] || '')

        this.setData({
          results: matched.slice(0, 6),
          allMatched: matched,
          resultReason: reason,
          showResult: true,
          loading: false
        })
      },
      fail: () => {
        this.setData({ results: [], showResult: true, loading: false })
      }
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

  // 返回
  onGoBack: function () {
    wx.navigateBack()
  }
})
