// utils/route-constants.js
// 路线相关常量映射（新版+旧版数据兼容）

// 难度映射（旧版字符串格式）
const DIFFICULTY_MAP = {
  '初级': { level: 1, stars: 1, color: '#4CAF50', text: '新手也能轻松走', icon: '🟢' },
  '中级': { level: 3, stars: 3, color: '#FFC107', text: '需要一定体力', icon: '🟡' },
  '中级-高级': { level: 4, stars: 4, color: '#FF9800', text: '有经验者推荐', icon: '🟠' },
  '高级': { level: 5, stars: 5, color: '#F44336', text: '挑战者专属', icon: '🔴' }
}

// 新版 routes 数据集字段映射
const DIFFICULTY_ZH = { 1: '轻松', 2: '简单', 3: '适中', 4: '较难', 5: '困难' }
const DIFFICULTY_COLORS = { 1: '#4CAF50', 2: '#8BC34A', 3: '#FFC107', 4: '#FF9800', 5: '#F44336' }
const DIFFICULTY_TEXTS = { 1: '新手也能轻松走', 2: '简单徒步无压力', 3: '需要一定体力', 4: '有经验者推荐', 5: '挑战者专属' }
const DIFFICULTY_ICONS = { 1: '🟢', 2: '🟢', 3: '🟡', 4: '🟠', 5: '🔴' }

const TERRAIN_ZH = {
  mountain_path: '山间小路', forest: '穿越森林', stream: '溪流路段',
  ridge: '山脊行走', rock_scramble: '岩石攀爬', grassland: '高山草甸', paved: '景区步道'
}

const ROUTEDNA_ZH = {
  wet_environment: '亲水栈道', forest_shade: '林荫清凉', significant_climb: '持续爬升',
  technical: '技术路段', high_altitude: '高海拔', water_crossing: '涉水过河',
  exposed_ridge: '悬岩峭壁', long_distance: '长距离', remote: '人迹罕至',
  paved_comfort: '舒适步道', scenic_viewpoint: '观景台'
}

const SEASON_ZH = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
const TECHNICAL_GRADE_ZH = { 1: '入门', 2: '进阶', 3: '专业' }
const WATER_SUPPLY_ZH = { 1: '需自带', 2: '部分补充', 3: '充足' }
const CELL_COVERAGE_ZH = { 1: '无信号', 2: '部分区域', 3: '良好' }
const TRAIL_MARKING_ZH = { 1: '差', 2: '一般', 3: '良好' }
const SAFETY_ZH = { 1: '危险', 2: '较危险', 3: '一般', 4: '较安全', 5: '安全' }
const FAMILY_ZH = { 1: '不适合', 2: '不太适合', 3: '一般', 4: '较适合', 5: '非常适合' }

// 判断是否为新版数据（新版 difficulty 是数字 1-5）
const isNewRouteData = (data) => typeof data.difficulty === 'number' && data.difficulty >= 1 && data.difficulty <= 5

module.exports = {
  DIFFICULTY_MAP,
  DIFFICULTY_ZH,
  DIFFICULTY_COLORS,
  DIFFICULTY_TEXTS,
  DIFFICULTY_ICONS,
  TERRAIN_ZH,
  ROUTEDNA_ZH,
  SEASON_ZH,
  TECHNICAL_GRADE_ZH,
  WATER_SUPPLY_ZH,
  CELL_COVERAGE_ZH,
  TRAIL_MARKING_ZH,
  SAFETY_ZH,
  FAMILY_ZH,
  isNewRouteData
}
