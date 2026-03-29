// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 用户等级配置
const LEVEL_CONFIG = [
  { level: 1, name: '徒步新手', minExp: 0, maxExp: 100 },
  { level: 2, name: '山野行者', minExp: 100, maxExp: 300 },
  { level: 3, name: '林间猎人', minExp: 300, maxExp: 600 },
  { level: 4, name: '峰顶勇士', minExp: 600, maxExp: 1000 },
  { level: 5, name: '户外达人', minExp: 1000, maxExp: 2000 },
  { level: 6, name: '探险家', minExp: 2000, maxExp: 5000 },
  { level: 7, name: '传奇旅者', minExp: 5000, maxExp: Infinity }
]

/**
 * 统一返回格式
 */
function success(data, msg = 'success') {
  return { code: 0, msg, data }
}

function fail(msg = '操作失败', data = null) {
  return { code: -1, msg, data }
}

/**
 * 用户登录
 * 获取 openid，创建或更新用户信息
 */
async function login(event, wxContext) {
  const { userInfo } = event
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取用户身份失败')
  }

  try {
    // 查询用户是否已存在
    const userRes = await db.collection('users').where({
      openid: openid
    }).get()

    const now = db.serverDate()

    if (userRes.data && userRes.data.length > 0) {
      // 用户已存在，更新登录时间和用户信息
      const userId = userRes.data[0]._id
      const updateData = {
        last_login: now,
        updated_at: now
      }

      // 如果传入了 userInfo，更新昵称和头像
      if (userInfo) {
        if (userInfo.nickName) updateData.nickname = userInfo.nickName
        if (userInfo.avatarUrl) updateData.avatar_url = userInfo.avatarUrl
      }

      await db.collection('users').doc(userId).update({
        data: updateData
      })

      // 获取更新后的完整用户信息
      const updatedUser = await db.collection('users').doc(userId).get()
      return success(updatedUser.data, '登录成功')
    } else {
      // 新用户，创建用户记录
      const newUser = {
        openid: openid,
        nickname: userInfo && userInfo.nickName ? userInfo.nickName : '徒步爱好者',
        avatar_url: userInfo && userInfo.avatarUrl ? userInfo.avatarUrl : '',
        exp: 0,
        level: 1,
        trails_completed: 0,
        total_distance: 0,
        favorites: [],
        created_at: now,
        last_login: now,
        updated_at: now
      }

      const addRes = await db.collection('users').add({
        data: newUser
      })

      newUser._id = addRes._id
      return success(newUser, '注册成功')
    }
  } catch (err) {
    console.error('login error:', err)
    return fail('登录失败：' + err.message)
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(event, wxContext) {
  const openid = wxContext.OPENID
  const { user_id } = event

  try {
    let query

    if (user_id) {
      // 通过 _id 查询
      const res = await db.collection('users').doc(user_id).get()
      query = res.data
    } else if (openid) {
      // 通过 openid 查询
      const res = await db.collection('users').where({
        openid: openid
      }).get()

      if (!res.data || res.data.length === 0) {
        return fail('用户不存在')
      }
      query = res.data[0]
    } else {
      return fail('缺少用户标识')
    }

    if (!query) {
      return fail('用户不存在')
    }

    return success(query)
  } catch (err) {
    console.error('getUserInfo error:', err)
    return fail('获取用户信息失败：' + err.message)
  }
}

/**
 * 更新用户信息
 * 支持更新：nickname, avatar_url
 */
async function updateUserInfo(event, wxContext) {
  const openid = wxContext.OPENID
  const { nickname, avatar_url } = event

  if (!openid) {
    return fail('获取用户身份失败')
  }

  try {
    // 查询用户
    const userRes = await db.collection('users').where({
      openid: openid
    }).get()

    if (!userRes.data || userRes.data.length === 0) {
      return fail('用户不存在')
    }

    const userId = userRes.data[0]._id
    const updateData = {
      updated_at: db.serverDate()
    }

    if (nickname !== undefined) updateData.nickname = nickname
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url

    await db.collection('users').doc(userId).update({
      data: updateData
    })

    // 返回更新后的用户信息
    const updatedUser = await db.collection('users').doc(userId).get()
    return success(updatedUser.data, '更新成功')
  } catch (err) {
    console.error('updateUserInfo error:', err)
    return fail('更新用户信息失败：' + err.message)
  }
}

/**
 * 获取用户等级信息
 */
async function getLevel(event, wxContext) {
  const openid = wxContext.OPENID
  const { user_id } = event

  try {
    let user

    if (user_id) {
      const res = await db.collection('users').doc(user_id).get()
      user = res.data
    } else if (openid) {
      const res = await db.collection('users').where({
        openid: openid
      }).get()

      if (!res.data || res.data.length === 0) {
        return fail('用户不存在')
      }
      user = res.data[0]
    } else {
      return fail('缺少用户标识')
    }

    if (!user) {
      return fail('用户不存在')
    }

    const exp = user.exp || 0
    const currentLevel = LEVEL_CONFIG.find(l => exp >= l.minExp && exp < l.maxExp) || LEVEL_CONFIG[0]
    const nextLevel = LEVEL_CONFIG.find(l => l.level === currentLevel.level + 1)

    const levelInfo = {
      current_level: currentLevel.level,
      current_name: currentLevel.name,
      exp: exp,
      current_min_exp: currentLevel.minExp,
      current_max_exp: currentLevel.maxExp,
      next_level: nextLevel ? nextLevel.level : null,
      next_name: nextLevel ? nextLevel.name : null,
      next_min_exp: nextLevel ? nextLevel.minExp : null,
      progress: nextLevel
        ? Math.round(((exp - currentLevel.minExp) / (nextLevel.minExp - currentLevel.minExp)) * 100)
        : 100,
      trails_completed: user.trails_completed || 0,
      total_distance: user.total_distance || 0
    }

    return success(levelInfo)
  } catch (err) {
    console.error('getLevel error:', err)
    return fail('获取等级信息失败：' + err.message)
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()

  switch (action) {
    case 'login':
      return await login(event, wxContext)
    case 'getUserInfo':
      return await getUserInfo(event, wxContext)
    case 'updateUserInfo':
      return await updateUserInfo(event, wxContext)
    case 'getLevel':
      return await getLevel(event, wxContext)
    default:
      return fail('未知操作：' + action)
  }
}
