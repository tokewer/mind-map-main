export const DEFAULT_REVIEW_GLOW_CONFIG = {
  enabled: true,
  reviewColor: '#409eff',
  focusColor: '#f59e0b',
  intensity: 12,
  speed: 2
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

const normalizeColor = (value, fallback) => {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback
}

export const normalizeReviewGlowConfig = config => {
  const value = config && typeof config === 'object' ? config : {}
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_REVIEW_GLOW_CONFIG.enabled,
    reviewColor: normalizeColor(value.reviewColor, DEFAULT_REVIEW_GLOW_CONFIG.reviewColor),
    focusColor: normalizeColor(value.focusColor, DEFAULT_REVIEW_GLOW_CONFIG.focusColor),
    intensity: clamp(value.intensity, 4, 30, DEFAULT_REVIEW_GLOW_CONFIG.intensity),
    speed: clamp(value.speed, 0.5, 6, DEFAULT_REVIEW_GLOW_CONFIG.speed)
  }
}

export const getReviewGlowConfig = localConfig => {
  return normalizeReviewGlowConfig(localConfig && localConfig.reviewGlow)
}

export const hexToRgb = hex => {
  const color = normalizeColor(hex, '#000000')
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16)
  ].join(', ')
}
