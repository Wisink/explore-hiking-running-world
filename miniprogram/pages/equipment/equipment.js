// pages/equipment/equipment.js
Page({
  data: {
    // 基础装备
    basicEquipment: [
      { name: '徒步鞋', desc: '防滑、透气、保护脚踝', checked: false },
      { name: '双肩背包', desc: '20-30L，舒适背负系统', checked: false },
      { name: '水壶', desc: '至少1L水，推荐保温壶', checked: false },
      { name: '手机+充电宝', desc: '保持通讯，导航使用', checked: false },
      { name: '身份证+现金', desc: '以备不时之需', checked: false }
    ],
    // 服装装备
    clothingEquipment: [
      { name: '速干衣裤', desc: '吸汗透气，快速干燥', checked: false },
      { name: '防风外套', desc: '山顶风大，注意保暖', checked: false },
      { name: '遮阳帽', desc: '防晒必备', checked: false },
      { name: '备用袜子', desc: '湿了及时更换', checked: false }
    ],
    // 安全装备
    safetyEquipment: [
      { name: '急救包', desc: '创可贴、消毒液、纱布', checked: false },
      { name: '哨子', desc: '紧急求救用', checked: false },
      { name: '手电筒', desc: '以防天黑下山', checked: false },
      { name: '登山杖', desc: '减轻膝盖压力', checked: false }
    ],
    // 食品补给
    foodEquipment: [
      { name: '能量棒/巧克力', desc: '快速补充体力', checked: false },
      { name: '水果', desc: '补充维生素', checked: false },
      { name: '面包/饭团', desc: '午餐干粮', checked: false },
      { name: '盐丸', desc: '大量出汗时补充电解质', checked: false }
    ]
  },

  // 切换勾选状态
  toggleCheck: function (e) {
    const index = e.currentTarget.dataset.index
    const type = e.currentTarget.dataset.type
    
    let equipment
    switch (type) {
      case 'basic':
        equipment = this.data.basicEquipment
        break
      case 'clothing':
        equipment = this.data.clothingEquipment
        break
      case 'safety':
        equipment = this.data.safetyEquipment
        break
      case 'food':
        equipment = this.data.foodEquipment
        break
    }
    
    equipment[index].checked = !equipment[index].checked
    
    const updateData = {}
    updateData[type + 'Equipment'] = equipment
    this.setData(updateData)
  }
})
