const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ==================== 工具函数 ====================

/** 根据月份推导季节 */
function getSeason(month) {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** 保守原则：同 priority 时取更高级别的推荐等级 */
const LEVEL_RANK = { must: 3, suggested: 2, not_needed: 1 }

// ==================== 条件评估引擎 ====================

/**
 * 评估单条条件
 * @param {Object} condition - { field, operator, value }
 * @param {Object} context  - 扁平化的评估上下文
 * @returns {boolean}
 */
function matchCondition(condition, context) {
  const { field, operator, value } = condition
  const actualValue = getField(context, field)

  if (actualValue === undefined || actualValue === null) return false

  switch (operator) {
    case '>=':  return actualValue >= value
    case '<=':  return actualValue <= value
    case '>':   return actualValue > value
    case '<':   return actualValue < value
    case '==':  return actualValue === value
    case '!=':  return actualValue !== value
    case 'includes':
      return Array.isArray(actualValue) && actualValue.includes(value)
    case 'not_includes':
      return Array.isArray(actualValue) && !actualValue.includes(value)
    case 'in':
      return Array.isArray(value) && value.includes(actualValue)
    default:
      console.warn('Unknown operator:', operator)
      return false
  }
}

/**
 * 从 context 中取值，支持嵌套字段如 "weather.temperature"
 */
function getField(obj, path) {
  if (!path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === undefined || current === null) return undefined
    current = current[part]
  }
  return current
}

/**
 * 评估复合条件组
 * @param {Array}  conditions - 条件数组
 * @param {String} logic      - "AND" 或 "OR"
 * @param {Object} context    - 评估上下文
 * @returns {boolean}
 */
function matchConditionGroup(conditions, logic, context) {
  if (!Array.isArray(conditions) || conditions.length === 0) return false
  if (logic === 'AND') {
    return conditions.every(c => matchCondition(c, context))
  }
  if (logic === 'OR') {
    return conditions.some(c => matchCondition(c, context))
  }
  return false
}

// ==================== 核心推荐算法 ====================

/**
 * 对单件装备执行匹配评估，返回最终推荐结果
 * @param {Object} equip   - 装备文档
 * @param {Object} context - 评估上下文
 * @returns {Object} { recommendation, reason, priority }
 */
function evaluateEquipment(equip, context) {
  const triggeredRules = []

  // 5b. 评估简单规则 matchingRules
  if (Array.isArray(equip.matchingRules)) {
    for (const rule of equip.matchingRules) {
      if (matchCondition(rule.condition, context)) {
        triggeredRules.push({
          recommendation: rule.recommendation,
          reason: rule.reason,
          priority: rule.priority || 5
        })
      }
    }
  }

  // 5c. 评估复合规则 complexRules
  if (Array.isArray(equip.complexRules)) {
    for (const rule of equip.complexRules) {
      if (matchConditionGroup(rule.conditions, rule.logic || 'AND', context)) {
        triggeredRules.push({
          recommendation: rule.recommendation,
          reason: rule.reason,
          priority: rule.priority || 5
        })
      }
    }
  }

  // 5d. 冲突解决
  if (triggeredRules.length === 0) {
    // 默认不推荐
    return {
      recommendation: 'not_needed',
      reason: '当前路线和天气条件下不需要此装备',
      priority: 0
    }
  }

  // 按 priority 降序排序
  triggeredRules.sort((a, b) => b.priority - a.priority)

  const top = triggeredRules[0]

  // 保守原则：检查是否有同 priority 但更高级别的推荐
  const samePriority = triggeredRules.filter(r => r.priority === top.priority)
  if (samePriority.length > 1) {
    let best = top
    for (const r of samePriority) {
      if (LEVEL_RANK[r.recommendation] > LEVEL_RANK[best.recommendation]) {
        best = r
      }
    }
    return best
  }

  return top
}

/**
 * 主推荐函数
 * @param {String} trailId - 路线ID
 * @returns {Object} { must, suggested, notNeeded, weather, trailName }
 */
async function recommend(trailId) {
  // 第一步：查询路线数据（加try-catch防止网络波动导致整个函数崩溃）
  let trail
  try {
    const trailRes = await db.collection('routes').doc(trailId).get()
    if (!trailRes.data) {
      throw new Error('路线不存在: ' + trailId)
    }
    trail = trailRes.data
  } catch (e) {
    console.error('[getRecommendation] 路线查询失败:', e.message, 'trailId:', trailId)
    throw new Error('路线查询失败: ' + e.message)
  }

  // 第二步：获取天气数据
  let weather = {
    temperature: 20, rain: false, rainLevel: 0, rainChance: 0,
    windSpeed: 2, uvIndex: 0, snow: false, humidity: 50,
    condition: '晴'
  }
  let weatherDesc = '天气数据暂不可用'

  try {
    // 优先使用路线经纬度获取天气
    const lat = trail.location && trail.location.lat
    const lng = trail.location && trail.location.lng

    let weatherResult
    if (lat && lng) {
      // 调用天气云函数，传入经纬度
      weatherResult = await cloud.callFunction({
        name: 'weather',
        data: { lat, lng, type: 'byLocation' }
      })
    } else {
      // 降级：按城市获取
      weatherResult = await cloud.callFunction({
        name: 'weather',
        data: { city: '西安' }
      })
    }

    if (weatherResult && weatherResult.result && weatherResult.result.code === 0) {
      const w = weatherResult.result.data
      weather = normalizeWeather(w)
      weatherDesc = `${w.icon || ''} ${w.desc || '晴'} ${w.temp || '--'}°C`
    }
  } catch (e) {
    console.error('[getRecommendation] 天气获取失败:', e.message)
  }

  // 第三步：构建评估上下文
  const now = new Date()
  const context = {
    // 路线数据
    distance: trail.distance || 0,
    durationMin: trail.durationMin || 0,
    durationMax: trail.durationMax || 0,
    elevationGain: trail.elevationGain || 0,
    elevationMax: trail.elevationMax || 0,
    elevationMin: trail.elevationMin || 0,
    difficulty: trail.difficulty || 3,
    terrainTypes: trail.terrainTypes || [],
    technicalGrade: trail.technicalGrade || 1,
    waterSupply: trail.waterSupply || 2,
    safetyLevel: trail.safetyLevel || 3,
    cellCoverage: trail.cellCoverage || 2,
    trailMarking: trail.trailMarking || 2,
    routeDNA: trail.routeDNA || [],
    restPoints: trail.restPoints || 0,
    familyFriendly: trail.familyFriendly || 3,
    estimatedCalories: trail.estimatedCalories || 0,
    bestSeasons: trail.bestSeasons || [],
    // 天气数据
    weather: weather,
    // 系统推导
    season: getSeason(now.getMonth() + 1)
  }

  // 第四步：查询所有装备
  let equipmentList = []
  try {
    const equipRes = await db.collection('equipment').limit(100).get()
    equipmentList = equipRes.data
  } catch (e) {
    console.error('[getRecommendation] 装备数据查询失败:', e.message)
    // 如果 equipment 集合不存在，返回默认推荐
    return getDefaultRecommendation(trail, weatherDesc)
  }

  if (equipmentList.length === 0) {
    return getDefaultRecommendation(trail, weatherDesc)
  }

  // 第五步：对每件装备执行匹配评估
  const results = []
  for (const equip of equipmentList) {
    const result = evaluateEquipment(equip, context)
    results.push({
      id: equip._id,
      name: equip.name,
      category: equip.category || '其他',
      icon: equip.icon || '🎒',
      recommendation: result.recommendation,
      reason: result.reason
    })
  }

  // 第六步：按推荐等级分组
  const must = results.filter(r => r.recommendation === 'must')
  const suggested = results.filter(r => r.recommendation === 'suggested')
  const notNeeded = results.filter(r => r.recommendation === 'not_needed')

  return {
    must,
    suggested,
    notNeeded,
    weather: weatherDesc,
    trailName: trail.name || '未知路线'
  }
}

/**
 * 将天气云函数返回的数据标准化为算法需要的格式
 */
function normalizeWeather(w) {
  const temp = parseInt(w.temp) || 20
  const desc = w.desc || ''
  const descEn = w.descEn || ''

  // 判断是否下雨
  const rainKeywords = ['雨', '雷', 'drizzle', 'rain', 'shower', 'thunder']
  const isRain = rainKeywords.some(kw =>
    desc.includes(kw) || descEn.toLowerCase().includes(kw)
  )

  // 判断是否下雪
  const snowKeywords = ['雪', '冰', 'snow', 'blizzard', 'ice']
  const isSnow = snowKeywords.some(kw =>
    desc.includes(kw) || descEn.toLowerCase().includes(kw)
  )

  // 估算降雨等级
  let rainLevel = 0
  if (isRain) {
    if (desc.includes('大雨') || desc.includes('暴雨')) rainLevel = 3
    else if (desc.includes('中雨')) rainLevel = 2
    else rainLevel = 1
  }

  // 风力等级
  const windStr = w.wind || ''
  const windMatch = windStr.match(/(\d+)/)
  const windSpeed = windMatch ? parseInt(windMatch[1]) : 2

  // 湿度
  const humidityStr = w.humidity || '50%'
  const humidityMatch = humidityStr.match(/(\d+)/)
  const humidity = humidityMatch ? parseInt(humidityMatch[1]) : 50

  return {
    temperature: temp,
    rain: isRain,
    rainLevel: rainLevel,
    rainChance: isRain ? 80 : 10,
    windSpeed: windSpeed,
    uvIndex: 0,
    snow: isSnow,
    humidity: humidity,
    condition: desc
  }
}

/**
 * 当 equipment 集合不存在时的兜底推荐
 */
function getDefaultRecommendation(trail, weatherDesc) {
  const dist = trail.distance || 0
  const elev = trail.elevationGain || 0
  const dur = trail.durationMax || 0
  const diff = trail.difficulty || 3
  const terrain = trail.terrainTypes || []

  const must = [
    { name: '防滑运动鞋', icon: '👟', category: '鞋类', recommendation: 'must', reason: '山路基本都需要防滑' },
    { name: '饮用水', icon: '💧', category: '饮水', recommendation: 'must', reason: dist >= 8 ? '长距离必须充足饮水' : '户外活动必须补水' },
    { name: '干粮/零食', icon: '🍫', category: '食物', recommendation: 'must', reason: dur >= 3 ? '长时徒步需要补充能量' : '及时补充体力' },
    { name: '手机充满电', icon: '📱', category: '电子设备', recommendation: 'must', reason: '导航和紧急联系必备' },
  ]

  if (elev >= 500) {
    must.push({ name: '登山杖', icon: '🏔️', category: '辅助装备', recommendation: 'must', reason: '大爬升对膝盖冲击大' })
  }
  if (diff >= 4) {
    must.push({ name: '急救包', icon: '🩹', category: '安全', recommendation: 'must', reason: '高难度路线受伤概率增加' })
  }
  if (dur >= 6) {
    must.push({ name: '头灯', icon: '🔦', category: '照明', recommendation: 'must', reason: '长距离徒步可能天黑' })
  }

  const suggest = [
    { name: '防晒帽', icon: '🧢', category: '防晒', recommendation: 'suggested', reason: '山顶紫外线较强' },
    { name: '充电宝', icon: '🔋', category: '电子设备', recommendation: 'suggested', reason: '导航和拍照耗电快' },
  ]

  if (terrain.includes('stream')) {
    suggest.push({ name: '备用袜子', icon: '🧦', category: '衣物', recommendation: 'suggested', reason: '涉水路段可能打湿' })
  }

  const notNeeded = []
  if (!terrain.includes('stream')) {
    notNeeded.push({ name: '溯溪鞋', icon: '🩴', category: '鞋类', recommendation: 'not_needed', reason: '路线没有涉水路段' })
  }

  return {
    must,
    suggested: suggest,
    notNeeded,
    weather: weatherDesc,
    trailName: trail.name || '未知路线'
  }
}

// ==================== 云函数入口 ====================

exports.main = async (event) => {
  const { trailId } = event

  if (!trailId) {
    return { code: -1, message: '缺少路线ID参数' }
  }

  try {
    const result = await recommend(trailId)
    return {
      code: 0,
      message: 'success',
      data: result
    }
  } catch (e) {
    console.error('[getRecommendation] 推荐失败:', e)
    return { code: -1, message: '装备推荐失败: ' + e.message }
  }
}
