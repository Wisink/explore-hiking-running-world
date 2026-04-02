/**
 * 云端路线亮点文案更新脚本（轻量版）
 * 
 * 使用方法：
 * 1. 先部署 import-data 云函数
 * 2. 在微信开发者工具调试器 Console 中粘贴执行
 * 
 * 原理：从云端获取路线名称 → 按名称从本地数据匹配亮点 → 批量更新
 * 无需手动准备数据，自动匹配
 */

async function updateHighlights() {
  console.log('=== 开始更新路线亮点文案 ===');

  const db = wx.cloud.database();
  const _ = db.command;
  const MAX = 100;

  // 第1步：获取云端所有路线
  const countRes = await db.collection('routes').count();
  const total = countRes.total;
  console.log(`云端路线总数: ${total}`);

  const routes = [];
  for (let i = 0; i < total; i += MAX) {
    const res = await db.collection('routes').skip(i).limit(MAX).get();
    routes.push(...res.data);
  }
  console.log(`获取到 ${routes.length} 条路线`);

  // 第2步：根据路线名称和特征生成亮点文案
  function genHighlights(r) {
    var name = r.name || '';
    var desc = r.description || '';
    var features = r.features || [];
    var season = r.best_season || [];
    var difficulty = r.difficulty || '';
    var cost = r.cost || '';
    var traffic = r.traffic || '';
    var parts = [];

    if (desc) parts.push(desc);

    if (features.length > 0) {
      var fText = features.slice(0, 5).join('、');
      parts.push('沿途可以欣赏到' + fText + '等美景。');
    }

    if (season.length > 0) {
      parts.push(season.join('和') + '是最佳出行时间。');
    }

    if (difficulty === '初级' || difficulty === '轻松') {
      parts.push('路线轻松平缓，非常适合新手和亲子出行。');
    } else if (difficulty === '中级' || difficulty === '适中') {
      parts.push('路线有一定挑战性，适合有一定徒步经验的朋友。');
    } else if (difficulty === '高级' || difficulty === '困难') {
      parts.push('路线难度较大，适合经验丰富的户外爱好者挑战。');
    }

    if (traffic && traffic.length > 10) {
      parts.push('交通便利，方便到达。');
    }

    if (cost && cost.indexOf('免费') >= 0) {
      parts.push('全程免费，无需门票。');
    } else if (cost) {
      parts.push('费用参考：' + cost + '。');
    }

    parts.push('来' + name + '，感受自然的魅力吧！');
    return parts.join('');
  }

  // 第3步：批量更新
  let updated = 0, failed = 0;
  const BATCH = 20;

  for (let i = 0; i < routes.length; i += BATCH) {
    var batch = routes.slice(i, i + BATCH);
    var tasks = batch.map(function(route) {
      var h = route.highlights || genHighlights(route);
      return db.collection('routes').doc(route._id).update({
        data: { highlights: h }
      }).then(function() {
        updated++;
        console.log('✅ ' + route.name);
      }).catch(function(err) {
        failed++;
        console.error('❌ ' + route.name + ': ' + err.message);
      });
    });
    await Promise.all(tasks);
    console.log('进度: ' + Math.min(i + BATCH, routes.length) + '/' + routes.length);
  }

  console.log('=== 完成！更新 ' + updated + ' 条，失败 ' + failed + ' 条 ===');
}

updateHighlights();
