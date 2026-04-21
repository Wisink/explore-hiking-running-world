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

// ===== 云数据库读取配置 =====
async function getConfig(key) {
  try {
    const res = await db.collection('config').doc(key).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

// ===== HTTPS POST =====
function httpsPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const postData = typeof data === 'string' ? data : JSON.stringify(data)
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...defaultHeaders, ...headers },
      timeout: 15000
    }

    const req = https.request(options, (res) => {
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
    req.write(postData)
    req.end()
  })
}

// ===== 百度千帆AI搜索 =====
async function baiduSearch(query, count = 5) {
  const config = await getConfig('baidu_search')
  if (!config || !config.apiKey) {
    throw new Error('百度搜索API Key未配置')
  }

  const url = 'https://qianfan.baidubce.com/v2/ai_search/web_search'
  const requestBody = {
    messages: [{ content: query, role: 'user' }],
    search_source: 'baidu_search_v2',
    resource_type_filter: [{ type: 'web', top_k: count }]
  }

  const res = await httpsPost(url, requestBody, {
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Appbuilder-From': 'qinren-outdoor'
  })

  if (res.code) {
    throw new Error('百度搜索错误: ' + (res.message || JSON.stringify(res)))
  }

  return {
    source: 'baidu',
    results: (res.references || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || r.snippet || ''
    }))
  }
}

// ===== Tavily搜索 =====
async function tavilySearch(query, count = 5) {
  const config = await getConfig('tavily_search')
  if (!config || !config.apiKey) {
    throw new Error('Tavily API Key未配置')
  }

  const requestBody = {
    api_key: config.apiKey,
    query: query,
    max_results: count,
    search_depth: 'basic',
    include_answer: false,
    include_images: false,
    include_raw_content: false
  }

  const res = await httpsPost('https://api.tavily.com/search', requestBody)

  if (res.detail) {
    throw new Error('Tavily搜索错误: ' + JSON.stringify(res.detail))
  }

  return {
    source: 'tavily',
    results: (res.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || ''
    }))
  }
}

// ===== 智能搜索（百度优先，Tavily降级） =====
async function smartSearch(query, count = 5) {
  let lastError = null

  // 优先百度
  try {
    console.log('[smartSearch] 尝试百度搜索:', query)
    const result = await baiduSearch(query, count)
    if (result.results && result.results.length > 0) {
      console.log('[smartSearch] 百度搜索成功，结果数:', result.results.length)
      return result
    }
    console.log('[smartSearch] 百度搜索无结果，降级到Tavily')
  } catch (e) {
    console.log('[smartSearch] 百度搜索失败:', e.message)
    lastError = e
  }

  // 降级Tavily
  try {
    console.log('[smartSearch] 尝试Tavily搜索:', query)
    const result = await tavilySearch(query, count)
    if (result.results && result.results.length > 0) {
      console.log('[smartSearch] Tavily搜索成功，结果数:', result.results.length)
      return result
    }
  } catch (e) {
    console.log('[smartSearch] Tavily搜索也失败:', e.message)
    if (!lastError) lastError = e
  }

  throw new Error(lastError ? lastError.message : '所有搜索引擎均无结果')
}

// ===== 规则解析：从搜索结果提取路线信息（严格遵循 routes 集合规范）=====
function parseRouteInfo(searchResults, routeName) {
  const info = {
    name: '',
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
    dataSource: '智能搜索',
    _searchResults: searchResults
  }

  // 合并所有搜索文本（去重处理，避免重复内容）
  const allTexts = searchResults.map(r => ((r.title || '') + ' ' + (r.content || '')).trim()).filter(t => t)
  const allText = allTexts.join('\n')

  // 提取核心特征关键词（用于生成简介和描述）
  const featurePool = []
  const featurePatterns = [
    { re: /(?:海拔|主峰|顶峰)\s*(?:约|大约)?\s*(\d+)\s*(?:米|m)/, tag: '海拔{1}米' },
    { re: /(?:全程|全程约)\s*(\d+(?:\.\d+)?)\s*(?:公里|km)/, tag: '全程{1}公里' },
    { re: /(?:累计爬升|爬升|拔高)\s*(?:约)?\s*(\d+)\s*(?:米|m)/, tag: '累计爬升{1}米' },
    { re: /(瀑布群|多级瀑布|多层瀑布)/, tag: '瀑布群' },
    { re: /(丹霞地貌|丹霞)/, tag: '丹霞地貌' },
    { re: /(高山草甸|大草甸)/, tag: '高山草甸' },
    { re: /(溶洞|古洞|钟乳石)/, tag: '溶洞奇观' },
    { re: /(红叶|赏秋)/, tag: '红叶胜地' },
    { re: /(石窟|石刻|摩崖)/, tag: '石窟古迹' },
    { re: /(古道|古驿道)/, tag: '千年古道' },
    { re: /(云海)/, tag: '云海' },
    { re: /(湿地|芦苇)/, tag: '黄河湿地' },
    { re: /(银杏林)/, tag: '银杏林' },
    { re: /(古村|古镇|红色古镇)/, tag: '古村' },
    { re: /(竹林)/, tag: '竹林' },
    { re: /(花海|桃花|牡丹)/, tag: '花海' },
    { re: /(天然石桥|天生桥|仙人桥)/, tag: '天然石桥' },
    { re: /(古寺|古刹|寺庙|祖庭)/, tag: '古寺' },
    { re: /(烽火台|历史遗迹)/, tag: '历史遗迹' },
    { re: /(峡谷|溪谷)/, tag: '峡谷' },
    { re: /(盘山公路|环山公路)/, tag: '盘山公路' },
    { re: /(溯溪|溪流|涉水)/, tag: '溪流' },
    { re: /(登山步道|步道)/, tag: '步道' },
    { re: /(杜甫|李白|韩愈|司马迁)/, tag: '文人足迹' }
  ]
  for (const fp of featurePatterns) {
    const m = allText.match(fp.re)
    if (m) {
      featurePool.push(m[1] ? fp.tag.replace('{1}', m[1]) : fp.tag)
    }
  }

  // ===== 花/果子/时令提取 =====
  const flowerFruitDetails = []
  const flowerFruitPatterns = [
    // 花类：X月+赏+花名
    { re: /(\d{1,2})月\s*(?:赏|观|看|赏)\s*(白鹃梅|紫荆花|紫荆|桃花|杏花|牡丹|杜鹃|山茱萸|连翘|油菜花|樱花|梨花|山花)/g, fmt: '{1}月赏{2}' },
    { re: /(?:赏|看|观)\s*(白鹃梅|紫荆花|紫荆|桃花|杏花|牡丹|杜鹃|山茱萸|连翘|油菜花|樱花|梨花)\s*(?:最佳)?(?:时间)?[是为：]?\s*(\d{1,2})\s*[-~至到]\s*(\d{1,2})月/g, fmt: '{2}-{3}月赏{1}' },
    { re: /(白鹃梅|紫荆花|紫荆|桃花|杏花|牡丹|杜鹃|山茱萸|连翘|油菜花|樱花|梨花|山花)\s*(?:盛开|绽放|漫山|满山|遍布|花期)/g, fmt: '{1}' },
    // 花类：季节+花名
    { re: /(?:春天|春季|3月|4月|5月)\s*(?:赏|看)?\s*(白鹃梅|紫荆花|紫荆|桃花|杏花|牡丹|杜鹃|山茱萸|连翘|油菜花|樱花|梨花)/g, fmt: '春季赏{1}' },
    { re: /(白鹃梅|紫荆花|紫荆|桃花|杏花|牡丹|杜鹃|山茱萸|连翘|油菜花|樱花|梨花)\s*(?:春天|春季|3月|4月|5月)/g, fmt: '春季赏{1}' },
    // 果子类
    { re: /(?:捡|摘|采)\s*(板栗|栗子|核桃|猕猴桃|柿子|桑葚|野果|山楂|五味子)/g, fmt: '捡{1}' },
    { re: /(板栗|栗子|核桃|猕猴桃|柿子|桑葚|野果|山楂|五味子)\s*(?:季节|成熟|收获|遍地|满地)/g, fmt: '{1}' },
    { re: /(\d{1,2})月\s*(?:可以|能)?\s*(?:捡|摘|采)\s*(板栗|栗子|核桃|猕猴桃|柿子|桑葚|野果|山楂)/g, fmt: '{1}月捡{2}' },
    // 红叶季节
    { re: /(\d{1,2})\s*[-~至到]\s*(\d{1,2})月\s*(?:赏|看|观赏)\s*(红叶|秋色|枫叶)/g, fmt: '{1}-{2}月赏{3}' },
    // 银杏
    { re: /(\d{1,2})月\s*(?:赏|看|观赏)?\s*(银杏)/g, fmt: '{1}月赏{2}' },
    { re: /(银杏)\s*(?:金黄|变黄|观赏期)/g, fmt: '{1}' },
    // 瀑布季节
    { re: /(夏季|夏天|雨季|6月|7月|8月)\s*(?:瀑布|壮观)/g, fmt: '夏季瀑布壮观' }
  ]
  for (const fp of flowerFruitPatterns) {
    let m
    const re = new RegExp(fp.re.source, fp.re.flags)
    while ((m = re.exec(allText)) !== null) {
      let item = fp.fmt
      for (let i = 1; i < m.length; i++) {
        item = item.replace('{' + i + '}', m[i])
      }
      if (!flowerFruitDetails.includes(item)) {
        flowerFruitDetails.push(item)
      }
    }
  }

  // ===== 历史文化底蕴提取 =====
  const historyDetails = []
  const historyPatterns = [
    // 人文典故
    { re: /(韩愈|李白|杜甫|白居易|王维|司马迁|汉武帝|秦始皇|刘邦|刘仲)\s*([^。，,\n]{5,50})/, fmt: '{1}{2}' },
    { re: /([^。，,\n]{0,30})(韩愈|李白|杜甫|白居易|王维|司马迁|汉武帝|秦始皇)\s*([^。，,\n]{5,30})/, fmt: '{2}{3}' },
    // 历史事件/典故
    { re: /(烽火戏诸侯|丝绸之路|秦直道|古驿道|茶马古道|蓝关古道|子午道|褒斜道)/g, fmt: '{1}' },
    { re: /([^。，,\n]{5,40})(遗址|故里|故城|古战场|兵谏亭|华清宫|大明宫)/g, fmt: '{0}' },
    // 寺庙文化
    { re: /(华严宗|律宗|净土宗|三论宗|密宗|禅宗)\s*(?:祖庭|发源地)/g, fmt: '{1}祖庭' },
    { re: /([^。，,\n]{3,20}(?:寺|庙|庵|观))\s*(?:始建于|创建于|唐代|宋代|隋代|明代|千年)/g, fmt: '{1}' },
    // 名人诗句
    { re: /(?:云横秦岭家何在|长安一片月|明月松间照|行到水穷处)/g, fmt: '' }
  ]
  for (const hp of historyPatterns) {
    let m
    const re = new RegExp(hp.source, hp.flags)
    while ((m = re.exec(allText)) !== null) {
      let item = hp.fmt
      for (let i = 1; i < m.length; i++) {
        item = item.replace('{' + i + '}', m[i])
      }
      item = item.replace(/\{0\}/, m[0])
      // 清理多余符号
      item = item.replace(/^[,，\s]+|[,，\s]+$/g, '').trim()
      if (item && item.length >= 6 && item.length <= 60 && !historyDetails.some(h => h.includes(item) || item.includes(h))) {
        historyDetails.push(item)
      }
    }
  }

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
    /(?:耗时|用时|预计|规划总耗时|大约)\s*(?:约|大约)?\s*(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(?:小时|h|H)/,
    /(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/,
    /(?:耗时|用时|预计|大约)\s*(?:约)?\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/
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
    /(?:陕西省西安市|西安)([\w·]+区|[\w·]+县)/,
    /([\w·]+区|[\w·]+县)(?:子午街道|庞光镇|蓝桥镇|石井镇|东大街道|引镇)/,
    /(?:长安|蓝田|鄠邑|周至|临潼|眉县)(?:区|县)/,
    /(?:渭南|咸阳|铜川|韩城|合阳|淳化|旬邑|礼泉|泾阳|彬州|华州|华阴)(?:市|区|县)/
  ]
  for (const p of districtPatterns) {
    const m = allText.match(p)
    if (m) {
      info.location_district = m[0].replace('陕西省西安市', '').replace('西安', '')
      break
    }
  }

  // ===== 路线类型提取 =====
  let routeType = ''
  if (/穿越/.test(allText)) routeType = '穿越'
  else if (/P形环线|P形/.test(allText)) routeType = 'P形环线'
  else if (/环线|环穿|环山/.test(allText)) routeType = '环线'
  else if (/原返|原路返回/.test(allText)) routeType = '原返'

  // ===== 路线命名：区县 + 路线名称 + 路线类型 =====
  // 清洗原始名称：去掉括号内容、去掉"徒步"等通用词尾
  let cleanName = routeName
    .replace(/[（(][^）)]*[）)]/g, '')  // 去掉已有括号
    .replace(/徒步$/, '').trim()

  // 检查是否已有路线类型
  if (!/穿越|环线|原返|P形环线/.test(cleanName) && routeType) {
    cleanName = cleanName + routeType
  }

  // 组装最终名称：区县 + 路线名（不加括号）
  if (info.location_district && !cleanName.includes(info.location_district)) {
    info.name = info.location_district + cleanName
  } else {
    info.name = cleanName
  }

  // ===== 一句话简介：提炼路线核心亮点（≤30字）=====
  // 优先从搜索结果中找一句描述性的话
  let hookSentence = ''
  const descSentences = allText.split(/[。！？\n]/).map(s => s.trim()).filter(s =>
    s.length >= 8 && s.length <= 40 &&
    !/攻略|下载|APP|微信|关注|点赞|转发|评论|搜索/.test(s)
  )

  // 找包含特征关键词的短句
  for (const s of descSentences) {
    if (featurePool.some(f => s.includes(f.replace(/\d+米?\d*/g, '')))) {
      hookSentence = s.replace(/^路线|^这条线|^本条线|^其特色是|^特色[是为：]/, '').trim()
      break
    }
  }

  // 降级：用特征关键词拼接
  if (!hookSentence && featurePool.length > 0) {
    hookSentence = featurePool.slice(0, 3).join('，')
  }
  if (!hookSentence) {
    // 从搜索结果取第一句有意义的
    const firstValid = descSentences.find(s => s.length >= 10)
    hookSentence = firstValid ? firstValid.substring(0, 30) : '适合休闲徒步的自然路线'
  }
  info.shortDesc = hookSentence.substring(0, 35)

  // ===== 详细描述：结构化完整描述（≤800字）=====
  // 收集去重的关键句子
  const allKeySentences = []
  for (const text of allTexts) {
    const sentences = text.split(/[。！？；\n]/)
      .map(s => s.trim())
      .filter(s =>
        s.length >= 10 && s.length <= 100 &&
        !/攻略|下载|APP|微信|关注|点赞|转发|评论|搜索|版权所有|免责|广告|推荐|本文|作者|来源|编辑/.test(s) &&
        !/^其|^该|^这个|^这是|^目前/.test(s)
      )
    let added = 0
    for (const s of sentences) {
      if (added >= 3) break
      const skeleton = s.replace(/\d+/g, '#')
      if (!allKeySentences.some(ks => ks.replace(/\d+/g, '#') === skeleton)) {
        allKeySentences.push(s)
        added++
      }
    }
  }

  // 按主题分类句子
  const scenerySentences = []    // 景观特色
  const routeSentences = []      // 路线描述
  const trafficSentences = []    // 交通信息
  const otherSentences = []      // 其他

  for (const s of allKeySentences) {
    if (/瀑布|溪流|峡谷|草甸|丹霞|红叶|花海|竹林|石窟|古寺|溶洞|云海|银杏|湿地|石桥|古道|奇石|古村|湖泊|天池|瀑布/.test(s)) {
      scenerySentences.push(s)
    } else if (/公里|千米|爬升|海拔|山路|步道|台阶|平缓|陡峭|泥泞|穿越|环线|原返|出发|起点|终点|耗时|用时/.test(s)) {
      routeSentences.push(s)
    } else if (/自驾|导航|地铁|公交|高速|停车|出发|从西安|开车/.test(s)) {
      trafficSentences.push(s)
    } else {
      otherSentences.push(s)
    }
  }

  // 构建结构化描述
  const descParts = []

  // 第一段：路线概述（核心特色 + 历史底蕴）
  const overview = []
  if (featurePool.length > 0) {
    overview.push(featurePool.slice(0, 4).join('、'))
  }
  if (scenerySentences.length > 0) {
    overview.push(scenerySentences[0])
  }
  if (otherSentences.length > 0) {
    overview.push(otherSentences[0])
  }
  if (overview.length > 0) descParts.push(overview.join('。'))

  // 第二段：历史底蕴（如有）
  if (historyDetails.length > 0) {
    descParts.push(historyDetails.slice(0, 3).join('。'))
  }

  // 第三段：路线详情（含数字）
  const detailParts = []
  if (routeSentences.length > 0) {
    detailParts.push(routeSentences.slice(0, 2).join('。'))
  }
  const statParts = []
  if (info.distance) statParts.push(`全程约${info.distance}公里`)
  if (info.elevationGain) statParts.push(`累计爬升${info.elevationGain}米`)
  if (info.elevationMax) statParts.push(`最高海拔${info.elevationMax}米`)
  if (info.durationMin && info.durationMax) {
    statParts.push(info.durationMin === info.durationMax
      ? `预计耗时${info.durationMin}小时`
      : `预计耗时${info.durationMin}-${info.durationMax}小时`)
  }
  if (statParts.length > 0) {
    detailParts.push(statParts.join('，'))
  }
  if (detailParts.length > 0) descParts.push(detailParts.join('。'))

  // 第四段：景观描述 + 时令花果
  const sceneryParts = []
  if (scenerySentences.length > 1) {
    sceneryParts.push(scenerySentences.slice(1, 3).join('。'))
  }
  if (flowerFruitDetails.length > 0) {
    sceneryParts.push(flowerFruitDetails.slice(0, 4).join('、'))
  }
  if (sceneryParts.length > 0) descParts.push(sceneryParts.join('。'))

  // 第五段：交通（一句话）
  if (trafficSentences.length > 0) {
    descParts.push(trafficSentences[0])
  }

  info.fullDesc = descParts.join('。').substring(0, 800)

  // ===== 难度推断 =====
  if (/困难|难度大|危险|慎入|偏难|技术攀登|绳索/.test(allText)) {
    info.difficulty = 4
  } else if (/适中|中等|有一定基础|略有挑战|初级进阶/.test(allText)) {
    info.difficulty = 3
  } else if (/轻松|简单|新手|亲子|休闲|平缓|第一次|全程平缓/.test(allText)) {
    info.difficulty = 2
  } else if (/非常轻松|散步|观光/.test(allText)) {
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

  const transM = allText.match(/(?:地铁|公交|乘\d+路|换乘)\s*([^。，,\n]{10,80})/);
  if (transM) info.transport_publicTransport = transM[0].trim()

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

  // ===== 补水点 =====
  if (/沿途有水|溪水|水源充足|可补水/.test(allText)) {
    info.waterSupply = 3
  } else if (/全程无水|无水源|缺水/.test(allText)) {
    info.waterSupply = 1
  }

  // ===== 路标 =====
  if (/路标清晰|标识清楚|成熟线路/.test(allText)) {
    info.trailMarking = 3
  } else if (/无路标|路标少|容易迷路/.test(allText)) {
    info.trailMarking = 1
  }

  // ===== 封面图 =====
  const imageUrls = searchResults.flatMap(r => r.images || [])
  if (imageUrls.length > 0) {
    info.coverImage = imageUrls[0]
  }

  return info
}

// ===== 云函数入口 =====
exports.main = async (event, context) => {
  const { action, params = {} } = event

  try {
    // 0. 设置API Key（管理员用）
    if (action === 'setApiKey') {
      const { type, apiKey } = params
      if (!type || !apiKey) return fail('type和apiKey不能为空')
      const docId = type === 'baidu' ? 'baidu_search' : 'tavily_search'
      await db.collection('config').doc(docId).set({
        data: { apiKey, updatedAt: db.serverDate() }
      })
      return success(null, `${type} API Key已保存`)
    }

    // 1. 纯搜索
    if (action === 'search') {
      const { query, count = 5, engine } = params
      if (!query) return fail('搜索词不能为空')

      if (engine === 'baidu') return success(await baiduSearch(query, count))
      if (engine === 'tavily') return success(await tavilySearch(query, count))
      return success(await smartSearch(query, count))
    }

    // 2. 搜索 + 智能解析（主要入口）
    if (action === 'searchAndParse') {
      const { name } = params
      if (!name) return fail('路线名称不能为空')

      const queries = [
        `${name} 徒步攻略`,
        `${name} 路线 距离 海拔`
      ]

      let allResults = []
      let searchSource = ''

      for (const q of queries) {
        try {
          const res = await smartSearch(q, 5)
          if (res.results && res.results.length > 0) {
            allResults = allResults.concat(res.results)
            if (!searchSource) searchSource = res.source
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

      const parsed = parseRouteInfo(allResults, name)
      parsed._searchSource = searchSource
      return success(parsed)
    }

    return fail('未知操作: ' + action)
  } catch (e) {
    console.error('[routeSearch] 错误:', e)
    return fail(e.message || '服务异常')
  }
}
