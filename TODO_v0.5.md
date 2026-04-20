# 秦人徒步 v0.5 任务规划

## 状态：待处理

### 1. 路线查询首页顶部固定
- **文件**: `miniprogram/pages/routes/routes.wxml` + `routes.wxss`
- **需求**: 标题"秦人徒步"和搜索框区域 `position: fixed`，不随列表滚动
- **注意**: 参考后台管理的 `styles/common.wxss` 的 fixed 头部模式

### 2. 后台管理手势返回脏检查
- **文件**: `miniprogram/pages/admin/route-edit.js` + 可能的 article 相关文件
- **需求**: 手势返回时也要提示"内容已修改，是否保存草稿？"
- **方案**: 在 `onUnload` 生命周期中检查脏标记，弹出确认框；和顶部返回按钮逻辑一致
- **难点**: `onUnload` 中调用 `wx.showModal` 可能无效（页面已销毁），需要用 `beforeunload` 或其他方案

### 3. 装备推荐偶现老装备
- **文件**: `miniprogram/pages/route-detail/route-detail.js`
- **现象**: 多次进出详情页，有时推荐的是旧写死装备（trail.equipment），有时是智能推荐（getRecommendation）
- **根因待查**: 可能是异竞态——`loadChecklistProgress` 的异步结果还没回来，分享图就已经用了旧数据
- **当前状态**: 详情页 loadChecklistProgress 已改为调用 getRecommendation + 缓存到 `this._recommendEquip`

### 4. 自动搜索添加路线（需方案确认）
- **文件**: `miniprogram/pages/admin/route-edit.js` + 新云函数
- **需求**: 输入路线名 → 检查数据库是否已存在 → 自动从互联网搜索信息 → 填充表单字段 → 用户修改后确认发布
- **涉及**: 互联网搜索API（小红书等）、路线信息提取、字段映射
