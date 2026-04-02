// 后台管理系统云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const crypto = require('crypto')

// 统一响应
function success(data, message = 'success') { return { code: 0, message, data } }
function fail(message) { return { code: -1, message, data: null } }

// ===== 管理员口令配置 =====
// 服务端哈希比对：SHA-256(salt + password)
// salt 与哈希值必须配套使用，更换口令需重新生成
const SALT = 'qinren_salt_2026'
const ADMIN_PASSWORD_HASH = '6534131ffb8b1048830bda34f8dae1d7058ea46952f139c3c73ba2be92e1bc80'

// 固定Token — 云函数冷启动不丢失，解决"token无效"问题
const FIXED_TOKEN = crypto.createHash('sha256')
  .update(SALT + 'admin-qr-2026')
  .digest('hex')

// ===== 认证模块 =====
function handleAuth(action, params) {
  switch (action) {
    case 'login': {
      const { password } = params || {}
      if (!password) return fail('缺少口令')
      // 服务端做 SHA-256(salt + password) 哈希比对
      const hashed = crypto.createHash('sha256')
        .update(SALT + password)
        .digest('hex')
      if (hashed === ADMIN_PASSWORD_HASH) {
        // 返回固定 token，不受云函数重启影响
        return success({ token: FIXED_TOKEN, loginTime: Date.now() }, '登录成功')
      }
      return fail('口令错误')
    }
    case 'verify': {
      const { token } = params || {}
      if (!token) return fail('缺少 token')
      if (token !== FIXED_TOKEN) return fail('token 无效')
      return success({ valid: true }, 'token 有效')
    }
    default: return fail('未知操作')
  }
}

// ===== Token 验证中间件 =====
function verifyToken(params) {
  const { token } = params || {}
  if (!token) return { valid: false, message: '缺少 token' }
  if (token !== FIXED_TOKEN) return { valid: false, message: 'token 无效' }
  return { valid: true }
}

// ===== 路线管理 =====
async function handleRoutes(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, keyword = '' } = params || {}
      let where = {}
      if (keyword) {
        where = _.or([
          { name: db.RegExp({ regexp: keyword, options: 'i' }) },
          { 'location.address': db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      }
      const countRes = await db.collection('routes').where(where).count()
      const { data } = await db.collection('routes')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data } = await db.collection('routes').doc(id).get()
      return success(data)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('routes').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    case 'add': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: addData } = params || {}
      const res = await db.collection('routes').add({ data: addData })
      return success({ id: res._id }, '添加成功')
    }
    case 'delete': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id } = params || {}
      await db.collection('routes').doc(id).remove()
      return success(null, '删除成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 用户管理 =====
async function handleUsers(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, keyword = '' } = params || {}
      let where = {}
      if (keyword) {
        where = _.or([
          { nickName: db.RegExp({ regexp: keyword, options: 'i' }) },
          { openid: db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      }
      const countRes = await db.collection('user_data').where(where).count()
      const { data } = await db.collection('user_data')
        .where(where).orderBy('_id', 'desc')
        .skip((page - 1) * pageSize).limit(pageSize).get()

      // 关联 users 集合获取 visitCount 和 userNumber
      const openIds = data.map(u => u._openid).filter(Boolean)
      let userMetaMap = {}
      if (openIds.length > 0) {
        const { data: userMetas } = await db.collection('users')
          .where({ _openid: _.in(openIds) }).get()
        userMetas.forEach(u => { userMetaMap[u._openid] = u })
      }

      const enriched = data.map(u => ({
        ...u,
        visitCount: (userMetaMap[u._openid] || {}).visitCount || 0,
        userNumber: (userMetaMap[u._openid] || {}).userNumber || ''
      }))

      return success({ list: enriched, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data: userData } = await db.collection('user_data').doc(id).get()
      if (!userData) return fail('用户不存在')

      // 关联 users 集合
      let userMeta = {}
      if (userData._openid) {
        const { data: metas } = await db.collection('users')
          .where({ _openid: userData._openid }).limit(1).get()
        if (metas.length > 0) userMeta = metas[0]
      }

      // 获取收藏路线详情（兼容新旧格式）
      const rawFavorites = userData.favorites || []
      let favoriteIds = []
      if (Array.isArray(rawFavorites)) {
        favoriteIds = rawFavorites.map(item => {
          if (typeof item === 'string') return item
          if (item && item.routeId) return item.routeId
          return null
        }).filter(Boolean)
      }
      let favoriteRoutes = []
      if (favoriteIds.length > 0) {
        const { data: routes } = await db.collection('routes')
          .where({ _id: _.in(favoriteIds) }).get()
        favoriteRoutes = routes
      }

      // 获取已走过路线详情
      const completedList = userData.completed || []
      let completedRoutes = []
      if (completedList.length > 0) {
        let completedItems
        if (typeof completedList[0] === 'string') {
          completedItems = completedList.map(id => ({ routeId: id }))
        } else {
          completedItems = completedList
        }
        const routeIds = [...new Set(completedItems.map(i => i.routeId || i))]
        const { data: routes } = await db.collection('routes')
          .where({ _id: _.in(routeIds) }).get()
        const routeMap = {}
        routes.forEach(r => { routeMap[r._id] = r })
        completedRoutes = completedItems.map(item => ({
          ...(routeMap[item.routeId] || {}),
          routeId: item.routeId,
          userDate: item.date || item.completedAt || '',
          userDistance: item.distance || 0,
          userWeather: item.weather || '',
          userDifficulty: item.difficulty || '',
          userFeeling: item.feeling || '',
          userCompanions: item.companions || item.companion || '',
          userNote: item.note || ''
        }))
      }

      return success({
        userInfo: {
          ...userData,
          visitCount: userMeta.visitCount || 0,
          userNumber: userMeta.userNumber || ''
        },
        favoriteRoutes,
        completedRoutes
      })
    }
    case 'completed': {
      const { id } = params || {}
      const { data: userData } = await db.collection('user_data').doc(id).get()
      if (!userData) return fail('用户不存在')

      const completedList = userData.completed || []
      if (completedList.length === 0) return success([])

      // 兼容新旧格式
      let completedItems
      if (typeof completedList[0] === 'string') {
        completedItems = completedList.map(id => ({ routeId: id }))
      } else {
        completedItems = completedList
      }

      const routeIds = [...new Set(completedItems.map(i => i.routeId || i))]
      const { data: routes } = await db.collection('routes')
        .where({ _id: _.in(routeIds) }).get()

      const routeMap = {}
      routes.forEach(r => { routeMap[r._id] = r })

      const result = completedItems.map(item => ({
        ...(routeMap[item.routeId] || {}),
        routeId: item.routeId,
        userDate: item.date || item.completedAt || '',
        userDistance: item.distance || 0,
        userWeather: item.weather || '',
        userDifficulty: item.difficulty || '',
        userFeeling: item.feeling || '',
        userCompanions: item.companions || item.companion || '',
        userNote: item.note || ''
      }))
      return success(result)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('user_data').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 文章管理 =====
async function handleArticles(action, params) {
  switch (action) {
    case 'list': {
      const { page = 1, pageSize = 20, category = '' } = params || {}
      let where = {}
      if (category) where.category = category
      const countRes = await db.collection('articles').where(where).count()
      const { data } = await db.collection('articles')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'detail': {
      const { id } = params || {}
      const { data } = await db.collection('articles').doc(id).get()
      return success(data)
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, data: updateData } = params || {}
      delete updateData._id
      delete updateData._openid
      await db.collection('articles').doc(id).update({ data: updateData })
      return success(null, '更新成功')
    }
    case 'add': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: addData } = params || {}
      const res = await db.collection('articles').add({ data: addData })
      return success({ id: res._id }, '添加成功')
    }
    case 'search': {
      const { keyword = '', searchType = 'all', page = 1, pageSize = 20 } = params || {}
      let where = {}
      if (keyword) {
        if (searchType === 'category') {
          where.category = db.RegExp({ regexp: keyword, options: 'i' })
        } else if (searchType === 'content') {
          where = _.or([
            { title: db.RegExp({ regexp: keyword, options: 'i' }) },
            { content: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        } else {
          // 'all' — 搜索标题、内容、分类
          where = _.or([
            { title: db.RegExp({ regexp: keyword, options: 'i' }) },
            { content: db.RegExp({ regexp: keyword, options: 'i' }) },
            { category: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        }
      }
      const countRes = await db.collection('articles').where(where).count()
      const { data } = await db.collection('articles')
        .where(where).orderBy('order', 'asc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
      return success({ list: data, total: countRes.total, page, pageSize })
    }
    case 'delete': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id } = params || {}
      await db.collection('articles').doc(id).remove()
      return success(null, '删除成功')
    }
    case 'importNewArticles': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const newArticles = [
        {
          _id: 'article_050',
          title: '新手徒步必备装备清单',
          category: '装备推荐',
          subcategory: '必备装备',
          difficulty: 'beginner',
          priority: 0,
          tags: ['新手', '装备', '清单', '入门'],
          season: ['all'],
          content: '<div class="article-body"><h2>第一次徒步，带什么？</h2><p>很多新手第一次徒步最大的困惑就是：我该带什么？带多了累赘，带少了又怕缺东西。别担心，这份清单帮你搞定。</p><h2>必备装备（缺一不可）</h2><p><strong>1. 徒步鞋：</strong>最重要的装备，没有之一。新手选低帮防滑徒步鞋即可，300-500元足够。记住：一定要提前穿磨合，千万别穿新鞋上山！</p><p><strong>2. 背包：</strong>一日徒步20-30L足够。选有腰带的款式，能把重量转移到髋部，肩膀不会太累。</p><p><strong>3. 水壶/水袋：</strong>按每小时300-500ml带水，夏季加倍。建议带一个保温水壶，冬天能喝热水。</p><p><strong>4. 防晒装备：</strong>帽子、防晒霜（SPF30+）、太阳镜。高海拔紫外线比平原强很多，阴天也会晒伤。</p><p><strong>5. 急救包：</strong>创可贴、碘伏棉签、弹性绷带、止痛药。用防水袋装好，放背包外层。</p><h2>建议装备（锦上添花）</h2><p><strong>登山杖：</strong>下山时能减轻30%膝盖负担，强烈推荐新手使用。</p><p><strong>头灯：</strong>万一走夜路就是救命装备。100元左右就够用。</p><p><strong>雨衣：</strong>山上天气多变，一件轻便雨衣不占多少空间。</p><p><strong>零食：</strong>能量棒、巧克力、坚果。关键时刻能补体力。</p><h2>不用带的东西</h2><p>❌ 牛仔裤（不透气、不速干）<br/>❌ 纯棉T恤（吸汗不排湿，湿了会失温）<br/>❌ 帆布鞋/拖鞋（没有防滑和保护）<br/>❌ 太多东西（一日徒步背包控制在5kg以内）</p></div>',
          summary: '第一次徒步该带什么？必备装备+建议装备+踩坑清单',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '6分钟',
          likes: 0,
          highlights: '第一次徒步不知道带什么？这份新手装备清单帮你避开90%的坑。必备5件套 + 建议装备 + 不用带的东西，一篇搞定。',
          isActive: true,
          order: 50
        },
        {
          _id: 'article_051',
          title: '户外徒步安全须知',
          category: '安全自救',
          subcategory: '基础安全',
          difficulty: 'beginner',
          priority: 0,
          tags: ['安全', '新手', '入门', '须知'],
          season: ['all'],
          content: '<div class="article-body"><h2>安全是徒步的第一课</h2><p>户外有风险，但只要做好准备，风险是可控的。新手最容易犯的错误就是：低估难度、高估体力、不做准备。以下几条安全须知，请刻在脑子里。</p><h2>出发前必做4件事</h2><p><strong>1. 查天气：</strong>看目的地未来24小时天气。有雨就带雨具，降温就加衣服。山上天气变化快，预报晴天也可能下雨。</p><p><strong>2. 规划路线：</strong>提前在两步路/六只脚APP上研究路线，下载离线地图。不要到了再「随便走走」。</p><p><strong>3. 告知他人：</strong>告诉家人或朋友你的路线、预计返回时间。万一出事，他们知道去哪里找你。</p><p><strong>4. 充电满格：</strong>手机是最重要的求救工具。带充电宝，出发前充满电。</p><h2>行进中的安全原则</h2><p><strong>不独行：</strong>新手绝对不要一个人去陌生路线。找靠谱的队友或参加户外团队。</p><p><strong>不逞强：</strong>累了就休息，不舒服就下撤。「来都来了」是最害人的话。</p><p><strong>不走野路：</strong>新手只走成熟路线和有标记的步道。不要抄近道、不要钻林子。</p><p><strong>留足时间：</strong>天黑前必须回到安全区域。算好时间，留出1-2小时的余量。</p><h2>紧急联系方式</h2><p>📞 全国急救电话：120<br/>📞 报警电话：110<br/>📞 秦岭区域救援：029-8888XXXX（出发前查好当地救援电话）<br/>📱 手机设置ICE紧急联系人信息</p><h2>记住STOP原则</h2><p>迷路时：<strong>S</strong>top停下来 → <strong>T</strong>hink思考 → <strong>O</strong>bserve观察 → <strong>P</strong>lan计划。不要慌乱继续走，越走越远是最危险的。</p></div>',
          summary: '出发前必做4件事、行进中的安全原则、紧急联系方式',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '6分钟',
          likes: 0,
          highlights: '安全是徒步的第一课。出发前查天气、规划路线、告知他人、充好电，行进中不独行不逞强不走野路。这条命是自己的，安全永远第一。',
          isActive: true,
          order: 51
        },
        {
          _id: 'article_052',
          title: '如何选择适合自己的第一条徒步路线',
          category: '其他',
          subcategory: '路线选择',
          difficulty: 'beginner',
          priority: 1,
          tags: ['新手', '路线', '选择', '入门'],
          season: ['all'],
          content: '<div class="article-body"><h2>选错路线是新手最大的坑</h2><p>很多人第一次徒步就选了高难度路线，结果累到怀疑人生，从此告别户外。选对第一条路线，才能爱上徒步。</p><h2>根据体能选难度</h2><p><strong>评估自己：</strong>平时运动吗？爬5楼喘不喘？能连续走路3小时吗？诚实回答这些问题。</p><p><strong>新手标准：</strong>距离5-8公里、爬升300-500米、用时3-4小时。这个强度适合大多数人。</p><p><strong>进阶标准：</strong>距离10-15公里、爬升500-800米、用时5-6小时。需要一定体能基础。</p><h2>西安周边推荐入门路线</h2><p><strong>翠华山（推荐指数⭐⭐⭐⭐⭐）：</strong>距西安1小时车程，路线成熟，有天池、冰洞等景观。全程约6km，爬升300m，2-3小时完成。最适合新手的秦岭入门路线。</p><p><strong>南五台（推荐指数⭐⭐⭐⭐）：</strong>距西安40分钟车程，台阶路为主，终点有云海概率高。全程约5km，爬升400m，2-3小时完成。</p><p><strong>太平峪（推荐指数⭐⭐⭐⭐）：</strong>峪口有瀑布群，沿途溪水潺潺，夏天很凉快。全程约7km，爬升300m，3-4小时完成。</p><p><strong>嘉午台（推荐指数⭐⭐⭐）：</strong>有一定挑战但不至于崩溃。全程约8km，爬升500m，4-5小时完成。适合体能还不错的新手。</p><h2>选路线的3个原则</h2><p><strong>1. 选成熟的：</strong>有路标、有其他人走、手机有信号的路线。</p><p><strong>2. 留余量：</strong>第一次选你觉得「太简单」的路线，而不是「刚好」的路线。</p><p><strong>3. 看季节：</strong>夏天避开暴晒路段，冬天避开结冰路段。春秋是最佳徒步季节。</p></div>',
          summary: '根据体能选难度、西安周边4条新手友好路线推荐',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '6分钟',
          likes: 0,
          highlights: '选错第一条路线 = 告别户外。根据你的体能选难度，西安周边这4条新手友好路线，总有一条适合你。',
          isActive: true,
          order: 52
        },
        {
          _id: 'article_053',
          title: '徒步前的热身和拉伸',
          category: '安全自救',
          subcategory: '基础安全',
          difficulty: 'beginner',
          priority: 0,
          tags: ['热身', '拉伸', '预防', '膝盖'],
          season: ['all'],
          content: '<div class="article-body"><h2>为什么要热身？</h2><p>很多人到山脚就直接开走，这是大错特错。热身能激活肌肉、润滑关节、提升心率，大幅降低扭伤和拉伤风险。只需要5-10分钟，但能保护你一整天。</p><h2>下肢热身动作（徒步必备）</h2><p><strong>1. 原地高抬腿（30秒）：</strong>交替抬腿至腰部高度，激活髋关节和大腿前侧肌群。速度不用快，关键是抬到位。</p><p><strong>2. 弓步蹲（每侧8次）：</strong>前腿膝盖不超过脚尖，后腿膝盖接近地面。拉伸髋屈肌和股四头肌，这是下山时最需要的力量。</p><p><strong>3. 侧弓步（每侧8次）：</strong>向侧面迈一大步，屈膝下蹲。拉伸大腿内侧（内收肌），山路不平时时常会用到。</p><p><strong>4. 踝关节环绕（每侧10圈）：</strong>脚尖画圈，顺时针逆时针各5圈。踝关节灵活度直接影响防扭伤能力。</p><p><strong>5. 小腿提踵（15次）：</strong>脚尖站立，慢慢上下。激活小腿肌群和跟腱，爬坡时大量使用。</p><h2>途中的动态拉伸</h2><p>每走1小时左右，停下来做几个动作：<br/>• 前后摆腿：扶着树或登山杖，腿前后摆动，放松髋关节<br/>• 小腿拉伸：脚后跟着地，身体前倾，感受小腿拉伸<br/>• 大腿后侧拉伸：脚放高处，身体前倾<br/>每个动作保持15-20秒，不用太久。</p><h2>下山后的拉伸（别忘了！）</h2><p>到达终点后，趁肌肉还热着，做5分钟拉伸：<br/>• 大腿前侧拉伸：站立，手拉脚背贴臀部<br/>• 大腿后侧拉伸：坐姿，腿伸直手够脚尖<br/>• 小腿拉伸：弓步，后腿伸直脚跟着地<br/>这能大幅减轻第二天的肌肉酸痛。</p></div>',
          summary: '5个下肢热身动作 + 途中动态拉伸 + 下山后放松',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '5分钟',
          likes: 0,
          highlights: '5分钟热身，保护一整天。5个简单动作激活腿部肌肉，加上途中和下山后的拉伸，远离膝盖伤痛和肌肉酸痛。',
          isActive: true,
          order: 53
        },
        {
          _id: 'article_054',
          title: '户外环保礼仪（Leave No Trace）',
          category: '户外礼仪',
          subcategory: 'LNT无痕山林',
          difficulty: 'beginner',
          priority: 0,
          tags: ['环保', 'LNT', '无痕', '礼仪'],
          season: ['all'],
          content: '<div class="article-body"><h2>什么是Leave No Trace？</h2><p>Leave No Trace（LNT），中文叫「无痕山林」，核心理念很简单：<strong>除了脚印，什么都不留下；除了照片，什么都不带走。</strong>我们享受自然，也有责任保护自然。</p><h2>新手必知的5条核心规则</h2><p><strong>1. 所有垃圾带走：</strong>包括果皮、纸巾、食物残渣。果皮在山里降解需要几个月甚至几年，而且会改变当地生态。准备一个垃圾袋，所有废弃物装袋带下山。</p><p><strong>2. 不采摘植物：</strong>看到漂亮的野花不要摘，看到野果不要采。它们是生态的一部分，也可能是保护物种。「摘一朵没关系」——如果有100个人都这么想呢？</p><p><strong>3. 不惊扰野生动物：</strong>保持距离观察，不投喂、不追逐、不大声喊叫。你手中的食物会让动物依赖人类，最终害了它们。</p><p><strong>4. 在已有步道上行走：</strong>不抄近道、不踩出新路。踩踏植被会造成水土流失，一条新路的痕迹可能需要十几年才能恢复。</p><p><strong>5. 尊重其他访客：</strong>不大声喧哗、不外放音乐。很多人来山里就是为了那份宁静。下坡让上坡，走得快的让走得慢的。</p><h2>为什么这很重要？</h2><p>秦岭是中国最重要的生态屏障之一，拥有大熊猫、金丝猴、羚牛、朱鹮等珍稀动物。每一次不文明的行为，都在伤害这片我们热爱的土地。保护户外环境不是道德绑架，而是确保我们的下一代也能看到同样的风景。</p><h2>从你做起</h2><p>看到别人丢的垃圾，顺手捡起来带走。不需要做环保大使，只需要做一个不添乱的户外人。这就是最大的贡献。</p></div>',
          summary: '无痕山林5条核心规则，做一个负责任的户外人',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '5分钟',
          likes: 0,
          highlights: 'Leave No Trace不是口号，是行动。带走所有垃圾、不采摘植物、不惊扰动物、走已有步道、尊重他人——5条规则，保护你热爱的山野。',
          isActive: true,
          order: 54
        },
        {
          _id: 'article_055',
          title: '中高强度徒步的体能训练',
          category: '其他',
          subcategory: '体能训练',
          difficulty: 'intermediate',
          priority: 1,
          tags: ['体能', '训练', '进阶', '力量'],
          season: ['all'],
          content: '<div class="article-body"><h2>为什么需要体能训练？</h2><p>当你从入门路线走向秦岭穿越、太白山攀登这样的中高强度路线时，仅靠「走」已经不够了。系统的体能训练能让你走得更远、更快、更安全，还能有效预防运动损伤。</p><h2>核心训练方向</h2><p><strong>1. 心肺耐力：</strong>决定你能走多远。训练方法：每周3次有氧运动（跑步、游泳、骑车），每次30-45分钟，心率保持在最大心率的60-70%。</p><p><strong>2. 腿部力量：</strong>决定你爬坡能力和膝盖保护。训练方法：深蹲（每组15个×4组）、箭步蹲（每侧10个×4组）、台阶上下（每侧15个×3组）。</p><p><strong>3. 核心稳定性：</strong>决定你在不平路面上的平衡能力。训练方法：平板支撑（30秒×4组）、俄罗斯转体（每侧15个×3组）、鸟狗式（每侧10个×3组）。</p><p><strong>4. 踝关节稳定性：</strong>减少扭伤风险。训练方法：单脚站立（每侧30秒×3组）、踝关节弹力带训练。</p><h2>8周训练计划（每周3次）</h2><p><strong>第1-2周（适应期）：</strong>快走30分钟 + 基础深蹲20个 + 平板支撑20秒×3组</p><p><strong>第3-4周（提升期）：</strong>快走40分钟/慢跑20分钟 + 深蹲30个 + 箭步蹲每侧10个 + 平板支撑30秒×3组</p><p><strong>第5-6周（强化期）：</strong>慢跑30分钟 + 深蹲40个 + 负重箭步蹲 + 平板支撑45秒×4组 + 踝关节训练</p><p><strong>第7-8周（巩固期）：</strong>模拟实际徒步（负重5-8kg快走1小时）+ 全套力量训练 + 拉伸放松</p><h2>注意事项</h2><p>循序渐进，不要一开始就高强度。训练后充分拉伸。如果膝盖有旧伤，先咨询运动医学医生。训练期间保证充足睡眠和蛋白质摄入。</p></div>',
          summary: '心肺耐力、腿部力量、核心稳定性三大训练方向',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '7分钟',
          likes: 0,
          highlights: '想走秦岭穿越、太白山？8周体能训练计划帮你做好准备。心肺+力量+核心+踝关节，系统训练让你走得更远更安全。',
          isActive: true,
          order: 55
        },
        {
          _id: 'article_056',
          title: '不同季节的徒步注意事项',
          category: '安全自救',
          subcategory: '季节安全',
          difficulty: 'intermediate',
          priority: 1,
          tags: ['季节', '四季', '天气', '注意事项'],
          season: ['all'],
          content: '<div class="article-body"><h2>秦岭四季各有挑战</h2><p>秦岭横跨中国南北，气候多变。不同季节徒步需要不同的准备和注意事项。了解季节特点，才能安全享受每个季节的风景。</p><h2>🌸 春季（3-5月）</h2><p><strong>特点：</strong>气温回升但早晚温差大（10-15°C），春雨频繁，山路湿滑。</p><p><strong>注意事项：</strong>防滑鞋底必备，雨衣随身带。4-5月是杜鹃花季，高海拔可能还有残雪。春季过敏者注意花粉。</p><p><strong>穿衣：</strong>速干内衣 + 抓绒 + 防风外套，随时增减。</p><h2>☀️ 夏季（6-8月）</h2><p><strong>特点：</strong>高温高湿，紫外线强，午后雷阵雨频繁，蚊虫多。</p><p><strong>注意事项：</strong>早出发（6-7点），避开11-14点高温时段。防暑降温，大量补水（每小时500ml+）。雷雨天气立即下撤到安全区域。</p><p><strong>穿衣：</strong>速干衣裤 + 防晒皮肤衣，帽子墨镜必备。带驱蚊液。</p><h2>🍂 秋季（9-11月）</h2><p><strong>特点：</strong>最佳徒步季节。天气凉爽稳定，能见度高，红叶满山。</p><p><strong>注意事项：</strong>抓住好天气多走几条路线。10月后早晚明显变凉，带保暖层。秋季干燥，注意防火。</p><p><strong>穿衣：</strong>速干 + 薄抓绒 + 防风衣。11月需要加厚保暖层。</p><h2>❄️ 冬季（12-2月）</h2><p><strong>特点：</strong>气温低（可能零下10°C+），路面结冰，日照短，大风。</p><p><strong>注意事项：</strong>新手不建议冬季进山。必须带冰爪、头灯（日照短）、足够保暖装备。时刻警惕失温。日落前必须下山。</p><p><strong>穿衣：</strong>速干 + 厚抓绒 + 羽绒 + 冲锋衣。手套、帽子、围巾缺一不可。</p><h2>通用建议</h2><p>出发前48小时持续关注天气预报。山区天气变化快，预报仅供参考。无论什么季节，防风外套和雨衣都是必备品。</p></div>',
          summary: '春夏秋冬四季徒步的穿衣、装备和安全要点',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '6分钟',
          likes: 0,
          highlights: '秦岭四季各有挑战：春天防滑防雨、夏天防暑防雷、秋天赏叶防火、冬天防冻防滑。了解季节特点，才能安全享受每个季节的风景。',
          isActive: true,
          order: 56
        },
        {
          _id: 'article_057',
          title: '秦岭野生动植物识别入门',
          category: '其他',
          subcategory: '自然科普',
          difficulty: 'intermediate',
          priority: 1,
          tags: ['秦岭', '动植物', '识别', '自然'],
          season: ['all'],
          content: '<div class="article-body"><h2>秦岭——中国的自然宝库</h2><p>秦岭是中国最重要的生态屏障之一，南北气候分界线。这里生活着大熊猫、金丝猴、羚牛、朱鹮等「秦岭四宝」，还有3000多种植物。学会识别一些常见的动植物，会让你的徒步体验丰富十倍。</p><h2>秦岭四宝</h2><p><strong>大熊猫：</strong>野生大熊猫很难遇到，但可以看它们的痕迹——竹子上的咬痕、地上的粪便（竹纤维组成）。主要分布在佛坪、长青等保护区。</p><p><strong>金丝猴：</strong>比大熊猫容易见到。金色毛发、蓝色面孔，群居生活。在周至老县城、佛坪等地有机会看到。注意：它们会抢食物！</p><p><strong>羚牛：</strong>体型庞大（可达300kg），看起来像牛又像羊。脾气暴躁，遇到千万不要靠近！在高海拔草甸活动。</p><p><strong>朱鹮：</strong>粉红色羽毛，曾濒临灭绝。主要在洋县一带的湿地和稻田活动，清晨和傍晚容易看到。</p><h2>常见植物识别</h2><p><strong>华山松：</strong>秦岭最常见的松树，针叶5针一束，松塔很大。松针可以泡茶（富含维C）。</p><p><strong>杜鹃花：</strong>4-5月漫山遍野，有红、白、紫等颜色。高海拔的杜鹃矮小匍匐，形成壮观的杜鹃花海。</p><p><strong>太白红杉：</strong>中国特有树种，只分布在秦岭高海拔。秋天变金黄色，非常壮观。</p><p><strong>独叶草：</strong>国家一级保护植物，只有一片叶子一朵花。看到不要采摘！</p><h2>安全提醒</h2><p><strong>不认识的植物不要碰、不要吃！</strong>秦岭有剧毒的断肠草、毒蘑菇等。只观察不触摸，只拍照不采摘。</p><p>遇到大型野生动物（羚牛、野猪），保持距离，安静后退，不要跑。带幼崽的动物最危险。</p><h2>如何学习识别</h2><p>推荐APP：形色（植物识别）、懂鸟（鸟类识别）。拍照识别后记录下来，慢慢就认识了。参加自然观察团也是好方法。</p></div>',
          summary: '秦岭四宝识别、常见植物入门、安全观察技巧',
          coverImage: '/images/scenery/scenery-general.jpg',
          readTime: '7分钟',
          likes: 0,
          highlights: '秦岭是中国的自然宝库——大熊猫、金丝猴、羚牛、朱鹮都在这里。学会识别常见动植物，让你的徒步从「走路」变成「探索」。',
          isActive: true,
          order: 57
        }
      ,
        {
          "_id": "article_047",
          "title": "出行安全检查清单",
          "category": "安全自救",
          "subcategory": "基础安全",
          "difficulty": "beginner",
          "priority": 6,
          "tags": [
                    "安全",
                    "清单",
                    "出发"
          ],
          "season": [
                    "all"
          ],
          "content": "<div class=\"article-body\"><h2>出发前必查10项</h2><p><strong>1. 天气预报：</strong>查看目的地未来24-48小时天气，重点关注降雨、大风、降温。山区天气多变，即使预报晴天也要带雨具。</p><p><strong>2. 路线规划：</strong>提前研究路线，下载离线地图。告诉家人你的路线和预计返回时间。</p><p><strong>3. 手机充电：</strong>满电出发，带充电宝。手机是你最重要的求救工具。</p><p><strong>4. 饮水量：</strong>按每小时300-500ml估算，夏季加倍。宁多勿少。</p><p><strong>5. 急救包：</strong>检查是否齐全、药品是否过期。创可贴、碘伏、绷带、止痛药是最低配置。</p><p><strong>6. 鞋子：</strong>穿磨合好的鞋，不要穿新鞋上山。检查鞋底有无脱胶。</p><p><strong>7. 衣物：</strong>带防风层和保暖层，即使夏天也要带。山上温差大。</p><p><strong>8. 食物：</strong>带高热量零食（能量棒、巧克力、坚果）。多带一份应急。</p><p><strong>9. 身体状态：</strong>感冒、熬夜、宿醉不要上山。身体不舒服就改期。</p><p><strong>10. 紧急联系人：</strong>手机存好紧急联系人电话，设置ICE（紧急联系人）信息。</p><h2>进山后检查</h2><p>每隔1小时检查一次：水还够吗？体力如何？天气有变化吗？如果任何一项有问题，及时调整计划。</p></div>",
          "summary": "出发前必查10项清单，徒步安全从准备开始",
          "coverImage": "/images/scenery/scenery-general.jpg",
          "readTime": "5分钟",
          "likes": 0,
          "highlights": "安全不是运气，是准备。这10项检查清单帮你把风险挡在出发前，养成每次出行前对照检查的习惯。"
},
        {
          "_id": "article_048",
          "title": "野外如厕指南",
          "category": "户外礼仪",
          "subcategory": "营地规范",
          "difficulty": "beginner",
          "priority": 3,
          "tags": [
                    "如厕",
                    "卫生",
                    "LNT",
                    "营地"
          ],
          "season": [
                    "all"
          ],
          "content": "<div class=\"article-body\"><h2>为什么要专门说这个？</h2><p>这是户外最不愿提但最重要的事之一。处理不当会污染水源、传播疾病、影响他人体验。好的户外人连这个都做得干净利落。</p><h2>小便</h2><p><strong>选址：</strong>离水源、步道、营地至少60米。选在土壤上（不是岩石上），土壤微生物能分解尿液中的盐分。</p><p><strong>注意：</strong>尿液中的盐分会吸引动物舔食，进而啃咬帐篷、背包。在盐碱匮乏的高山区域尤其明显。</p><h2>大便</h2><p><strong>挖猫洞：</strong>找一个远离水源60米以上、远离步道和营地的地方。用小铲子挖一个深约15-20cm、宽约10-15cm的洞。</p><p><strong>使用后：</strong>排入猫洞。用土掩埋压实。纸巾也掩埋（最好用可降解纸巾），或装入密封袋带下山。</p><p><strong>不能挖洞的地方：</strong>岩石区、高山草甸、沙地。此时必须使用WAG袋（废物打包袋）将排泄物带下山。</p><h2>卫生</h2><p>携带免洗洗手液或酒精棉片。如厕后必须清洁双手。女性需要带够卫生用品和密封袋。</p><h2>特别注意</h2><p>永远不要在水源附近如厕！溪流会冲走排泄物但不会消除病菌，下游的人可能因此生病。保护水源就是保护所有户外人的健康。</p></div>",
          "summary": "挖猫洞、距离水源、带走纸巾，户外卫生基本功",
          "coverImage": "/images/scenery/scenery-stream-waterfall.jpg",
          "readTime": "5分钟",
          "likes": 0,
          "highlights": "户外如厕看似小事，实则关系到水源保护和公共卫生。学会正确处理，是每个户外人的基本素养。"
},
        {
          "_id": "article_049",
          "title": "步道礼让规范",
          "category": "户外礼仪",
          "subcategory": "社区礼仪",
          "difficulty": "beginner",
          "priority": 1,
          "tags": [
                    "礼让",
                    "步道",
                    "社交",
                    "礼仪"
          ],
          "season": [
                    "all"
          ],
          "content": "<div class=\"article-body\"><h2>基本规则</h2><p>步道虽宽，但人与人之间的尊重更宽。几个简单的规则，让每个人都能愉快地享受山野。</p><h2>上坡优先</h2><p>上坡的人有优先通行权。原因：上坡者正在集中体力和节奏，停下来重新启动比下坡者消耗更大。遇到上坡的人，主动侧身让路。</p><h2>靠右行走</h2><p>和公路规则一样，靠右行走。这样对面来人时自然错开，不需要临时让路。在较宽的步道上，也不要横排占满。</p><h2>超车礼仪</h2><p>从后面超越时，提前说一声「麻烦让一下」或「我从左边过」。被超越的人听到后靠右让出空间。快速通过后说声「谢谢」。</p><h2>休息位置</h2><p>不要在步道中间休息！找一个宽敞的地方靠边停下。如果步道很窄，让到能容一人通过的位置。</p><h2>噪音控制</h2><p>不要大声喧哗、外放音乐。山野的宁静是很多人来徒步的原因。说话压低音量，使用耳机听音乐。</p><h2>宠物管理</h2><p>如果带狗上山，全程牵绳。清理狗的粪便。注意：有些路线禁止携带宠物，出发前确认。</p><h2>遇到团队</h2><p>遇到大团队（10人以上），主动让路等待他们通过。团队行进时不便频繁避让个人，体谅一下。</p></div>",
          "summary": "上坡优先、靠右行走、超车有礼，步道社交基本功",
          "coverImage": "/images/scenery/scenery-trail.jpg",
          "readTime": "5分钟",
          "likes": 0,
          "highlights": "步道礼让是户外社交的基本功。上坡优先、靠右行走、超车有礼——简单规则让山野更和谐。"
}
      ]
      let imported = 0
      let skipped = 0
      for (const article of newArticles) {
        try {
          await db.collection('articles').doc(article._id).get()
          skipped++
        } catch (e) {
          await db.collection('articles').add({ data: article })
          imported++
        }
      }
      return success({ imported, skipped }, `导入完成：新增${imported}篇，跳过${skipped}篇`)
    }
    default: return fail('未知操作')
  }
}

// ===== isActive 切换 =====
async function handleToggleActive(action, params) {
  switch (action) {
    case 'toggle': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { id, collection } = params || {}
      if (!id || !collection) return fail('缺少参数')
      if (!['routes', 'articles'].includes(collection)) return fail('不支持的集合')
      const { data } = await db.collection(collection).doc(id).get()
      if (!data) return fail('记录不存在')
      const newVal = !(data.isActive !== false) // 默认 true，取反
      await db.collection(collection).doc(id).update({ data: { isActive: newVal } })
      return success({ isActive: newVal }, newVal ? '已启用' : '已禁用')
    }
    default: return fail('未知操作')
  }
}

// ===== 批量导出 JSONL =====
async function handleExport(action, params) {
  switch (action) {
    case 'exportData': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { collection } = params || {}
      if (!collection || !['routes', 'articles', 'user_data'].includes(collection)) {
        return fail('不支持的集合，可选：routes / articles / user_data')
      }

      // 分批获取全部数据
      const MAX_LIMIT = 100
      const countRes = await db.collection(collection).count()
      const total = countRes.total
      const batchTimes = Math.ceil(total / MAX_LIMIT)
      let allData = []
      for (let i = 0; i < batchTimes; i++) {
        const { data } = await db.collection(collection)
          .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
        allData = allData.concat(data)
      }

      // 转换时间字段为 JSONL 格式，生成 JSONL 字符串
      const jsonlLines = allData.map(record => {
        const converted = convertDates(record)
        return JSON.stringify(converted)
      })
      const jsonlContent = jsonlLines.join('\n')

      // 上传到云存储
      const fileName = `${collection}_export_${Date.now()}.jsonl`
      const cloudPath = `exports/${fileName}`
      const uploadRes = await cloud.uploadFile({
        cloudPath,
        fileContent: Buffer.from(jsonlContent, 'utf-8')
      })

      // 获取下载链接
      const fileID = uploadRes.fileID
      const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
      const downloadUrl = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL

      return success({
        fileID,
        downloadUrl,
        fileName,
        totalRecords: allData.length
      }, `导出成功，共 ${allData.length} 条记录`)
    }
    default: return fail('未知操作')
  }
}

// 递归转换 Date 对象为 { "$date": "..." } 格式
function convertDates(obj) {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) {
    return { $date: obj.toISOString() }
  }
  if (Array.isArray(obj)) {
    return obj.map(item => convertDates(item))
  }
  if (typeof obj === 'object') {
    const result = {}
    for (const key of Object.keys(obj)) {
      result[key] = convertDates(obj[key])
    }
    return result
  }
  return obj
}

// ===== 数据迁移：为现有数据添加 isActive =====
async function handleMigrate(action, params) {
  switch (action) {
    case 'migrateIsActive': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)

      const collections = ['routes', 'articles']
      const results = {}

      for (const col of collections) {
        // 查询没有 isActive 字段的记录
        const countRes = await db.collection(col).where({ isActive: _.exists(false) }).count()
        const total = countRes.total
        if (total === 0) {
          results[col] = { total: 0, updated: 0 }
          continue
        }

        const MAX_LIMIT = 100
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        let updated = 0

        for (let i = 0; i < batchTimes; i++) {
          const { data } = await db.collection(col)
            .where({ isActive: _.exists(false) })
            .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()

          const tasks = data.map(record =>
            db.collection(col).doc(record._id).update({ data: { isActive: true } })
              .then(() => { updated++ })
              .catch(e => console.error(`迁移 ${col} ${record._id} 失败:`, e))
          )
          await Promise.all(tasks)
        }

        results[col] = { total, updated }
      }

      return success(results, '数据迁移完成')
    }
    default: return fail('未知操作')
  }
}

// ===== 配置管理 =====
async function handleConfig(action, params) {
  switch (action) {
    case 'get': {
      const { data } = await db.collection('admin_config').limit(1).get()
      return success(data[0] || {})
    }
    case 'update': {
      const tokenCheck = verifyToken(params)
      if (!tokenCheck.valid) return fail(tokenCheck.message)
      const { data: updateData } = params || {}
      const { data: existing } = await db.collection('admin_config').limit(1).get()
      if (existing.length > 0) {
        await db.collection('admin_config').doc(existing[0]._id).update({ data: updateData })
      } else {
        await db.collection('admin_config').add({ data: { ...updateData, createdAt: db.serverDate() } })
      }
      return success(null, '更新成功')
    }
    default: return fail('未知操作')
  }
}

// ===== 统计 =====
async function handleStats(action, params) {
  switch (action) {
    case 'overview': {
      const [routesRes, usersRes, articlesRes] = await Promise.all([
        db.collection('routes').count(),
        db.collection('user_data').count(),
        db.collection('articles').count()
      ])
      return success({
        totalRoutes: routesRes.total,
        totalUsers: usersRes.total,
        totalArticles: articlesRes.total
      })
    }

    // ====== 新增统计接口 ======

    // 用户增长趋势（按 day/week/month/year 统计）
    case 'userGrowth': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate, dateFormat

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        dateFormat = '%Y-%m-%d'
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
        dateFormat = '%Y-W%V'
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        dateFormat = '%Y-%m'
      } else { // year
        startDate = new Date(now.getFullYear() - 4, 0, 1)
        dateFormat = '%Y'
      }

      const res = await db.collection('user_data').aggregate()
        .match({ _openid: _.exists(true) })
        .project({
          dateStr: $.dateToString({
            date: '$updatedAt',
            format: dateFormat,
            timezone: '+08:00'
          })
        })
        .group({
          _id: '$dateStr',
          count: $.sum(1)
        })
        .sort({ _id: 1 })
        .end()

      return success({ list: res.list, dimension })
    }

    // 收藏趋势（按收藏日期分组统计）
    // 新数据格式：favorites = [{ routeId, date }]
    // 旧数据格式：favorites = ["route_001"]（无日期，跳过）
    case 'favoriteTrend': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      } else {
        startDate = new Date(now.getFullYear() - 4, 0, 1)
      }

      // 查询所有 user_data 记录（分页）
      const countResult = await db.collection('user_data').count()
      const total = countResult.total
      const pageSize = 100
      const pages = Math.ceil(total / pageSize)
      const trendMap = {}

      for (let i = 0; i < pages; i++) {
        const { data } = await db.collection('user_data')
          .skip(i * pageSize)
          .limit(pageSize)
          .get()

        for (const doc of data) {
          const favorites = doc.favorites || []
          for (const fav of favorites) {
            // 兼容新旧格式
            const favDate = typeof fav === 'object' && fav.date ? new Date(fav.date) : null
            if (!favDate || isNaN(favDate.getTime())) continue
            if (favDate < startDate) continue

            // 根据维度生成 key
            let key
            const d = new Date(favDate.getTime() + 8 * 3600000) // 转北京时间
            if (dimension === 'day') {
              key = d.toISOString().slice(0, 10)
            } else if (dimension === 'week') {
              const onejan = new Date(d.getFullYear(), 0, 1)
              const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7)
              key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
            } else if (dimension === 'month') {
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            } else {
              key = `${d.getFullYear()}`
            }
            trendMap[key] = (trendMap[key] || 0) + 1
          }
        }
      }

      // 转为排序数组
      const list = Object.keys(trendMap).sort().map(k => ({ _id: k, count: trendMap[k] }))
      console.log('favoriteTrend result:', JSON.stringify(list))
      return success({ list, dimension })
    }

    // 已走过趋势（按 completedAt 时间戳聚合）
    case 'completedTrend': {
      const { dimension = 'month' } = params || {}
      const now = new Date()
      let startDate, dateFormat

      if (dimension === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        dateFormat = '%Y-%m-%d'
      } else if (dimension === 'week') {
        startDate = new Date(now.getTime() - 29 * 7 * 86400000)
        dateFormat = '%Y-W%V'
      } else if (dimension === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        dateFormat = '%Y-%m'
      } else {
        startDate = new Date(now.getFullYear() - 4, 0, 1)
        dateFormat = '%Y'
      }

      // 展开 completed 数组，按 completedAt 聚合
      const res = await db.collection('user_data').aggregate()
        .unwind('$completed')
        .match({
          'completed.completedAt': _.gte(startDate.getTime())
        })
        .project({
          dateStr: $.dateToString({
            date: $.add([new Date(0), '$completed.completedAt']),
            format: dateFormat,
            timezone: '+08:00'
          })
        })
        .group({
          _id: '$dateStr',
          count: $.sum(1)
        })
        .sort({ _id: 1 })
        .end()

      return success({ list: res.list, dimension })
    }

    // 收藏最多的 50 条路线
    case 'topFavoritedRoutes': {
      const res = await db.collection('routes').aggregate()
        .match({ favoriteCount: _.gt(0) })
        .project({
          name: 1,
          favoriteCount: $.ifNull(['$favoriteCount', 0])
        })
        .sort({ favoriteCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 已走过最多的 50 条路线
    case 'topCompletedRoutes': {
      const res = await db.collection('routes').aggregate()
        .match({ completedCount: _.gt(0) })
        .project({
          name: 1,
          completedCount: $.ifNull(['$completedCount', 0])
        })
        .sort({ completedCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 阅读量最多的 50 篇文章
    case 'topArticles': {
      const res = await db.collection('articles').aggregate()
        .match({ viewCount: _.gt(0) })
        .project({
          title: 1,
          category: 1,
          author: 1,
          viewCount: $.ifNull(['$viewCount', 0])
        })
        .sort({ viewCount: -1 })
        .limit(50)
        .end()

      return success({ list: res.list })
    }

    // 访问最活跃的 100 位用户（按已走过记录数排序）
    // 注意：小程序没有独立的访问日志 collection，用已走过记录数作为活跃度指标
    case 'topUsers': {
      // 从 users 集合按 visitCount 降序取 TOP 100
      const { data: topUsers } = await db.collection('users')
        .orderBy('visitCount', 'desc')
        .limit(100)
        .get()

      // 关联 user_data 获取已走过和收藏数
      const topOpenIds = topUsers.map(u => u._openid).filter(Boolean)
      let userDataMap = {}
      if (topOpenIds.length > 0) {
        const { data: userDatas } = await db.collection('user_data')
          .where({ _openid: _.in(topOpenIds) }).get()
        userDatas.forEach(ud => { userDataMap[ud._openid] = ud })
      }

      const list = topUsers.map(u => {
        const ud = userDataMap[u._openid] || {}
        return {
          _openid: u._openid,
          nickName: u.nickName || '',
          avatarUrl: u.avatarUrl || '',
          userNumber: u.userNumber || '',
          visitCount: u.visitCount || 0,
          completedCount: Array.isArray(ud.completed) ? ud.completed.length : 0,
          favoritesCount: Array.isArray(ud.favorites) ? ud.favorites.length : 0
        }
      })

      return success({ list })
    }

    // 初始化路线收藏和已走过次数统计（一次性操作）
    // 遍历所有 user_data，统计 favorites 和 completed，写入 routes 集合
    case 'initRouteStats': {
      const MAX_LIMIT = 100
      async function getAllRecords(collection) {
        const countRes = await db.collection(collection).count()
        const total = countRes.total
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        const tasks = []
        for (let i = 0; i < batchTimes; i++) {
          tasks.push(
            db.collection(collection)
              .skip(i * MAX_LIMIT)
              .limit(MAX_LIMIT)
              .get()
              .then(res => res.data)
          )
        }
        const results = await Promise.all(tasks)
        return results.reduce((acc, cur) => acc.concat(cur), [])
      }

      // 1. 获取所有 user_data
      const allUserData = await getAllRecords('user_data')

      // 2. 统计
      const favoriteCountMap = {}
      const completedCountMap = {}
      let totalFavorites = 0
      let totalCompleted = 0

      for (const user of allUserData) {
        const favorites = user.favorites || []
        for (const item of favorites) {
          // 兼容新旧格式
          const routeId = typeof item === 'string' ? item : (item && item.routeId ? item.routeId : null)
          if (routeId) {
            favoriteCountMap[routeId] = (favoriteCountMap[routeId] || 0) + 1
            totalFavorites++
          }
        }
        const completed = user.completed || []
        for (const item of completed) {
          const routeId = item.routeId
          if (routeId) {
            completedCountMap[routeId] = (completedCountMap[routeId] || 0) + 1
            totalCompleted++
          }
        }
      }

      // 3. 更新 routes 集合
      const allRoutes = await getAllRecords('routes')
      const updateTasks = []
      let routesUpdated = 0
      let routesWithFavorites = 0
      let routesWithCompleted = 0
      const details = []

      for (const route of allRoutes) {
        const routeId = route._id
        const favCount = favoriteCountMap[routeId] || 0
        const compCount = completedCountMap[routeId] || 0

        if (favCount > 0) routesWithFavorites++
        if (compCount > 0) routesWithCompleted++

        const needsUpdate =
          route.favoriteCount !== favCount ||
          route.completedCount !== compCount ||
          route.favoriteCount === undefined ||
          route.completedCount === undefined

        if (needsUpdate) {
          updateTasks.push(
            db.collection('routes').doc(routeId).update({
              data: { favoriteCount: favCount, completedCount: compCount }
            }).then(() => {
              routesUpdated++
              if (favCount > 0 || compCount > 0) {
                details.push({
                  routeId, name: route.name || '未知',
                  favoriteCount: favCount, completedCount: compCount
                })
              }
            }).catch(e => { console.error(`更新路线 ${routeId} 失败:`, e) })
          )
        }
      }

      await Promise.all(updateTasks)

      return success({
        totalUsers: allUserData.length,
        totalFavorites,
        totalCompleted,
        totalRoutes: allRoutes.length,
        routesUpdated,
        routesWithFavorites,
        routesWithCompleted,
        topFavorites: details.filter(d => d.favoriteCount > 0).sort((a, b) => b.favoriteCount - a.favoriteCount),
        topCompleted: details.filter(d => d.completedCount > 0).sort((a, b) => b.completedCount - a.completedCount)
      }, '初始化统计完成')
    }

    default: return fail('未知操作')
  }
}

// ===== 云函数入口 =====
exports.main = async (event, context) => {
  try {
    const { module, action, params } = event
    switch (module) {
      case 'routes': return await handleRoutes(action, params)
      case 'users': return await handleUsers(action, params)
      case 'articles': return await handleArticles(action, params)
      case 'config': return await handleConfig(action, params)
      case 'stats': return await handleStats(action, params)
      case 'auth': return handleAuth(action, params)
      case 'toggleActive': return await handleToggleActive(action, params)
      case 'export': return await handleExport(action, params)
      case 'migrate': return await handleMigrate(action, params)
      case 'check-admin': {
        const adminOpenIds = ['o4BVT3QcW1wbAgEt1yqRD7drVPhY']
        const { OPENID } = cloud.getWXContext()
        return success({ isAdmin: adminOpenIds.includes(OPENID), openid: OPENID })
      }
      default: return fail('未知模块: ' + module)
    }
  } catch (err) {
    console.error('admin-api error:', err)
    return fail(err.message)
  }
}

// 已在文件中 - 不要重复添加

