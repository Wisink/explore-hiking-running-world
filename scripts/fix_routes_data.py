#!/usr/bin/env python3
"""
秦人户外路线数据修复脚本
========================
数据来源: database_export 文件
验证方法: Tavily 搜索 + 人工分析
运行后输出每条需要修改的路线及其建议修改值。
验证日期: 2026-04-03

用法:
  python3 fix_routes_data.py                      # 输出完整报告
  python3 fix_routes_data.py --category cost      # 只看费用相关
  python3 fix_routes_data.py --route route_002    # 只看某条路线
"""

import json, sys

DATA_FILE = (
    "/Users/wangweixin/.openclaw/media/inbound/"
    "database_export-JuJ10CesNTfX---ddd30db0-614d-4bb7-b486-df2115e6278e"
)

def load_routes(path):
    routes = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    routes.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return [r for r in routes if r.get("_id","").startswith("route_") and r.get("isActive", False)]


def get_nested(obj, dotpath):
    keys = dotpath.split(".")
    val = obj
    for key in keys:
        if isinstance(val, dict):
            val = val.get(key)
        else:
            return None
    return val


# =============================================================================
# 所有修改建议
# (route_id, route_name, field, current, suggested, reason, search_ref, category, priority)
# categories: elevation / cost / distance / duration / season / direction / difficulty
# =============================================================================
FIXES = [

    # ───── ELEVATION ─────────────────────────────────────────────────────
    ("route_001","临潼骊山最美环山公路骑行徒步","elevation_gain_m",300,"待核实(约600-800)","骊山环山公路15km盘山路，骊山海拔900-1300m，爬升不止300m","","elevation"),
    ("route_002","刘家山草甸（蓝田县玉山镇）","elevation_gain_m",300,600,"搜索:刘家山草甸累计拔高600米","抖音:全程约10公里,累计拔高600米","elevation"),
    ("route_003","武帝山穿越梁山","elevation_gain_m",300,570,"搜索:武帝山穿梁山累计拔高570米","抖音:全长11公里,累计拔高570米","elevation"),
    ("route_004","华阳草甸","elevation_gain_m",300,750,"搜索:华阳草甸累计拔高750米","抖音:华阳草甸10km,爬升750米","elevation"),
    ("route_005","蓝关古道","elevation_gain_m",300,"待核实(约400)","蓝关古道13km,爬升需核实","Trip.com:全程徒步13公里","elevation"),
    ("route_006","王顺山（蓝田县）","elevation_gain_m",2339,"待核实(约800)","2339是海拔高度(应为2239),不是爬升。4A景区有步道爬升约600-900m","搜索:主峰海拔2239米","elevation"),
    ("route_007","三凤山桃花谷","elevation_gain_m",300,780,"搜索:三凤山穿越拔高约780米","hwgogo.com:穿越约9公里,拔高约780米","elevation"),
    ("route_008","黑沟瀑布（蓝田县）","elevation_gain_m",300,"待核实","瀑布路线爬升不确定,300大概率默认值","","elevation"),
    ("route_009","临潼骊山烽火台","elevation_gain_m",300,"待核实","骊山有索道,实际爬升待核实","携程:骊山索道旺季60元","elevation"),
    ("route_010","韩城司马迁祠","elevation_gain_m",300,50,"陵园景区参观性质,几乎无爬升","","elevation"),
    ("route_011","合阳洽川","elevation_gain_m",300,0,"黄河湿地平原,步道无海拔变化","","elevation"),
    ("route_012","蓝田水陆庵壁塑","elevation_gain_m",300,0,"寺庙参观,无爬山","","elevation"),
    ("route_013","塔坪红叶（渭南华州区）","elevation_gain_m",300,700,"搜索:塔坪爬升约700米","8264.com:13公里,爬升约700米","elevation"),
    ("route_014","葛牌古镇蓝关古道","elevation_gain_m",300,500,"搜索:葛牌镇10公里爬升约500米","冰岩户外:爬升约500米","elevation"),
    ("route_015","蓝桥悟真寺","elevation_gain_m",300,"待核实","6km/5h太慢,需核实","豆瓣:单程4公里/2h","elevation"),
    ("route_016","汉阳陵银杏林","elevation_gain_m",300,0,"平陵参观,平地步行无爬升","","elevation"),
    ("route_017","淳化仲山","elevation_gain_m",1600,500,"1600是海拔高度非爬升","抖音:北仲山2公里爬升300米","elevation"),
    ("route_030","莲花洞（大峪）","elevation_gain_m",3,"待核实","3m爬升几乎为零,明显错误","","elevation"),
    ("route_033","天子峪西岭","elevation_gain_m",3,"待核实","3m不合理","","elevation"),
    ("route_046","鸡窝子高山草甸精华线","elevation_gain_m",1800,"约1000-1200","搜索:穿越光头山爬升1000-1200m","搜狐:徒步15-20公里,爬升约1000-1200米","elevation"),
    ("route_050","长安区高冠瀑布环线","elevation_gain_m",20,"待核实(约100)","20m爬升过低","","elevation"),
    ("route_084","丹凤凤冠山","elevation_gain_m",861,400,"861m是海拔高度非爬升","","elevation"),
    ("route_098","正阳大草甸","elevation_gain_m",2500,500,"2500是海拔非爬升,徒步爬升约300-500m","抖音:正阳大草甸海拔2500米","elevation"),
    ("route_100","留坝闸口石狮子沟徒步","elevation_gain_m",1700,"待核实","8km路线不太可能爬升1700m","","elevation"),

    # ───── COST ──────────────────────────────────────────────────────────
    ("route_009","临潼骊山烽火台","cost.type","免费","收费","骊山门票含在华清宫120元/80元,索道60元","携程:华清宫旺季120元","cost"),
    ("route_010","韩城司马迁祠","cost.type","免费","收费","搜索:门票80元","Tripadvisor:80元","cost"),
    ("route_010","韩城司马迁祠","cost.amount",0,80,"门票约80元","","cost"),
    ("route_012","蓝田水陆庵壁塑","cost.type","免费","应核实","水陆庵可能收取门票","","cost"),
    ("route_016","汉阳陵银杏林","cost.type","免费","收费","汉阳陵门票90元,银杏林不单独售票","西安本地宝:需遗址公园门票90元","cost"),
    ("route_020","咸阳五陵塬汉唐帝陵徒步","cost.type","免费","部分收费","帝陵外围免费,部分景区收费(乾陵103/汉阳陵90)","携程:乾陵103元,汉阳陵约90元","cost"),
    ("route_023","铜川照金薛家寨丹霞","cost.type","免费","收费","note已写薛家寨景区开放但实际收费","Trip.com:薛家寨有门票","cost"),
    ("route_024","铜川照金丹霞","cost.type","免费","收费","薛家寨门票约40元","Trip.com:薛家寨40元","cost"),
    ("route_026","高冠瀑布步道","cost.type","免费","收费","高冠瀑布门票20元/人","抖音:门票20元","cost"),
    ("route_045","太乙峪登天池","cost.type","免费","部分收费","走野路免费,正规入口65元,自驾上山25元","搜索:翠华山门票65元","cost"),
    ("route_050","长安区高冠瀑布环线","cost.type","免费","收费","高冠瀑布门票20元/人","","cost"),
    ("route_057","眉县汤峪温泉古道环线","cost.note","温泉100-200元，古道","古道徒步免费,泡温泉100-200元/人(可选)","","","cost"),
    ("route_076","黄柏塬","cost.type","免费","收费","黄柏塬风景区有门票","大河票务网:有门票","cost"),
    ("route_077","关山草原","cost.type","免费","收费","关山草原门票60元/人","知乎:门票60元","cost"),
    ("route_089","麟游九成宫","cost.type","免费","应核实","国家级文物保护单位,可能收费","","cost"),
    ("route_095","麟游九成宫遗址","cost.type","免费","应核实","同上","","cost"),

    # ───── DISTANCE ──────────────────────────────────────────────────────
    ("route_002","刘家山草甸","distance_km",5,10,"搜索:往返约8-10km","抖音:全程往返9公里","distance"),
    ("route_004","华阳草甸","distance_km",6,10,"搜索:华阳草甸全程10km","","distance"),
    ("route_005","蓝关古道","distance_km",6,13,"搜索:全程13km","Trip.com:全程徒步13公里","distance"),
    ("route_007","三凤山桃花谷","distance_km",8,9,"搜索:穿越全程约9km","hwgogo.com:穿越全程约9公里","distance"),
    ("route_013","塔坪红叶","distance_km",7,11,"搜索:全程11公里","2bulu.com:全程11公里","distance"),
    ("route_098","正阳大草甸","distance_km",21,10,"搜索:往返约9-10km","抖音:全程往返约9-10公里","distance"),

    # ───── DURATION ──────────────────────────────────────────────────────
    ("route_002","刘家山草甸","duration_hours",5,4,"10km/4h=2.5km/h合理,5h偏长","","duration"),
    ("route_004","华阳草甸","duration_hours",4,5,"10km+爬升750m约需5-6h","","duration"),
    ("route_005","蓝关古道","duration_hours",4,5,"13km古道约需5h","","duration"),
    ("route_015","蓝桥悟真寺","duration_hours",5,3,"6km/5h=1.2km/h太慢","豆瓣:单程4km/2h","duration"),
    ("route_050","长安区高冠瀑布环线","duration_hours",5,3,"5km/5h=1km/h过于缓慢,2-3h合理","","duration"),
    ("route_055","周至黑河源","duration_hours",5,3,"6km/5h=1.2km/h偏慢,溪谷步道约3h","","duration"),
    ("route_094","凤翔东湖步道","duration_hours",5,2,"3km/5h=0.6km/h极度不合理,城市公园1-2h","","duration"),

    # ───── SEASON ────────────────────────────────────────────────────────
    ("route_043","乌桑峪天生桥","best_season","春,秋","春、秋","逗号分隔不统一,建议改用顿号","","season"),
    ("route_054","赤峪红叶谷","best_season","夏,秋","秋","红叶谷最佳季节是秋季","","season"),
    ("route_082","丹凤桃花谷","best_season","夏,春","春","桃花在3-4月,夏季无桃花","","season"),
    ("route_046","鸡窝子高山草甸精华线","best_season","春","夏、秋","高山草甸春季草未绿,最佳夏秋","","season"),
    ("route_077","关山草原","best_season","全年","夏、秋","高山草原冬季积雪","","season"),
    ("route_098","正阳大草甸","best_season","全年","夏、秋","高山草甸冬季积雪封路","","season"),
    ("route_100","留坝闸口石狮子沟徒步","best_season","全年","夏、秋","高山草甸冬季有积雪","","season"),

    # ───── DIRECTION ─────────────────────────────────────────────────────
    ("route_078","棣花古镇（丹凤县）","location.direction","秦岭西线","秦岭东线","丹凤县在商洛,属秦岭东南方向","","direction"),
    ("route_082","丹凤桃花谷","location.direction","秦岭西线","秦岭东线","丹凤县在商洛","","direction"),
    ("route_084","丹凤凤冠山","location.direction","秦岭西线","秦岭东线","丹凤县在商洛","","direction"),
    ("route_085","丹凤商山","location.direction","秦岭西线","秦岭东线","丹凤县在商洛","","direction"),

    # ───── DIFFICULTY ────────────────────────────────────────────────────
    ("route_006","王顺山（蓝田县）","difficulty.level",2,1,"4A景区有完善步道和缆车","","difficulty"),
    ("route_046","鸡窝子高山草甸精华线","difficulty.level",2,3,"爬升1000-1200m,难度偏高,应提升","","difficulty"),
]


# =============================================================================
# 报告输出
# =============================================================================

def print_report(fixes, category=None, route_id=None):
    categories = ["elevation","cost","distance","duration","season","direction","difficulty"]
    cat_labels = {
        "elevation": "elevation_gain_m 爬升高度异常",
        "cost": "cost 费用信息错误",
        "distance": "distance_km 距离不符",
        "duration": "duration_hours 时间不合理",
        "season": "best_season 季节格式/用词",
        "direction": "location.direction 方向分类错误",
        "difficulty": "difficulty.level 难度不匹配",
    }

    count = 0
    for cat in categories:
        cat_fixes = [f for f in fixes if f[7] == cat]
        if category and category != cat:
            continue
        if route_id:
            cat_fixes = [f for f in cat_fixes if f[0] == route_id]
        if not cat_fixes:
            continue

        print(f"\n{'='*70}")
        print(f"  【{cat_labels.get(cat, cat)}】共 {len(cat_fixes)} 条")
        print(f"{'='*70}")

        for f in cat_fixes:
            count += 1
            rid = f[0]
            name = f[1]
            field = f[2]
            cur = f[3]
            sug = f[4]
            reason = f[5]
            ref = f[6]
            cur_str = json.dumps(cur, ensure_ascii=False)
            sug_str = json.dumps(sug, ensure_ascii=False)
            print(f"\n  [{count}] {rid}: {name}")
            print(f"      字段    : {field}")
            print(f"      当前值  : {cur_str}")
            print(f"      建议值  : {sug_str}")
            print(f"      原因    : {reason}")
            if ref:
                print(f"      搜索依据: {ref}")

    print(f"\n{'='*70}")
    print(f"  总计: {count} 条修改建议")
    print(f"{'='*70}")


def main():
    category = None
    route_id = None
    i = 0
    while i < len(sys.argv[1:]):
        a = sys.argv[1:][i]
        if a == "--category" and i+1 < len(sys.argv[1:]):
            category = sys.argv[1:][i+1]
            i += 2
        elif a == "--route" and i+1 < len(sys.argv[1:]):
            route_id = sys.argv[1:][i+1]
            i += 2
        else:
            i += 1

    routes = load_routes(DATA_FILE)
    print(f"已加载 {len(routes)} 条活跃路线")
    print(f"共 {len(FIXES)} 条修改建议\n")

    print_report(FIXES, category, route_id)


if __name__ == "__main__":
    main()
