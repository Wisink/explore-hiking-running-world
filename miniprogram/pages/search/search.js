// pages/search/search.js

// 模拟路线数据（云函数未部署时使用）
const MOCK_ROUTES = [
  { id: '1', name: '黄山云海日出', score: 5, difficulty: '中级', region: '华东', season: '春季', familyFriendly: false, cost: '100-300', tags: ['云海', '日出'], location: '安徽省黄山市', distance: 320, likes: 2156 },
  { id: '2', name: '武功山草甸穿越', score: 5, difficulty: '中级', region: '华东', season: '夏季', familyFriendly: false, cost: '100-300', tags: ['云海', '日出', '草原'], location: '江西省萍乡市', distance: 450, likes: 1823 },
  { id: '3', name: '庐山瀑布徒步', score: 4, difficulty: '初级', region: '华东', season: '夏季', familyFriendly: true, cost: '100-300', tags: ['瀑布', '竹林'], location: '江西省九江市', distance: 380, likes: 967 },
  { id: '4', name: '太行山挂壁公路', score: 4, difficulty: '中级', region: '华北', season: '秋季', familyFriendly: false, cost: '免费', tags: ['红叶', '峡谷'], location: '河南省辉县市', distance: 520, likes: 1345 },
  { id: '5', name: '张家界天门山', score: 5, difficulty: '初级', region: '华中', season: '秋季', familyFriendly: true, cost: '300+', tags: ['云海', '峡谷', '奇峰'], location: '湖南省张家界市', distance: 680, likes: 3021 },
  { id: '6', name: '漓江竹筏漂流', score: 4, difficulty: '初级', region: '华南', season: '春季', familyFriendly: true, cost: '100-300', tags: ['竹林', '溪流'], location: '广西桂林市', distance: 890, likes: 1567 },
  { id: '7', name: '稻城亚丁转山', score: 5, difficulty: '中级', region: '西南', season: '秋季', familyFriendly: false, cost: '300+', tags: ['雪山', '冰川', '红叶'], location: '四川省甘孜州', distance: 1200, likes: 2890 },
  { id: '8', name: '华山长空栈道', score: 4, difficulty: '中级', region: '西北', season: '夏季', familyFriendly: false, cost: '100-300', tags: ['日出', '奇峰'], location: '陕西省渭南市', distance: 120, likes: 2045 },
  { id: '9', name: '长白山天池', score: 5, difficulty: '初级', region: '东北', season: '夏季', familyFriendly: true, cost: '100-300', tags: ['瀑布', '冰川'], location: '吉林省延边州', distance: 1500, likes: 1876 },
  { id: '10', name: '秦岭太白山穿越', score: 4, difficulty: '中级', region: '西北', season: '秋季', familyFriendly: false, cost: '免费', tags: ['红叶', '云海', '溪流'], location: '陕西省宝鸡市', distance: 150, likes: 1234 },
  { id: '11', name: '莫干山竹海漫步', score: 3, difficulty: '初级', region: '华东', season: '春季', familyFriendly: true, cost: '100以内', tags: ['竹林', '溪流'], location: '浙江省湖州市', distance: 280, likes: 756 },
  { id: '12', name: '峨眉山金顶', score: 5, difficulty: '中级', region: '西南', season: '冬季', familyFriendly: false, cost: '100-300', tags: ['日出', '云海', '雪景'], location: '四川省乐山市', distance: 950, likes: 2345 },
  { id: '13', name: '壶口瀑布', score: 4, difficulty: '初级', region: '西北', season: '夏季', familyFriendly: true, cost: '免费', tags: ['瀑布'], location: '陕西省延安市', distance: 300, likes: 890 },
  { id: '14', name: '神农架探秘', score: 4, difficulty: '中级', region: '华中', season: '秋季', familyFriendly: false, cost: '100-300', tags: ['红叶', '溪流', '竹林'], location: '湖北省神农架', distance: 600, likes: 1123 },
  { id: '15', name: '香格里拉虎跳峡', score: 5, difficulty: '中级', region: '西南', season: '春季', familyFriendly: false, cost: '300+', tags: ['峡谷', '雪山', '冰川'], location: '云南省迪庆州', distance: 1800, likes: 2567 },
];

Page({
  data: {
    // 搜索关键词
    keyword: '',
    // 筛选条件
    filters: {
      difficulty: [],    // 难度：初级 / 中级
      region: [],        // 地区
      season: [],        // 季节
      score: 0,          // 风景评分 1-5
      familyFriendly: '',// 亲子友好
      cost: '',          // 费用区间
      tags: [],          // 景色特点标签
    },
    // 筛选区是否展开（默认展开）
    filterExpanded: true,
    // 筛选选项定义
    difficultyOptions: ['初级', '初级-中级', '中级', '中级-高级', '高级', '专业级'],
    regionOptions: [],  // 从数据库动态获取
    seasonOptions: ['春季', '夏季', '秋季', '冬季'],
    familyOptions: ['是', '否'],
    costOptions: ['免费', '100以内', '100-300', '300+'],
    tagOptions: ['云海', '日出', '瀑布', '红叶', '雪山', '峡谷', '竹林', '溪流', '冰川', '草原', '雪景', '奇峰', '花海', '古道', '寺庙'],
    // 搜索结果
    results: [],
    // 加载状态
    loading: false,
  },

  onLoad() {
    // 页面加载时显示默认热门路线（按点赞数排序前10）
    this.setData({ loading: true });
    this._loadRegionOptions();
    this._loadDefaultRoutes();
  },

  /**
   * 加载默认热门路线（无关键词时调用）
   * 从云数据库获取 likes_count 最高的前10条路线
   */
  _loadDefaultRoutes() {
    wx.cloud.callFunction({
      name: 'trail',
      data: { action: 'hot', limit: 10 },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const results = this._processResults(res.result.data, this.data.filters);
          this.setData({ results, loading: false });
        } else {
          // 云函数返回异常，降级到模拟数据
          this._searchWithMockData('', this.data.filters);
        }
      },
      fail: () => {
        // 云函数未部署，降级到模拟数据
        this._searchWithMockData('', this.data.filters);
      }
    });
  },

  // 从数据库加载地区选项
  _loadRegionOptions() {
    wx.cloud.callFunction({
      name: 'trail',
      data: { action: 'getRegions' },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          this.setData({ regionOptions: res.result.data });
        }
      },
      fail: () => {
        // 云函数未部署，使用默认地区（按路线数量排序）
        this.setData({ regionOptions: ['西安', '宝鸡', '咸阳', '安康', '商洛', '汉中', '渭南', '铜川', '延安', '榆林'] });
      }
    });
  },

  // 页面显示时刷新（从详情页返回时可能有变化）
  onShow() {
    // tabBar 页面 onShow 时不需要每次都刷新，避免闪烁
  },

  // 下拉刷新
  onPullDownRefresh() {
    this._searchRoutes();
    wx.stopPullDownRefresh();
  },

  // 输入搜索关键词
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  // 执行搜索
  onSearch() {
    this.setData({ loading: true });
    this._searchRoutes();
  },

  // 键盘回车搜索
  onConfirm() {
    this.onSearch();
  },

  // 切换筛选区域展开/折叠
  toggleFilter() {
    this.setData({ filterExpanded: !this.data.filterExpanded });
  },

  // 选择筛选条件（多选）
  onFilterSelect(e) {
    const { type, value } = e.currentTarget.dataset;
    const filters = { ...this.data.filters };

    if (type === 'score') {
      // 评分单选，再次点击取消
      filters.score = filters.score === value ? 0 : value;
    } else if (type === 'familyFriendly' || type === 'cost') {
      // 亲子友好和费用区间单选
      filters[type] = filters[type] === value ? '' : value;
    } else {
      // 难度、地区、季节、标签多选
      const arr = [...filters[type]];
      const idx = arr.indexOf(value);
      if (idx > -1) {
        arr.splice(idx, 1);
      } else {
        arr.push(value);
      }
      filters[type] = arr;
    }

    this.setData({ filters });
    // 筛选条件变化后自动搜索
    this._searchRoutes();
  },

  // 重置筛选条件
  onResetFilters() {
    this.setData({
      filters: {
        difficulty: [],
        region: [],
        season: [],
        score: 0,
        familyFriendly: '',
        cost: '',
        tags: [],
      }
    });
    // 重置后自动搜索
    this._searchRoutes();
  },

  // 点击路线卡片跳转详情
  onRouteTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  /**
   * 搜索路线（核心方法）
   * 1. 无关键词时加载热门路线（likes_count 前10）
   * 2. 有关键词时调用云函数搜索
   * 3. 云函数未部署时降级使用模拟数据
   */
  _searchRoutes() {
    this.setData({ loading: true });

    const { keyword, filters } = this.data;

    // 无关键词时加载热门路线
    if (!keyword || !keyword.trim()) {
      this._loadDefaultRoutes();
      return;
    }

    // 尝试调用云函数搜索
    wx.cloud.callFunction({
      name: 'trail',
      data: { action: 'search', keyword, filters },
      success: (res) => {
        if (res.result && res.result.data) {
          const results = this._processResults(res.result.data, filters);
          this.setData({ results, loading: false });
        } else {
          // 云函数返回空数据，降级到模拟数据
          this._searchWithMockData(keyword, filters);
        }
      },
      fail: () => {
        // 云函数未部署或调用失败，使用模拟数据
        this._searchWithMockData(keyword, filters);
      }
    });
  },

  /**
   * 使用模拟数据搜索
   * @param {string} keyword 搜索关键词
   * @param {object} filters 筛选条件
   */
  _searchWithMockData(keyword, filters) {
    // 模拟网络延迟
    setTimeout(() => {
      let results = [...MOCK_ROUTES];

      // 关键词搜索
      if (keyword && keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        results = results.filter(r =>
          r.name.toLowerCase().includes(kw) ||
          r.location.toLowerCase().includes(kw) ||
          r.tags.some(t => t.includes(kw))
        );
      } else {
        // 无关键词时按点赞数排序，取前10（模拟热门路线）
        results.sort((a, b) => b.likes - a.likes);
        results = results.slice(0, 10);
      }

      // 应用筛选条件
      results = this._processResults(results, filters);
      this.setData({ results, loading: false });
    }, 300);
  },

  /**
   * 处理筛选和排序
   * @param {Array} data 原始数据
   * @param {object} filters 筛选条件
   * @returns {Array} 处理后的结果
   */
  _processResults(data, filters) {
    // 将云函数返回的数据转换为页面需要的格式
    let results = data.map(item => ({
      id: item._id || item.id,
      name: item.name,
      score: item.scenery || item.score || 0,
      difficulty: item.difficulty,
      region: item.region || '',
      season: Array.isArray(item.best_season) ? item.best_season[0] : (item.season || ''),
      familyFriendly: item.family_friendly || item.familyFriendly || false,
      cost: item.cost || '',
      tags: item.features || item.tags || [],
      location: item.location,
      distance: item.distance || '',
      likes: item.likes_count || item.likes || 0
    }));

    // 难度筛选
    if (filters.difficulty.length > 0) {
      results = results.filter(r => filters.difficulty.includes(r.difficulty));
    }

    // 地区筛选
    if (filters.region.length > 0) {
      results = results.filter(r => {
        // 从 location 中提取城市名进行匹配（如"陕西省西安市" → "西安市"）
        const cityMatch = r.location.match(/省(.+?市)/) || r.location.match(/(.+?市)/);
        const city = cityMatch ? cityMatch[1] : r.location;
        return filters.region.some(region => city.includes(region) || region.includes(city));
      });
    }

    // 季节筛选
    if (filters.season.length > 0) {
      results = results.filter(r => filters.season.includes(r.season));
    }

    // 风景评分筛选
    if (filters.score > 0) {
      results = results.filter(r => r.score >= filters.score);
    }

    // 亲子友好筛选
    if (filters.familyFriendly) {
      const wantFamily = filters.familyFriendly === '是';
      results = results.filter(r => r.familyFriendly === wantFamily);
    }

    // 费用区间筛选
    if (filters.cost) {
      results = results.filter(r => r.cost === filters.cost);
    }

    // 景色特点标签筛选
    if (filters.tags.length > 0) {
      results = results.filter(r =>
        filters.tags.some(t => r.tags.includes(t))
      );
    }

    // 按风景评分从高到低排序
    results.sort((a, b) => b.score - a.score);

    return results;
  },
});
