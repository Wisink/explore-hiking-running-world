# 云函数接口文档

「秦人徒步路线分享」小程序云函数，基于微信云开发 Node.js 环境。

## 统一返回格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- `code: 0` 表示成功，`-1` 表示失败

---

## 1. routes — 路线查询

数据库集合：`routes`

### 1.1 获取路线列表

```json
{
  "action": "list",
  "page": 1,
  "pageSize": 20,
  "filter": {
    "difficulty": [1, 2, 3],
    "cost": "免费",
    "direction": "秦岭东线",
    "suitableFor": "新手"
  }
}
```

**filter 字段均为可选**，不传则返回全部路线。按 `order` 升序排列。

返回：`{ list, total, page, pageSize, totalPages }`

### 1.2 获取路线详情

```json
{
  "action": "detail",
  "routeId": "route_001"
}
```

返回：完整的路线对象（含 sections、equipment、safety 等字段）

### 1.3 搜索路线

```json
{
  "action": "search",
  "keyword": "蓝关",
  "page": 1,
  "pageSize": 20
}
```

模糊搜索路线名称、描述、地址、风景关键词。

---

## 2. articles — 文章查询

数据库集合：`articles`

### 2.1 获取文章列表

```json
{
  "action": "list",
  "category": "装备选购",
  "page": 1,
  "pageSize": 20
}
```

`category` 可选，不传返回全部。分类值：`装备选购`、`安全自救`、`户外礼仪` 等。

返回：`{ list, total, page, pageSize }`

### 2.2 获取文章详情

```json
{
  "action": "detail",
  "articleId": "article_001"
}
```

### 2.3 获取推荐文章

```json
{
  "action": "recommend",
  "limit": 3
}
```

按 `order` 升序取前 N 篇，默认 3 篇。

---

## 3. weather — 天气查询

数据库集合：`weather`（可选，用于缓存）

### 3.1 获取天气

```json
{
  "action": "get",
  "city": "西安"
}
```

`city` 可选，默认西安。优先返回数据库缓存，无缓存实时获取。

返回：
```json
{
  "temp": "22",
  "desc": "多云",
  "icon": "⛅",
  "humidity": "65%",
  "wind": "3级",
  "safeTip": "天气适宜，适合户外活动",
  "suitable": true
}
```

### 3.2 定时触发器

配置 `config.json` 中的定时触发器，每天自动更新天气缓存：

```json
{
  "triggers": [{
    "name": "daily-weather",
    "type": "timer",
    "config": "0 0 7 * * * *"
  }]
}
```

定时触发时 event.type 为 `timer`，自动刷新 weather 集合中的数据。

---

## 4. import-data — 数据导入

**仅管理员可调用**

### 4.1 导入路线数据

```json
{
  "action": "import-routes",
  "data": [
    {
      "_id": "route_001",
      "name": "蓝关古道",
      "description": "千年古道，山脊漫步",
      ...
    }
  ]
}
```

返回：`{ imported, failed, errors? }`

### 4.2 导入文章数据

```json
{
  "action": "import-articles",
  "data": [
    {
      "_id": "article_001",
      "category": "装备选购",
      "title": "徒步鞋怎么选",
      ...
    }
  ]
}
```

### 4.3 清空集合

```json
{
  "action": "clear",
  "collection": "routes"
}
```

仅支持 `routes` 和 `articles`。

### 4.4 查询数据量

```json
{
  "action": "count",
  "collection": "routes"
}
```

支持 `routes`、`articles`、`weather`。

---

## 数据库集合

| 集合名 | 说明 | 权限 |
|--------|------|------|
| `routes` | 路线数据 | 所有人可读，仅管理员可写 |
| `articles` | 文章数据 | 所有人可读，仅管理员可写 |
| `weather` | 天气缓存 | 所有人可读，仅云函数可写 |

## 部署说明

每个云函数目录包含 `index.js` + `package.json`，在微信开发者工具中右键目录 → 「上传并部署：云端安装依赖」即可。
