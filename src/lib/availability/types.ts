// Shapes for the availability layer. Pure data, no behaviour.

/** A calendar event, normalized away from whichever provider supplied it. */
export interface BusyEvent {
  id: string
  title: string
  /** ISO. For all-day events, local midnight of the first day. */
  startsAt: string
  /** ISO, exclusive. For all-day events, local midnight after the last day. */
  endsAt: string
  allDay: boolean
  /** Free text off the calendar entry. Often empty, often a city, often a video link. */
  location: string
  /** Events marked free sit on the calendar without blocking. */
  transparency: 'busy' | 'free'
}

/** What a friend can book. Each kind gets its own hours and length. */
export type MeetKind = 'coffee' | 'run' | 'call'

/** Half-open interval in epoch milliseconds, local zone throughout. */
export interface Interval {
  start: number
  end: number
}

/** A booked or proposed meeting. Duration is chosen, not derived. */
export interface Slot {
  kind: MeetKind
  /** ISO. */
  startsAt: string
  /** ISO. */
  endsAt: string
}

/**
 * What gets published.
 *
 * "Open until it isn't" is a fact about a stretch of time. Enumerating every
 * possible start was storing a rendering choice, and it is what produced four
 * thousand "open times" from an ordinary calendar. A day is now one row.
 */
export interface Published {
  windows: OpenWindow[]
  kinds: KindTemplate[]
}

/**
 * The edge of a blocked span. Day offsets are relative to the event's own
 * start day: 0 is that day, -1 the day before, +1 the day after. Time is
 * local "HH:MM", or the day's own boundary.
 */
export interface DayEdge {
  dayOffset: number
  time: string | 'dayStart' | 'dayEnd'
}

/** What one calendar event does to the days around it. */
export type Spread =
  /** Blocks nothing. Birthday reminders, events marked free, "week of" banners. */
  | { kind: 'ignored'; reason: string }
  /** Blocks its own hours plus buffers, leaving the rest of the day bookable. */
  | { kind: 'confined' }
  /** Blocks a stretch of days. Travel, a weekend away, a conference elsewhere. */
  | { kind: 'spans'; from: DayEdge; to: DayEdge; reason: string }

/** One day's outer bound. Null means the day is closed entirely. */
export interface DayHours {
  /** Local "HH:MM". */
  start: string
  end: string
  /**
   * Closing a day is a flag rather than a null, so its hours survive being
   * toggled off and back on. Modelling closed as absence threw the times
   * away, so reopening a day silently reset it to a default she never chose.
   */
  open: boolean
}

/**
 * When she is open at all, by weekday, index 0 = Sunday.
 *
 * This is the whole time constraint, and it is the sleep and downtime setting.
 * Inside these hours, anything not blocked is bookable. There is deliberately
 * no per-kind hour window: "open until it isn't" is one fact about the day,
 * not three.
 */
export type OpenHours = DayHours[]

/**
 * A kind of thing to do together. The duration is a starting suggestion the
 * person booking can change, not a fixed slot length, which is why nothing
 * here enumerates start times.
 */
export interface KindTemplate {
  kind: MeetKind
  label: string
  defaultMinutes: number
  /** Offered in the booking page's duration picker. */
  choices: number[]
}

/** A stretch she is open. Epoch milliseconds. */
export interface OpenWindow {
  start: number
  end: number
}

export interface AvailabilityRules {
  openHours: OpenHours
  /** Minutes kept clear either side of anything already on the calendar. */
  bufferMinutes: number
  /** Windows shorter than this are dropped: too small to be worth offering. */
  minWindowMinutes: number
  /** Matched case-insensitively against an event location to mean "not travel". */
  homeCity: string
  /** Substrings in a title or location that mean leaving town. */
  travelHints: string[]
  /** Substrings in a location that mean the event is virtual, so travel is irrelevant. */
  virtualHints: string[]
  /** A departure before this local time takes the evening before with it. */
  earlyDepartureBefore: string
  /** When the evening starts, for the edge of a travel block. */
  eveningStart: string
  /** An out of town span touching a weekend swallows the rest of that weekend. */
  extendAcrossWeekend: boolean
  kinds: KindTemplate[]
}
