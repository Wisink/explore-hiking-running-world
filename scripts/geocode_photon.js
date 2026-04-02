#!/usr/bin/env node
/**
 * 使用 Photon (Komoot/OpenStreetMap) 批量解析路线经纬度
 * 免费、不需要 API Key、国内可访问
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REQUEST_INTERVAL_MS = 1200;
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function geocode(address) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(address);
    const url = `https://photon.komoot.io/api/?q=${encoded}&limit=1`;

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.features && json.features.length > 0) {
            const coords = json.features[0].geometry.coordinates;
            resolve({ lat: coords[1], lng: coords[0] });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * 清理地址，提高匹配率
 * - 移除括号内容
 * - 移除模糊词
 * - 提取关键地名部分
 */
function cleanAddress(address) {
  let addr = address;
  // 移除括号及内容
  addr = addr.replace(/[（(][^）)]*[）)]/g, '');
  // 移除模糊词
  addr = addr.replace(/周边|内$|深处/g, '');
  // 移除 "导航搜索：" 前缀
  addr = addr.replace(/^导航搜索[：:]\s*/, '');
  return addr.trim();
}

/**
 * 尝试简化地址 - 只保留省市区+关键地名
 */
function trySimplifiedAddresses(fullAddress) {
  const results = [];

  // 1. 完整地址
  results.push(fullAddress);

  // 2. 清理后
  const cleaned = cleanAddress(fullAddress);
  if (cleaned !== fullAddress) results.push(cleaned);

  // 3. 提取市+区/县+地名（去掉"省"和更详细的后缀）
  const match = fullAddress.match(/(?:.*?省)?(.+?[市区县])(.+)/);
  if (match) {
    results.push(match[1] + match[2].replace(/周边|内|深处/g, '').trim());
  }

  // 4. 只用市+区/县+核心地名
  const match2 = fullAddress.match(/(?:.*?省)?(.+?[市区县])([^/，,（(]+)/);
  if (match2) {
    results.push(match2[1] + match2[2].trim());
  }

  // 5. 只用地名（去掉所有行政区划）
  const placeMatch = fullAddress.match(/[市区县](.+?)(?:镇|街道|乡)?(.+?)(?:$|周边|内|深处)/);
  if (placeMatch) {
    results.push(placeMatch[2].trim());
  }

  // 去重、过滤太短的
  return [...new Set(results)].filter(s => s.length >= 2);
}

function extractAddress(route) {
  if (route.location && typeof route.location === 'object' && route.location.address) {
    return route.location.address;
  }
  if (route.location && typeof route.location === 'string') {
    return route.location;
  }
  if (route.location && typeof route.location === 'object' && route.location.navAddress) {
    return route.location.navAddress.replace(/^导航搜索[：:]\s*/, '');
  }
  return route.name || '';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const jsonPath = path.join(__dirname, '..', 'data', 'routes.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ 找不到文件: ${jsonPath}`);
    process.exit(1);
  }

  const routes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📂 从本地文件读取了 ${routes.length} 条路线`);

  const needGeocode = routes.filter(r => !r.latitude || !r.longitude);
  const alreadyDone = routes.filter(r => r.latitude && r.longitude);

  console.log(`📊 统计：共 ${routes.length} 条路线，已有经纬度 ${alreadyDone.length} 条，待解析 ${needGeocode.length} 条\n`);

  if (needGeocode.length === 0) {
    console.log('✅ 所有路线都已有经纬度！');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;
  const updates = [];

  for (let i = 0; i < needGeocode.length; i++) {
    const route = needGeocode[i];
    const address = extractAddress(route);

    if (!address) {
      console.error(`  ⚠️  [${i+1}/${needGeocode.length}] 跳过: ${route.name} — 无地址`);
      failCount++;
      continue;
    }

    process.stdout.write(`  🔄 [${i+1}/${needGeocode.length}] ${route.name}`);

    // 尝试多个地址变体
    const candidates = trySimplifiedAddresses(address);
    let location = null;

    for (const candidate of candidates) {
      location = await geocode(candidate);
      if (location) {
        console.log(` ✅ lat=${location.lat}, lng=${location.lng} ← "${candidate}"`);
        break;
      }
      await sleep(500);
    }

    if (location) {
      successCount++;
      updates.push({
        _id: route._id,
        name: route.name,
        latitude: location.lat,
        longitude: location.lng,
      });
    } else {
      console.log(` ❌ 失败`);
      failCount++;
    }

    if (i < needGeocode.length - 1) {
      await sleep(REQUEST_INTERVAL_MS);
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`📊 解析完成：成功 ${successCount} 条，失败 ${failCount} 条`);
  console.log(`═══════════════════════════════════════\n`);

  if (dryRun) {
    console.log('🔍 [Dry Run] 未写入文件');
    if (updates.length > 0) {
      console.log(JSON.stringify(updates.slice(0, 3), null, 2));
    }
    process.exit(0);
  }

  // 写入文件
  const allRoutes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  for (const update of updates) {
    const idx = allRoutes.findIndex(r => r._id === update._id);
    if (idx !== -1) {
      allRoutes[idx].latitude = update.latitude;
      allRoutes[idx].longitude = update.longitude;
    }
  }

  const backupPath = jsonPath + '.bak.' + Date.now();
  fs.copyFileSync(jsonPath, backupPath);
  console.log(`💾 已备份原文件: ${path.basename(backupPath)}`);

  fs.writeFileSync(jsonPath, JSON.stringify(allRoutes, null, 2), 'utf-8');
  console.log(`✅ 已更新本地文件: data/routes.json`);

  if (failCount > 0) {
    const failed = needGeocode.filter(r => !updates.some(u => u._id === r._id));
    console.log(`\n⚠️  以下 ${failCount} 条解析失败：`);
    failed.forEach(r => {
      console.log(`  - ${r.name}: "${extractAddress(r)}"`);
    });
  }

  console.log('\n🎉 全部完成！');
}

main().catch(err => {
  console.error('❌ 脚本执行出错:', err);
  process.exit(1);
});
