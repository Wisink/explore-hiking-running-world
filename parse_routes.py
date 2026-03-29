#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 routes.md，提取路线信息并输出 JSON Lines 格式
"""
import re
import json
import sys

def read_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def parse_routes(md_content):
    """解析 markdown 中的所有路线"""
    # 先按 ### 分割每个路由块
    # 处理 ### ### 路线名（双标题）的特殊情况
    md_content = re.sub(r'###\s+###\s+', '### ', md_content)
    # 确保 ### 前面有换行（处理嵌在一行中的情况，如 ## 名山攀登### 华山）
    # 只在非#字符后面插入换行
    md_content = re.sub(r'([^#\n])###\s+', r'\1\n### ', md_content)
    sections = re.split(r'\n###\s+', md_content)
    
    trails = []
    for section in sections:
        if not section.strip():
            continue
        # 跳过目录等非路线内容
        if section.startswith('#') or section.startswith('目'):
            continue
        
        trail = parse_single_route(section)
        if trail and trail.get('name'):
            trails.append(trail)
    
    return trails

def extract_field(text, field_name, default=''):
    """从文本中提取指定字段的值"""
    # 匹配多种格式：- **字段**：值 或 - **字段**: 值
    patterns = [
        rf'\*\*{re.escape(field_name)}\*\*[：:]\s*(.+)',
        rf'{re.escape(field_name)}[：:]\s*(.+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            # 去掉可能的 markdown 标记
            value = re.sub(r'\*\*', '', value)
            # 去掉行尾的链接标记
            value = re.sub(r'\[.*?\]\(.*?\)', '', value)
            return value.strip()
    return default

def extract_detail_field(block, field_name, default=''):
    """从详细攻略部分提取字段（如 交通：xxx）"""
    patterns = [
        rf'^[-*]\s*{re.escape(field_name)}[：:]\s*(.+)',
        rf'^{re.escape(field_name)}[：:]\s*(.+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, block, re.MULTILINE)
        if match:
            value = match.group(1).strip()
            value = re.sub(r'\*\*', '', value)
            return value.strip()
    return default

def parse_array_field(value):
    """将逗号/顿号分隔的字符串转为数组"""
    if not value:
        return []
    # 按顿号、逗号、分号分割
    items = re.split(r'[,，、；;]', value)
    return [item.strip() for item in items if item.strip()]

def parse_family_index(text):
    """提取亲子指数，如 (4/5星) 或 （3/5星）"""
    match = re.search(r'[（(](\d+)/5\s*星?[）)]', text)
    if match:
        return int(match.group(1))
    # 尝试其他格式
    match = re.search(r'亲子指数[：:]\s*[（(]?(\d+)/5', text)
    if match:
        return int(match.group(1))
    return None

def parse_suitable_age(text):
    """提取适合年龄"""
    match = re.search(r'适合年龄[：:]\s*(.+?)(?:\n|$|[|｜])', text)
    if match:
        return match.group(1).strip()
    return ''

def extract_between(text, start_marker, end_markers=None):
    """提取两个标记之间的内容"""
    if end_markers is None:
        end_markers = [r'\n###', r'\n##']
    
    idx = text.find(start_marker)
    if idx == -1:
        return ''
    
    content = text[idx + len(start_marker):]
    
    # 找到最早出现的结束标记
    min_end = len(content)
    for marker in end_markers:
        # 对于正则模式
        match = re.search(marker, content)
        if match and match.start() < min_end:
            min_end = match.start()
    
    return content[:min_end].strip()

def parse_single_route(section):
    """解析单条路线"""
    # 预处理：如果内容是单行的（所有字段在一行），将 `- **字段**` 前面插入换行
    # 处理类似 `- **位置**：xxx- **难度**：xxx` 的情况
    section = re.sub(r'(-\s*\*\*)', r'\n\1', section)
    # 也处理无 ** 标记的字段
    section = re.sub(r'(-\s+亲子指数)', r'\n\1', section)
    
    lines = section.strip().split('\n')
    if not lines:
        return None
    
    # 第一行是路线名称
    name_line = lines[0].strip()
    name = re.sub(r'^#+\s*', '', name_line).strip()
    # 去掉可能的锚点标记
    name = re.sub(r'\s*\{.*?\}', '', name).strip()
    # 去掉名字后面可能附带的字段（如 "华山- **位置**..."）
    name_match = re.match(r'^([^-*\n]+)', name)
    if name_match:
        name = name_match.group(1).strip()
    
    if not name or name in ['名山攀登', '长城徒步', '川西徒步', '云南徒步', '四川徒步', 
                             '西北徒步', '华南徒步', '华东徒步', '东北徒步', 
                             '西安周边徒步', '西安周边亲子徒步路线',
                             '西安更多峪口亲子路线', '宝鸡周边亲子徒步',
                             '咸阳周边亲子徒步', '渭南周边亲子徒步',
                             '汉中周边亲子徒步', '安康周边亲子徒步',
                             '商洛周边亲子徒步', '延安·榆林·铜川亲子徒步',
                             '2026年3月新增徒步路线']:
        return None
    
    full_text = section
    
    # 提取基础字段
    location = extract_field(full_text, '位置')
    difficulty = extract_field(full_text, '难度')
    scenery_str = extract_field(full_text, '风景评分')
    
    # 风景评分转为数字
    scenery = 0
    if scenery_str:
        match = re.search(r'(\d+\.?\d*)/5', scenery_str)
        if match:
            scenery = float(match.group(1))
        else:
            match = re.search(r'(\d+\.?\d*)', scenery_str)
            if match:
                scenery = float(match.group(1))
    
    # 全程信息
    full_distance = extract_field(full_text, '全程')
    distance = ''
    duration = ''
    if full_distance:
        # 尝试分离距离和时间
        parts = re.split(r'[/／]', full_distance)
        if len(parts) >= 2:
            distance = parts[0].strip()
            duration = parts[1].strip()
        else:
            distance = full_distance
            duration = full_distance
    
    # 提取爬升信息
    climb_str = extract_field(full_text, '爬升')
    
    # 最佳季节
    best_season_str = extract_field(full_text, '最佳季节')
    best_season = parse_array_field(best_season_str)
    
    # 费用参考
    cost = extract_field(full_text, '费用参考')
    
    # 路线亮点
    description = extract_field(full_text, '路线亮点')
    
    # 景色特点
    features_str = extract_field(full_text, '景色特点')
    features = parse_array_field(features_str)
    
    # 经典线路
    classic_route = extract_field(full_text, '经典线路')
    
    # 安全提示
    safety_str = extract_field(full_text, '安全提示')
    safety_tips = []
    if safety_str:
        safety_tips = [safety_str]
    
    # === 详细攻略部分 ===
    detail_section = ''
    detail_match = re.search(r'\*\*详细攻略\*\*[：:]?\s*\n(.*?)(?=\n###|\n##\s|\Z)', full_text, re.DOTALL)
    if detail_match:
        detail_section = detail_match.group(1)
    
    # 亲子指数和适合年龄
    family_index = None
    suitable_age = ''
    family_friendly = False
    
    # 从整个文本中搜索亲子相关信息
    family_match = re.search(r'亲子指数[：:]\s*[（(]?(\d+)/5\s*星?[）)]?\s*[|｜]?\s*适合年龄[：:]\s*(.+?)(?:\n|$)', full_text)
    if family_match:
        family_index = int(family_match.group(1))
        suitable_age = family_match.group(2).strip()
        # 去掉可能的括号说明
        suitable_age = re.sub(r'（.*?）', '', suitable_age).strip()
        suitable_age = re.sub(r'\(.*?\)', '', suitable_age).strip()
    else:
        # 单独尝试
        family_index = parse_family_index(full_text)
        suitable_age = parse_suitable_age(full_text)
    
    # 亲子友好判断（3星及以上）
    if family_index and family_index >= 3:
        family_friendly = True
    
    # 从详细攻略中提取子字段
    traffic = extract_detail_field(detail_section, '交通') or extract_field(full_text, '交通方式')
    ticket_info = extract_detail_field(detail_section, '门票') or cost
    best_time = extract_detail_field(detail_section, '最佳时间')
    route_detail = extract_detail_field(detail_section, '路线')
    checkpoints = extract_detail_field(detail_section, '打卡点')
    food = extract_detail_field(detail_section, '餐饮')
    pitfall = extract_detail_field(detail_section, '避坑提示')
    tips = extract_detail_field(detail_section, '小贴士')
    
    # 处理交通方式（可能有专门的交通方式字段）
    if not traffic:
        traffic = extract_field(full_text, '交通方式')
    
    # highlights
    highlights = description or checkpoints
    
    # 构建数据
    trail = {
        'name': name,
        'location': location,
        'difficulty': difficulty,
        'scenery': scenery,
        'distance': distance,
        'duration': duration,
        'features': features,
        'best_season': best_season,
        'cost': cost,
        'description': description,
        'traffic': traffic,
        'safety_tips': safety_tips,
        'eco_tips': '请勿乱扔垃圾，保护自然环境；不采摘植物，不惊扰野生动物',
        'law_tips': '遵守景区规定，禁止野外用火；保护区内禁止捕猎',
        'family_friendly': family_friendly,
        'family_index': family_index,
        'suitable_age': suitable_age,
        'highlights': highlights,
        'classic_route': classic_route,
        'ticket_info': ticket_info,
        'best_time': best_time,
        'route_detail': route_detail,
        'checkpoints': checkpoints,
        'food': food,
        'pitfall': pitfall,
        'tips': tips,
    }
    
    return trail

def main():
    input_file = '/Users/wangweixin/.openclaw/workspace-life-assistant/skills/hiking-trails-guanzhong/references/routes.md'
    output_file = '/Users/wangweixin/.openclaw/workspace-life-assistant/qinren-outdoor/trails_data_jsonl.json'
    
    # 读取文件
    content = read_file(input_file)
    
    # 解析路线
    trails = parse_routes(content)
    
    # 去重（按名称）
    seen = set()
    unique_trails = []
    for trail in trails:
        if trail['name'] not in seen:
            seen.add(trail['name'])
            unique_trails.append(trail)
    
    # 写入 JSON Lines
    with open(output_file, 'w', encoding='utf-8') as f:
        for trail in unique_trails:
            f.write(json.dumps(trail, ensure_ascii=False) + '\n')
    
    # 统计
    total = len(unique_trails)
    has_location = sum(1 for t in unique_trails if t['location'])
    has_difficulty = sum(1 for t in unique_trails if t['difficulty'])
    has_scenery = sum(1 for t in unique_trails if t['scenery'])
    has_distance = sum(1 for t in unique_trails if t['distance'])
    has_duration = sum(1 for t in unique_trails if t['duration'])
    has_features = sum(1 for t in unique_trails if t['features'])
    has_best_season = sum(1 for t in unique_trails if t['best_season'])
    has_cost = sum(1 for t in unique_trails if t['cost'])
    has_description = sum(1 for t in unique_trails if t['description'])
    has_traffic = sum(1 for t in unique_trails if t['traffic'])
    has_safety = sum(1 for t in unique_trails if t['safety_tips'])
    has_family_index = sum(1 for t in unique_trails if t['family_index'] is not None)
    has_classic_route = sum(1 for t in unique_trails if t['classic_route'])
    has_ticket_info = sum(1 for t in unique_trails if t['ticket_info'])
    has_best_time = sum(1 for t in unique_trails if t['best_time'])
    has_route_detail = sum(1 for t in unique_trails if t['route_detail'])
    has_checkpoints = sum(1 for t in unique_trails if t['checkpoints'])
    has_food = sum(1 for t in unique_trails if t['food'])
    has_pitfall = sum(1 for t in unique_trails if t['pitfall'])
    has_tips = sum(1 for t in unique_trails if t['tips'])
    family_friendly_count = sum(1 for t in unique_trails if t['family_friendly'])
    
    # 难度分布
    difficulty_dist = {}
    for t in unique_trails:
        d = t['difficulty'] or '未知'
        difficulty_dist[d] = difficulty_dist.get(d, 0) + 1
    
    print("=" * 60)
    print("📊 routes.md 解析统计报告")
    print("=" * 60)
    print(f"总路线数：{total}")
    print(f"\n📋 字段完整性：")
    print(f"  位置：{has_location}/{total} ({has_location*100//total if total else 0}%)")
    print(f"  难度：{has_difficulty}/{total} ({has_difficulty*100//total if total else 0}%)")
    print(f"  风景评分：{has_scenery}/{total} ({has_scenery*100//total if total else 0}%)")
    print(f"  全程距离：{has_distance}/{total} ({has_distance*100//total if total else 0}%)")
    print(f"  预计耗时：{has_duration}/{total} ({has_duration*100//total if total else 0}%)")
    print(f"  景色特点：{has_features}/{total} ({has_features*100//total if total else 0}%)")
    print(f"  最佳季节：{has_best_season}/{total} ({has_best_season*100//total if total else 0}%)")
    print(f"  费用参考：{has_cost}/{total} ({has_cost*100//total if total else 0}%)")
    print(f"  路线亮点：{has_description}/{total} ({has_description*100//total if total else 0}%)")
    print(f"  交通方式：{has_traffic}/{total} ({has_traffic*100//total if total else 0}%)")
    print(f"  安全提示：{has_safety}/{total} ({has_safety*100//total if total else 0}%)")
    print(f"  亲子指数：{has_family_index}/{total} ({has_family_index*100//total if total else 0}%)")
    print(f"  经典线路：{has_classic_route}/{total} ({has_classic_route*100//total if total else 0}%)")
    print(f"  门票信息：{has_ticket_info}/{total} ({has_ticket_info*100//total if total else 0}%)")
    print(f"  最佳时间：{has_best_time}/{total} ({has_best_time*100//total if total else 0}%)")
    print(f"  路线详情：{has_route_detail}/{total} ({has_route_detail*100//total if total else 0}%)")
    print(f"  打卡点：{has_checkpoints}/{total} ({has_checkpoints*100//total if total else 0}%)")
    print(f"  餐饮推荐：{has_food}/{total} ({has_food*100//total if total else 0}%)")
    print(f"  避坑提示：{has_pitfall}/{total} ({has_pitfall*100//total if total else 0}%)")
    print(f"  小贴士：{has_tips}/{total} ({has_tips*100//total if total else 0}%)")
    
    print(f"\n👨‍👩‍👧‍👦 亲子友好（3星以上）：{family_friendly_count}/{total}")
    
    print(f"\n⛰️ 难度分布：")
    for d, count in sorted(difficulty_dist.items()):
        print(f"  {d}：{count}")
    
    print(f"\n✅ 输出文件：{output_file}")
    print(f"   格式：JSON Lines（每行一个 JSON 对象）")

if __name__ == '__main__':
    main()
