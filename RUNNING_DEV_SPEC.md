# 跑步小程序开发规范（所有子代理必须遵守）

## 项目路径
~/.hermes/qinren-outdoor/miniprogram/

## 云函数路径
~/.hermes/qinren-outdoor/cloudfunctions/

## 设计规范
- UI风格：与徒步小程序保持一致（绿色系渐变、圆角卡片、固定头部、返回按钮用`<`字符）
- 跑步世界主题色：蓝色系（主色#1565c0，辅色#42a5f5，背景#e3f2fd）
- 徒步世界主题色：绿色系（主色#2e7d32，辅色#66bb6a，背景#e8f5e9）
- 自定义navigationStyle，顶部固定，左上角返回按钮

## 页面路由
- 世界选择: /pages/world-select/world-select
- 跑步首页: /pages/running-home/running-home (Tab页)
- 频道详情: /pages/channel-detail/channel-detail?channel=1
- 文章列表: /pages/running-article-list/running-article-list?subcategory=1.1
- 文章搜索: /pages/running-search/running-search
- 文章详情: /pages/running-article/running-article?id=xxx
- 跑步个人中心: /pages/running-profile/running-profile (Tab页)
- 后台管理: /pages/running-admin/running-admin
- 文章编辑: /pages/running-admin/article-edit?id=xxx

## 云函数
- running-api: 跑步业务统一入口
- running-admin: 后台管理统一入口

## 云函数调用方式
```javascript
wx.cloud.callFunction({
  name: 'running-api',
  data: { action: 'xxx', ...params }
})
```

## 全局状态
```javascript
const app = getApp()
app.globalData.world  // 'hiking' | 'running'
app.globalData.userInfo  // { userNumber, nickName, visitCount }
```

## 世界切换
- 选择存储: wx.setStorageSync('world', 'running'|'hiking')
- tabBar根据world渲染不同tab列表

## 7个频道
1. 跑步观念 (25篇)
2. 从零开始跑 (20篇)
3. 训练方法 (25篇)
4. 无伤跑步 (25篇)
5. 装备指南 (18篇)
6. 跑步文化 (17篇)
7. 专题合集 (10个专题)

## 频道二级子分类
1.1 跑步前的心理准备, 1.2 跑步认知纠偏, 1.3 正确的跑绩观, 1.4 跑步与健康, 1.5 不同人群建议
2.1 第一次出门跑, 2.2 走跑交替, 2.3 第一个月常见问题, 2.4 从能跑到跑得舒服
3.1 跑步关键指标, 3.2 训练方法详解, 3.3 训练计划设计, 3.4 跑步技术, 3.5 交叉训练与力量
4.1 听懂身体信号, 4.2 损伤预防5原则, 4.3 常见损伤详解, 4.4 受伤了怎么办, 4.5 跑姿与损伤
5.1 跑鞋, 5.2 运动服装, 5.3 运动手表与心率设备, 5.4 其他装备
6.1 跑步历史与故事, 6.2 跑步哲学与思考, 6.3 全球跑步文化, 6.4 跑者故事

## 难度标签
入门级 / 基础级 / 进阶级 / 深度级

## 数据库集合
- running_articles: 文章主表
- running_topics: 专题合集
- running_favorites: 收藏
- running_reviews: 阅读感受
- running_reading_history: 阅读历史
- running_daily_stats: 每日统计

## 返回按钮规范
- WXML中使用 {{lt}} 数据绑定（不能用&amp;lt;）
- 返回按钮无背景色
- 顶部必须position:fixed不随滚动
