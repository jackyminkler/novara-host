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
  // M1 templates. Together these answer whether a host reuses a plan at all,
  // which is the only evidence that save-as-template earned its place.
  | 'hp_template_created'
  | 'hp_template_edited'
  | 'hp_template_deleted'
  | 'hp_event_saved_as_template'
  // M1 event workspace depth. Deliverables and the shot list answer whether an
  // agreement written down gets worked; spend and ROI answer whether the recap
  // is worth the ten minutes it asks for.
  | 'hp_deliverable_toggled'
  | 'hp_spend_entry_added'
  | 'hp_roi_viewed'
  | 'hp_shot_toggled'
  | 'hp_site_lesson_added'
  // CRM completion. Between them these answer the one question the guest CRM
  // has to earn: does a list that took an import ever get used again. An
  // export or an invite copied is the list doing work; a promotion is a
  // handshake becoming someone the host can find later.
  | 'hp_people_exported'
  | 'hp_csv_import_completed'
  | 'hp_followup_invite_copied'
  | 'hp_person_promoted'
  // M1 guest surface. The deliverable toggle is the only evidence that an
  // agreement written down gets worked by the side that owes it, rather than
  // by the host ticking boxes on their behalf.
  | 'hp_guest_deliverable_toggled'
  // M1 share card. Three events, one question: does handing someone a link
  // instead of a phone number actually come back. A link created that is
  // never viewed, or viewed and never answered, says the card is a nice idea
  // and not a working one.
  | 'hp_card_link_created'
  | 'hp_card_viewed'
  | 'hp_card_contact_left'
  // M1 voice notes.
  | 'hp_voice_note_recorded'
  // M-match-0, rank in the host app. Three events answer whether pairing
  // people up is a thing a host does once out of curiosity or a thing they
  // come back to: a run started that never completes is an engine or a data
  // problem, and a run completed that is never viewed is a feature nobody
  // wanted. The Host App Matching Feature Spec writes these without the hp_
  // prefix; they carry it here because one naming scheme beats matching a doc.
  | 'hp_matching_run_started'
  | 'hp_matching_run_completed'
  | 'hp_matching_results_viewed'
  // F14 to F19, availability. The import event is how "did she actually
  // connect a calendar" gets answered without asking her.
  | 'hp_calendar_imported'
  | 'hp_friend_link_created'
  | 'hp_booking_created'
  | 'hp_booking_cancelled'
  | 'hp_huddle_created'

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
