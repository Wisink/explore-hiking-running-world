const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const articles = [
  {
    "_id": "article_001",
    "highlights": "一双好鞋是徒步的根基。本篇详解鞋面、中底、大底三大核心部件的选择要点，帮你在不同地形找到最适合的那双鞋。"
  },
  {
    "_id": "article_002",
    "highlights": "登山杖不是拐杖，是你的第三条腿。正确使用能减轻30%膝盖负担，学会调节长度、握持技巧和上坡下坡姿势是关键。"
  },
  {
    "_id": "article_003",
    "highlights": "背包选对了，背负体验天差地别。从容量选择、背负系统到装载技巧，一篇搞定你的出行装备核心。"
  },
  {
    "_id": "article_004",
    "highlights": "洋葱穿衣法是户外穿衣的黄金法则——内层排汗、中层保暖、外层防风防雨。掌握分层搭配，从容应对多变天气。"
  },
  {
    "_id": "article_005",
    "highlights": "夜间徒步、露营、应急，头灯都是必备品。亮度、续航、防水是三大指标，这篇帮你选到性价比最高的那一盏。"
  },
  {
    "_id": "article_006",
    "highlights": "水壶方便快捷，水袋适合长距离。不同的出行场景需要不同的饮水方案，对比分析帮你做出最佳选择。"
  },
  {
    "_id": "article_007",
    "highlights": "户外急救包清单的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_008",
    "highlights": "中暑预防和处理的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_009",
    "highlights": "失温怎么办的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_010",
    "highlights": "蛇虫咬伤急救的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_011",
    "highlights": "扭伤处理方法的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_012",
    "highlights": "冷静、定位、等待——迷路时的三步法则。学会使用指南针、地图和手机GPS定位。"
  },
  {
    "_id": "article_013",
    "highlights": "无痕山林七原则的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_014",
    "highlights": "好营地是选出来的，不是造出来的。远离水源、避开动物痕迹、保持原貌是选营地的三大原则。"
  },
  {
    "_id": "article_015",
    "highlights": "垃圾处理原则的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_016",
    "highlights": "野生动物互动指南的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_017",
    "highlights": "团队徒步礼仪的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_018",
    "highlights": "山林防火常识的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_019",
    "highlights": "帐篷是户外的家。从三季帐到四季帐，从双层帐到隧道帐，了解帐篷结构和面料，才能选到合适的移动居所。"
  },
  {
    "_id": "article_020",
    "highlights": "温标、填充物、重量——选购睡袋的三个核心维度。别让错误的睡袋毁掉一个美好的露营夜晚。"
  },
  {
    "_id": "article_021",
    "highlights": "地面寒气比你想象的更伤人。泡沫垫、充气垫、自充气垫各有优劣，选对防潮垫才能睡个好觉。"
  },
  {
    "_id": "article_022",
    "highlights": "徒步下坡是膝盖最大的敌人。护具不是伤了才用，预防才是关键。本篇教你选对型号和尺码。"
  },
  {
    "_id": "article_023",
    "highlights": "别小看一双袜子，选错了可能让你脚底磨出水泡。羊毛、混纺、速干面料，不同场景不同选择。"
  },
  {
    "_id": "article_024",
    "highlights": "汗水不干，体温就难控制。速干衣是户外最基础的装备之一，面料、剪裁、厚度怎么选？"
  },
  {
    "_id": "article_025",
    "highlights": "防水≠透气≠防风。GORE-TEX、eVent、DWR涂层…各种科技让人眼花缭乱？这篇帮你理清脉络。"
  },
  {
    "_id": "article_026",
    "highlights": "突如其来的暴雨最考验装备。分体式、连体式、斗篷式雨衣各有什么优缺点？实用选购指南在此。"
  },
  {
    "_id": "article_027",
    "highlights": "山上的一杯热茶是无价的快乐。炉头、气罐、锅具三件套怎么搭？轻量化和实用性如何平衡？"
  },
  {
    "_id": "article_028",
    "highlights": "体积小、重量轻、作用大。急救毯是被低估的户外神器，保温、防晒、求救信号反射样样行。"
  },
  {
    "_id": "article_029",
    "highlights": "山里信号不好时，对讲机就是生命线。频率、功率、防水等级，选购时这几个参数要关注。"
  },
  {
    "_id": "article_030",
    "highlights": "记录户外精彩瞬间需要一台靠谱的相机。GoPro、Insta360、DJI各有什么特点？"
  },
  {
    "_id": "article_031",
    "highlights": "海拔、气压、温度、GPS——一块户外手表能给你全方位的数据支持。从入门到专业，选购建议全覆盖。"
  },
  {
    "_id": "article_032",
    "highlights": "收纳是一门艺术。合理的装备收纳不仅能省空间，还能在紧急时刻快速找到所需物品。"
  },
  {
    "_id": "article_033",
    "highlights": "高原反应预防的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_034",
    "highlights": "低血糖应急处理的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_035",
    "highlights": "脱水与补水的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_036",
    "highlights": "溺水自救互救的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_037",
    "highlights": "雷电天气应对的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_038",
    "highlights": "暴风雪自救的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_039",
    "highlights": "山洪预警与逃生的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_040",
    "highlights": "野外导航方法的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_041",
    "highlights": "信号求救方法的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_042",
    "highlights": "动物伤害预防的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_043",
    "highlights": "植物中毒预防的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_044",
    "highlights": "晒伤处理的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_045",
    "highlights": "冻伤处理的详细指南，涵盖核心知识点和实用建议。"
  },
  {
    "_id": "article_046",
    "highlights": "户外急救基本技能的详细指南，涵盖核心知识点和实用建议。"
  }
]

exports.main = async (event) => {
  let updated = 0
  let failed = 0
  
  for (let i = 0; i < articles.length; i += 20) {
    const batch = articles.slice(i, i + 20)
    try {
      await Promise.all(batch.map(item =>
        db.collection('articles').doc(item._id).update({
          data: { highlights: item.highlights }
        })
      ))
      updated += batch.length
      console.log('已更新', updated, '条')
    } catch (err) {
      failed += batch.length
      console.error('批次更新失败:', err)
    }
  }
  
  return { code: 0, message: '更新完成', updated, failed }
}
