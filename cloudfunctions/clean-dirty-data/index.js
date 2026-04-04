/**
 * 脏数据清理云函数 — 临时部署专用
 * 
 * 调用方式：
 * { action: 'dry-run' }  — 预览脏数据，不做修改
 * { action: 'execute' }  — 执行清理
 * 
 * ⚠️ 执行完毕后请立即删除此云函数，不要保留在线上！
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BATCH_SIZE = 20

exports.main = async (event, context) => {
  const action = event.action || 'dry-run'
  const isDryRun = action !== 'execute'

  if (isDryRun) {
    console.log('===== 脏数据清理 — 预览模式 =====')
  } else {
    console.log('===== 脏数据清理 — 执行模式 =====')
  }

  const stats = {
    testDirtyDataFound: 0,
    testDirtyDataDeleted: 0,
    emptyBestSeasonFound: [],
    emptyBestSeasonFixed: 0,
    emptyDirectionFound: [],
    emptyDirectionFixed: 0,
    commaBestSeasonFound: [],
    commaBestSeasonFixed: 0,
    emptyBestSeasonArrayFixed: 0,
    totalRoutesScanned: 0,
    totalErrors: 0,
    errors: []
  }

  try {
    // ========== 任务2：删除测试脏数据 ==========
    console.log('\n--- 任务2：删除测试脏数据 ---')
    try {
      const target = await db.collection('routes').doc('93abbbd769cf328302b874b9283d22a8').get()
      if (target.data && target.data.name === '测试') {
        stats.testDirtyDataFound = 1
        if (!isDryRun) {
          await db.collection('routes').doc('93abbbd769cf328302b874b9283d22a8').remove()
          stats.testDirtyDataDeleted = 1
          console.log('  [已删除] 测试脏数据 93abbbd769cf328302b874b9283d22a8')
        } else {
          console.log('  [预览] 发现测试脏数据:', { _id: target.data._id, name: target.data.name })
        }
      } else {
        console.log('  测试脏数据不存在或已清理')
      }
    } catch (e) {
      console.log('  测试脏数据查询失败（可能已不存在）:', e.message)
    }

    // ========== 扫描 routes 集合 ==========
    console.log('\n--- 扫描 routes 集合 ---')
    let allRoutes = []
    let skip = 0
    while (true) {
      const batch = await db.collection('routes').skip(skip).limit(BATCH_SIZE).get()
      if (!batch.data || batch.data.length === 0) break
      allRoutes = allRoutes.concat(batch.data)
      skip += batch.data.length
      if (batch.data.length < BATCH_SIZE) break
    }
    stats.totalRoutesScanned = allRoutes.length
    console.log(`  共扫描 ${allRoutes.length} 条记录`)

    for (const route of allRoutes) {
      const id = route._id
      const name = route.name || '未命名'

      // 任务6：逗号格式 best_seaon / best_season（字符串含逗号 → 数组）
      const commaFields = []
      if (typeof route.best_season === 'string' && route.best_season.includes(',')) {
        commaFields.push('best_season')
      }
      if (typeof route.best_seaon === 'string' && route.best_seaon.includes(',')) {
        commaFields.push('best_seaon')
      }
      if (Array.isArray(route.best_season) && route.best_season.some(s => typeof s === 'string' && s.includes(','))) {
        commaFields.push('best_season[]')
      }
      if (commaFields.length > 0) {
        stats.commaBestSeasonFound.push({ _id: id, name, fields: commaFields })
      }

      // 任务3 & 7：best_season 空字符串
      if (route.best_season === '') {
        stats.emptyBestSeasonFound.push({ _id: id, name })
      }
      if (route.best_seaon === '') {
        stats.emptyBestSeasonFound.push({ _id: id, name, field: 'best_seaon' })
      }

      // 任务3 & 4：direction 空字符串
      if (route.direction === '') {
        stats.emptyDirectionFound.push({ _id: id, name })
      }
    }

    console.log(`  best_season 空字符串: ${stats.emptyBestSeasonFound.length} 条`)
    console.log(`  direction 空字符串: ${stats.emptyDirectionFound.length} 条`)
    console.log(`  best_season 逗号格式: ${stats.commaBestSeasonFound.length} 条`)

    // ========== 执行修复 ==========
    if (!isDryRun) {
      // 任务6：逗号格式 → 数组
      console.log('\n--- 任务6：修复逗号格式 → 数组 ---')
      for (const item of stats.commaBestSeasonFound) {
        try {
          const doc = await db.collection('routes').doc(item._id).get()
          for (const field of item.fields) {
            if (field === 'best_season[]' || field === 'best_seaon[]') {
              const realField = field.replace('[]', '')
              const arrVal = doc.data[realField]
              const newArr = []
              for (const s of arrVal) {
                if (typeof s === 'string' && s.includes(',')) {
                  newArr.push(...s.split(',').map(x => x.trim()))
                } else {
                  newArr.push(s)
                }
              }
              await db.collection('routes').doc(item._id).update({ data: { [realField]: newArr } })
              console.log(`  [已修复] ${item._id} ${realField}: ${JSON.stringify(arrVal)} → ${JSON.stringify(newArr)}`)
            } else {
              const strVal = doc.data[field]
              const arrVal = strVal.split(',').map(s => s.trim())
              await db.collection('routes').doc(item._id).update({ data: { [field]: arrVal } })
              console.log(`  [已修复] ${item._id} ${field}: "${strVal}" → ${JSON.stringify(arrVal)}`)
            }
          }
          stats.commaBestSeasonFixed++
        } catch (e) {
          stats.totalErrors++
          stats.errors.push(`修复 ${item._id}: ${e.message}`)
          console.error(`  [失败] ${item._id}: ${e.message}`)
        }
      }

      // 任务3 & 7：best_season 空字符串 → []
      console.log('\n--- 任务3 & 7：修复 best_season 空字符串 → [] ---')
      for (const item of stats.emptyBestSeasonFound) {
        try {
          const field = item.field || 'best_season'
          const doc = await db.collection('routes').doc(item._id).get()
          if (doc.data[field] === '') {
            await db.collection('routes').doc(item._id).update({ data: { [field]: [] } })
            console.log(`  [已修复] ${item._id} ${field}: "" → []`)
            stats.emptyBestSeasonFixed++
          }
        } catch (e) {
          stats.totalErrors++
          stats.errors.push(`修复 ${item._id}: ${e.message}`)
          console.error(`  [失败] ${item._id}: ${e.message}`)
        }
      }

      // 任务3 & 4：direction 空字符串 → '未知'
      console.log('\n--- 任务3 & 4：修复 direction 空字符串 → 未知 ---')
      for (const item of stats.emptyDirectionFound) {
        try {
          const doc = await db.collection('routes').doc(item._id).get()
          if (doc.data.direction === '') {
            await db.collection('routes').doc(item._id).update({ data: { direction: '未知' } })
            console.log(`  [已修复] ${item._id} direction: "" → "未知"`)
            stats.emptyDirectionFixed++
          }
        } catch (e) {
          stats.totalErrors++
          stats.errors.push(`修复 ${item._id}: ${e.message}`)
          console.error(`  [失败] ${item._id}: ${e.message}`)
        }
      }
    }

    // ========== 输出统计 ==========
    console.log('\n===== 清理统计 =====')
    console.log(`总扫描: ${stats.totalRoutesScanned}`)
    console.log(`\n任务2: 测试脏数据 - 发现 ${stats.testDirtyDataFound} / 已删除 ${stats.testDirtyDataDeleted}`)
    console.log(`\n任务3 & 7: best_season 空字符串 - 发现 ${stats.emptyBestSeasonFound.length} / 已修复 ${stats.emptyBestSeasonFixed}`)
    console.log(`\n任务3 & 4: direction 空字符串 - 发现 ${stats.emptyDirectionFound.length} / 已修复 ${stats.emptyDirectionFixed}`)
    console.log(`\n任务6: 逗号格式 → 数组 - 发现 ${stats.commaBestSeasonFound.length} / 已修复 ${stats.commaBestSeasonFixed}`)
    console.log(`\n错误: ${stats.totalErrors}`)
    if (stats.errors.length > 0) {
      stats.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`))
    }

    if (isDryRun) {
      console.log('\n⚠️  这是预览模式，未做任何修改。如需执行清理，调用 { action: "execute" }')
      if (stats.commaBestSeasonFound.length > 0) {
        console.log('\n逗号格式记录:')
        stats.commaBestSeasonFound.slice(0, 10).forEach(item =>
          console.log(`  ${item._id} (${item.name}): ${item.fields.join(', ')}`)
        )
      }
      if (stats.emptyBestSeasonFound.length > 0) {
        console.log('\nbest_season 空字符串:')
        stats.emptyBestSeasonFound.slice(0, 10).forEach(item =>
          console.log(`  ${item._id} (${item.name}) [${item.field || 'best_season'}]`)
        )
      }
      if (stats.emptyDirectionFound.length > 0) {
        console.log('\ndirection 空字符串:')
        stats.emptyDirectionFound.slice(0, 10).forEach(item =>
          console.log(`  ${item._id} (${item.name})`)
        )
      }
    }

    return { code: 0, mode: isDryRun ? 'dry-run' : 'execute', stats }
  } catch (err) {
    console.error('清理过程出错:', err)
    return { code: -1, message: '清理失败', error: err.message }
  }
}
