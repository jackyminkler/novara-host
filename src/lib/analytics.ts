// PRD 4.3. These names are the contract with the Amplitude dashboard; do not
// rename one without updating the success gate that reads it.
export type AnalyticsEvent =
  | 'hp_guest_view_opened'
  | 'hp_date_response_submitted'
  | 'hp_task_updated'
  | 'hp_role_confirmed'
  | 'hp_capture_created'
  | 'hp_followup_done'
  | 'hp_nudge_logged'
  // CRM-1. Prefixed like every other event above: the Guest CRM Plan wrote
  // these without the hp_ prefix, and one naming scheme beats matching a doc.
  | 'hp_people_list_viewed'
  | 'hp_person_viewed'
  | 'hp_person_note_saved'
  // F14 to F19, availability. The import event is how "did she actually
  // connect a calendar" gets answered without asking her.
  | 'hp_calendar_imported'
  | 'hp_friend_link_created'
  | 'hp_booking_created'
  | 'hp_booking_cancelled'

const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY

// The Amplitude SDK is about 220 kB, which is more than the rest of the guest
// page put together. It loads on demand instead of in the critical path, so
// instrumentation never costs a partner their first two seconds on LTE.
let sdk: Promise<typeof import('@amplitude/analytics-browser')> | null = null

function load() {
  if (!sdk) {
    sdk = import('@amplitude/analytics-browser').then((amplitude) => {
      amplitude.init(apiKey as string, { autocapture: false })
      return amplitude
    })
  }
  return sdk
}

/** No-ops without an API key, so local dev works before Amplitude is wired up. */
export function track(name: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!apiKey) return
  // Fire and forget. A dropped analytics call must never break a guest action.
  void load()
    .then((amplitude) => amplitude.track(name, props))
    .catch(() => undefined)
}
