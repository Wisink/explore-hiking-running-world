/**
 * 消息云函数
 * 功能：获取消息列表、标记已读、全部已读、未读数、发送消息
 * 数据表：messages
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
 * 获取消息列表
 * @param {Object} params - { user_id, type, page, pageSize }
 */
async function getMessageList(params) {
  const { user_id, type, page = 1, pageSize = 20 } = params

  if (!user_id) {
    return result(-1, '缺少user_id参数')
  }

  const where = { user_id }
  if (type) {
    where.type = type
  }

  const skip = (page - 1) * pageSize

  // 获取总数
  const countRes = await db.collection('messages').where(where).count()

  // 获取列表
  const listRes = await db.collection('messages')
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
 * 标记消息为已读
 * @param {Object} params - { message_id }
 */
async function markRead(params) {
  const { message_id } = params

  if (!message_id) {
    return result(-1, '缺少message_id参数')
  }

  await db.collection('messages').doc(message_id).update({
    data: {
      is_read: true,
      read_at: db.serverDate()
    }
  })

  return result(0, 'success')
}

/**
 * 标记所有消息为已读
 * @param {Object} params - { user_id }
 */
async function markAllRead(params) {
  const { user_id } = params

  if (!user_id) {
    return result(-1, '缺少user_id参数')
  }

  // 批量更新未读消息
  await db.collection('messages')
    .where({
      user_id,
      is_read: false
    })
    .update({
      data: {
        is_read: true,
        read_at: db.serverDate()
      }
    })

  return result(0, 'success')
}

/**
 * 获取未读消息数
 * @param {Object} params - { user_id }
 */
async function getUnreadCount(params) {
  const { user_id } = params

  if (!user_id) {
    return result(-1, '缺少user_id参数')
  }

  const countRes = await db.collection('messages')
    .where({
      user_id,
      is_read: false
    })
    .count()

  // 获取各类型未读数
  const typeCounts = {}
  const types = ['correction_approved', 'correction_rejected', 'system', 'comment_reply', 'like']

  for (const type of types) {
    const res = await db.collection('messages')
      .where({
        user_id,
        is_read: false,
        type
      })
      .count()
    if (res.total > 0) {
      typeCounts[type] = res.total
    }
  }

  return result(0, 'success', {
    total: countRes.total,
    byType: typeCounts
  })
}

/**
 * 发送消息（系统内部调用）
 * @param {Object} params - { user_id, type, title, content, related_id }
 */
async function sendMessage(params) {
  const { user_id, type, title, content, related_id } = params

  // 参数校验
  if (!user_id || !type || !title || !content) {
    return result(-1, '缺少必要参数')
  }

  // 验证消息类型
  const validTypes = ['correction_approved', 'correction_rejected', 'system', 'comment_reply', 'like', 'favorite', 'admin']
  if (!validTypes.includes(type)) {
    return result(-1, '无效的消息类型')
  }

  const addRes = await db.collection('messages').add({
    data: {
      user_id,
      type,
      title,
      content,
      related_id: related_id || '',
      is_read: false,
      created_at: db.serverDate()
    }
  })

  return result(0, 'success', { message_id: addRes._id })
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action, ...params } = event

  try {
    switch (action) {
      case 'getList':
        return await getMessageList(params)
      case 'markRead':
        return await markRead(params)
      case 'markAllRead':
        return await markAllRead(params)
      case 'getUnreadCount':
        return await getUnreadCount(params)
      case 'send':
        return await sendMessage(params)
      default:
        return result(-1, `未知操作: ${action}`)
    }
  } catch (err) {
    console.error('message云函数错误:', err)
    return result(-1, '服务器内部错误', { error: err.message })
  }
}
