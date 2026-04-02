#!/usr/bin/env node
/**
 * 批量解析路线经纬度脚本
 * 
 * 功能：
 *   1. 从云数据库读取所有路线（或本地 JSON 文件作为备选）
 *   2. 对每条路线的地址调用腾讯地图 Geocoding API 获取经纬度
 *   3. 将经纬度写回云数据库 routes 集合（新增 latitude、longitude 字段）
 * 
 * 使用方式：
 *   node scripts/geocode_routes.js [--local] [--dry-run] [--key YOUR_KEY]
 * 
 * 参数：
 *   --local     从本地 data/routes.json 读取（不连云数据库）
 *   --dry-run   只输出解析结果，不写回数据库
 *   --key KEY   腾讯地图 API Key（优先级高于环境变量）
 * 
 * 前置条件：
 *   - 需要腾讯地图 WebService API Key（申请地址：https://lbs.qq.com/）
 *   - 云数据库使用需要安装 wx-server-sdk（npm install wx-server-sdk）
 *   - 或者使用 --local 模式配合本地 JSON 文件
 * 
 * 注意：
 *   - 腾讯地图 Geocoding API 有调用频率限制，脚本自动控制请求间隔
 *   - 每次请求间隔 200ms，避免触发限流
 *   - 失败的地址会记录到 stderr，方便排查
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ========== 配置区 ==========

// 腾讯地图 API Key —— 请替换为你的实际 Key
// 可通过 --key 参数或环境变量 TENCENT_MAP_KEY 传入
const TENCENT_MAP_KEY = process.env.TENCENT_MAP_KEY || 'YOUR_TENCENT_MAP_KEY_HERE';

// 请求间隔（毫秒），避免触发 API 限流
const REQUEST_INTERVAL_MS = 200;

// 单次请求超时（毫秒）
const REQUEST_TIMEOUT_MS = 5000;

// ========== 工具函数 ==========

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    local: args.includes('--local'),
    dryRun: args.includes('--dry-run'),
    key: TENCENT_MAP_KEY,
    jsonOutput: false,
  };

  // 解析 --key
  const keyIdx = args.indexOf('--key');
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    options.key = args[keyIdx + 1];
  }

  // 解析 --json-output（内部用，输出 JSON 格式）
  if (args.includes('--json-output')) {
    options.jsonOutput = true;
  }

  return options;
}

/**
 * 调用腾讯地图 Geocoding API
 * @param {string} address 地址字符串
 * @param {string} key 腾讯地图 API Key
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
function geocode(address, key) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(address);
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encoded}&key=${key}`;

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 0 && json.result && json.result.location) {
            resolve({
              lat: json.result.location.lat,
              lng: json.result.location.lng,
            });
          } else {
            const msg = json.message || `status=${json.status}`;
            console.error(`  ⚠️  解析失败: ${address} → ${msg}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`  ⚠️  JSON 解析失败: ${address} → ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`  ⚠️  请求失败: ${address} → ${e.message}`);
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`  ⚠️  请求超时: ${address}`);
      resolve(null);
    });
  });
}

/**
 * 从路线数据中提取待解析的地址
 * @param {object} route 路线数据对象
 * @returns {string} 地址字符串
 */
function extractAddress(route) {
  // 优先使用 location.address（结构化格式）
  if (route.location && typeof route.location === 'object' && route.location.address) {
    return route.location.address;
  }
  // 兼容 location 为字符串的情况
  if (route.location && typeof route.location === 'string') {
    return route.location;
  }
  // 兼容 navAddress
  if (route.location && typeof route.location === 'object' && route.location.navAddress) {
    // navAddress 通常格式为 "导航搜索：XXX"，提取实际地址
    return route.location.navAddress.replace(/^导航搜索[：:]\s*/, '');
  }
  // 回退到路线名称
  return route.name || '';
}

// ========== 主流程 ==========

async function main() {
  const options = parseArgs();

  // 检查 API Key
  if (options.key === 'YOUR_TENCENT_MAP_KEY_HERE') {
    console.error('❌ 错误：未设置腾讯地图 API Key！');
    console.error('');
    console.error('请通过以下方式之一设置：');
    console.error('  1. 设置环境变量: export TENCENT_MAP_KEY=your_key_here');
    console.error('  2. 命令行参数: node scripts/geocode_routes.js --key your_key_here');
    console.error('  3. 直接修改脚本中的 TENCENT_MAP_KEY 常量');
    console.error('');
    console.error('申请地址：https://lbs.qq.com/');
    process.exit(1);
  }

  // ========== 读取路线数据 ==========
  let routes = [];

  if (options.local) {
    // 本地 JSON 模式
    const jsonPath = path.join(__dirname, '..', 'data', 'routes.json');
    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ 找不到文件: ${jsonPath}`);
      process.exit(1);
    }
    routes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`📂 从本地文件读取了 ${routes.length} 条路线`);
  } else {
    // 云数据库模式（需要 wx-server-sdk）
    try {
      const cloud = require('wx-server-sdk');
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
      const db = cloud.database();
      
      // 分批读取（云数据库单次限制 100 条）
      let allRoutes = [];
      let offset = 0;
      const BATCH_SIZE = 100;
      
      while (true) {
        const res = await db.collection('routes')
          .skip(offset)
          .limit(BATCH_SIZE)
          .get();
        
        if (!res.data || res.data.length === 0) break;
        allRoutes = allRoutes.concat(res.data);
        offset += res.data.length;
        
        if (res.data.length < BATCH_SIZE) break;
      }
      
      routes = allRoutes;
      console.log(`☁️  从云数据库读取了 ${routes.length} 条路线`);
    } catch (err) {
      console.error('❌ 连接云数据库失败:', err.message);
      console.error('   提示：使用 --local 参数从本地 JSON 文件读取');
      process.exit(1);
    }
  }

  if (routes.length === 0) {
    console.error('❌ 没有找到任何路线数据');
    process.exit(1);
  }

  // ========== 过滤已有经纬度的路线 ==========
  const needGeocode = routes.filter(r => !r.latitude || !r.longitude);
  const alreadyDone = routes.filter(r => r.latitude && r.longitude);

  console.log(`📊 统计：共 ${routes.length} 条路线，已有经纬度 ${alreadyDone.length} 条，待解析 ${needGeocode.length} 条`);
  console.log('');

  if (needGeocode.length === 0) {
    console.log('✅ 所有路线都已有经纬度，无需解析！');
    process.exit(0);
  }

  // ========== 开始 Geocoding ==========
  let successCount = 0;
  let failCount = 0;
  const results = [];
  const updates = [];

  for (let i = 0; i < needGeocode.length; i++) {
    const route = needGeocode[i];
    const address = extractAddress(route);
    
    if (!address) {
      console.error(`  ⚠️  [${i + 1}/${needGeocode.length}] 跳过: ${route.name || route._id} — 无地址`);
      failCount++;
      continue;
    }

    console.log(`  🔄 [${i + 1}/${needGeocode.length}] 解析: ${route.name || route._id} → ${address}`);

    const location = await geocode(address, options.key);

    if (location) {
      console.log(`  ✅ [${i + 1}/${needGeocode.length}] 成功: ${route.name} → lat=${location.lat}, lng=${location.lng}`);
      successCount++;
      
      results.push({
        _id: route._id,
        name: route.name,
        address,
        latitude: location.lat,
        longitude: location.lng,
      });

      updates.push({
        _id: route._id,
        latitude: location.lat,
        longitude: location.lng,
      });
    } else {
      failCount++;
    }

    // 控制请求频率
    if (i < needGeocode.length - 1) {
      await sleep(REQUEST_INTERVAL_MS);
    }
  }

  // ========== 输出结果 ==========
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`📊 解析完成：成功 ${successCount} 条，失败 ${failCount} 条`);
  console.log('═══════════════════════════════════════');

  if (options.dryRun) {
    console.log('');
    console.log('🔍 [Dry Run] 以下为解析结果（未写入数据库）：');
    console.log(JSON.stringify(results, null, 2));
    console.log('');
    console.log('💡 去掉 --dry-run 参数即可实际写入数据库');
    process.exit(0);
  }

  // ========== 写回数据 ==========
  if (options.local) {
    // 本地模式：直接修改 JSON 文件
    const jsonPath = path.join(__dirname, '..', 'data', 'routes.json');
    const allRoutes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    for (const update of updates) {
      const idx = allRoutes.findIndex(r => r._id === update._id);
      if (idx !== -1) {
        allRoutes[idx].latitude = update.latitude;
        allRoutes[idx].longitude = update.longitude;
      }
    }
    
    // 备份原文件
    const backupPath = jsonPath + '.bak.' + Date.now();
    fs.copyFileSync(jsonPath, backupPath);
    console.log(`💾 已备份原文件: ${path.basename(backupPath)}`);
    
    // 写入更新后的数据
    fs.writeFileSync(jsonPath, JSON.stringify(allRoutes, null, 2), 'utf-8');
    console.log(`✅ 已更新本地文件: data/routes.json`);
  } else {
    // 云数据库模式
    try {
      const cloud = require('wx-server-sdk');
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
      const db = cloud.database();
      const _ = db.command;

      console.log('☁️  正在写入云数据库...');
      
      // 批量更新（每批最多 20 条，避免超时）
      const BATCH_SIZE = 20;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const promises = batch.map(update => {
          return db.collection('routes').doc(update._id).update({
            data: {
              latitude: update.latitude,
              longitude: update.longitude,
            }
          });
        });
        await Promise.all(promises);
        console.log(`  📝 已写入 ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length} 条`);
      }
      
      console.log('✅ 云数据库更新完成！');
    } catch (err) {
      console.error('❌ 写入云数据库失败:', err.message);
      console.error('');
      console.error('💡 可以将以下 JSON 保存后手动导入：');
      console.error(JSON.stringify(updates, null, 2));
      process.exit(1);
    }
  }

  // ========== 输出失败列表 ==========
  if (failCount > 0) {
    const failed = needGeocode.filter(r => {
      return !updates.some(u => u._id === r._id);
    });
    console.log('');
    console.log('⚠️  以下地址解析失败，请手动检查：');
    failed.forEach(r => {
      const addr = extractAddress(r);
      console.log(`  - ${r.name || r._id}: "${addr}"`);
    });
  }

  console.log('');
  console.log('🎉 全部完成！');
}

main().catch(err => {
  console.error('❌ 脚本执行出错:', err);
  process.exit(1);
});
