// app.js - 秦人徒步路线分享
const cloudSync = require('./utils/cloud-sync')

App({
  onLaunch: async function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-1ghoxvn859e9d0df', // 云开发环境ID
        traceUser: true,
      })
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo
    this.globalData.statusBarHeight = systemInfo.statusBarHeight
    this.globalData.screenWidth = systemInfo.screenWidth
    this.globalData.screenHeight = systemInfo.screenHeight

    // 同步用户数据和初始化用户编号（并行执行，提高启动速度）
    this._userReady = Promise.all([
      this.syncUserData(),
      this.initUser()
    ])
    await this._userReady
  },

  // 初始化用户编号和访问次数
  initUser: function () {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      const _ = db.command

      // 获取当前用户 openid
      wx.cloud.callFunction({
        name: 'user-data',
        data: { action: 'get-openid' }
      }).then(res => {
        const openid = res.result && res.result.openid
        if (!openid) {
          console.log('initUser: 未获取到 openid，跳过初始化')
          resolve()
          return
        }

        // 查询 users 表是否已有该用户
        db.collection('users').where({ _openid: openid }).get().then(userRes => {
          if (userRes.data.length > 0) {
            // 已有用户，访问次数 +1
            const user = userRes.data[0]
            db.collection('users').doc(user._id).update({
              data: { visitCount: _.inc(1) }
            })
            this.globalData.userInfo = {
              userNumber: user.userNumber,
              nickName: user.nickName,
              visitCount: (user.visitCount || 0) + 1
            }
            console.log('initUser: 老用户回访，编号', user.userNumber, '访问次数', this.globalData.userInfo.visitCount)
            resolve()
          } else {
            // 新用户，分配编号
            // 先检查 counters 文档是否存在，不存在则创建
            db.collection('counters').doc('user_number').get().then(() => {
              // 文档存在，直接自增
              return db.collection('counters').doc('user_number').update({
                data: { value: _.inc(1) }
              })
            }).catch(() => {
              // 文档不存在，先创建再自增
              console.log('initUser: user_number 文档不存在，正在创建...')
              return db.collection('counters').add({
                data: { _id: 'user_number', value: 0 }
              }).then(() => {
                return db.collection('counters').doc('user_number').update({
                  data: { value: _.inc(1) }
                })
              })
            }).then(() => {
              return db.collection('counters').doc('user_number').get()
            }).then(counterRes => {
              const number = counterRes.data.value
              const nickName = String(number).padStart(3, '0') + '号徒步爱好者'
              return db.collection('users').add({
                data: {
                  userNumber: number,
                  nickName: nickName,
                  visitCount: 1,
                  createdAt: db.serverDate()
                }
              }).then(() => {
                this.globalData.userInfo = {
                  userNumber: number,
                  nickName: nickName,
                  visitCount: 1
                }
                console.log('initUser: 新用户注册，编号', number, '昵称', nickName)
                resolve()
              })
            }).catch(err => {
              console.error('initUser: 新用户注册失败:', err)
              resolve() // 不阻塞启动
            })
          }
        }).catch(err => {
          // 首次运行，counters 集合可能不存在，先创建
          if (err.errCode === -502005) {
            console.log('initUser: counters 集合不存在，正在创建...')
            db.collection('counters').add({
              data: { _id: 'user_number', value: 0 }
            }).then(() => {
              return this.initUser() // 重试
            }).then(resolve).catch(reject)
          } else {
            console.error('initUser: 查询用户失败:', err)
            resolve() // 不阻塞启动
          }
        })
      }).catch(err => {
        console.error('initUser: 调用 user-data 云函数失败:', err)
        resolve() // 不阻塞启动
      })
    })
  },

  // 同步用户数据（收藏和已走过）
  syncUserData: async function () {
    try {
      console.log('开始同步用户数据...')
      const data = await cloudSync.pullFromCloud()
      this.globalData.favorites = data.favorites
      this.globalData.completed = data.completed
      console.log('用户数据同步完成:', data)
    } catch (err) {
      console.error('用户数据同步失败，使用本地缓存:', err)
      // 同步失败时使用本地缓存
      this.globalData.favorites = cloudSync.getLocalFavorites()
      this.globalData.completed = cloudSync.getLocalCompleted()
    }
  },

  globalData: {
    favorites: [],
    completed: [],
    systemInfo: null,
    statusBarHeight: 0,
    screenWidth: 0,
    screenHeight: 0
  }
})
