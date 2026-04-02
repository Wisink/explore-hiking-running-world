#!/usr/bin/env python3
"""
秦人户外小程序 - 本地数据同步到云端
用法:
  python3 sync_to_cloud.py --type articles    # 同步文章
  python3 sync_to_cloud.py --type routes      # 同步路线
  python3 sync_to_cloud.py --type highlights  # 同步路线亮点文案
  python3 sync_to_cloud.py --type articles --dry-run  # 预览，不执行
"""

import json
import sys
import os
import argparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 本地数据文件路径
DATA_FILES = {
    'articles': os.path.join(BASE_DIR, 'miniprogram/data/articles.json'),
    'routes': os.path.join(BASE_DIR, 'data/routes.json'),
}

# 对应的云函数 action
CLOUD_ACTIONS = {
    'articles': 'import-articles',
    'routes': 'import-routes',
    'highlights': 'update-routes',
}


def load_articles():
    """读取本地文章数据，转为JSON数组"""
    with open(DATA_FILES['articles'], 'r', encoding='utf-8') as f:
        return json.load(f)


def load_routes():
    """读取本地路线数据"""
    with open(DATA_FILES['routes'], 'r', encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return data.get('data', data.get('routes', []))


def load_highlights():
    """从trails_data.json读取highlights字段"""
    path = os.path.join(BASE_DIR, 'data/trails_data.json')
    with open(path, 'r', encoding='utf-8') as f:
        trails = json.load(f)
    items = []
    for t in trails:
        if t.get('highlights'):
            items.append({
                '_id': t['_id'],
                'highlights': t['highlights']
            })
    return items


def generate_cloud_script(data, action, collection):
    """生成云函数调用脚本，供用户在微信开发者工具中执行"""
    # 分批：每次最多20条
    BATCH_SIZE = 20
    batches = [data[i:i+BATCH_SIZE] for i in range(0, len(data), BATCH_SIZE)]
    
    script_lines = [
        '// ===== 在微信开发者工具的云函数日志中执行 =====',
        '// 1. 先在云开发控制台部署 import-data 云函数',
        '// 2. 打开云开发 → 云函数 → import-data → 测试',
        '// 3. 将下面的JSON粘贴到测试参数中：',
        '',
        '// --- 测试参数 ---',
    ]
    
    if action == 'update-routes':
        script_lines.append(json.dumps({
            'action': action,
            'data': data
        }, ensure_ascii=False, indent=2))
    else:
        # 需要分批调用
        script_lines.append(f'// 需要分{len(batches)}批调用，每批最多20条')
        script_lines.append('')
        for i, batch in enumerate(batches):
            script_lines.append(f'// --- 第{i+1}批 ({len(batch)}条) ---')
            script_lines.append(json.dumps({
                'action': action,
                'data': batch
            }, ensure_ascii=False, indent=2))
            script_lines.append('')
    
    return '\n'.join(script_lines)


def main():
    parser = argparse.ArgumentParser(description='同步本地数据到云端')
    parser.add_argument('--type', required=True, choices=['articles', 'routes', 'highlights'],
                        help='数据类型')
    parser.add_argument('--dry-run', action='store_true', help='预览模式，不执行')
    args = parser.parse_args()

    # 加载数据
    loaders = {
        'articles': load_articles,
        'routes': load_routes,
        'highlights': load_highlights,
    }
    data = loaders[args.type]()
    action = CLOUD_ACTIONS[args.type]
    
    print(f'📦 {args.type}: {len(data)}条数据')
    print(f'🎯 云函数action: {action}')
    
    if args.dry_run:
        print('\n--- 预览前5条 ---')
        for item in data[:5]:
            if args.type == 'articles':
                print(f"  [{item.get('category','')}] {item.get('title','')}")
            elif args.type == 'routes':
                print(f"  [{item.get('_id','')}] {item.get('name','')}")
            elif args.type == 'highlights':
                print(f"  [{item['_id']}] {item.get('highlights','')[:50]}...")
        print(f'\n共 {len(data)} 条，需 {len(data) // 20 + 1} 批调用')
        return
    
    # 生成测试参数
    script = generate_cloud_script(data, action, args.type)
    
    # 保存到文件
    out_path = os.path.join(BASE_DIR, f'data/sync_{args.type}_params.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(script)
    
    print(f'\n✅ 测试参数已生成: {out_path}')
    print(f'\n📋 操作步骤:')
    print(f'  1. 微信开发者工具 → 云开发 → 云函数 → import-data')
    print(f'  2. 上传并部署（云端安装依赖）')
    print(f'  3. 点击「测试」，将 {out_path} 中的JSON粘贴到测试参数')
    print(f'  4. 点击「运行测试」')
    print(f'  5. 重复直到所有批次完成')
    
    if args.type == 'articles':
        print(f'\n💡 文章同步：会先清空旧数据再导入，不用担心重复')


if __name__ == '__main__':
    main()
