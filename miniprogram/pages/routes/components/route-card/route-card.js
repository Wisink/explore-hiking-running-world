// 路线卡片组件 v4.0 - 适配新版 routes 数据集（数字字段）
// difficulty 是数字 1~5，distance/elevationGain 是数值，terrainLabels/dnaLabels 是中文数组

const DIFFICULTY_ZH = {
  1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难'
}

const TERRAIN_ZH = {
  mountain_path: '山间小路',
  forest: '穿越森林',
  stream: '溪流路段',
  ridge: '山脊行走',
  rock_scramble: '岩石攀爬',
  grassland: '高山草甸',
  paved: '景区步道'
}

const ROUTEDNA_ZH = {
  wet_environment: '亲水栈道',
  forest_shade: '林荫清凉',
  significant_climb: '持续爬升',
  technical: '技术路段',
  high_altitude: '高海拔',
  water_crossing: '涉水过河',
  exposed_ridge: '悬岩峭壁',
  long_distance: '长距离',
  remote: '人迹罕至',
  paved_comfort: '舒适步道',
  scenic_viewpoint: '观景台'
}

Component({
  properties: {
    route: {
      type: Object,
      value: {}
    },
    isFavorited: {
      type: Boolean,
      value: false
    },
    hideFav: {
      type: Boolean,
      value: false
    }
  },

  data: {
    difficultyText: '',
    difficultyValue: 3,
    terrainLabels: [],
    dnaLabels: [],
    diffColor: '#FFC107'
  },

  observers: {
    route: function (route) {
      if (!route) return

      // difficulty: 数字 1~5
      const difficultyLevel = typeof route.difficulty === 'number' ? route.difficulty : 3
      const difficultyText = DIFFICULTY_ZH[difficultyLevel] || '适中'

      // 颜色映射
      const diffColorMap = {
        1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF9800', 5: '#F44336'
      }
      const diffColor = route.diffColor || diffColorMap[difficultyLevel] || '#FFC107'

      // terrainLabels: 最多 3 个
      let terrainLabels = []
      if (route.terrainLabels && Array.isArray(route.terrainLabels)) {
        // 如果已经是中文数组，直接用
        terrainLabels = route.terrainLabels.slice(0, 3)
      } else if (route.terrainTypes && Array.isArray(route.terrainTypes)) {
        // 如果是英文数组，转中文
        terrainLabels = route.terrainTypes
          .map(t => TERRAIN_ZH[t] || t)
          .filter(Boolean)
          .slice(0, 3)
      }

      // dnaLabels: 最多 2 个
      let dnaLabels = []
      if (route.dnaLabels && Array.isArray(route.dnaLabels)) {
        dnaLabels = route.dnaLabels.slice(0, 2)
      } else if (route.routeDNA && Array.isArray(route.routeDNA)) {
        dnaLabels = route.routeDNA
          .map(d => ROUTEDNA_ZH[d] || d)
          .filter(Boolean)
          .slice(0, 2)
      }

      this.setData({
        difficultyText,
        difficultyValue: difficultyLevel,
        terrainLabels,
        dnaLabels,
        diffColor
      })
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { route: this.data.route })
    },

    onFavTap() {
      this.triggerEvent('fav', { route: this.data.route })
    },

    onImageError() {
      this.triggerEvent('imageerror', { route: this.data.route })
    }
  }
})
