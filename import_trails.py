#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 routes.md 徒步路线数据，生成 trails_data.json
用于导入微信小程序云数据库
"""

import json
import re
import sys
from pathlib import Path

# 输入输出路径
ROUTES_MD = Path(__file__).parent.parent / "skills" / "hiking-trails-guanzhong" / "references" / "routes.md"
OUTPUT_JSON = Path(__file__).parent / "trails_data.json"


def parse_routes_md(md_path):
    """解析 routes.md 文件，返回路线数据列表"""
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 统一换行符
    content = content.replace('\r\n', '\n').replace('\r', '\n')

    # 关键：在每个 - ** 前插入换行（如果前面不是换行）
    # 这样每个字段独占一行，方便解析
    content = re.sub(r'([^\n])- \*\*', r'\1\n- **', content)

    # 按 ### 分割（不管前面有没有换行）
    parts = re.split(r'### ', content)

    trails = []
    for part in parts:
        # 必须包含位置字段才是有效路线
        if '位置' not in part and '**位置**' not in part:
            continue
        trail = parse_single_route(part)
        if trail and trail.get("name"):
            trails.append(trail)

    return trails


def parse_single_route(raw):
    """解析单条路线数据"""
    lines = raw.strip().split("\n")
    if not lines:
        return None

    # 提取路线名称（第一行），去掉星星评分
    name_line = lines[0].strip()
    name = re.sub(r'[⭐🌟★☆\s]+$', '', name_line).strip()
    name = re.sub(r'\*\*(.+?)\*\*', r'\1', name).strip()
    # 去掉可能的 Markdown 标题标记
    name = re.sub(r'^#+\s*', '', name).strip()
    # 去掉可能的 "详细攻略" 等非路线名称
    if name in ('详细攻略', '目录', '', '名山攀登', '长城徒步', '川西徒步', '云南徒步',
                '四川徒步', '西北徒步', '华南徒步', '华东徒步', '东北徒步',
                '西安周边徒步', '西安周边亲子徒步路线', '西安更多峪口亲子路线',
                '宝鸡周边亲子徒步', '咸阳周边亲子徒步', '渭南周边亲子徒步',
                '汉中周边亲子徒步', '安康周边亲子徒步', '商洛周边亲子徒步',
                '延安·榆林·铜川亲子徒步', '2026年3月新增徒步路线'):
        return None
    if not name:
        return None

    trail = {
        "name": name,
        "location": "",
        "difficulty": "初级",
        "scenery": 3.0,
        "distance": "",
        "features": [],
        "best_season": [],
        "cost": "",
        "description": "",
        "traffic": "",
        "safety_tips": [],
        "eco_tips": ["带走垃圾", "不破坏植被", "不采摘花草"],
        "law_tips": ["遵守景区规定", "注意防火安全"],
        "likes_count": 0,
        "favorites_count": 0,
        "comments_count": 0,
        "view_count": 0,
        "family_friendly": False,
        "created_at": "2026-03-26T15:30:00Z"
    }

    full_text = "\n".join(lines)

    # 位置 - 支持多种格式
    m = re.search(r'\*\*位置\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'位置[：:]\s*(.+)', full_text)
    if m:
        trail["location"] = m.group(1).strip().split('\n')[0]

    # 难度
    m = re.search(r'\*\*难度\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'难度[：:]\s*(.+)', full_text)
    if m:
        trail["difficulty"] = normalize_difficulty(m.group(1).strip().split('\n')[0])

    # 风景评分
    m = re.search(r'\*\*风景评分?\*\*[：:]\s*([\d.]+)', full_text)
    if not m:
        m = re.search(r'风景[：:]\s*([\d.]+)', full_text)
    if m:
        try:
            trail["scenery"] = float(m.group(1))
        except ValueError:
            pass

    # 距离/全程
    m = re.search(r'\*\*全程\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'距离[：:]\s*(.+)', full_text)
    if m:
        trail["distance"] = m.group(1).strip().split('\n')[0]

    # 景色特点
    m = re.search(r'\*\*景色特点\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'景色特点[：:]\s*(.+)', full_text)
    if m:
        trail["features"] = [f.strip() for f in re.split(r'[,，、]', m.group(1).strip().split('\n')[0]) if f.strip()]

    # 最佳季节
    m = re.search(r'\*\*最佳季节\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'最佳季节[：:]\s*(.+)', full_text)
    if m:
        trail["best_season"] = parse_seasons(m.group(1).strip().split('\n')[0])

    # 费用
    m = re.search(r'\*\*费用参考?\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'费用[：:]\s*(.+)', full_text)
    if m:
        trail["cost"] = m.group(1).strip().split('\n')[0]

    # 路线亮点 / 描述
    m = re.search(r'\*\*路线亮点\*\*[：:]\s*(.+)', full_text)
    if m:
        trail["description"] = m.group(1).strip().split('\n')[0]

    # 如果没有路线亮点，尝试从经典线路提取
    if not trail["description"]:
        m = re.search(r'\*\*经典线路\*\*[：:]\s*(.+)', full_text)
        if m:
            trail["description"] = m.group(1).strip().split('\n')[0]

    # 交通
    m = re.search(r'- 交通[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'\*\*交通\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'\*\*交通方式\*\*[：:]\s*(.+)', full_text)
    if m:
        trail["traffic"] = m.group(1).strip().split('\n')[0]

    # 安全提示
    m = re.search(r'\*\*安全提示\*\*[：:]\s*(.+)', full_text)
    if not m:
        m = re.search(r'安全提示[：:]\s*(.+)', full_text)
    if m:
        safety_text = m.group(1).strip().split('\n')[0]
        trail["safety_tips"] = [s.strip() for s in re.split(r'[；;。]', safety_text) if s.strip()]

    # 亲子指数 - 判断是否适合家庭
    m = re.search(r'亲子指数[：:]\s*[（(]?\s*(\d)', full_text)
    if not m:
        m = re.search(r'亲子[：:]\s*[（(]?\s*(\d)', full_text)
    if m:
        trail["family_friendly"] = int(m.group(1)) >= 3

    return trail


def normalize_difficulty(diff):
    """标准化难度级别"""
    diff = diff.strip()
    if re.search(r'专业', diff):
        if '初' in diff or '中' in diff:
            return '中级-高级'
        return '高级'
    if re.search(r'高级', diff):
        if '初' in diff or '中' in diff:
            return '中级-高级'
        return '高级'
    if re.search(r'中[级级]', diff):
        if '初' in diff:
            return '初级-中级'
        return '中级'
    if re.search(r'初[级级]', diff):
        if '中' in diff:
            return '初级-中级'
        return '初级'
    return diff if diff else '初级'


def parse_seasons(text):
    """解析最佳季节"""
    seasons = []
    for match in re.finditer(r'(春季|夏季|秋季|冬季|春|夏|秋|冬)', text):
        s = match.group(1)
        mapped = {'春': '春季', '夏': '夏季', '秋': '秋季', '冬': '冬季'}.get(s, s)
        if mapped not in seasons:
            seasons.append(mapped)
    return seasons if seasons else ['春季', '夏季', '秋季', '冬季']


def main():
    md_path = ROUTES_MD
    if not md_path.exists():
        print(f"错误：找不到文件 {md_path}")
        sys.exit(1)

    print(f"读取文件：{md_path}")
    trails = parse_routes_md(md_path)
    print(f"解析完成，共 {len(trails)} 条路线")

    # 验证数据
    valid_trails = []
    for i, trail in enumerate(trails):
        if trail.get("name") and trail.get("location"):
            valid_trails.append(trail)
        else:
            print(f"  警告：第 {i+1} 条路线缺少名称或位置，已跳过: name={trail.get('name')}, location={trail.get('location')}")

    print(f"有效路线：{len(valid_trails)} 条")

    # 写入 JSON
    output_path = OUTPUT_JSON
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(valid_trails, f, ensure_ascii=False, indent=2)

    print(f"数据已导出到：{output_path}")

    # 统计信息
    difficulties = {}
    for t in valid_trails:
        d = t["difficulty"]
        difficulties[d] = difficulties.get(d, 0) + 1
    print("\n难度分布：")
    for d, count in sorted(difficulties.items(), key=lambda x: -x[1]):
        print(f"  {d}: {count} 条")

    family_count = sum(1 for t in valid_trails if t["family_friendly"])
    print(f"\n适合亲子：{family_count} 条")


if __name__ == "__main__":
    main()
