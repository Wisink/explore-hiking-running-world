#!/usr/bin/env node
/**
 * 使用 Nominatim (OpenStreetMap) 批量解析路线经纬度
 * 不需要 API Key，免费使用
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REQUEST_INTERVAL_MS = 1100; // Nominatim 要求每秒不超过1次
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'QinRenOutdoor/1.0';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

/**
 * Nominatim Geocoding
 */
function geocode(address) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=cn`;

    const options = {
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.length > 0) {
            resolve({
              lat: parseFloat(json[0].lat),
              lng: parseFloat(json[0].lon),
            });
          } else {
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
 * 简化地址，移除括号内容和特殊字符，提高匹配率
 */
function simplifyAddress(address) {
  let addr = address;
  // 移除括号及内容（中文括号和英文括号）
  addr = addr.replace(/[（(][^）)]*[）)]/g, '');
  // 移除 "周边"、"内" 等模糊词
  addr = addr.replace(/周边|内$/g, '');
  // 移除 "深处"
  addr = addr.replace(/深处/g, '');
  return addr.trim();
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
  const options = parseArgs();
  const jsonPath = path.join(__dirname, '..', 'data', 'routes.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ 找不到文件: ${jsonPath}`);
    process.exit(1);
  }

  const routes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📂 从本地文件读取了 ${routes.length} 条路线`);

  const needGeocode = routes.filter(r => !r.latitude || !r.longitude);
  const alreadyDone = routes.filter(r => r.latitude && r.longitude);

  console.log(`📊 统计：共 ${routes.length} 条路线，已有经纬度 ${alreadyDone.length} 条，待解析 ${needGeocode.length} 条`);
  console.log('');

  if (needGeocode.length === 0) {
    console.log('✅ 所有路线都已有经纬度，无需解析！');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;
  const updates = [];

  for (let i = 0; i < needGeocode.length; i++) {
    const route = needGeocode[i];
    const address = extractAddress(route);

    if (!address) {
      console.error(`  ⚠️  [${i + 1}/${needGeocode.length}] 跳过: ${route.name} — 无地址`);
      failCount++;
      continue;
    }

    // 先尝试完整地址
    console.log(`  🔄 [${i + 1}/${needGeocode.length}] 解析: ${route.name} → ${address}`);
    let location = await geocode(address);

    // 如果失败，尝试简化地址
    if (!location) {
      const simplified = simplifyAddress(address);
      if (simplified !== address && simplified.length > 2) {
        await sleep(500);
        location = await geocode(simplified);
        if (location) {
          console.log(`    ✨ 简化地址成功: ${simplified}`);
        }
      }
    }

    // 如果还是失败，尝试只用市/县名
    if (!location) {
      const parts = address.split(/省|市|区|县/);
      if (parts.length >= 3) {
        const simpleAddr = address.match(/(.+?[市区县])/)?.[1];
        if (simpleAddr && simpleAddr.length > 2) {
          await sleep(500);
          location = await geocode(simpleAddr);
          if (location) {
            console.log(`    ✨ 区域地址成功: ${simpleAddr}`);
          }
        }
      }
    }

    if (location) {
      console.log(`  ✅ [${i + 1}/${needGeocode.length}] 成功: lat=${location.lat}, lng=${location.lng}`);
      successCount++;
      updates.push({
        _id: route._id,
        name: route.name,
        latitude: location.lat,
        longitude: location.lng,
      });
    } else {
      console.error(`  ❌ [${i + 1}/${needGeocode.length}] 失败: ${address}`);
      failCount++;
    }

    if (i < needGeocode.length - 1) {
      await sleep(REQUEST_INTERVAL_MS);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`📊 解析完成：成功 ${successCount} 条，失败 ${failCount} 条`);
  console.log('═══════════════════════════════════════');

  if (options.dryRun) {
    console.log('\n🔍 [Dry Run] 未写入文件');
    console.log(JSON.stringify(updates.slice(0, 5), null, 2));
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
    console.log('\n⚠️  以下地址解析失败：');
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
