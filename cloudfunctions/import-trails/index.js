// 云函数：import-trails
// 功能：批量导入徒步路线数据到云数据库
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX_BATCH_SIZE = 20 // 云数据库单次批量写入上限

/**
 * 查询当前已有路线数
 */
async function getTrailCount() {
  const countResult = await db.collection('trails').count()
  return countResult.total
}

/**
 * 批量导入路线数据
 * @param {Array} trails - 路线数据数组
 * @returns {Object} 导入结果
 */
async function batchImport(trails) {
  if (!trails || trails.length === 0) {
    return { success: false, message: '没有需要导入的数据' }
  }

  let imported = 0
  let failed = 0
  const errors = []

  // 分批写入，每批最多20条
  for (let i = 0; i < trails.length; i += MAX_BATCH_SIZE) {
    const batch = trails.slice(i, i + MAX_BATCH_SIZE)
    try {
      const tasks = batch.map(trail => {
        return db.collection('trails').add({
          data: {
            ...trail,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        })
      })
      await Promise.all(tasks)
      imported += batch.length
    } catch (err) {
      failed += batch.length
      errors.push({
        batch: Math.floor(i / MAX_BATCH_SIZE) + 1,
        error: err.message
      })
      console.error(`批次 ${Math.floor(i / MAX_BATCH_SIZE) + 1} 导入失败:`, err)
    }
  }

  return {
    success: failed === 0,
    total: trails.length,
    imported,
    failed,
    errors: errors.length > 0 ? errors : undefined
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action, trails } = event

  switch (action) {
    case 'count':
      // 查询当前路线数
      const count = await getTrailCount()
      return { success: true, count }

    case 'import':
      // 批量导入
      return await batchImport(trails)

    case 'clear':
      // 清空路线数据（谨慎使用）
      try {
        const { total } = await db.collection('trails').count()
        if (total <= 0) {
          return { success: true, message: '集合已为空' }
        }
        // 云数据库每次最多删除20条，循环删除
        let deleted = 0
        while (deleted < total) {
          const { data } = await db.collection('trails').limit(MAX_BATCH_SIZE).get()
          if (data.length === 0) break
          const tasks = data.map(item => db.collection('trails').doc(item._id).remove())
          await Promise.all(tasks)
          deleted += data.length
        }
        return { success: true, deleted }
      } catch (err) {
        return { success: false, error: err.message }
      }

    default:
      return {
        success: false,
        message: '未知操作。支持的操作：count, import, clear'
      }
  }
}
