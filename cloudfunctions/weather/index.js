// 云函数入口文件
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 天气描述中文映射（wttr.in 返回英文）
const WEATHER_DESC_CN = {
  'Clear': '晴天',
  'Sunny': '晴天',
  'Partly cloudy': '多云',
  'Cloudy': '阴天',
  'Overcast': '阴天',
  'Mist': '薄雾',
  'Fog': '大雾',
  'Light rain': '小雨',
  'Moderate rain': '中雨',
  'Heavy rain': '大雨',
  'Light snow': '小雪',
  'Moderate snow': '中雪',
  'Heavy snow': '大雪',
  'Thundery outbreaks': '雷阵雨',
  'Patchy rain': '阵雨',
  'Patchy snow': '阵雪',
  'Blizzard': '暴风雪',
  'Ice pellets': '冰雹'
}

// 天气图标映射
const WEATHER_ICONS = {
  'Clear': '☀️',
  'Sunny': '☀️',
  'Partly cloudy': '⛅',
  'Cloudy': '☁️',
  'Overcast': '☁️',
  'Mist': '🌫️',
  'Fog': '🌫️',
  'Light rain': '🌧️',
  'Moderate rain': '🌧️',
  'Heavy rain': '🌧️',
  'Light snow': '❄️',
  'Moderate snow': '❄️',
  'Heavy snow': '❄️',
  'Thundery outbreaks': '⛈️',
  'Patchy rain': '🌦️',
  'Patchy snow': '🌨️',
  'Blizzard': '🌨️',
  'Ice pellets': '🧊'
}

// 根据天气数据生成出行建议
function getAdvice(temp, descEn, windKmph) {
  const tempNum = parseFloat(temp)
  const windNum = parseFloat(windKmph)
  const descLower = (descEn || '').toLowerCase()

  if (tempNum > 35) {
    return { safeTip: '高温预警，建议室内活动，注意防暑降温', suitable: false }
  }
  if (tempNum < 0) {
    return { safeTip: '低温预警，注意保暖，外出请穿厚衣服', suitable: false }
  }
  if (descLower.includes('rain') || descLower.includes('thunder')) {
    return { safeTip: '带好雨具，注意路滑', suitable: false }
  }
  if (descLower.includes('snow') || descLower.includes('blizzard') || descLower.includes('ice')) {
    return { safeTip: '注意防滑，谨慎出行', suitable: false }
  }
  if (windNum > 24) { // 大约6级风 >24km/h
    return { safeTip: '大风预警，不建议户外活动', suitable: false }
  }
  return { safeTip: '天气适宜，适合户外活动', suitable: true }
}

// 获取天气数据（带超时）
function fetchWeather(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('请求超时')), 5000)

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

// 默认天气数据（API失败时返回）
function getDefaultWeather() {
  return {
    code: 0,
    data: {
      temp: '--',
      desc: '暂无数据',
      icon: '🌤️',
      humidity: '--%',
      wind: '--级',
      safeTip: '天气数据获取失败，请稍后重试',
      suitable: true
    }
  }
}

// 云函数入口
exports.main = async (event) => {
  const city = event.city || '西安'

  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    const weatherData = await fetchWeather(url)

    // 提取当前天气
    const current = weatherData.current_condition?.[0]
    if (!current) return getDefaultWeather()

    const tempC = current.temp_C || '--'
    const descEn = current.weatherDesc?.[0]?.value || 'Clear'
    const humidity = current.humidity || '--'
    const windKmph = current.windspeedKmph || '0'

    // 获取中文描述和图标
    const desc = WEATHER_DESC_CN[descEn] || descEn
    const icon = WEATHER_ICONS[descEn] || '🌤️'

    // 计算风力等级（km/h 转级数：1级≈20km/h）
    const windLevel = Math.max(1, Math.round(parseFloat(windKmph) / 8))
    const wind = `${windLevel}级`

    // 生成出行建议
    const advice = getAdvice(tempC, descEn, windKmph)

    return {
      code: 0,
      data: {
        temp: tempC,
        desc,
        icon,
        humidity: `${humidity}%`,
        wind,
        safeTip: advice.safeTip,
        suitable: advice.suitable
      }
    }
  } catch (err) {
    console.error('天气获取失败:', err.message)
    return getDefaultWeather()
  }
}
