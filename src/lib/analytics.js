import * as amplitude from '@amplitude/analytics-browser'

const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY

if (apiKey) {
  amplitude.init(apiKey, { autocapture: false })
}

// No-ops without an API key so local dev works before Amplitude is wired up.
export function track(name, props) {
  if (apiKey) {
    amplitude.track(name, props)
  }
}
