// routes.json 的 JS 包装模块
// 解决微信小程序 require 不能直接加载 .json 的问题
const routes = require('./routes.json')
module.exports = routes
