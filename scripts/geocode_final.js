#!/usr/bin/env node
/**
 * 路线经纬度批量解析 - 最终版
 * 策略: Photon API + 精确查找表 + 县级坐标兜底
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ========== 精确坐标查找表 ==========
// 来源: 高德/百度地图公开数据、OSM
const COORD_TABLE = {
  // ---- 西安市 ----
  '骊山': [34.334, 109.276],
  '临潼区': [34.367, 109.214],
  '蓝田县': [34.153, 109.324],
  '蓝桥镇': [34.063, 109.412],
  '王顺山': [34.078, 109.421],
  '穆家堰': [34.120, 109.350],
  '葛牌镇': [34.038, 109.380],
  '蓝关古道': [34.100, 109.350],
  '水陆庵': [34.147, 109.320],
  '长安区': [34.168, 108.942],
  '抱龙峪': [34.055, 108.935],
  '沣峪': [34.025, 108.835],
  '子午峪': [34.010, 108.860],
  '大峪': [34.000, 109.020],
  '太乙宫': [34.020, 109.000],
  '石砭峪': [34.010, 108.920],
  '引镇': [34.050, 109.010],
  '东大街道': [34.030, 108.810],
  '鸡窝子': [33.980, 108.790],
  '神水峪': [34.040, 108.980],
  '紫阁峪': [34.035, 108.890],
  '净业寺': [34.020, 108.840],
  '天子峪': [34.005, 108.870],
  '鄠邑区': [34.109, 108.605],
  '石井镇': [34.060, 108.610],
  '高冠峪': [34.040, 108.790],
  '高冠瀑布': [34.038, 108.788],
  '太平峪': [34.020, 108.670],
  '庞光镇': [34.080, 108.640],
  '化羊村': [34.075, 108.635],
  '草堂寺': [34.095, 108.710],
  '金龙峡': [34.050, 108.590],
  '乌桑峪': [34.070, 108.600],
  '阿姑泉': [34.065, 108.615],
  '周至县': [34.162, 108.223],
  '楼观台': [34.080, 108.330],
  '楼观镇': [34.085, 108.320],
  '骆峪镇': [34.060, 108.100],
  '厚畛子镇': [33.880, 107.870],
  '马召镇': [34.120, 108.200],
  '仙游寺': [34.115, 108.195],
  '黑河水库': [34.060, 108.040],
  '就峪': [34.090, 108.290],
  '集贤镇': [34.100, 108.380],
  '沙河': [34.140, 108.230],
  '竹峪': [34.050, 108.150],
  '赤峪': [34.040, 108.080],
  '田峪': [34.095, 108.350],

  // ---- 渭南市 ----
  '合阳县': [35.237, 110.148],
  '洽川': [35.180, 110.200],
  '武帝山': [35.260, 110.170],
  '华阴市': [34.566, 110.089],
  '华阳乡': [34.530, 110.050],
  '韩城市': [35.477, 110.443],
  '司马迁祠': [35.460, 110.430],
  '华州区': [34.493, 109.764],
  '大夫峪': [34.540, 110.060],

  // ---- 咸阳市 ----
  '渭城区': [34.339, 108.738],
  '秦都区': [34.327, 108.710],
  '汉阳陵': [34.420, 108.940],
  '五陵塬': [34.370, 108.720],
  '淳化县': [34.802, 108.583],
  '仲山': [34.780, 108.550],
  '旬邑县': [35.112, 108.334],
  '赵家洞': [35.080, 108.310],
  '礼泉县': [34.482, 108.426],
  '烟霞镇': [34.510, 108.510],
  '袁家村': [34.500, 108.520],
  '泾阳县': [34.527, 108.838],
  '王桥镇': [34.540, 108.770],
  '张家山': [34.535, 108.760],
  '彬州市': [35.039, 108.081],
  '大佛寺': [35.050, 108.070],

  // ---- 铜川市 ----
  '耀州区': [34.912, 108.969],
  '照金镇': [35.050, 108.850],
  '薛家寨': [35.060, 108.840],

  // ---- 宝鸡市 ----
  '眉县': [34.275, 107.752],
  '汤峪镇': [34.150, 107.870],
  '霸王河': [34.250, 107.780],
  '扶眉战役纪念馆': [34.270, 107.750],
  '太白县': [34.060, 107.315],
  '黄柏塬': [33.870, 107.500],
  '药王谷': [34.010, 107.350],
  '陇县': [34.893, 106.865],
  '天成镇': [34.870, 106.820],
  '八渡镇': [34.830, 106.780],
  '龙门洞': [34.900, 106.800],
  '雷音山': [34.880, 106.830],
  '西武当': [34.850, 106.770],
  '关山草原': [34.880, 106.750],
  '岐山县': [34.444, 107.621],
  '周公庙': [34.460, 107.630],
  '五丈原': [34.400, 107.640],
  '陈仓区': [34.354, 107.387],
  '九龙山': [34.380, 107.420],
  '千阳县': [34.643, 107.132],
  '凤翔区': [34.522, 107.397],
  '凤翔东湖': [34.525, 107.400],
  '麟游县': [34.678, 107.794],
  '九成宫': [34.680, 107.790],
  '渭滨区': [34.372, 107.150],
  '石鼓园': [34.365, 107.155],

  // ---- 商洛市 ----
  '丹凤县': [33.695, 110.328],
  '棣花镇': [33.720, 110.280],
  '凤冠山': [33.700, 110.330],
  '商山': [33.680, 110.350],
  '桃花谷': [33.710, 110.300],

  // ---- 汉中市 ----
  '留坝县': [33.618, 106.920],
  '柴关岭': [33.580, 106.880],
  '太子岭': [33.630, 106.910],
  '闸口石': [33.650, 106.870],
  '留侯镇': [33.640, 106.880],
  '凤县': [33.914, 106.523],
  '宽滩': [33.940, 106.550],

  // ---- 安康市 ----
  '平利县': [32.387, 109.362],
  '正阳镇': [32.350, 109.400],
  '镇坪县': [31.884, 109.526],
  '曙坪镇': [31.870, 109.510],
};

// 县/区级兜底坐标
const COUNTY_FALLBACK = {
  '临潼区': [34.367, 109.214],
  '蓝田县': [34.153, 109.324],
  '合阳县': [35.237, 110.148],
  '华阴市': [34.566, 110.089],
  '韩城市': [35.477, 110.443],
  '华州区': [34.493, 109.764],
  '渭城区': [34.339, 108.738],
  '秦都区': [34.327, 108.710],
  '淳化县': [34.802, 108.583],
  '旬邑县': [35.112, 108.334],
  '礼泉县': [34.482, 108.426],
  '泾阳县': [34.527, 108.838],
  '彬州市': [35.039, 108.081],
  '耀州区': [34.912, 108.969],
  '长安区': [34.168, 108.942],
  '鄠邑区': [34.109, 108.605],
  '周至县': [34.162, 108.223],
  '眉县': [34.275, 107.752],
  '太白县': [34.060, 107.315],
  '陇县': [34.893, 106.865],
  '岐山县': [34.444, 107.621],
  '陈仓区': [34.354, 107.387],
  '千阳县': [34.643, 107.132],
  '凤翔区': [34.522, 107.397],
  '麟游县': [34.678, 107.794],
  '渭滨区': [34.372, 107.150],
  '丹凤县': [33.695, 110.328],
  '留坝县': [33.618, 106.920],
  '凤县': [33.914, 106.523],
  '平利县': [32.387, 109.362],
  '镇坪县': [31.884, 109.526],
  '咸阳市': [34.330, 108.710],
  '西安市': [34.261, 108.942],
  '宝鸡市': [34.362, 107.237],
  '渭南市': [34.499, 109.510],
  '铜川市': [34.897, 108.946],
  '汉中市': [33.068, 107.023],
  '安康市': [32.684, 109.029],
  '商洛市': [33.868, 109.940],
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/**
 * 从地址中提取所有可能匹配查找表的关键词
 */
function extractKeywords(address) {
  const keywords = [];
  // 按常见分隔符拆分
  const parts = address.split(/[省市区县镇乡村/、，,（(）)\s]+/).filter(s => s.length >= 2);
  keywords.push(...parts);

  // 提取 "XX市YY区" 格式
  const cityMatch = address.match(/(.+?市)(.+?[区县])/);
  if (cityMatch) {
    keywords.push(cityMatch[2]); // 区/县名
  }

  // 提取 "XX县YY镇" 格式
  const townMatch = address.match(/(.+?[区县])(.+?[镇乡街道])/);
  if (townMatch) {
    keywords.push(townMatch[2]); // 镇名
  }

  return [...new Set(keywords)];
}

/**
 * 在查找表中搜索坐标
 */
function lookupCoords(address) {
  const keywords = extractKeywords(address);

  // 1. 精确匹配（从最长关键词开始）
  keywords.sort((a, b) => b.length - a.length);
  for (const kw of keywords) {
    if (COORD_TABLE[kw]) {
      return { lat: COORD_TABLE[kw][0], lng: COORD_TABLE[kw][1], source: `查找表:${kw}` };
    }
  }

  // 2. 模糊匹配（子串）
  for (const kw of keywords) {
    for (const [key, coords] of Object.entries(COORD_TABLE)) {
      if (key.includes(kw) || kw.includes(key)) {
        return { lat: coords[0], lng: coords[1], source: `模糊:${key}` };
      }
    }
  }

  // 3. 县级兜底
  for (const [county, coords] of Object.entries(COUNTY_FALLBACK)) {
    if (address.includes(county)) {
      return { lat: coords[0], lng: coords[1], source: `县级:${county}` };
    }
  }

  return null;
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
  let tableCount = 0;
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

    process.stdout.write(`  [${i+1}/${needGeocode.length}] ${route.name}`);

    const result = lookupCoords(address);
    if (result) {
      console.log(` ✅ ${result.lat}, ${result.lng} (${result.source})`);
      successCount++;
      tableCount++;
      updates.push({
        _id: route._id,
        name: route.name,
        latitude: result.lat,
        longitude: result.lng,
      });
    } else {
      console.log(` ❌ 未找到`);
      failCount++;
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`📊 解析完成：成功 ${successCount} 条，失败 ${failCount} 条`);
  console.log(`═══════════════════════════════════════\n`);

  if (dryRun) {
    console.log('🔍 [Dry Run] 未写入文件');
    if (updates.length > 0) {
      console.log('\n前5条结果:');
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.name}: ${u.latitude}, ${u.longitude}`);
      });
    }
    if (failCount > 0) {
      const failed = needGeocode.filter(r => !updates.some(u => u._id === r._id));
      console.log(`\n失败列表 (${failCount}条):`);
      failed.forEach(r => console.log(`  - ${r.name}: ${extractAddress(r)}`));
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

  console.log('\n🎉 全部完成！');
}

main().catch(err => {
  console.error('❌ 脚本执行出错:', err);
  process.exit(1);
});
