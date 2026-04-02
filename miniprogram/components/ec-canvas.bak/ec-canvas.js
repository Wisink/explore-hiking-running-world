// ec-canvas.js - adapted from echarts-for-weixin
// Inlined wx-canvas module

class WxCanvas {
  constructor(ctx, canvasId, isNew, canvasNode) {
    this.ctx = ctx;
    this.canvasId = canvasId;
    this.chart = null;
    this.isNew = isNew;
    if (isNew) {
      this.canvasNode = canvasNode;
    } else {
      this._initStyle(ctx);
    }
    this._initEvent();
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return this.ctx;
    }
  }

  setChart(chart) {
    this.chart = chart;
  }

  attachEvent() { /* noop */ }
  detachEvent() { /* noop */ }

  _initStyle(ctx) {
    const styles = [
      'fillStyle', 'strokeStyle', 'globalAlpha', 'textAlign',
      'textBaseAlign', 'shadow', 'lineWidth', 'lineCap', 'lineJoin',
      'lineDash', 'miterLimit', 'fontSize'
    ];

    styles.forEach(style => {
      Object.defineProperty(ctx, style, {
        set: value => {
          if (style !== 'fillStyle' && style !== 'strokeStyle' || value !== 'none' && value !== null) {
            ctx['set' + style.charAt(0).toUpperCase() + style.slice(1)](value);
          }
        }
      });
    });

    ctx.createRadialGradient = function () {
      return ctx.createCircularGradient(arguments);
    };
  }

  _initEvent() {
    this.event = {};
    const eventNames = [
      { wxName: 'touchStart', ecName: 'mousedown' },
      { wxName: 'touchMove', ecName: 'mousemove' },
      { wxName: 'touchEnd', ecName: 'mouseup' },
      { wxName: 'touchEnd', ecName: 'click' }
    ];

    eventNames.forEach(name => {
      this.event[name.wxName] = e => {
        const touch = e.touches[0];
        this.chart.getZr().handler.dispatch(name.ecName, {
          zrX: name.wxName === 'tap' ? touch.clientX : touch.x,
          zrY: name.wxName === 'tap' ? touch.clientY : touch.y
        });
      };
    });
  }

  set width(w) { if (this.canvasNode) this.canvasNode.width = w; }
  get width() { if (this.canvasNode) return this.canvasNode.width; return 0; }
  set height(h) { if (this.canvasNode) this.canvasNode.height = h; }
  get height() { if (this.canvasNode) return this.canvasNode.height; return 0; }
}

function compareVersion(v1, v2) {
  v1 = v1.split('.');
  v2 = v2.split('.');
  const len = Math.max(v1.length, v2.length);
  while (v1.length < len) v1.push('0');
  while (v2.length < len) v2.push('0');
  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i]);
    const num2 = parseInt(v2[i]);
    if (num1 > num2) return 1;
    else if (num1 < num2) return -1;
  }
  return 0;
}

let globalCtx = void 0;

Component({
  properties: {
    canvasId: { type: String, value: 'ec-canvas' },
    echarts: { type: Object },
    ec: { type: Object },
    forceUseOldCanvas: { type: Boolean, value: false }
  },

  data: { isUseNewCanvas: false },

  ready() {
    if (!this.data.echarts) {
      console.warn('ec-canvas: 组件需要传入 echarts');
      return;
    }

    // Disable progressive rendering (drawImage doesn't support DOM in mini program)
    this.data.echarts.registerPreprocessor(option => {
      if (option && option.series) {
        if (option.series.length > 0) {
          option.series.forEach(series => { series.progressive = 0; });
        } else if (typeof option.series === 'object') {
          option.series.progressive = 0;
        }
      }
    });

    if (!this.data.ec) {
      console.warn('ec-canvas: 组件需绑定 ec 变量');
      return;
    }

    if (!this.data.ec.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init(callback) {
      const version = wx.getSystemInfoSync().SDKVersion;
      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      const forceUseOldCanvas = this.data.forceUseOldCanvas;
      const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;
      this.setData({ isUseNewCanvas });

      if (forceUseOldCanvas && canUseNewCanvas) {
        console.warn('ec-canvas: 开发者强制使用旧canvas,建议关闭');
      }

      if (isUseNewCanvas) {
        this.initByNewWay(callback);
      } else {
        const isValid = compareVersion(version, '1.9.91') >= 0;
        if (!isValid) {
          console.error('ec-canvas: 微信基础库版本过低，需大于等于 1.9.91');
          return;
        } else {
          console.warn('ec-canvas: 建议将微信基础库调整大于等于2.9.0版本');
          this.initByOldWay(callback);
        }
      }
    },

    initByOldWay(callback) {
      globalCtx = wx.createCanvasContext(this.data.canvasId, this);
      const canvas = new WxCanvas(globalCtx, this.data.canvasId, false);

      this.data.echarts.setCanvasCreator(() => canvas);
      const canvasDpr = 1;
      const query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').boundingClientRect(res => {
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas, width: res.width, height: res.height, canvasDpr
          });
        }
      }).exec();
    },

    initByNewWay(callback) {
      const query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').fields({ node: true, size: true }).exec(res => {
        const canvasNode = res[0].node;
        this.canvasNode = canvasNode;

        const canvasDpr = wx.getSystemInfoSync().pixelRatio;
        const canvasWidth = res[0].width;
        const canvasHeight = res[0].height;

        const ctx = canvasNode.getContext('2d');
        const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode);
        this.data.echarts.setCanvasCreator(() => canvas);

        if (typeof callback === 'function') {
          this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas, width: canvasWidth, height: canvasHeight, dpr: canvasDpr
          });
        }
      });
    },

    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this);
        query.select('.ec-canvas').fields({ node: true, size: true }).exec(res => {
          opt.canvas = res[0].node;
          wx.canvasToTempFilePath(opt);
        });
      } else {
        if (!opt.canvasId) opt.canvasId = this.data.canvasId;
        globalCtx.draw(true, () => { wx.canvasToTempFilePath(opt, this); });
      }
    },

    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0];
        const handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', { zrX: touch.x, zrY: touch.y });
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0];
        const handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {};
        const handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', { zrX: touch.x, zrY: touch.y });
        handler.dispatch('click', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'end');
      }
    }
  }
});

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return event;
}
