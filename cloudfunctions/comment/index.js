/**
 * 评论云函数
 * 功能：添加评论、获取评论列表、点赞评论、删除评论
 * 数据表：comments, likes
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

/**
 * 统一返回格式
 */
function result(code, msg, data) {
  return { code, msg, data }
}

/**
 * 添加评论
 * @param {Object} params - { trail_id, user_id, content, rating, visited, eco_mark, images }
 */
async function addComment(params) {
  const { trail_id, user_id, content, rating, visited, eco_mark, images } = params

  // 参数校验
  if (!trail_id || !user_id || !content || !rating) {
    return result(-1, '缺少必要参数')
  }

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return result(-1, '评分必须为1-5之间的整数')
  }

  if (content.length > 500) {
    return result(-1, '评论内容不能超过500字')
  }

  // 获取用户信息
  const userRes = await db.collection('users').doc(user_id).get().catch(() => null)
  const userName = userRes ? (userRes.data.nickname || '匿名用户') : '匿名用户'
  const userAvatar = userRes ? (userRes.data.avatar || '') : ''

  const now = db.serverDate()

  // 插入评论
  const addRes = await db.collection('comments').add({
    data: {
      trail_id,
      user_id,
      user_name: userName,
      user_avatar: userAvatar,
      content,
      rating,
      visited: visited || false,
      eco_mark: eco_mark || false,
      images: images || [],
      likes: 0,
      created_at: now,
      updated_at: now,
      status: 'normal' // normal | deleted
    }
  })

  // 更新路线的平均评分和评论数
  await updateTrailRating(trail_id)

  return result(0, 'success', { comment_id: addRes._id })
}

/**
 * 更新路线的平均评分
 */
async function updateTrailRating(trail_id) {
  try {
    const statRes = await db.collection('comments').aggregate()
      .match({ trail_id, status: 'normal' })
      .group({
        _id: null,
        avgRating: $.avg('$rating'),
        count: $.sum(1)
      })
      .end()

    if (statRes.list.length > 0) {
      const { avgRating, count } = statRes.list[0]
      await db.collection('trails').doc(trail_id).update({
        data: {
          rating: Math.round(avgRating * 10) / 10,
          review_count: count,
          updated_at: db.serverDate()
        }
      })
    }
  } catch (e) {
    console.error('更新路线评分失败:', e)
  }
}

/**
 * 获取评论列表（按路线）
 * @param {Object} params - { trail_id, page, pageSize }
 */
async function getCommentList(params) {
  const { trail_id, page = 1, pageSize = 20 } = params

  if (!trail_id) {
    return result(-1, '缺少trail_id参数')
  }

  const skip = (page - 1) * pageSize

  // 获取评论总数
  const countRes = await db.collection('comments')
    .where({ trail_id, status: 'normal' })
    .count()

  // 获取评论列表
  const listRes = await db.collection('comments')
    .where({ trail_id, status: 'normal' })
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
 * 点赞评论
 * @param {Object} params - { comment_id, user_id }
 */
async function likeComment(params) {
  const { comment_id, user_id } = params

  if (!comment_id || !user_id) {
    return result(-1, '缺少必要参数')
  }

  // 检查是否已点赞
  const existingLike = await db.collection('likes')
    .where({
      target_id: comment_id,
      target_type: 'comment',
      user_id
    })
    .get()

  if (existingLike.data.length > 0) {
    // 取消点赞
    await db.collection('likes')
      .where({
        target_id: comment_id,
        target_type: 'comment',
        user_id
      })
      .remove()

    await db.collection('comments').doc(comment_id).update({
      data: { likes: _.inc(-1) }
    })

    return result(0, 'success', { action: 'unliked' })
  } else {
    // 添加点赞
    await db.collection('likes').add({
      data: {
        target_id: comment_id,
        target_type: 'comment',
        user_id,
        created_at: db.serverDate()
      }
    })

    await db.collection('comments').doc(comment_id).update({
      data: { likes: _.inc(1) }
    })

    return result(0, 'success', { action: 'liked' })
  }
}

/**
 * 删除评论（管理员）
 * @param {Object} params - { comment_id }
 */
async function deleteComment(params) {
  const { comment_id } = params

  if (!comment_id) {
    return result(-1, '缺少comment_id参数')
  }

  // 获取评论信息（用于更新路线评分）
  const commentRes = await db.collection('comments').doc(comment_id).get().catch(() => null)

  // 软删除
  await db.collection('comments').doc(comment_id).update({
    data: {
      status: 'deleted',
      updated_at: db.serverDate()
    }
  })

  // 更新路线评分
  if (commentRes && commentRes.data) {
    await updateTrailRating(commentRes.data.trail_id)
  }

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
        return await addComment(params)
      case 'getList':
        return await getCommentList(params)
      case 'like':
        return await likeComment(params)
      case 'delete':
        return await deleteComment(params)
      default:
        return result(-1, `未知操作: ${action}`)
    }
  } catch (err) {
    console.error('comment云函数错误:', err)
    return result(-1, '服务器内部错误', { error: err.message })
  }
}
