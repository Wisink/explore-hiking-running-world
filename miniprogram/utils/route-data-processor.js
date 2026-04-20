// utils/route-data-processor.js
// 路线数据处理（原始数据 → UI 格式）

const {
  DIFFICULTY_MAP, DIFFICULTY_ZH, DIFFICULTY_COLORS, DIFFICULTY_TEXTS, DIFFICULTY_ICONS,
  TERRAIN_ZH, ROUTEDNA_ZH, SEASON_ZH, TECHNICAL_GRADE_ZH, WATER_SUPPLY_ZH,
  CELL_COVERAGE_ZH, TRAIL_MARKING_ZH, SAFETY_ZH, FAMILY_ZH, isNewRouteData
} = require('./route-constants')

function parseArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string' && val.trim()) {
    return val.split(/[;；,，。]/).filter(s => s.trim()).map(s => s.trim())
  }
  return []
}

const DEFAULT_EQUIPMENT = {
  must: [
    { name: '防滑运动鞋', reason: '路面有碎石和土路，防滑很重要' },
    { name: '饮用水（至少1L）', reason: '山里没有补给点，必须自带' },
    { name: '干粮/零食', reason: '及时补充体力，避免低血糖' },
    { name: '手机充满电', reason: '导航、拍照、紧急联络都需要' }
  ],
  suggest: [
    { name: '登山杖', reason: '上下坡减轻膝盖压力约30%' },
    { name: '防晒帽', reason: '山脊段无遮挡，容易晒伤' },
    { name: '充电宝', reason: '拍照+导航耗电快' }
  ],
  noNeed: [
    { name: '专业登山鞋', reason: '运动鞋够了，路况不复杂' },
    { name: '帐篷', reason: '一日往返，不需要露营' }
  ]
}

function getTimeplanAdvice() {
  const month = new Date().getMonth() + 1
  if (month >= 6 && month <= 8) {
    return { depart: '7:00 - 8:00', return: '14:00 前', tip: '夏季天长，建议早出发避开午后高温' }
  } else if (month >= 12 || month <= 2) {
    return { depart: '9:00 - 10:00', return: '13:00 前', tip: '⚠️ 冬季17:00天黑，建议天黑前2小时返程' }
  }
  return { depart: '8:00 - 9:00', return: '14:00 前', tip: '春秋舒适，建议按计划出发' }
}

function parseDurationVal(d) {
  if (!d) return 0
  const rangeMatch = d.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
  if (rangeMatch) return Math.round((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2 * 10) / 10
  const numMatch = d.match(/([\d.]+)/)
  return numMatch ? parseFloat(numMatch[1]) : 0
}

function processNewRouteData(data) {
  const diffLevel = data.difficulty || 3
  const diffColor = DIFFICULTY_COLORS[diffLevel] || '#FFC107'
  const diffText = DIFFICULTY_ZH[diffLevel] || '适中'
  const diffIcon = DIFFICULTY_ICONS[diffLevel] || '🟡'
  const diffHintText = DIFFICULTY_TEXTS[diffLevel] || '需要一定体力'
  const district = (data.location && data.location.district) ? data.location.district : ''
  const distanceText = data.distance ? `${data.distance}km` : ''
  const distanceKm = data.distance || 0

  let durationText = ''
  if (data.durationMin && data.durationMax) {
    durationText = `${data.durationMin}-${data.durationMax}小时`
  } else if (data.durationMin) {
    durationText = `约${data.durationMin}小时`
  }

  const elevationText = data.elevationGain ? `${data.elevationGain}m爬升` : ''
  const terrainLabels = Array.isArray(data.terrainTypes) && data.terrainTypes.length > 0
    ? data.terrainTypes.slice(0, 5).map(t => TERRAIN_ZH[t] || t) : []
  const routeDNALabels = Array.isArray(data.routeDNA) && data.routeDNA.length > 0
    ? data.routeDNA.slice(0, 4).map(d => ROUTEDNA_ZH[d] || d) : []
  const bestSeasonLabels = Array.isArray(data.bestSeasons) && data.bestSeasons.length > 0
    ? data.bestSeasons.map(s => SEASON_ZH[s] || s) : []

  // 图片处理
  let images = []
  let cloudPaths = []
  const isDirectUrl = (val) => typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'))
  const isCloudPath = (val) => typeof val === 'string' && val.startsWith('cloud://')

  if (data.coverImage && isDirectUrl(data.coverImage)) images.push(data.coverImage)
  if (Array.isArray(data.images)) {
    data.images.forEach(item => {
      if (isDirectUrl(item)) images.push(item)
      else if (isCloudPath(item)) cloudPaths.push(item)
    })
  }
  if (images.length === 0 && cloudPaths.length === 0) {
    images = ['/images/scenery/scenery-general.jpg']
  }

  const startName = (data.trailhead && data.trailhead.startName) ? data.trailhead.startName : ''
  const endName = (data.trailhead && data.trailhead.endName) ? data.trailhead.endName : ''
  const hasParking = !!(data.transport && data.transport.hasParking)
  const parkingNote = (data.transport && data.transport.parkingNote) ? data.transport.parkingNote : ''
  const publicTransport = (data.transport && data.transport.publicTransport) ? data.transport.publicTransport : ''

  return {
    _id: data._id,
    name: data.name,
    description: data.shortDesc || data.fullDesc || '',
    fullDesc: data.fullDesc || '',
    images: images,
    _cloudPaths: cloudPaths,
    diffLevel, diffColor, diffText, diffIcon, diffHintText,
    diffStars: diffLevel,
    distance: distanceText,
    distanceKm: distanceKm,
    duration: durationText,
    durationMin: data.durationMin,
    durationMax: data.durationMax,
    durationVal: parseDurationVal(durationText),
    elevation: elevationText,
    elevationGain: data.elevationGain || 0,
    elevationMax: data.elevationMax || 0,
    elevationMin: data.elevationMin || 0,
    district,
    terrainLabels,
    routeDNALabels,
    bestSeasonLabels,
    waterSupplyLabel: WATER_SUPPLY_ZH[data.waterSupply] || '',
    cellCoverageLabel: CELL_COVERAGE_ZH[data.cellCoverage] || '',
    trailMarkingLabel: TRAIL_MARKING_ZH[data.trailMarking] || '',
    safetyLabel: SAFETY_ZH[data.safetyLevel] || '',
    familyLabel: FAMILY_ZH[data.familyFriendly] || '',
    technicalGradeLabel: TECHNICAL_GRADE_ZH[data.technicalGrade] || '',
    startName,
    endName,
    hasParking,
    parkingNote,
    publicTransport,
    drivingGuide: (data.transport && data.transport.drivingGuide) ? data.transport.drivingGuide : '',
    estimatedCalories: data.estimatedCalories || 0,
    restPoints: data.restPoints || 0,
    // 兼容旧 WXML 字段
    difficulty: diffText,
    cost: '',
    location: district,
    navAddress: district || `导航搜索：${data.name}`,
    suitableFor: [],
    bestSeason: bestSeasonLabels,
    family_friendly: data.familyFriendly || 3,
    sections: [],
    routeSurfaceSummary: '',
    highlights: '',
    checkpoints: '',
    equipment: data.equipment || DEFAULT_EQUIPMENT,
    safety_tips: parseArray(data.safety_tips),
    law_tips: parseArray(data.law_tips),
    eco_tips: parseArray(data.eco_tips),
    emergencyPhone: data.emergencyPhone || '西安救援：029-12345',
    ticket_info: '',
    food: '',
    pitfall: '',
    tips: '',
    best_time: '',
    likes_count: data.likes_count || 0,
    favorites_count: data.favorites_count || 0,
    view_count: data.view_count || 0,
    favoriteCount: data.favoriteCount || 0,
    completedCount_global: data.completedCount || 0,
    timeplanAdvice: getTimeplanAdvice(),
    updatedAt: data.updatedAt ? (typeof data.updatedAt === 'string' ? data.updatedAt.split('T')[0] : '') : '',
    latitude: (data.location && data.location.lat) ? data.location.lat : null,
    longitude: (data.location && data.location.lng) ? data.location.lng : null,
    traffic: { hasParking, parkingNote, publicTransport }
  }
}

function processLegacyRouteData(data) {
  let difficultyStr = typeof data.difficulty === 'object' ? (data.difficulty.label || '中级') : (data.difficulty || '中级')
  const diffInfo = DIFFICULTY_MAP[difficultyStr] || DIFFICULTY_MAP['中级']
  let locationStr = typeof data.location === 'object' ? (data.location.address || '') : (data.location || '')
  let navAddress = typeof data.location === 'object' ? (data.location.navAddress || '') : (data.navAddress || '')
  let publicTransport = typeof data.location === 'object' ? (data.location.publicTransport || '') : (data.traffic || '')

  let costStr = typeof data.cost === 'object'
    ? (data.cost.type === '免费' ? '免费' : `${data.cost.note || ''} ${data.cost.amount ? data.cost.amount + '元' : ''}`.trim())
    : (data.cost || '免费')

  let distanceText, durationText, distanceKm = 0
  if (typeof data.distance === 'string' && data.distance.includes('/')) {
    const parts = data.distance.split('/')
    distanceText = parts[0].trim()
    durationText = parts[1] ? parts[1].trim() : ''
    const numMatch = distanceText.match(/([\d.]+)/)
    distanceKm = numMatch ? parseFloat(numMatch[1]) : 0
  } else if (data.distance_km) {
    distanceText = `约${data.distance_km}公里`
    distanceKm = data.distance_km
    durationText = data.duration_hours ? `约${data.duration_hours}小时` : ''
  } else {
    distanceText = data.distance || ''
    durationText = ''
    const numMatch = distanceText.match(/([\d.]+)/)
    distanceKm = numMatch ? parseFloat(numMatch[1]) : 0
  }

  // 图片处理
  let images = []
  let cloudPaths = []
  const isDirectUrl = (val) => typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'))
  const isCloudPath = (val) => typeof val === 'string' && val.startsWith('cloud://')

  if (data.imageUrl && isDirectUrl(data.imageUrl)) images.push(data.imageUrl)
  else if (data.image && isDirectUrl(data.image)) images.push(data.image)
  if (data.imagePath && isCloudPath(data.imagePath)) cloudPaths.push(data.imagePath)
  else if (data.image && isCloudPath(data.image)) cloudPaths.push(data.image)

  const imageArrays = [data.images, data.imageUrls, data.imagePaths]
  imageArrays.forEach(arr => {
    if (arr && Array.isArray(arr)) {
      arr.forEach(item => {
        if (isDirectUrl(item)) images.push(item)
        else if (isCloudPath(item)) cloudPaths.push(item)
      })
    }
  })
  if (images.length === 0 && cloudPaths.length === 0) {
    images = ['/images/scenery/scenery-general.jpg']
  }

  // 分段路况
  let sections = []
  let routeSurfaceSummary = ''
  if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
    sections = data.sections.map((s, i) => ({
      name: s.name || `第${i + 1}段`,
      desc: s.desc || '',
      road: s.road || '',
      difficulty: 2,
      diffColor: '#4CAF50',
      diffLabel: '适中',
      percent: Math.round(100 / data.sections.length)
    }))
    const roads = data.sections.map(s => s.road).filter(Boolean)
    if (roads.length) routeSurfaceSummary = '全程：' + roads.join(' + ')
  } else if (data.route_detail) {
    const parts = data.route_detail.split(/[;；。]/).filter(s => s.trim())
    sections = parts.map((p, i) => ({
      name: `第${i + 1}段`, desc: p.trim(), difficulty: 2,
      diffColor: '#4CAF50', diffLabel: '适中', surface: '土路', scenery: '',
      percent: Math.round(100 / parts.length)
    }))
  }

  const normalize = (list) => {
    if (!Array.isArray(list)) return []
    return list.map(item => typeof item === 'string' ? { name: item, reason: '' } : item)
  }

  return {
    _id: data._id,
    name: data.name,
    description: data.description || '',
    images,
    _cloudPaths: cloudPaths,
    difficulty: difficultyStr,
    diffStars: diffInfo.stars,
    diffColor: diffInfo.color,
    diffText: diffInfo.text,
    diffIcon: diffInfo.icon,
    distance: distanceText,
    distanceKm,
    duration: durationText,
    durationVal: parseDurationVal(durationText),
    elevation: data.elevation_gain_m || '',
    cost: costStr,
    location: locationStr,
    navAddress: navAddress || `导航搜索：${data.name}`,
    publicTransport,
    scenery: Array.isArray(data.scenery) ? data.scenery : [],
    suitableFor: parseArray(
      (typeof data.difficulty === 'object' && data.difficulty.suitableFor)
        ? data.difficulty.suitableFor : data.features || []
    ),
    bestSeason: parseArray(data.best_season || []),
    family_friendly: data.family_friendly || false,
    sections,
    routeSurfaceSummary,
    highlights: data.highlights || '',
    checkpoints: data.checkpoints || '',
    equipment: (() => {
      const eq = data.equipment || DEFAULT_EQUIPMENT
      return { must: normalize(eq.must), suggest: normalize(eq.suggest), noNeed: normalize(eq.noNeed) }
    })(),
    safety_tips: (data.safety && data.safety.warnings) ? data.safety.warnings : parseArray(data.safety_tips),
    law_tips: parseArray(data.law_tips),
    eco_tips: parseArray(data.eco_tips),
    emergencyPhone: (data.safety && data.safety.emergencyPhone) ? data.safety.emergencyPhone : (data.emergencyPhone || '西安救援：029-12345'),
    ticket_info: data.ticket_info || '',
    food: data.food || '',
    pitfall: data.pitfall || '',
    tips: data.tips || '',
    best_time: data.best_time || '',
    likes_count: data.likes_count || 0,
    favorites_count: data.favorites_count || 0,
    view_count: data.view_count || 0,
    favoriteCount: data.favoriteCount || 0,
    completedCount_global: data.completedCount || 0,
    timeplanAdvice: getTimeplanAdvice(),
    updatedAt: data.updatedAt ? (typeof data.updatedAt === 'string' ? data.updatedAt.split('T')[0] : '') : '',
    latitude: data.latitude || null,
    longitude: data.longitude || null
  }
}

/**
 * 处理路线详情数据（新版+旧版兼容）
 * @param {Object} data - 原始路线数据
 * @returns {Object} - 处理后的 UI 格式数据
 */
function processTrailDetail(data) {
  if (isNewRouteData(data)) {
    return processNewRouteData(data)
  }
  return processLegacyRouteData(data)
}

module.exports = { processTrailDetail }
