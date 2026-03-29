Component({
  properties: {
    type: {
      type: String,
      value: 'list'  // list | detail
    },
    count: {
      type: Number,
      value: 3  // 列表骨架卡片数量
    }
  }
});
