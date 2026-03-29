const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 天气描述中文映射
const WEATHER_DESC_CN = {
  'Clear': '晴天', 'Sunny': '晴天', 'Partly cloudy': '多云',
  'Cloudy': '阴天', 'Overcast': '阴天', 'Mist': '薄雾', 'Fog': '大雾',
  'Light rain': '小雨', 'Moderate rain': '中雨', 'Heavy rain': '大雨',
  'Light snow': '小雪', 'Moderate snow': '中雪', 'Heavy snow': '大雪',
  'Thundery outbreaks': '雷阵雨', 'Patchy rain': '阵雨',
  'Patchy snow': '阵雪', 'Blizzard': '暴风雪', 'Ice pellets': '冰雹'
}

const WEATHER_ICONS = {
  'Clear': '☀️', 'Sunny': '☀️', 'Partly cloudy': '⛅', 'Cloudy': '☁️',
  'Overcast': '☁️', 'Mist': '🌫️', 'Fog': '🌫️', 'Light rain': '🌧️',
  'Moderate rain': '🌧️', 'Heavy rain': '🌧️', 'Light snow': '❄️',
  'Moderate snow': '❄️', 'Heavy snow': '❄️', 'Thundery outbreaks': '⛈️',
  'Patchy rain': '🌦️', 'Patchy snow': '🌨️', 'Blizzard': '🌨️', 'Ice pellets': '🧊'
}

// 出行建议
function getAdvice(temp, descEn, windKmph) {
  const t = parseFloat(temp)
  const w = parseFloat(windKmph)
  const d = (descEn || '').toLowerCase()

  if (t > 35) return { safeTip: '高温预警，建议室内活动，注意防暑降温', suitable: false }
  if (t < 0) return { safeTip: '低温预警，注意保暖', suitable: false }
  if (d.includes('rain') || d.includes('thunder')) return { safeTip: '带好雨具，注意路滑', suitable: false }
  if (d.includes('snow') || d.includes('blizzard') || d.includes('ice')) return { safeTip: '注意防滑，谨慎出行', suitable: false }
  if (w > 24) return { safeTip: '大风预警，不建议户外活动', suitable: false }
  return { safeTip: '天气适宜，适合户外活动', suitable: true }
}

function fetchWeather(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('请求超时')), 8000)
    https.get(url, { headers: { 'User-Agent': 'WeChat-MiniApp' } }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('数据解析失败')) }
      })
    }).on('error', err => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function getDefaultWeather() {
  return { code: 0, message: 'success', data: {
    temp: '--', desc: '暂无数据', icon: '🌤️',
    humidity: '--%', wind: '--级',
    safeTip: '天气数据获取失败，请稍后重试', suitable: true
  }}
}

/**
 * 获取天气数据
 * 入参：{ action: "get", city? } 默认西安
 * 支持定时触发器：timer 触发时直接刷新数据库缓存
 */
exports.main = async (event) => {
  const city = event.city || '西安'

  // 定时触发器调用（event.type === 'timer'）
  if (event.type === 'timer') {
    try {
      const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
      const weatherData = await fetchWeather(url)
      const current = weatherData.current_condition?.[0]
      if (!current) return { code: -1, message: '天气数据为空' }

      const descEn = current.weatherDesc?.[0]?.value || 'Clear'
      const advice = getAdvice(current.temp_C, descEn, current.windspeedKmph)
      const windLevel = Math.max(1, Math.round(parseFloat(current.windspeedKmph || 0) / 8))

      const weatherDoc = {
        city,
        temp: current.temp_C,
        desc: WEATHER_DESC_CN[descEn] || descEn,
        icon: WEATHER_ICONS[descEn] || '🌤️',
        humidity: `${current.humidity}%`,
        wind: `${windLevel}级`,
        safeTip: advice.safeTip,
        suitable: advice.suitable,
        updatedAt: db.serverDate()
      }

      // upsert 到 weather 集合
      const exist = await db.collection('weather').where({ city }).get()
      if (exist.data.length > 0) {
        await db.collection('weather').doc(exist.data[0]._id).update({ data: weatherDoc })
      } else {
        await db.collection('weather').add({ data: weatherDoc })
      }

      return { code: 0, message: '定时更新成功' }
    } catch (err) {
      console.error('定时天气更新失败:', err.message)
      return { code: -1, message: '定时更新失败' }
    }
  }

  // 普通请求：优先返回数据库缓存，无缓存则实时获取
  try {
    const cached = await db.collection('weather').where({ city }).get()
    if (cached.data.length > 0) {
      const doc = cached.data[0]
      return { code: 0, message: 'success', data: {
        temp: doc.temp, desc: doc.desc, icon: doc.icon,
        humidity: doc.humidity, wind: doc.wind,
        safeTip: doc.safeTip, suitable: doc.suitable
      }}
    }
  } catch (e) {
    // 缓存查询失败，走实时获取
  }

  // 实时获取
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    const weatherData = await fetchWeather(url)
    const current = weatherData.current_condition?.[0]
    if (!current) return getDefaultWeather()

    const descEn = current.weatherDesc?.[0]?.value || 'Clear'
    const advice = getAdvice(current.temp_C, descEn, current.windspeedKmph)
    const windLevel = Math.max(1, Math.round(parseFloat(current.windspeedKmph || 0) / 8))

    return { code: 0, message: 'success', data: {
      temp: current.temp_C,
      desc: WEATHER_DESC_CN[descEn] || descEn,
      icon: WEATHER_ICONS[descEn] || '🌤️',
      humidity: `${current.humidity}%`,
      wind: `${windLevel}级`,
      safeTip: advice.safeTip,
      suitable: advice.suitable
    }}
  } catch (err) {
    console.error('天气获取失败:', err.message)
    return getDefaultWeather()
  }
}
