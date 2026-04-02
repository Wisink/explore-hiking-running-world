#!/usr/bin/env python3
"""批量生成徒步路线亮点文案"""

import json
import random
import sys

INPUT_FILE = '/Users/wangweixin/.openclaw/workspace-life-assistant/qinren-outdoor/miniprogram/trails_data.json'

# 开头变体模板
INTRO_TEMPLATES = [
    "如果你想在{name}来一场身心放松的徒步之旅，{description}是绝佳的选择。",
    "说起{name}，最让人心动的莫过于{description}。",
    "想要探索{name}？{description}绝对不容错过。",
    "{description}——这就是{name}最迷人的地方。",
    "走进{name}，{description}会让你感受到自然的鬼斧神工。",
]

# 风景描述变体
SCENERY_TEMPLATES = [
    "沿途可以欣赏到{scenery_text}等美景。",
    "一路上{scenery_text}令人目不暇接。",
    "{scenery_text}等景观让人流连忘返。",
    "这里拥有{scenery_text}等丰富多样的自然风光。",
]

# 季节推荐变体
SEASON_TEMPLATES = [
    "{season_text}是最佳出行时间，景色最为动人。",
    "推荐{season_text}前往，届时风光最为迷人。",
    "{season_text}时节来此，能邂逅最美的风景。",
    "最佳出行季是{season_text}，气候宜人，风景绝佳。",
]

# 难度描述
DIFFICULTY_MAP = {
    '初级': [
        "路线轻松平缓，非常适合新手和亲子出行。",
        "难度不大，老人小孩都能轻松完成，是一条温馨的家庭路线。",
        "整体难度友好，即使没有太多户外经验也能享受其中。",
        "难度适中，适合全家出动，带孩子亲近大自然。",
    ],
    '中级': [
        "路线有一定挑战性，适合有一定徒步经验的朋友。",
        "中等难度，需要一定体力和耐力，但沿途风景绝对值得。",
        "适合有基础的户外爱好者，既不会太轻松也不会太辛苦。",
        "有一定起伏和距离，适合周末来一场有强度的运动。",
    ],
    '高级': [
        "路线难度较大，适合经验丰富的户外爱好者挑战自我。",
        "适合资深驴友，需要充分准备装备和体力，是检验实力的好路线。",
        "挑战指数较高，建议做好充足准备再出发，但风景一定会让你觉得不虚此行。",
        "高难度路线，适合追求极致体验的户外达人。",
    ],
    '轻松': [
        "路线轻松平缓，非常适合新手和亲子出行。",
        "难度不大，老人小孩都能轻松完成，是一条温馨的家庭路线。",
    ],
    '适中': [
        "路线有一定挑战性，适合有一定徒步经验的朋友。",
        "中等难度，需要一定体力和耐力，但沿途风景绝对值得。",
    ],
    '困难': [
        "路线难度较大，适合经验丰富的户外爱好者挑战自我。",
        "适合资深驴友，需要充分准备装备和体力，是检验实力的好路线。",
    ],
}

# 交通描述
TRAFFIC_TEMPLATES = [
    "交通便利，自驾或公共交通都能轻松到达。",
    "交通方便，不需要长途跋涉就能抵达起点。",
    "到达起点非常便捷，无论开车还是坐车都很方便。",
]

# 免费描述
FREE_TEMPLATES = [
    "全程免费，无需门票。",
    "不收取任何费用，真正的零成本户外体验。",
    "完全免费开放，随时都可以出发。",
]

# 结尾号召
ENDINGS = [
    "来{name}，感受自然的魅力吧！",
    "来{name}，给自己一段与自然对话的时光。",
    "周末就出发吧，{name}在等你！",
    "背上背包，{name}走起！",
    "来{name}走一趟，你会发现生活原来可以这么美好。",
]

def pick(lst):
    """随机选一个"""
    return random.choice(lst)

def generate_highlights(trail):
    name = trail.get('name', '')
    difficulty = trail.get('difficulty', '')
    features = trail.get('features', [])
    best_season = trail.get('best_season', [])
    cost = trail.get('cost', '')
    description = trail.get('description', '')
    traffic = trail.get('traffic', '')
    
    parts = []
    random.seed(hash(name) + len(description) + len(features))
    
    # 开头：用 description 或 fallback
    if description:
        if len(description) > 15:
            # 直接用描述作为吸引人的开头
            parts.append(description + "。")
        else:
            parts.append(pick(INTRO_TEMPLATES).format(name=name, description=description))
    else:
        parts.append(f"{name}是一条值得一走的徒步路线。")
    
    # 风景特色
    if features:
        scenery_text = '、'.join(features[:5])
        parts.append(pick(SCENERY_TEMPLATES).format(scenery_text=scenery_text))
    
    # 季节推荐
    if best_season:
        season_text = '和'.join(best_season)
        parts.append(pick(SEASON_TEMPLATES).format(season_text=season_text))
    
    # 难度
    if difficulty in DIFFICULTY_MAP:
        parts.append(pick(DIFFICULTY_MAP[difficulty]))
    
    # 交通
    if traffic and len(traffic) > 10:
        parts.append(pick(TRAFFIC_TEMPLATES))
    
    # 费用
    if cost and '免费' in cost:
        parts.append(pick(FREE_TEMPLATES))
    elif cost:
        parts.append(f"费用参考：{cost}。")
    
    # 结尾
    parts.append(pick(ENDINGS).format(name=name))
    
    result = ''.join(parts)
    
    # 如果太短，补充一些
    if len(result) < 100:
        result += f"{name}的风景值得你专程前往，每一次徒步都是与大自然的亲密接触。"
    
    return result

def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    total = len(data)
    success = 0
    fail = 0
    
    print(f"开始处理 {total} 条路线...")
    
    for i, trail in enumerate(data):
        try:
            highlights = generate_highlights(trail)
            trail['highlights'] = highlights
            success += 1
        except Exception as e:
            trail['highlights'] = f"{trail.get('name', '')}是一条值得探索的徒步路线，沿途风景优美。"
            fail += 1
            print(f"  [ERROR] 第{i+1}条 ({trail.get('name', '未知')}): {e}")
        
        if (i + 1) % 100 == 0:
            print(f"  已处理 {i+1}/{total} ({success}成功, {fail}失败)")
    
    # 写回
    with open(INPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成！总计: {total}, 成功: {success}, 失败: {fail}")
    
    # 打印几个样本
    print("\n--- 样本文案 ---")
    for trail in data[:3]:
        print(f"\n【{trail['name']}】")
        print(trail['highlights'])

if __name__ == '__main__':
    main()
