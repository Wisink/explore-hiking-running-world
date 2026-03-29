#!/usr/bin/env python3
"""
精选100条路线并转换数据结构
秦人徒步路线分享 - 微信小程序数据准备
"""
import json
import random

random.seed(42)  # 可复现

def classify_region(loc):
    """根据location字段分类到6个区域"""
    # 秦岭东线: 蓝田、临潼、灞桥、渭南、华阴
    for c in ['蓝田','临潼','灞桥','华阴']:
        if c in loc: return '秦岭东线'
    if '渭南' in loc and '咸阳' not in loc: return '秦岭东线'
    
    # 秦岭东北线: 铜川、咸阳地区
    for c in ['铜川','咸阳','兴平','武功','礼泉','乾县','淳化','旬邑','永寿','彬州','长武','泾阳','三原','杨凌']:
        if c in loc: return '秦岭东北线'
    
    # 秦岭中线: 长安、鄠邑
    for c in ['长安','鄠邑','户县']:
        if c in loc: return '秦岭中线'
    
    # 秦岭中西线: 周至、眉县
    for c in ['周至','眉县']:
        if c in loc: return '秦岭中西线'
    
    # 秦岭西线: 宝鸡、太白、凤县
    for c in ['宝鸡','太白','凤县']:
        if c in loc: return '秦岭西线'
    
    # 秦岭远郊: 汉中、安康、商洛、宁陕、石泉等
    for c in ['汉中','安康','商洛','商州','洛南','柞水','山阳','丹凤','镇安','城固','洋县','佛坪','宁陕','石泉','岚皋','镇坪','南郑']:
        if c in loc: return '秦岭远郊'
    
    return None

def difficulty_level(d):
    """返回数值难度"""
    m = {'初级':1, '初级-中级':2, '中级':3, '中级-高级':4, '高级':5}
    return m.get(d, 3)

def diff_label(level):
    """难度标签"""
    labels = {
        1: "第一次也能走",
        2: "稍微有点挑战",
        3: "需要一些体力",
        4: "有经验再去",
        5: "大神专属"
    }
    return labels.get(level, "需要一些体力")

def suitable_for(level):
    """适合人群"""
    s = {
        1: ["新手", "亲子5岁+", "老年人"],
        2: ["新手", "亲子8岁+", "有一定运动基础"],
        3: ["有徒步经验", "体能一般即可"],
        4: ["有丰富徒步经验", "体能好"],
        5: ["专业户外玩家", "体能优秀"]
    }
    return s.get(level, ["有徒步经验"])

def parse_distance(dist_str):
    """从distance字符串提取km"""
    import re
    m = re.search(r'约?(\d+)\s*公里', dist_str)
    if m: return int(m.group(1))
    m = re.search(r'约?(\d+)\s*km', dist_str, re.IGNORECASE)
    if m: return int(m.group(1))
    return 8  # default

def parse_duration(dist_str, distance_km, diff_level):
    """从distance字符串提取hours"""
    import re
    # Try to find explicit time
    m = re.search(r'(\d+)-(\d+)\s*小时', dist_str)
    if m: return int(m.group(2))  # take upper bound
    m = re.search(r'约?(\d+)\s*小时', dist_str)
    if m: return int(m.group(1))
    
    # Estimate from distance
    if distance_km <= 5: return 2
    elif distance_km <= 8: return 3
    elif distance_km <= 12: return 4
    elif distance_km <= 16: return 5
    elif distance_km <= 20: return 6
    else: return 7

def parse_elevation(features, desc):
    """估算海拔爬升"""
    import re
    m = re.search(r'(\d+)\s*米', desc or '')
    if m: return int(m.group(1))
    return 300

def cost_obj(cost_str):
    """转换费用对象"""
    s = str(cost_str)
    if '免费' in s:
        note = s.replace('免费', '').strip('（）() ')
        if not note:
            note = "无额外费用"
        elif note.startswith('（') or note.startswith('('):
            note = note.strip('（）()')
        return {"type": "免费", "amount": 0, "note": note if note != "" else "无额外费用"}
    else:
        import re
        m = re.search(r'(\d+)\s*元', s)
        amount = int(m.group(1)) if m else 0
        if amount <= 20:
            return {"type": "低费用", "amount": amount, "note": s}
        else:
            return {"type": "收费", "amount": amount, "note": s}

def gen_sections(distance_km, difficulty_num):
    """生成分段路况"""
    if distance_km <= 6:
        return [
            {"name": f"0-{distance_km}km", "road": "土路/步道", "desc": "全程平缓，适合悠闲漫步"}
        ]
    elif distance_km <= 10:
        half = distance_km // 2
        return [
            {"name": f"0-{half}km", "road": "水泥路/土路", "desc": "平缓起步，适合热身"},
            {"name": f"{half}-{distance_km}km", "road": "山间小道", "desc": "略有起伏，风景渐入佳境"}
        ]
    else:
        third = distance_km // 3
        return [
            {"name": f"0-{third}km", "road": "水泥路/土路", "desc": "平缓起步，适合热身"},
            {"name": f"{third}-{third*2}km", "road": "山间小道", "desc": "开始爬升，注意脚下"},
            {"name": f"{third*2}-{distance_km}km", "road": "山脊/林间路", "desc": "风景最佳处，注意安全"}
        ]

def gen_equipment(difficulty_num, distance_km):
    """生成装备清单"""
    must = ["徒步鞋", "水(至少1L)", "零食干粮"]
    suggest = ["防晒帽", "防晒霜"]
    no_need = ["帐篷", "睡袋", "炉具"]
    
    if difficulty_num >= 2:
        suggest.append("登山杖")
    if difficulty_num >= 3:
        must.append("头灯")
        suggest.append("护膝")
    if distance_km >= 12:
        suggest.append("登山杖")
        # 替换为更大的水量
        must = [x for x in must if not x.startswith("水(")]
        must.append("水(至少2L)")
    suggest.extend(["魔术头巾", "充电宝"])
    
    return {"must": list(dict.fromkeys(must)), "suggest": list(dict.fromkeys(suggest)), "noNeed": no_need}

def gen_safety(difficulty_num, name, location):
    """生成安全提醒"""
    warnings = []
    if difficulty_num >= 2:
        warnings.append("建议结伴同行，不要单独前往")
    warnings.append("雨天路滑，建议晴天前往")
    warnings.append("出发前告知家人行程")
    if difficulty_num >= 3:
        warnings.append("部分路段无手机信号")
    
    # 提取县名
    county = "当地"
    for c in ['蓝田','长安','鄠邑','周至','眉县','太白','凤县','宝鸡','咸阳','铜川',
              '渭南','华阴','汉中','安康','商洛','洛南','柞水','山阳','宁陕','石泉','镇安']:
        if c in location:
            county = c
            break
    
    return {
        "warnings": warnings,
        "emergencyPhone": f"{county}县救援：119 / 110"
    }

def make_description(t):
    """生成一句话描述"""
    desc = t.get('description', '')
    features = t.get('features', [])
    name = t.get('name', '')
    
    if desc:
        # Take first sentence or first 50 chars
        first = desc.split('，')[0].split('、')[0].split('。')[0]
        if len(first) < 8 and '，' in desc:
            parts = desc.split('，')
            first = parts[0] + '，' + parts[1] if len(parts) > 1 else parts[0]
        return first[:50]
    elif features:
        return f"体验{features[0]}，感受自然之美"
    else:
        return f"{name}徒步路线，亲近自然好去处"

def gen_scenery(features, description):
    """生成风景关键词"""
    scenery = []
    if features:
        scenery.extend(features[:5])
    # 从描述中提取
    desc = description or ""
    keywords = ['瀑布','溪流','古道','寺庙','森林','草甸','花海','云海','日出','湖泊',
                '峡谷','悬崖','石林','竹林','茶园','古村','遗址','栈道','栈桥','观景台']
    for kw in keywords:
        if kw in desc and kw not in scenery:
            scenery.append(kw)
    return scenery[:6] if scenery else ["自然风光"]

def gen_transport(location):
    """生成交通信息"""
    nav = f"导航搜索：{location.split('省')[-1].split('市')[-1].split('县')[-1].strip()}"
    return {
        "direction": "",  # will be set later
        "address": location,
        "navAddress": nav,
        "publicTransport": "建议自驾或拼车前往"
    }

def select_trails(data):
    """从714条路线中精选100条"""
    target = {
        '秦岭东线': 15,
        '秦岭东北线': 10,
        '秦岭中线': 25,
        '秦岭中西线': 25,
        '秦岭西线': 20,
        '秦岭远郊': 5
    }
    
    # 分类所有初级和初级-中级的免费路线
    classified = {r: [] for r in target}
    for t in data:
        region = classify_region(t.get('location', ''))
        if region and region in classified:
            diff = t.get('difficulty', '')
            if diff in ['初级', '初级-中级']:
                classified[region].append(t)
    
    selected = []
    
    for region, count in target.items():
        trails = classified[region]
        
        # 优先免费的
        free_trails = [t for t in trails if '免费' in str(t.get('cost', ''))]
        paid_trails = [t for t in trails if '免费' not in str(t.get('cost', ''))]
        
        # 按风景评分排序
        free_trails.sort(key=lambda x: x.get('scenery', 0), reverse=True)
        paid_trails.sort(key=lambda x: x.get('scenery', 0), reverse=True)
        
        result = []
        # 从免费中选大部分
        for t in free_trails:
            if len(result) < count:
                # 避免城市公园类（不够户外）
                name = t.get('name', '')
                loc = t.get('location', '')
                if any(x in name for x in ['公园','广场','步行街','美食街','博物馆','商业街','海洋','植物园','运动公园']):
                    continue
                if any(x in loc for x in ['雁塔区','莲湖区','新城区','碑林区','未央区','经开区','曲江新区','浐灞']):
                    continue
                result.append(t)
        
        # 如果不够，从收费中补（限3条总计）
        for t in paid_trails:
            if len(result) < count:
                name = t.get('name', '')
                if any(x in name for x in ['公园','广场','步行街','美食街','博物馆','商业街','海洋']):
                    continue
                result.append(t)
        
        selected.extend(result[:count])
    
    return selected

def convert_route(t, order, region):
    """转换为新数据结构"""
    diff = difficulty_level(t.get('difficulty', '中级'))
    distance = parse_distance(t.get('distance', ''))
    duration = parse_duration(t.get('distance', ''), distance, diff)
    
    return {
        "_id": f"route_{order:03d}",
        "name": t.get('name', ''),
        "description": make_description(t),
        "coverImage": "",
        "images": [],
        "difficulty": {
            "level": diff,
            "label": diff_label(diff),
            "suitableFor": suitable_for(diff)
        },
        "distance_km": distance,
        "duration_hours": duration,
        "elevation_gain_m": parse_elevation(t.get('features', []), t.get('description', '')),
        "cost": cost_obj(t.get('cost', '免费')),
        "scenery": gen_scenery(t.get('features', []), t.get('description', '')),
        "location": {
            "direction": region,
            "address": t.get('location', ''),
            "navAddress": f"导航搜索：{t.get('name', '')}",
            "publicTransport": t.get('traffic', '建议自驾前往')
        },
        "sections": gen_sections(distance, diff),
        "equipment": gen_equipment(diff, distance),
        "safety": gen_safety(diff, t.get('name', ''), t.get('location', '')),
        "order": order,
        "createdAt": "2026-03-29"
    }

def main():
    with open('trails_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"原始数据: {len(data)} 条路线")
    
    selected = select_trails(data)
    print(f"精选路线: {len(selected)} 条")
    
    # 统计各区域数量
    from collections import Counter
    region_count = Counter()
    for t in selected:
        r = classify_region(t.get('location', ''))
        region_count[r] += 1
    print("各区域分布:")
    for r, c in region_count.most_common():
        print(f"  {r}: {c}")
    
    # 统计费用
    free_count = sum(1 for t in selected if '免费' in str(t.get('cost', '')))
    print(f"免费: {free_count}, 收费: {len(selected) - free_count}")
    
    # 转换为新数据结构
    routes = []
    order = 1
    for t in selected:
        region = classify_region(t.get('location', ''))
        route = convert_route(t, order, region)
        routes.append(route)
        order += 1
    
    # 写入文件
    with open('data/routes.json', 'w', encoding='utf-8') as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已生成 data/routes.json ({len(routes)} 条路线)")
    
    # 输出部分路线信息供检查
    print("\n前10条路线预览:")
    for r in routes[:10]:
        print(f"  {r['order']}. [{r['location']['direction']}] {r['name']} - 难度{r['difficulty']['level']} - {r['distance_km']}km - {r['cost']['type']}")

if __name__ == '__main__':
    main()
