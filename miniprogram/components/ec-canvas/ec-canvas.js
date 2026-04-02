// ec-canvas.js - 基于 echarts-for-weixin 官方源码
// 使用 function 而非 class，确保最大兼容性

function WxCanvas(ctx, canvasId, isNew, canvasNode) {
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

WxCanvas.prototype.getContext = function(contextType) {
  if (contextType === '2d') {
    return this.ctx;
  }
};

WxCanvas.prototype.setChart = function(chart) {
  this.chart = chart;
};

WxCanvas.prototype.attachEvent = function() {};
WxCanvas.prototype.detachEvent = function() {};

WxCanvas.prototype._initStyle = function(ctx) {
  var styles = [
    'fillStyle', 'strokeStyle', 'globalAlpha', 'textAlign',
    'textBaseAlign', 'shadow', 'lineWidth', 'lineCap', 'lineJoin',
    'lineDash', 'miterLimit', 'fontSize'
  ];

  styles.forEach(function(style) {
    Object.defineProperty(ctx, style, {
      set: function(value) {
        if (style !== 'fillStyle' && style !== 'strokeStyle' || value !== 'none' && value !== null) {
          ctx['set' + style.charAt(0).toUpperCase() + style.slice(1)](value);
        }
      }
    });
  });

  ctx.createRadialGradient = function() {
    return ctx.createCircularGradient(arguments);
  };
};

WxCanvas.prototype._initEvent = function() {
  this.event = {};
  var eventNames = [
    { wxName: 'touchStart', ecName: 'mousedown' },
    { wxName: 'touchMove', ecName: 'mousemove' },
    { wxName: 'touchEnd', ecName: 'mouseup' },
    { wxName: 'touchEnd', ecName: 'click' }
  ];

  eventNames.forEach(function(name) {
    this.event[name.wxName] = function(e) {
      var touch = e.touches[0];
      this.chart.getZr().handler.dispatch(name.ecName, {
        zrX: name.wxName === 'tap' ? touch.clientX : touch.x,
        zrY: name.wxName === 'tap' ? touch.clientY : touch.y
      });
    }.bind(this);
  }.bind(this));
};

Object.defineProperty(WxCanvas.prototype, 'width', {
  set: function(w) { if (this.canvasNode) this.canvasNode.width = w; },
  get: function() { if (this.canvasNode) return this.canvasNode.width; return 0; }
});

Object.defineProperty(WxCanvas.prototype, 'height', {
  set: function(h) { if (this.canvasNode) this.canvasNode.height = h; },
  get: function() { if (this.canvasNode) return this.canvasNode.height; return 0; }
});

function compareVersion(v1, v2) {
  v1 = v1.split('.');
  v2 = v2.split('.');
  var len = Math.max(v1.length, v2.length);
  while (v1.length < len) v1.push('0');
  while (v2.length < len) v2.push('0');
  for (var i = 0; i < len; i++) {
    var num1 = parseInt(v1[i]);
    var num2 = parseInt(v2[i]);
    if (num1 > num2) return 1;
    else if (num1 < num2) return -1;
  }
  return 0;
}

var globalCtx;

Component({
  properties: {
    canvasId: { type: String, value: 'ec-canvas' },
    echarts: { type: Object },
    ec: { type: Object },
    forceUseOldCanvas: { type: Boolean, value: false }
  },

  data: { isUseNewCanvas: false },

  ready: function() {
    if (!this.data.echarts) {
      console.warn('ec-canvas: 组件需要传入 echarts');
      return;
    }

    this.data.echarts.registerPreprocessor(function(option) {
      if (option && option.series) {
        if (option.series.length > 0) {
          option.series.forEach(function(series) {
            series.progressive = 0;
          });
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
    init: function(callback) {
      var version = wx.getSystemInfoSync().SDKVersion;
      var canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      var forceUseOldCanvas = this.data.forceUseOldCanvas;
      var isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;
      this.setData({ isUseNewCanvas: isUseNewCanvas });

      if (forceUseOldCanvas && canUseNewCanvas) {
        console.warn('ec-canvas: 开发者强制使用旧canvas,建议关闭');
      }

      if (isUseNewCanvas) {
        this.initByNewWay(callback);
      } else {
        var isValid = compareVersion(version, '1.9.91') >= 0;
        if (!isValid) {
          console.error('ec-canvas: 微信基础库版本过低，需大于等于 1.9.91');
          return;
        } else {
          console.warn('ec-canvas: 建议将微信基础库调整大于等于2.9.0版本');
          this.initByOldWay(callback);
        }
      }
    },

    initByOldWay: function(callback) {
      globalCtx = wx.createCanvasContext(this.data.canvasId, this);
      var canvas = new WxCanvas(globalCtx, this.data.canvasId, false);

      this.data.echarts.setCanvasCreator(function() { return canvas; });
      var canvasDpr = 1;
      var query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').boundingClientRect(function(res) {
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas: canvas, width: res.width, height: res.height, canvasDpr: canvasDpr
          });
        }
      }.bind(this)).exec();
    },

    initByNewWay: function(callback) {
      var query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').fields({ node: true, size: true }).exec(function(res) {
        var canvasNode = res[0].node;
        this.canvasNode = canvasNode;

        var canvasDpr = wx.getSystemInfoSync().pixelRatio;
        var canvasWidth = res[0].width;
        var canvasHeight = res[0].height;

        var ctx = canvasNode.getContext('2d');
        var canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode);
        this.data.echarts.setCanvasCreator(function() { return canvas; });

        if (typeof callback === 'function') {
          this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas: canvas, width: canvasWidth, height: canvasHeight, dpr: canvasDpr
          });
        }
      }.bind(this));
    },

    canvasToTempFilePath: function(opt) {
      if (this.data.isUseNewCanvas) {
        var query = wx.createSelectorQuery().in(this);
        query.select('.ec-canvas').fields({ node: true, size: true }).exec(function(res) {
          opt.canvas = res[0].node;
          wx.canvasToTempFilePath(opt);
        });
      } else {
        if (!opt.canvasId) opt.canvasId = this.data.canvasId;
        globalCtx.draw(true, function() { wx.canvasToTempFilePath(opt, this); });
      }
    },

    touchStart: function(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', { zrX: touch.x, zrY: touch.y });
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove: function(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd: function(e) {
      if (this.chart) {
        var touch = e.changedTouches ? e.changedTouches[0] : {};
        var handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', { zrX: touch.x, zrY: touch.y });
        handler.dispatch('click', { zrX: touch.x, zrY: touch.y });
        handler.processGesture(wrapTouch(e), 'end');
      }
    }
  }
});

function wrapTouch(event) {
  for (var i = 0; i < event.touches.length; ++i) {
    var touch = event.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return event;
}
