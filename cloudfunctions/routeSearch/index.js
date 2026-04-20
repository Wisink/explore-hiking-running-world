const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ===== 返回格式 =====
function success(data, message = 'success') {
  return { code: 0, message, data }
}
function fail(message = '操作失败', data = null) {
  return { code: -1, message, data }
}

// ===== 百度AI搜索API =====
// 百度千帆AI搜索 endpoint
const BAIDU_SEARCH_ENDPOINT = 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/ai_search/v1/search'

// 从云数据库 config 集合读取 API Key
async function getBaiduApiKey() {
  // 1. 优先从环境变量读取（本地调试用）
  if (process.env.BAIDU_API_KEY) {
    return process.env.BAIDU_API_KEY
  }
  // 2. 从云数据库 config 集合读取
  try {
    const res = await db.collection('config').doc('baidu_search').get()
    if (res.data && res.data.apiKey) {
      return res.data.apiKey
    }
  } catch (e) {
    // config 文档不存在
  }
  throw new Error('百度搜索API Key未配置。请在云数据库config集合中添加文档 _id=baidu_search, apiKey=你的Key')
}

// ===== HTTPS 请求封装 =====
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const postData = JSON.stringify(data)
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }

    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('百度API返回非JSON: ' + body.substring(0, 300)))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(postData)
    req.end()
  })
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('返回非JSON: ' + body.substring(0, 300)))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// ===== 百度千帆AI搜索 =====
async function baiduSearch(query, count = 5) {
  const apiKey = await getBaiduApiKey()

  // 千帆AI搜索接口
  const url = `${BAIDU_SEARCH_ENDPOINT}?access_token=${apiKey}`

  const payload = {
    messages: [
      { role: 'user', content: query }
    ],
    search_source: 'baidu_search_v1',
    max_search_results: count
  }

  // 尝试千帆接口，失败则回退到规则解析
  try {
    const res = await httpsPost(url, payload)
    if (res && res.result) {
      const ref = res.result.reference || []
      return {
        answer: res.result.answer || '',
        results: ref.map(r => ({
          title: r.title || '',
          url: r.url || '',
          content: r.content || ''
        }))
      }
    }
  } catch (e) {
    console.log('[routeSearch] 千帆接口失败，尝试传统搜索:', e.message)
  }

  // 回退：使用百度搜索建议API（无需额外Key）
  return await baiduFallbackSearch(query, count)
}

// ===== 回退搜索方案 =====
async function baiduFallbackSearch(query, count) {
  const encodedQuery = encodeURIComponent(query + ' 徒步攻略 路线')
  const url = `https://www.baidu.com/s?wd=${encodedQuery}&rn=${count}`

  // 使用百度移动搜索API（更容易解析）
  const mobileUrl = `https://m.baidu.com/su?action=opensearch&word=${encodedQuery}`

  // 简单返回：让客户端使用搜索结果页面
  // 实际部署时，这里应该用网页抓取服务
  return {
    answer: '',
    results: [],
    fallback: true,
    searchUrl: `https://www.baidu.com/s?wd=${encodedQuery}`
  }
}

// ===== 规则解析：从搜索结果提取路线信息 =====
function parseRouteInfo(searchResults, routeName) {
  const info = {
    name: routeName,
    shortDesc: '',
    fullDesc: '',
    coverImage: '',
    images: [],
    location_district: '',
    location_lat: '',
    location_lng: '',
    distance: '',
    durationMin: '',
    durationMax: '',
    elevationGain: '',
    elevationMax: '',
    elevationMin: '',
    difficulty: 2,
    technicalGrade: 1,
    terrainTypes: [],
    routeDNA: [],
    waterSupply: 2,
    safetyLevel: 3,
    cellCoverage: 2,
    trailMarking: 2,
    trailhead_startName: '',
    trailhead_startFacilities: [],
    trailhead_endName: '',
    trailhead_endFacilities: [],
    transport_hasParking: true,
    transport_parkingNote: '',
    transport_publicTransport: '',
    transport_drivingGuide: '',
    bestSeasons: [],
    restPoints: 0,
    familyFriendly: 3,
    estimatedCalories: '',
    dataSource: '百度搜索',
    // 搜索结果原文（供参考）
    _searchResults: searchResults
  }

  // 合并所有搜索文本
  const allText = searchResults.map(r =>
    (r.title || '') + ' ' + (r.content || '')
  ).join('\n')

  // ===== 距离提取 =====
  const distPatterns = [
    /(?:全程|全程约|全程共计|总长|长度|距离)(?:约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:公里|km|KM)/,
    /(\d+(?:\.\d+)?)\s*(?:公里|km)\s*(?:环线|环穿|原返|穿越)/,
    /约\s*(\d+(?:\.\d+)?)\s*(?:公里|km)/
  ]
  for (const p of distPatterns) {
    const m = allText.match(p)
    if (m) { info.distance = m[1]; break }
  }

  // ===== 时间提取 =====
  const timePatterns = [
    /(?:耗时|用时|预计|规划总耗时|大约)\s*(?:约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:[-~至到]\s*(\d+(?:\.\d+)?))?\s*(?:小时|h|H)/,
    /(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/,
    /(?:耗时|用时)\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/
  ]
  for (const p of timePatterns) {
    const m = allText.match(p)
    if (m) {
      if (m[2]) {
        info.durationMin = m[1]
        info.durationMax = m[2]
      } else {
        info.durationMin = m[1]
        info.durationMax = m[1]
      }
      break
    }
  }

  // ===== 累计爬升提取 =====
  const climbPatterns = [
    /(?:累计爬升|爬升|拔高|累计拔高|爬山)\s*(?:约|大约|共)?\s*(\d+)\s*(?:米|m)/,
    /(\d+)\s*(?:米|m)\s*(?:爬升|拔高)/
  ]
  for (const p of climbPatterns) {
    const m = allText.match(p)
    if (m) { info.elevationGain = m[1]; break }
  }

  // ===== 最高海拔提取 =====
  const maxElevPatterns = [
    /(?:海拔|最高海拔|主峰|山顶|顶峰)\s*(?:约|大约)?\s*(\d+)\s*(?:米|m)/,
    /(?:海拔)\s*(\d+)/
  ]
  for (const p of maxElevPatterns) {
    const m = allText.match(p)
    if (m) { info.elevationMax = m[1]; break }
  }

  // ===== 区县提取 =====
  const districtPatterns = [
    /(?:陕西省西安市|西安)(\w+区|\w+县)/,
    /(\w+区|\w+县)(?:子午街道|庞光镇|蓝桥镇|石井镇)/,
    /(?:长安|蓝田|鄠邑|周至|临潼|眉县)(?:区|县)/
  ]
  for (const p of districtPatterns) {
    const m = allText.match(p)
    if (m) {
      info.location_district = m[0].replace('陕西省西安市', '').replace('西安', '')
      break
    }
  }

  // ===== 难度推断 =====
  if (/困难|难度大|危险|慎入|偏难|技术/.test(allText)) {
    info.difficulty = 4
  } else if (/适中|中等|有一定基础|略有挑战/.test(allText)) {
    info.difficulty = 3
  } else if (/轻松|简单|新手|亲子|休闲|平缓|封神/.test(allText)) {
    info.difficulty = 2
  } else if (/非常轻松|第一次|全程平缓/.test(allText)) {
    info.difficulty = 1
  }

  // ===== 技术等级 =====
  if (/绳索|攀岩|技术攀登/.test(allText)) {
    info.technicalGrade = 4
  } else if (/大量攀爬/.test(allText)) {
    info.technicalGrade = 3
  } else if (/攀爬|翻越/.test(allText)) {
    info.technicalGrade = 2
  }

  // ===== 地形类型 =====
  if (/山脊|山梁|刀背/.test(allText)) info.terrainTypes.push('ridge')
  if (/森林|林间|林荫/.test(allText)) info.terrainTypes.push('forest')
  if (/溪流|涉水|过河/.test(allText)) info.terrainTypes.push('stream')
  if (/草甸|草原/.test(allText)) info.terrainTypes.push('grassland')
  if (/攀岩|攀爬|岩壁/.test(allText)) info.terrainTypes.push('rock_scramble')
  if (/步道|景区|铺装|水泥/.test(allText)) info.terrainTypes.push('paved')
  if (info.terrainTypes.length === 0) info.terrainTypes.push('mountain_path')

  // ===== 路线DNA =====
  if (/大爬升|爬升大|持续爬升/.test(allText)) info.routeDNA.push('significant_climb')
  if (/技术/.test(allText)) info.routeDNA.push('technical')
  if (/偏远|人少|人迹罕至/.test(allText)) info.routeDNA.push('remote')
  if (/过河|涉水/.test(allText)) info.routeDNA.push('water_crossing')
  if (/林荫|遮蔽/.test(allText)) info.routeDNA.push('forest_shade')
  if (/无遮挡|暴露|山脊/.test(allText)) info.routeDNA.push('exposed_ridge')
  if (/潮湿|溪水|瀑布/.test(allText)) info.routeDNA.push('wet_environment')
  if (/高海拔|2000|3000/.test(allText)) info.routeDNA.push('high_altitude')

  // ===== 最佳季节 =====
  if (/红叶|秋季|秋天|层林尽染|10月|11月/.test(allText)) info.bestSeasons.push('autumn')
  if (/春天|春季|山花|桃花|3月|4月|5月/.test(allText)) info.bestSeasons.push('spring')
  if (/夏天|夏季|避暑|清凉|瀑布|6月|7月|8月/.test(allText)) info.bestSeasons.push('summer')
  if (/冬天|冬季|冰雪|冰瀑|12月|1月|2月/.test(allText)) info.bestSeasons.push('winter')
  if (info.bestSeasons.length === 0) info.bestSeasons.push('spring', 'autumn')

  // ===== 交通信息提取 =====
  if (/停车/.test(allText)) {
    info.transport_hasParking = true
    const parkingM = allText.match(/停车[费场]?\s*(?:约|大约)?\s*(\d+)\s*(?:元|辆)/)
    if (parkingM) info.transport_parkingNote = parkingM[0]
  }

  // 公共交通
  const transM = allText.match(/(?:地铁|公交|乘\d+路|换乘)\s*([^。，,\n]{10,80})/);
  if (transM) info.transport_publicTransport = transM[0].trim()

  // 自驾指引
  const driveM = allText.match(/(?:自驾|导航|走\w+路|走\w+高速)\s*([^。，,\n]{10,80})/);
  if (driveM) info.transport_drivingGuide = driveM[0].trim()

  // ===== 起点信息 =====
  const startM = allText.match(/(?:起点|出发|导航至?|定位)\s*(?:[:：至到])?\s*([^。，,\n\s]{2,20}(?:保护站|农家乐|村|口|镇|山庄))/)
  if (startM) info.trailhead_startName = startM[1]

  // ===== 安全/信号 =====
  if (/信号不稳定|无信号|全程无信号/.test(allText)) {
    info.cellCoverage = 1
    info.safetyLevel = 2
  }

  // ===== 封面图 =====
  const imageUrls = searchResults.flatMap(r => r.images || [])
  if (imageUrls.length > 0) {
    info.coverImage = imageUrls[0]
  }

  // ===== 简介 =====
  const firstResult = searchResults[0]
  if (firstResult && firstResult.content) {
    info.shortDesc = firstResult.content.substring(0, 80)
    info.fullDesc = searchResults.map(r => {
      let text = r.content || ''
      return text.substring(0, 200)
    }).filter(t => t).join('\n\n')
  }

  return info
}

// ===== 云函数入口 =====
exports.main = async (event, context) => {
  const { action, params = {} } = event

  try {
    // 0. 设置API Key（管理员用）
    if (action === 'setApiKey') {
      const { apiKey } = params
      if (!apiKey) return fail('apiKey不能为空')
      await db.collection('config').doc('baidu_search').set({
        data: { apiKey, updatedAt: db.serverDate() }
      })
      return success(null, 'API Key已保存')
    }

    // 1. 纯搜索
    if (action === 'search') {
      const { query, count = 5 } = params
      if (!query) return fail('搜索词不能为空')
      const results = await baiduSearch(query, count)
      return success(results)
    }

    // 2. 搜索 + 智能解析（主要入口）
    if (action === 'searchAndParse') {
      const { name } = params
      if (!name) return fail('路线名称不能为空')

      // 多关键词搜索，提高覆盖率
      const queries = [
        `${name} 徒步攻略`,
        `${name} 路线 距离 海拔`
      ]

      let allResults = []
      for (const q of queries) {
        try {
          const res = await baiduSearch(q, 5)
          if (res.results && res.results.length > 0) {
            allResults = allResults.concat(res.results)
          }
        } catch (e) {
          console.log(`[routeSearch] 搜索"${q}"失败:`, e.message)
        }
      }

      if (allResults.length === 0) {
        return fail('未搜索到相关路线信息', { name, _searchResults: [] })
      }

      // 去重
      const seen = new Set()
      allResults = allResults.filter(r => {
        const key = r.url || r.title
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // 规则解析
      const parsed = parseRouteInfo(allResults, name)
      return success(parsed)
    }

    return fail('未知操作: ' + action)
  } catch (e) {
    console.error('[routeSearch] 错误:', e)
    return fail(e.message || '服务异常')
  }
}
