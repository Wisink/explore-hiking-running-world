const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const OPENWEATHER_API_KEY = 'DEMO_KEY'

const WEATHER_DESC_CN = {
  'Clear': '晴天', 'Sunny': '晴天', 'Partly cloudy': '多云',
  'Cloudy': '阴天', 'Overcast': '阴天', 'Mist': '薄雾', 'Fog': '大雾',
  'Light rain': '小雨', 'Moderate rain': '中雨', 'Heavy rain': '大雨',
  'Light snow': '小雪', 'Moderate snow': '中雪', 'Heavy snow': '大雪',
  'Thundery outbreaks': '雷阵雨', 'Patchy rain': '阵雨',
  'Patchy snow': '阵雪', 'Blizzard': '暴风雪', 'Ice pellets': '冰雹',
  'few clouds': '晴间多云', 'scattered clouds': '多云', 'broken clouds': '多云',
  'shower rain': '阵雨', 'thunderstorm': '雷阵雨', 'snow': '小雪',
  'drizzle': '毛毛雨', 'haze': '霾'
}
const WEATHER_ICONS = {
  'Clear': '\u2600\ufe0f', 'Sunny': '\u2600\ufe0f', 'Partly cloudy': '\u26c5',
  'Cloudy': '\u2601\ufe0f', 'Overcast': '\u2601\ufe0f', 'Mist': '\U0001f32b\ufe0f',
  'Fog': '\U0001f32b\ufe0f', 'Light rain': '\U0001f327\ufe0f', 'Moderate rain': '\U0001f327\ufe0f',
  'Heavy rain': '\U0001f327\ufe0f', 'Light snow': '\u2744\ufe0f', 'Moderate snow': '\u2744\ufe0f',
  'Heavy snow': '\u2744\ufe0f', 'Thundery outbreaks': '\u26c8\ufe0f',
  'Patchy rain': '\U0001f326\ufe0f', 'Patchy snow': '\U0001f328\ufe0f', 'Blizzard': '\U0001f328\ufe0f',
  'Ice pellets': '\U0001f9ca', 'few clouds': '\U0001f324\ufe0f', 'scattered clouds': '\u26c5',
  'broken clouds': '\u2601\ufe0f', 'shower rain': '\U0001f326\ufe0f', 'thunderstorm': '\u26c8\ufe0f',
  'snow': '\u2744\ufe0f', 'drizzle': '\U0001f326\ufe0f', 'haze': '\U0001f32b\ufe0f'
}
const OWM_CODE_DESC = {
  800: 'Clear', 801: 'few clouds', 802: 'scattered clouds',
  803: 'broken clouds', 804: 'Overcast',
  500: 'Light rain', 501: 'Moderate rain', 502: 'Heavy rain',
  511: 'Ice pellets', 600: 'Light snow', 601: 'Moderate snow',
  602: 'Heavy snow', 701: 'Mist', 711: 'Mist', 721: 'haze',
  741: 'Fog', 900: 'Clear', 906: 'Moderate snow', 957: 'Overcast'
}

function getAdvice(temp, descEn, windKmph) {
  const t = parseFloat(temp), w = parseFloat(windKmph || 0)
  const d = (descEn || '').toLowerCase()
  if (t > 35) return { safeTip: '高温预警，建议室内活动', suitable: false }
  if (t < 0) return { safeTip: '低温预警，注意保暖', suitable: false }
  if (/rain|thunder|drizzle|shower/.test(d)) return { safeTip: '带好雨具，注意路滑', suitable: false }
  if (/snow|blizzard|ice/.test(d)) return { safeTip: '注意防滑，谨慎出行', suitable: false }
  if (w > 24) return { safeTip: '大风预警，不建议户外活动', suitable: false }
  return { safeTip: '天气适宜，适合户外活动', suitable: true }
}

function fetchWeather(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('超时')), 8000)
    https.get(url, { headers: { 'User-Agent': 'WeChat-MiniApp' } }, r => {
      let d = ''; r.on('data', c => d += c)
      r.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
    }).on('error', e => { clearTimeout(timeout); reject(e) })
  })
}

function getDefaultWeather() {
  return { code: 0, message: 'success', data: {
    temp: '--', desc: '暂无数据', icon: '\U0001f324\ufe0f',
    humidity: '--%', wind: '--\u7ea7',
    safeTip: '天气数据获取失败', suitable: true
  }}
}

async function fetchFromWttrIn(city) {
  const u = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1'
  const w = await fetchWeather(u)
  const c = w.current_condition && w.current_condition[0]
  if (!c) throw new Error('wttr.in empty')
  const d = c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value || 'Clear'
  const a = getAdvice(c.temp_C, d, c.windspeedKmph)
  const wl = Math.max(1, Math.round(parseFloat(c.windspeedKmph || 0) / 8))
  return {
    temp: c.temp_C,
    desc: WEATHER_DESC_CN[d] || d,
    descEn: d,
    icon: WEATHER_ICONS[d] || '\U0001f324\ufe0f',
    humidity: c.humidity + '%',
    wind: wl + '\u7ea7',
    safeTip: a.safeTip, suitable: a.suitable, source: 'wttr.in'
  }
}

async function fetchWeatherFromOpenWeather(city) {
  const cityMap = { '西安': "Xi'an", '北京': 'Beijing', '上海': 'Shanghai' }
  const cn = cityMap[city] || city
  const u = 'http://api.openweathermap.org/data/2.5/weather?q='
    + encodeURIComponent(cn) + ',CN&appid=' + OPENWEATHER_API_KEY
    + '&units=metric&lang=zh_cn'
  console.log('[weather] OWM fallback:', u)
  const d = await fetchWeather(u)
  if (!d || d.cod !== 200) throw new Error('OWM returned error')
  const w = d.weather && d.weather[0]
  const mn = d.main || {}
  const wi = d.wind || {}
  const descEn = (w && w.description) || (w && w.main) || 'Clear'
  const mappedDesc = OWM_CODE_DESC[(w && w.id)] || (w && w.main) || 'Clear'
  const windKmph = (wi.speed || 0) * 3.6
  const a = getAdvice(mn.temp, mappedDesc, windKmph)
  const wl = Math.max(1, Math.round((wi.speed || 0) * 0.836))
  return {
    temp: String(Math.round(mn.temp)),
    desc: WEATHER_DESC_CN[descEn] || WEATHER_DESC_CN[mappedDesc] || mappedDesc,
    descEn: mappedDesc,
    icon: WEATHER_ICONS[descEn] || WEATHER_ICONS[mappedDesc] || '\U0001f324\ufe0f',
    humidity: mn.humidity + '%',
    wind: wl + '\u7ea7',
    safeTip: a.safeTip, suitable: a.suitable, source: 'OpenWeatherMap'
  }
}

async function getWeatherWithFallback(city) {
  try { return await fetchFromWttrIn(city) } catch (e) {
    console.error('[weather] wttr.in failed:', e.message)
  }
  try { return await fetchWeatherFromOpenWeather(city) } catch (e) {
    console.error('[weather] OWM also failed:', e.message)
  }
  return null
}

/** 按经纬度获取天气（供 getRecommendation 云函数调用） */
async function fetchWeatherByLocation(lat, lng) {
  try {
    // wttr.in 支持经纬度查询
    const u = `https://wttr.in/${lat},${lng}?format=j1`
    const w = await fetchWeather(u)
    const c = w.current_condition && w.current_condition[0]
    if (!c) throw new Error('wttr.in empty')
    const d = c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value || 'Clear'
    const a = getAdvice(c.temp_C, d, c.windspeedKmph)
    const wl = Math.max(1, Math.round(parseFloat(c.windspeedKmph || 0) / 8))
    return {
      temp: c.temp_C,
      desc: WEATHER_DESC_CN[d] || d,
      descEn: d,
      icon: WEATHER_ICONS[d] || '\u2600\ufe0f',
      humidity: c.humidity + '%',
      wind: wl + '\u7ea7',
      safeTip: a.safeTip, suitable: a.suitable, source: 'wttr.in(latlng)'
    }
  } catch (e) {
    console.error('[weather] latlng query failed:', e.message)
    return null
  }
}

exports.main = async (event) => {
  // 按经纬度查询天气（供 getRecommendation 调用）
  if (event.type === 'byLocation' && event.lat && event.lng) {
    const r = await fetchWeatherByLocation(event.lat, event.lng)
    if (!r) return getDefaultWeather()
    return { code: 0, message: 'success', data: {
      temp: r.temp, desc: r.desc, descEn: r.descEn, icon: r.icon,
      humidity: r.humidity, wind: r.wind,
      safeTip: r.safeTip, suitable: r.suitable
    }}
  }

  const city = event.city || '西安'

  if (event.type === 'timer') {
    try {
      const r = await getWeatherWithFallback(city)
      if (!r) return { code: -1, message: '天气获取失败' }
      const weatherDoc = {
        city, temp: r.temp, desc: r.desc, icon: r.icon,
        humidity: r.humidity, wind: r.wind,
        safeTip: r.safeTip, suitable: r.suitable, updatedAt: db.serverDate()
      }
      const ex = await db.collection('weather').where({ city }).get()
      if (ex.data.length > 0) await db.collection('weather').doc(ex.data[0]._id).update({ data: weatherDoc })
      else await db.collection('weather').add({ data: weatherDoc })
      return { code: 0, message: '定时更新成功', source: r.source }
    } catch (e) {
      console.error('Timer error:', e.message)
      return { code: -1, message: '定时更新失败' }
    }
  }

  try {
    const ex = await db.collection('weather').where({ city }).get()
    if (ex.data.length > 0) {
      const doc = ex.data[0]
      return { code: 0, message: 'success', data: {
        temp: doc.temp, desc: doc.desc, icon: doc.icon,
        humidity: doc.humidity, wind: doc.wind,
        safeTip: doc.safeTip, suitable: doc.suitable
      }}
    }
  } catch (e) {
    console.error('[weather] Database query failed:', e.message)
  }

  const r = await getWeatherWithFallback(city)
  if (!r) return getDefaultWeather()
  return { code: 0, message: 'success', data: {
    temp: r.temp, desc: r.desc, icon: r.icon,
    humidity: r.humidity, wind: r.wind,
    safeTip: r.safeTip, suitable: r.suitable
  }}
}
