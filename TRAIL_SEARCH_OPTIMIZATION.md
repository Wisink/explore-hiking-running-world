# 秦人徒步小程序 — 路线查询优化方案

> 分析日期：2026-04-02
> 针对页面：`pages/routes/routes`（路线查询 Tab 页）

---

## 现状分析

### 当前用户流程
1. 用户进入「路线查询」Tab → 看到全部路线卡片列表
2. 可选择顶部筛选标签（全部 / 新手友好 / 亲子推荐 / 有溪流 等 8 个）
3. 可点击「⚙️ 筛选」展开高级筛选面板（难度 / 距离 / 爬升 / 路面 / 风景 / 费用，共 6 维度）
4. 可在搜索栏输入关键词搜索

### 痛点（对徒步新手）
| 痛点 | 说明 |
|------|------|
| **信息过载** | 6 维高级筛选对新手而言门槛太高，不知道「爬升 300m」意味着什么 |
| **无位置感知** | 不知道哪些路线离自己近，需要逐个看地址判断 |
| **决策成本高** | 面对几十条路线，新手缺乏判断依据，容易选择困难 |
| **缺少引导** | 没有"我不知道选什么，帮我推荐"的入口 |

### 现有数据基础（云端 routes 集合）
- `location.address`：文字地址（如"西安市蓝田县"）
- `location.direction`：区域方向（秦岭东线/中线/西线）
- `difficulty.label` / `difficulty.level`：难度标签
- `distance_km` / `duration_hours`：距离和耗时
- `scenery`：风景标签数组
- `elevation_gain_m`：海拔爬升
- ⚠️ **缺少经纬度字段**（lat/lng），这是位置匹配的基础

---

## 方案一：「附近路线」— 一键定位智能推荐

### 核心思路
> 用户打开路线查询页 → 自动获取定位（或手动选区域） → 按距离排序展示附近路线 → 新手只需看「离我最近 + 难度轻松」的路线即可出发。

**一句话**：把"搜索"变成"推荐"，让路线来找人，而不是人找路线。

### 具体实现步骤

#### 第一步：为路线数据补充经纬度
在云端 `routes` 集合中为每条路线增加 `latitude` 和 `longitude` 字段。

- **方式 A（推荐）**：利用腾讯地图 Geocoding API，将已有 `location.address` 批量解析为经纬度
- **方式 B**：后台管理页面(route-edit)增加经纬度输入字段，管理员手动填写

```javascript
// 云函数：批量补全经纬度（一次性任务）
const axios = require('axios')
async function geocodeRoute(address) {
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(address)}&key=${YOUR_KEY}`
  const res = await axios.get(url)
  if (res.data.status === 0) {
    return {
      lat: res.data.result.location.lat,
      lng: res.data.result.location.lng
    }
  }
  return null
}
```

#### 第二步：前端获取用户位置
使用微信 `wx.getLocation` API 获取用户当前经纬度。

```javascript
// pages/routes/routes.js 新增
getUserLocation: function() {
  wx.getLocation({
    type: 'gcj02',
    success: (res) => {
      this.setData({
        userLat: res.latitude,
        userLng: res.longitude,
        locationGranted: true
      })
      this.sortByDistance()
    },
    fail: () => {
      // 用户拒绝授权 → 显示手动选择区域的降级方案
      this.setData({ locationGranted: false, showRegionPicker: true })
    }
  })
}
```

#### 第三步：客户端距离计算与排序
使用 Haversine 公式计算用户到每条路线的直线距离，按距离排序展示。

```javascript
// 工具函数：计算两点距离（km）
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
    Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// 对全量路线按距离排序
sortByDistance: function() {
  const { userLat, userLng } = this.data
  if (!userLat || !userLng) return
  const sorted = this._allProcessedData.map(item => ({
    ...item,
    distanceToUser: haversine(userLat, userLng, item.latitude, item.longitude)
  })).sort((a, b) => a.distanceToUser - b.distanceToUser)
  this._allProcessedData = sorted
  this.processRoutes(sorted, 0, true, true)
}
```

#### 第四步：UI 改造

**新增「附近路线」模块**（页面顶部，筛选栏上方）：
- 显示用户当前位置（如"📍 西安市长安区"，可用腾讯地图逆地理编码获取文字地址）
- 展示最近的 3-5 条路线卡片（紧凑模式），标注"距你 X km"
- 一个「查看全部附近路线」按钮，点击后按距离排序展示完整列表
- 新手默认看到的就是「附近 + 轻松」的推荐

**降级方案**（用户拒绝定位时）：
- 显示区域选择器（东线 / 中线 / 西线 / 咸阳 / 渭南 等）
- 按所选区域筛选路线

**筛选标签改造**：
- 新增「📍 离我最近」筛选标签，排在首位
- 原有筛选标签保留，与距离排序叠加

#### 第五步：路线卡片增加距离信息
在路线卡片上显示"距你 X.X km"标签。

### 技术实现要点

| 模块 | 技术方案 |
|------|---------|
| 用户定位 | 微信 `wx.getLocation`（gcj02 坐标系） |
| 路线经纬度 | 腾讯地图 Geocoding API 批量解析 |
| 距离计算 | 客户端 Haversine 公式（全量数据已在客户端） |
| 逆地理编码 | 腾讯地图 Reverse Geocoding API（坐标→地址文字） |
| 权限处理 | `wx.getSetting` 检查 + 引导授权弹窗 |
| 地图密钥 | 复用小程序已有的腾讯地图 Key（`project.private.config.json` 中配置） |

### 优缺点分析

| 维度 | 详情 |
|------|------|
| ✅ 优点 | **极低使用门槛**：打开即推荐，零操作也能看到结果 |
| ✅ 优点 | **符合直觉**：「附近有什么」是最自然的查询方式 |
| ✅ 优点 | **技术成熟**：微信定位 + 腾讯地图是小程序标配能力 |
| ✅ 优点 | **对现有代码改动较小**：主要是在现有流程上叠加距离维度 |
| ⚠️ 缺点 | 依赖用户授权定位，拒绝后体验降级 |
| ⚠️ 缺点 | 需要为所有路线补全经纬度（一次性工作，约 20-50 条路线） |
| ⚠️ 缺点 | 直线距离 ≠ 实际路程，可能有偏差（但对新手筛选足够） |

### 预估工作量

| 任务 | 工时 |
|------|------|
| 路线经纬度数据补全（云函数 + 腾讯地图 Geocoding） | 0.5 天 |
| 前端定位获取 + 权限处理 | 0.5 天 |
| 距离计算 + 排序逻辑 | 0.5 天 |
| UI 改造（附近路线模块 + 卡片距离标签） | 1 天 |
| 降级方案（区域选择器） | 0.5 天 |
| 联调测试 | 0.5 天 |
| **合计** | **约 3.5 天** |

---

## 方案二：「徒步助手」— 对话式智能推荐

### 核心思路
> 新增一个「帮我选路线」入口 → 以对话问答形式了解用户需求 → 3-4 个简单问题后 → 推荐 2-3 条最适合的路线。

**一句话**：像朋友推荐一样，用聊天代替筛选，用问答代替参数。

### 具体实现步骤

#### 第一步：设计问题引导流程

采用**分步卡片式交互**（不是真正对话，而是分步选择器），共 3 步：

```
Step 1: "你今天想怎么玩？"
  🌿 轻松散步（走走看看，不累）
  🥾 认真徒步（出出汗，挑战一下）
  👨‍👩‍👧 带娃出去（小朋友也开心）

Step 2: "你更想看什么风景？"
  🌊 溪水瀑布（水边凉快）
  🌲 森林山林（绿荫遮阳）
  🏔️ 山顶远眺（开阔壮观）
  🏛️ 古迹古道（历史文化）
  🤷 都行（你帮我选）

Step 3: "大概想走多久？"
  ⏱️ 半天以内（2-3小时）
  ⏱️ 大半天（4-5小时）
  ⏱️ 一整天（6小时+）
  🤷 看情况（不赶时间）
```

#### 第二步：答案映射为筛选条件

```javascript
// 问题答案 → 数据筛选条件映射
const ANSWER_MAP = {
  // Step 1 答案
  '轻松散步': {
    difficulty: { level: { $lte: 2 } },
    distance_km: { $lte: 8 }
  },
  '认真徒步': {
    difficulty: { level: { $in: [3, 4] } }
  },
  '带娃出去': {
    'difficulty.suitableFor': { $elemMatch: { $regex: '亲子' } },
    difficulty: { level: { $lte: 2 } },
    distance_km: { $lte: 6 }
  },

  // Step 2 答案
  '溪水瀑布': { scenery: { $regex: '溪流|瀑布|溪水' } },
  '森林山林': { scenery: { $regex: '森林|山林|竹林' } },
  '山顶远眺': { scenery: { $regex: '云海|远眺|山脊|日出' } },
  '古迹古道': { scenery: { $regex: '古迹|古道|古寺' } },
  '都行': {},

  // Step 3 答案
  '半天以内': { duration_hours: { $lte: 3 } },
  '大半天': { duration_hours: { $gte: 4, $lte: 5.5 } },
  '一整天': { duration_hours: { $gte: 6 } },
  '看情况': {}
}
```

#### 第三步：构建推荐引擎

```javascript
// 云函数新增 action: 'recommend'
async function recommend(event) {
  const { preferences } = event
  // preferences = { step1: '轻松散步', step2: '溪水瀑布', step3: '半天以内' }

  // 合并筛选条件
  const where = {}
  for (const [step, answer] of Object.entries(preferences)) {
    const conditions = ANSWER_MAP[answer] || {}
    Object.assign(where, conditions)
  }

  // 查询匹配路线
  let routes = await db.collection('routes').where(where).limit(10).get()

  // 如果匹配不足3条，放宽条件（去掉距离限制）
  if (routes.data.length < 3) {
    const relaxed = { ...where }
    delete relaxed.distance_km
    routes = await db.collection('routes').where(relaxed).limit(10).get()
  }

  // 如果有定位信息，按距离排序
  if (event.userLat && event.userLng) {
    routes.data.forEach(r => {
      if (r.latitude && r.longitude) {
        r.distanceToUser = haversine(event.userLat, event.userLng, r.latitude, r.longitude)
      }
    })
    routes.data.sort((a, b) => (a.distanceToUser || 999) - (b.distanceToUser || 999))
  }

  // 取前3条推荐
  return success({
    recommendations: routes.data.slice(0, 3),
    total_matched: routes.data.length
  })
}
```

#### 第四步：前端 UI 实现

**新增「帮我选路线」入口**：
- 在路线查询页顶部 header 区域增加一个显眼按钮：「🎯 不知道去哪？帮你选！」
- 点击后弹出全屏分步选择器（Modal 或独立页面）

**分步选择器 UI**：
- 每步展示 3-4 个大卡片选项（图文并茂，emoji + 简短文案）
- 顶部进度条（Step 1/3）
- 选完 3 步后立即展示推荐结果

**推荐结果页**：
- 展示 2-3 条推荐路线（卡片形式）
- 每条附推荐理由："因为你想轻松散步 + 看溪水 + 半天以内 → 推荐这条"
- 「换一批」按钮（随机从剩余匹配中再选 3 条）
- 「重新选」按钮（回到问答流程）
- 「查看全部」按钮（跳转到筛选结果列表）

#### 第五步：可选增强 — 结合定位

如果用户已授权定位，在推荐结果中叠加距离维度：
- 推荐理由增加"离你最近，仅 X km"
- 优先推荐附近的路线

### 技术实现要点

| 模块 | 技术方案 |
|------|---------|
| 交互形式 | 独立页面 `pages/route-quiz/` 或全屏 Modal 组件 |
| 推荐逻辑 | 云函数 `routes` 新增 `action: 'recommend'` |
| 筛选条件 | 客户端组装 `where` 对象，传入云函数 |
| 结果排序 | 距离（如有定位）+ 收藏数/浏览数加权 |
| 缓存策略 | 答案映射表可写在前端常量中，减少请求 |
| UI 组件 | 大卡片选项 + 进度条 + 推荐理由标签 |

### 优缺点分析

| 维度 | 详情 |
|------|------|
| ✅ 优点 | **零学习成本**：不需要理解任何专业术语 |
| ✅ 优点 | **体验有趣**：像做小测试一样，增加互动感 |
| ✅ 优点 | **精准推荐**：3 个维度交叉筛选，结果更贴合需求 |
| ✅ 优点 | **降低选择焦虑**：只推荐 2-3 条，减少决策压力 |
| ✅ 优点 | **独立于现有功能**：不影响原有筛选体系，纯增量 |
| ⚠️ 缺点 | 开发量稍大（新增页面 + 云函数 + 交互逻辑） |
| ⚠️ 缺点 | 问题设计需要精心打磨，文案要吸引人 |
| ⚠️ 缺点 | 路线数据量少时（< 15 条），推荐可能不够精准 |

### 预估工作量

| 任务 | 工时 |
|------|------|
| 推荐逻辑设计（答案映射 + 降级策略） | 0.5 天 |
| 云函数新增 recommend action | 0.5 天 |
| 分步选择器页面开发（UI + 交互） | 1.5 天 |
| 推荐结果页开发 | 1 天 |
| 入口集成（路线查询页按钮） | 0.5 天 |
| 联调测试 + 文案打磨 | 0.5 天 |
| **合计** | **约 4.5 天** |

---

## 方案对比总结

| 维度 | 方案一：附近路线 | 方案二：徒步助手 |
|------|-----------------|-----------------|
| 核心理念 | 让路线来找人 | 用对话代替筛选 |
| 新手门槛 | ⭐ 极低（打开即用） | ⭐ 极低（回答问题即可） |
| 开发工作量 | 3.5 天 | 4.5 天 |
| 对现有代码影响 | 中等（改现有页面） | 较低（新增独立页面） |
| 数据依赖 | 需补全经纬度 | 无额外数据需求 |
| 是否需要定位权限 | 是（有降级方案） | 可选增强 |
| 适合场景 | 日常快速查找 | 不知道去哪时的灵感来源 |
| 创新度 | ⭐⭐⭐ | ⭐⭐⭐⭐ |

### 推荐策略

**最佳实践：两个方案组合实施**

1. **先做方案一**（3.5 天）：因为改动小、见效快，直接提升日常查询体验
2. **再做方案二**（4.5 天）：作为「路线查询」页的亮点功能入口
3. 两者互补：方案一是"我知道要查什么"的快捷方式；方案二是"我不知道去哪"的灵感来源

**如果只能选一个**：
- 路线数量 > 20 条 → 选**方案一**（数据多时距离排序价值大）
- 路线数量 < 20 条 → 选**方案二**（数据少时对话推荐更精准）

---

*小鱼分析出品 🐟*
