/**
 * 纠错云函数
 * 功能：添加纠错、获取纠错列表、我的纠错、采纳/驳回纠错
 * 数据表：corrections, messages
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 统一返回格式
 */
function result(code, msg, data) {
  return { code, msg, data }
}

/**
 * 创建消息通知
 * @param {string} userId - 接收消息的用户ID
 * @param {string} type - 消息类型
 * @param {string} title - 消息标题
 * @param {string} content - 消息内容
 * @param {string} relatedId - 关联ID
 */
async function createMessage(userId, type, title, content, relatedId) {
  try {
    await db.collection('messages').add({
      data: {
        user_id: userId,
        type,
        title,
        content,
        related_id: relatedId,
        is_read: false,
        created_at: db.serverDate()
      }
    })
  } catch (e) {
    console.error('创建消息失败:', e)
  }
}

/**
 * 添加纠错
 * @param {Object} params - { trail_id, user_id, error_type, error_desc, correct_info, extra, images }
 */
async function addCorrection(params) {
  const { trail_id, user_id, error_type, error_desc, correct_info, extra, images } = params

  // 参数校验
  if (!trail_id || !user_id || !error_type || !error_desc) {
    return result(-1, '缺少必要参数')
  }

  // 验证错误类型
  const validTypes = ['trail_name', 'trail_length', 'trail_elevation', 'trail_difficulty', 'trail_location', 'trail_route', 'trail_facilities', 'other']
  if (!validTypes.includes(error_type)) {
    return result(-1, '无效的错误类型')
  }

  if (error_desc.length > 500) {
    return result(-1, '错误描述不能超过500字')
  }

  // 获取路线信息
  const trailRes = await db.collection('trails').doc(trail_id).get().catch(() => null)
  const trailName = trailRes ? trailRes.data.name : ''

  const addRes = await db.collection('corrections').add({
    data: {
      trail_id,
      trail_name: trailName,
      user_id,
      error_type,
      error_desc,
      correct_info: correct_info || '',
      extra: extra || {},
      images: images || [],
      status: 'pending', // pending | approved | rejected
      admin_reply: '',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  })

  return result(0, 'success', { correction_id: addRes._id })
}

/**
 * 获取纠错列表（管理员用）
 * @param {Object} params - { status, page, pageSize }
 */
async function getCorrectionList(params) {
  const { status, page = 1, pageSize = 20 } = params

  const where = {}
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    where.status = status
  }

  const skip = (page - 1) * pageSize

  const countRes = await db.collection('corrections').where(where).count()

  const listRes = await db.collection('corrections')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return result(0, 'success', {
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize,
    hasMore: skip + listRes.data.length < countRes.total
  })
}

/**
 * 获取我的纠错列表
 * @param {Object} params - { user_id, page, pageSize }
 */
async function getMyCorrectionList(params) {
  const { user_id, page = 1, pageSize = 20 } = params

  if (!user_id) {
    return result(-1, '缺少user_id参数')
  }

  const skip = (page - 1) * pageSize

  const countRes = await db.collection('corrections')
    .where({ user_id })
    .count()

  const listRes = await db.collection('corrections')
    .where({ user_id })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return result(0, 'success', {
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize,
    hasMore: skip + listRes.data.length < countRes.total
  })
}

/**
 * 采纳纠错（管理员）
 * @param {Object} params - { correction_id, admin_reply }
 */
async function approveCorrection(params) {
  const { correction_id, admin_reply } = params

  if (!correction_id) {
    return result(-1, '缺少correction_id参数')
  }

  // 获取纠错信息
  const correctionRes = await db.collection('corrections').doc(correction_id).get().catch(() => null)
  if (!correctionRes || !correctionRes.data) {
    return result(-1, '纠错记录不存在')
  }

  const correction = correctionRes.data

  // 更新纠错状态
  await db.collection('corrections').doc(correction_id).update({
    data: {
      status: 'approved',
      admin_reply: admin_reply || '您的纠错已被采纳，感谢您的贡献！',
      updated_at: db.serverDate()
    }
  })

  // 发送通知消息给用户
  await createMessage(
    correction.user_id,
    'correction_approved',
    '纠错被采纳',
    `您提交的「${correction.trail_name || '路线'}」纠错已被管理员采纳。${admin_reply ? '管理员回复：' + admin_reply : '感谢您的贡献！'}`,
    correction_id
  )

  return result(0, 'success')
}

/**
 * 驳回纠错（管理员）
 * @param {Object} params - { correction_id, admin_reply }
 */
async function rejectCorrection(params) {
  const { correction_id, admin_reply } = params

  if (!correction_id) {
    return result(-1, '缺少correction_id参数')
  }

  // 获取纠错信息
  const correctionRes = await db.collection('corrections').doc(correction_id).get().catch(() => null)
  if (!correctionRes || !correctionRes.data) {
    return result(-1, '纠错记录不存在')
  }

  const correction = correctionRes.data

  // 更新纠错状态
  await db.collection('corrections').doc(correction_id).update({
    data: {
      status: 'rejected',
      admin_reply: admin_reply || '您的纠错未被采纳，感谢您的参与。',
      updated_at: db.serverDate()
    }
  })

  // 发送通知消息给用户
  await createMessage(
    correction.user_id,
    'correction_rejected',
    '纠错未采纳',
    `您提交的「${correction.trail_name || '路线'}」纠错未被采纳。${admin_reply ? '管理员回复：' + admin_reply : '感谢您的参与！'}`,
    correction_id
  )

  return result(0, 'success')
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action, ...params } = event

  try {
    switch (action) {
      case 'add':
        return await addCorrection(params)
      case 'getList':
        return await getCorrectionList(params)
      case 'getMyList':
        return await getMyCorrectionList(params)
      case 'approve':
        return await approveCorrection(params)
      case 'reject':
        return await rejectCorrection(params)
      default:
        return result(-1, `未知操作: ${action}`)
    }
  } catch (err) {
    console.error('correction云函数错误:', err)
    return result(-1, '服务器内部错误', { error: err.message })
  }
}
