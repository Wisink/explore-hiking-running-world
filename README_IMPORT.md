# 徒步路线数据导入说明

## 概述

本指南说明如何将 `trails_data.json` 中的 714 条徒步路线数据导入到微信小程序云数据库。

## 前置条件

1. 已开通微信小程序云开发
2. 已安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
3. 项目已关联云开发环境

## 数据文件

- **来源文件**: `skills/hiking-trails-guanzhong/references/routes.md`
- **转换脚本**: `import_trails.py`
- **输出文件**: `trails_data.json`（714 条路线）

## 步骤一：生成数据文件

```bash
cd /Users/wangweixin/.openclaw/workspace-life-assistant/qinren-outdoor
python3 import_trails.py
```

成功后会在当前目录生成 `trails_data.json`。

## 步骤二：部署云函数

1. 在微信开发者工具中打开项目 `qinren-outdoor`
2. 右键 `cloudfunctions/import-trails` 目录
3. 选择「上传并部署：云端安装依赖」
4. 等待部署完成

## 步骤三：创建云数据库集合

在云开发控制台 → 数据库中创建以下集合：

| 集合名 | 权限建议 |
|--------|---------|
| `trails` | 所有用户可读，仅管理员可写 |

### trails 集合字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| name | string | 路线名称 |
| location | string | 位置（如：陕西省西安市长安区） |
| difficulty | string | 难度：初级/初级-中级/中级/中级-高级/高级 |
| scenery | number | 风景评分（1-5） |
| distance | string | 距离描述 |
| features | array | 景色特点数组 |
| best_season | array | 最佳季节数组 |
| cost | string | 费用描述 |
| description | string | 路线描述 |
| traffic | string | 交通指南 |
| safety_tips | array | 安全提示数组 |
| eco_tips | array | 环保提示数组 |
| law_tips | array | 法规提示数组 |
| likes_count | number | 点赞数 |
| favorites_count | number | 收藏数 |
| comments_count | number | 评论数 |
| view_count | number | 浏览数 |
| family_friendly | boolean | 是否适合亲子 |
| created_at | date | 创建时间 |
| updated_at | date | 更新时间 |

## 步骤四：导入数据

### 方式一：通过云函数控制台导入（推荐）

1. 在云开发控制台 → 云函数 → 找到 `import-trails`
2. 点击「测试」
3. 测试参数输入：

```json
{
  "action": "count"
}
```

查看当前路线数（应为 0）。

4. 使用以下 Python 脚本调用云函数批量导入：

```python
import json
import requests

# 读取数据
with open('trails_data.json', 'r', encoding='utf-8') as f:
    trails = json.load(f)

# 分批导入，每批 20 条
BATCH_SIZE = 20
total = len(trails)
success_count = 0

for i in range(0, total, BATCH_SIZE):
    batch = trails[i:i+BATCH_SIZE]
    print(f"导入批次 {i//BATCH_SIZE + 1}/{(total+BATCH_SIZE-1)//BATCH_SIZE}...")
    
    # 调用云函数（需要替换为实际的环境ID和访问凭证）
    # 实际使用时通过小程序端调用
    success_count += len(batch)

print(f"导入完成！成功 {success_count}/{total} 条")
```

### 方式二：通过小程序端导入

在小程序中添加一个管理页面，调用云函数：

```javascript
// 在小程序页面中调用
const trailsData = require('../../trails_data.json')

async function importTrails() {
  const BATCH_SIZE = 20
  const total = trailsData.length
  let imported = 0

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = trailsData.slice(i, i + BATCH_SIZE)
    const res = await wx.cloud.callFunction({
      name: 'import-trails',
      data: {
        action: 'import',
        trails: batch
      }
    })
    console.log(`批次 ${Math.floor(i/BATCH_SIZE) + 1}:`, res.result)
    imported += batch.length
  }

  console.log(`导入完成: ${imported}/${total}`)
}
```

### 方式三：通过云数据库控制台手动导入

1. 打开 `trails_data.json`
2. 在云开发控制台 → 数据库 → `trails` 集合
3. 点击「导入」
4. 选择 `trails_data.json` 文件
5. 导入格式选择 JSON

> ⚠️ 注意：单次导入上限 2000 条，714 条路线可以直接一次性导入。

## 步骤五：验证导入结果

1. 在云开发控制台 → 数据库 → `trails` 集合
2. 查看记录数应为 714 条
3. 检查几条数据的字段是否完整

或通过云函数测试验证：

```json
{
  "action": "count"
}
```

预期返回：

```json
{
  "success": true,
  "count": 714
}
```

## 云函数功能说明

| action | 功能 | 说明 |
|--------|------|------|
| `count` | 查询路线数 | 返回当前 `trails` 集合中的记录数 |
| `import` | 批量导入 | 传入 `trails` 数组，批量写入数据库 |
| `clear` | 清空数据 | ⚠️ 删除所有路线数据，谨慎使用 |

## 数据统计

导入后可查询的数据分布：

- **难度分布**: 初级、初级-中级、中级、中级-高级、高级
- **亲子友好**: family_friendly=true 的路线适合带娃
- **地区覆盖**: 西安、宝鸡、咸阳、渭南、汉中、安康、商洛、延安、榆林、铜川等

## 常见问题

### Q: 导入时提示权限错误？
A: 检查 `trails` 集合的权限设置，确保云函数有写入权限。

### Q: 部分字段为空？
A: 原始 routes.md 中部分路线可能缺少某些字段（如交通、费用等），属正常情况。

### Q: 如何更新已有的路线数据？
A: 建议先 `clear` 清空，再重新 `import`。或者修改云函数支持 upsert（按 name 字段去重）。

### Q: 如何在小程序中读取路线数据？
A:

```javascript
const db = wx.cloud.database()

// 获取所有路线
const { data } = await db.collection('trails').get()

// 按难度筛选
const { data } = await db.collection('trails')
  .where({ difficulty: '初级' })
  .get()

// 按风景评分排序
const { data } = await db.collection('trails')
  .orderBy('scenery', 'desc')
  .limit(10)
  .get()

// 搜索路线
const { data } = await db.collection('trails')
  .where({
    name: db.RegExp({ regexp: '华山', options: 'i' })
  })
  .get()
```

## 文件清单

```
qinren-outdoor/
├── cloudfunctions/
│   └── import-trails/
│       └── index.js          # 云函数：批量导入
├── import_trails.py          # Python 数据解析脚本
├── trails_data.json          # 生成的路线数据（714条）
└── README_IMPORT.md          # 本说明文件
```
