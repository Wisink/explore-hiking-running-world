/**
 * 脏数据清理脚本 — 本地运行入口
 *
 * ⚠️ 此脚本不能直接在本地 Node.js 执行（需要微信云开发环境）
 * 实际使用：部署 cloudfunctions/clean-dirty-data/ 到云端后调用
 *
 * 部署步骤：
 * 1. 在微信开发者工具中右键 cloudfunctions/clean-dirty-data/ → 上传并部署
 * 2. 调用云函数 clean-dirty-data：
 *    - { action: 'dry-run' } 预览脏数据
 *    - { action: 'execute' } 执行清理
 * 3. 清理完成后删除该云函数
 */
console.log('='.repeat(60));
console.log('秦人户外 — 脏数据清理工具');
console.log('='.repeat(60));
console.log('');
console.log('⚠️  需要在微信云开发环境下运行');
console.log('');
console.log('清理项目:');
console.log('  2. 删除 _id=93abbbd769cf328302b874b9283d22a8 的 name=测试 脏数据');
console.log('  3. 修复 best_season 空字符串 → []');
console.log('  4. 修复 direction 空字符串 → 未知');
console.log('  6. 修复 best_seaon 逗号格式 → 数组');
console.log('');
console.log('请部署后调用云函数 clean-dirty-data 执行');
