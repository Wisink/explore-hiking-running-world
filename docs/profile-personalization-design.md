# 秦人徒步路线查询小程序 - 个人中心个性化设计方案

## 一、现有页面分析

### 当前页面结构（pages/profile/）

```
profile-page
├── page-header（顶部标题区：🥾 我的徒步 / 记录每一步的风景）
├── sync-bar（同步状态条）
├── stats-card（统计卡片：收藏 / 已走过 / 总里程）
├── tab-bar（Tab切换：我的收藏 / 已走过）
├── list-wrap（路线列表区域）
├── admin-entry（管理员入口）
└── footer（底部标语 + 备案号）
```

### 现有问题

- 页面顶部只有静态标题文字"🥾 我的徒步"，**缺少个性化用户标识**
- 没有头像、昵称等用户身份元素
- 与其他小程序个人中心相比，缺少"归属感"

### 现有UI风格

| 元素 | 值 |
|------|-----|
| 主色调 | `#2E7D32`（森林绿） |
| 强调色 | `#FF8F00`（琥珀橙） |
| 背景色 | `#FAFAF5`（暖白）渐变 `#E8F5E9`（浅绿） |
| 圆角 | 20-24rpx（卡片级） |
| 阴影 | `0 8rpx 32rpx rgba(0,0,0,0.06)` |
| 字重 | 标题800，正文500 |
| 动效 | 弹性缓动 `cubic-bezier(0.34, 1.56, 0.64, 1)` |

---

## 二、UI设计方案

### 2.1 布局示意图

```
┌──────────────────────────────────────────┐
│  ░░░░░░░░░░ 渐变背景 #E8F5E9 ░░░░░░░░░░  │
│                                          │
│              ┌──────────┐                │
│              │          │                │
│              │  ☁️🏔️🌸  │  ← 圆形头像     │
│              │ (卡通风景)│    140rpx       │
│              │          │                │
│              └──────────┘                │
│             白色边框 4rpx                 │
│           绿色阴影 ring                   │
│                                          │
│         042号徒步爱好者  ← 昵称           │
│         字号30rpx / 颜色#2E7D32          │
│         字重700 / 居中                    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ⭐ 收藏  │  👣 已走过  │  📏 里程  │  │
│  │    12     │     8      │   36.5   │  │
│  └────────────────────────────────────┘  │
│          （统计卡片 - 保持不变）            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ⭐ 我的收藏  │  👣 已走过          │  │
│  └────────────────────────────────────┘  │
│          （Tab栏 - 保持不变）              │
│  ...                                     │
└──────────────────────────────────────────┘
```

### 2.2 详细布局规格

#### 头像区域

| 属性 | 值 |
|------|-----|
| 位置 | page-header 最上方，居中 |
| 容器尺寸 | 140rpx × 140rpx |
| 头像图片 | `border-radius: 50%`（圆形裁剪） |
| 边框 | `4rpx solid #FFFFFF`（白色描边） |
| 外发光 | `box-shadow: 0 4rpx 20rpx rgba(46, 125, 50, 0.2)` |
| 底部外边距 | `margin-bottom: 20rpx` |
| 入场动画 | `fadeInUp` 400ms + `ease-spring` 弹性缓动 |

#### 昵称区域

| 属性 | 值 |
|------|-----|
| 位置 | 头像正下方，居中 |
| 字号 | `30rpx` |
| 字重 | `700` |
| 颜色 | `#2E7D32`（森林绿主色） |
| 底部外边距 | `margin-bottom: 8rpx` |
| 入场动画 | `fadeInUp` 400ms 100ms 延迟 |

#### 原 page-header 改造

- 原标题"🥾 我的徒步"和副标题"记录每一步的风景"**保留**，移至头像+昵称下方
- 整体改为垂直居中排列（`align-items: center`）
- 背景渐变保持不变

---

## 三、头像图片资源方案

### 3.1 资源来源

**方案：使用项目已有的 `/images/scenery/` 风景图片作为头像基础**

项目已有以下风景图片（均为实景照片）：

| 文件 | 主题 |
|------|-----|
| `scenery-cloud-sea.jpg` | 云海 |
| `scenery-historic.jpg` | 古迹 |
| `scenery-pastoral.jpg` | 田园 |
| `scenery-flowers.jpg` | 花海 |
| `scenery-lake.jpg` | 湖泊 |
| `scenery-forest.jpg` | 森林 |
| `scenery-canyon.jpg` | 峡谷 |
| `scenery-stream-waterfall.jpg` | 溪流瀑布 |
| `scenery-trail.jpg` | 小径 |
| `scenery-general.jpg` | 通用风景 |

共 **10 张**，足够提供头像多样性。

### 3.2 卡通化方案（推荐）

由于要求"卡通风景图片"，需要将现有图片卡通化。推荐两种方案：

#### 方案A：AI生成卡通风景头像（推荐⭐）

使用 DashScope/SD 等 AI 图片生成工具，以现有风景图为参考，生成卡通风格头像：

- 提示词模板：`cute cartoon illustration style landscape, [主题], soft pastel colors, rounded composition, flat design, kawaii style, no people, suitable for avatar`
- 生成 8-10 张不同主题的卡通风景图
- 尺寸统一为 400×400px（正方形，方便圆形裁剪）
- 保存到 `/images/avatars/` 目录

#### 方案B：使用现有风景图 + 圆形裁剪（快速方案）

- 直接使用现有 scenery 图片，通过 CSS `border-radius: 50%` 裁剪为圆形
- 不需要额外资源，但风格上是实景而非卡通
- 作为过渡方案，后续替换为卡通版

### 3.3 建议的头像列表

最终准备 **8 张** 卡通风景头像（去重和精简）：

```
/images/avatars/
├── avatar-01-cloud.jpg    # 卡通云海
├── avatar-02-forest.jpg   # 卡通森林
├── avatar-03-lake.jpg     # 卡通湖泊
├── avatar-04-flower.jpg   # 卡通花海
├── avatar-05-canyon.jpg   # 卡通峡谷
├── avatar-06-trail.jpg    # 卡通小径
├── avatar-07-waterfall.jpg # 卡通瀑布
└── avatar-08-sunset.jpg   # 卡通日落山景
```

---

## 四、昵称生成逻辑

### 4.1 编号生成规则

```javascript
// 核心逻辑
function generateNickname() {
  // 1. 检查本地是否已有昵称缓存
  const cached = wx.getStorageSync('userProfile')
  if (cached && cached.nickname) return cached.nickname

  // 2. 生成随机编号（3位数字，补零）
  const number = Math.floor(Math.random() * 999) + 1  // 001-999
  const paddedNumber = String(number).padStart(3, '0')

  // 3. 拼接昵称
  const nickname = `${paddedNumber}号徒步爱好者`

  // 4. 同时随机分配一个头像
  const avatarIndex = Math.floor(Math.random() * 8)  // 0-7
  const avatarPath = `/images/avatars/avatar-${String(avatarIndex + 1).padStart(2, '0')}.jpg`

  // 5. 缓存到本地（持久化，同一用户不会变）
  wx.setStorageSync('userProfile', {
    nickname: nickname,
    avatar: avatarPath,
    createdAt: Date.now()
  })

  return nickname
}
```

### 4.2 昵称特点

- 格式：`{3位编号}号徒步爱好者`
- 示例：`001号徒步爱好者`、`387号徒步爱好者`、`999号徒步爱好者`
- **一次性生成**，存入 `wx.Storage`，后续读取缓存，不重复生成
- 编号范围 001-999，共 999 种组合
- 头像同理，一次分配，持久化

---

## 五、与现有UI风格的融合方案

### 5.1 色彩融合

| 元素 | 颜色方案 |
|------|---------|
| 头像白色边框 | `#FFFFFF`（与卡片背景统一） |
| 头像外发光 | `rgba(46, 125, 50, 0.2)`（主色绿的半透明） |
| 昵称文字 | `#2E7D32`（主色，与统计数字一致） |
| 页面背景 | 保持现有 `#E8F5E9 → #FAFAF5` 渐变 |

### 5.2 间距融合

- 头像区与统计卡片间距：沿用现有 `padding: 40rpx 32rpx 20rpx`
- 头像距顶部安全区：增加 `padding-top: 40rpx`（给头像留出呼吸空间）
- 头像到昵称：`margin-bottom: 20rpx`
- 昵称到副标题：`margin-bottom: 8rpx`
- 副标题到统计卡片：保持现有 `16rpx`

### 5.3 动效融合

复用项目已有的动效体系：

- 头像入场：`fadeInUp` + `ease-spring`（同统计数字动画）
- 昵称入场：`fadeInUp` 100ms 延迟（错落感）
- 头像点击：`scale(0.95)` + `transition 150ms`（同收藏按钮风格）

### 5.4 整体层级调整

```
改造后的 page-header 结构：

page-header (position: relative; padding: 60rpx 32rpx 20rpx; align-items: center)
├── page-header__bg（渐变背景 - 保持）
├── user-avatar-wrap（新增 - 头像容器）
│   └── image.user-avatar（圆形头像 140rpx）
├── user-nickname（新增 - 昵称文字）
├── page-header__emoji（原标题emoji - 保留但缩小为36rpx）
├── page-header__title（原标题 - 保留但缩小为36rpx）
└── page-header__sub（副标题 - 保持26rpx）
```

---

## 六、具体实施步骤

### 步骤1：准备头像资源

```
1. 使用 AI 图片生成工具（DashScope z-image-turbo）生成 8 张卡通风景头像
2. 统一尺寸 400×400px，正方形
3. 保存到 /images/avatars/ 目录
4. 文件命名：avatar-01.jpg ~ avatar-08.jpg
```

### 步骤2：修改 profile.wxml

在 `<view class="page-header__content">` 内、最上方插入头像和昵称：

```xml
<!-- 用户头像 -->
<view class="user-avatar-wrap">
  <image class="user-avatar" src="{{userAvatar}}" mode="aspectFill"></image>
</view>

<!-- 用户昵称 -->
<text class="user-nickname">{{userNickname}}</text>
```

### 步骤3：修改 profile.wxss

新增样式：

```css
/* 用户头像 */
.user-avatar-wrap {
  align-self: center;
  margin-bottom: 20rpx;
  animation: fadeInUp 400ms var(--ease-spring) both;
}

.user-avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  border: 4rpx solid #FFFFFF;
  box-shadow: 0 4rpx 20rpx rgba(46, 125, 50, 0.2);
  background: #E8F5E9;
  transition: transform 150ms var(--ease-default);
}

.user-avatar:active {
  transform: scale(0.95);
}

/* 用户昵称 */
.user-nickname {
  align-self: center;
  font-size: 30rpx;
  font-weight: 700;
  color: #2E7D32;
  margin-bottom: 8rpx;
  letter-spacing: 1rpx;
  animation: fadeInUp 400ms var(--ease-spring) 100ms both;
}

/* page-header 内容改为居中对齐 */
.page-header__content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;  /* 新增：居中 */
  gap: 8rpx;
}
```

### 步骤4：修改 profile.js

1. 在 `data` 中新增：
```javascript
data: {
  // ... 现有字段
  userAvatar: '/images/avatars/avatar-01.jpg',  // 默认头像
  userNickname: '',  // 昵称
}
```

2. 新增初始化方法：
```javascript
/**
 * 初始化用户个性化信息（头像+昵称）
 * 首次使用时随机生成，之后读取缓存
 */
initUserProfile() {
  let profile = wx.getStorageSync('userProfile')

  if (!profile || !profile.nickname) {
    // 首次使用，随机生成
    const avatarList = [
      '/images/avatars/avatar-01.jpg',
      '/images/avatars/avatar-02.jpg',
      '/images/avatars/avatar-03.jpg',
      '/images/avatars/avatar-04.jpg',
      '/images/avatars/avatar-05.jpg',
      '/images/avatars/avatar-06.jpg',
      '/images/avatars/avatar-07.jpg',
      '/images/avatars/avatar-08.jpg',
    ]

    const number = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    const avatarIndex = Math.floor(Math.random() * avatarList.length)

    profile = {
      nickname: `${number}号徒步爱好者`,
      avatar: avatarList[avatarIndex],
      createdAt: Date.now()
    }

    wx.setStorageSync('userProfile', profile)
  }

  this.setData({
    userAvatar: profile.avatar,
    userNickname: profile.nickname
  })
}
```

3. 在 `onLoad()` 中调用 `this.initUserProfile()`

### 步骤5：测试验证

- [ ] 首次进入：头像和昵称随机生成并显示
- [ ] 再次进入：头像和昵称与上次一致（缓存生效）
- [ ] 清除缓存后重新进入：重新随机生成
- [ ] UI风格：与统计卡片、Tab栏风格协调
- [ ] 动画效果：头像和昵称有入场动画

---

## 七、技术要点

### 关键注意事项

1. **头像圆形裁剪**：使用 `border-radius: 50%` + 正方形图片，确保不拉伸变形
2. **昵称持久化**：必须存入 `wx.Storage`，否则每次刷新都会变
3. **默认头像兜底**：即使图片加载失败，也要有背景色兜底（`background: #E8F5E9`）
4. **入场动画时机**：在 `onShow` 或 `onLoad` 中触发，使用 `setData` 更新数据时自动触发动画
5. **不使用微信头像**：按需求不调用 `wx.getUserProfile`，使用本地随机分配

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `pages/profile/profile.wxml` | 修改 | 新增头像+昵称节点 |
| `pages/profile/profile.wxss` | 修改 | 新增头像+昵称样式 |
| `pages/profile/profile.js` | 修改 | 新增初始化逻辑 |
| `images/avatars/avatar-01~08.jpg` | 新增 | 8张卡通风景头像图片 |

---

## 八、扩展建议（可选）

1. **头像点击更换**：点击头像弹出头像选择面板，用户可手动切换
2. **昵称编辑**：点击昵称可手动修改（保留编号前缀）
3. **个人徒步等级**：根据已走过路线数量显示等级徽章（🥾新手 → 🏔️达人 → 🗻大师）
4. **加入打卡天数**：显示"已加入 XX 天"

---

*方案生成时间：2026-04-02*
*项目：秦人徒步路线查询小程序*
*涉及文件：pages/profile/*
