import type { OrgType, OwnerRef, CrewMember, Org, Party } from './types'

export const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'cohost', label: 'Co-host' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'activation', label: 'Activation partner' },
  { value: 'venue', label: 'Venue' },
]

export function orgTypeLabel(value: OrgType | string): string {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? value
}

/** Short label for chips, where the full one is too wide. */
export function orgTypeChip(value: OrgType | string): string {
  return value === 'activation' ? 'Activation' : orgTypeLabel(value)
}

export interface ProfileField {
  key: string
  label: string
  placeholder: string
}

/**
 * PRD 4.7. Each type carries built-in fields. Values are editable per org and
 * overridable per event. New types are M2, so this map is closed in M0.
 */
export const TYPE_PROFILES: Record<OrgType, ProfileField[]> = {
  vendor: [
    { key: 'rate', label: 'Rate', placeholder: 'Market rate, friend rate, no charge' },
    { key: 'terms', label: 'Standard terms', placeholder: 'What they need from you' },
  ],
  sponsor: [
    { key: 'value', label: 'Budget or in-kind value', placeholder: 'Cash amount or what they cover' },
    { key: 'goal', label: 'Goal', placeholder: 'What a good outcome looks like for them' },
  ],
  cohost: [
    { key: 'audience', label: 'Audience', placeholder: 'Who they bring' },
    { key: 'split', label: 'Split notes', placeholder: 'How work and costs divide' },
  ],
  activation: [
    { key: 'staffing', label: 'Staffing', placeholder: 'How many people they send' },
    { key: 'consentOwner', label: 'Consent owner', placeholder: 'Who holds consent for their capture' },
  ],
  venue: [
    { key: 'capacity', label: 'Capacity', placeholder: 'How many fit' },
    { key: 'permits', label: 'Permit notes', placeholder: 'Thresholds, sound rules, lead time' },
  ],
}

export function profileFields(type: OrgType | string): ProfileField[] {
  return TYPE_PROFILES[type as OrgType] ?? []
}

// Owner refs. One string addresses the host, a party, a crew person, or all.

export function partyOwner(partyId: string): OwnerRef {
  return `party:${partyId}`
}

export function crewOwner(crewId: string): OwnerRef {
  return `crew:${crewId}`
}

export function ownerKind(owner: OwnerRef): 'host' | 'all' | 'party' | 'crew' {
  if (owner === 'host' || owner === 'all') return owner
  return owner.startsWith('crew:') ? 'crew' : 'party'
}

export function ownerId(owner: OwnerRef): string | null {
  const at = owner.indexOf(':')
  return at === -1 ? null : owner.slice(at + 1)
}

export interface OwnerLookup {
  parties: Party[]
  orgs: Org[]
  crew: CrewMember[]
  hostName: string
}

/** Human label for an owner ref, used on chips and group headers. */
export function ownerLabel(owner: OwnerRef, lookup: OwnerLookup): string {
  const kind = ownerKind(owner)
  if (kind === 'host') return lookup.hostName
  if (kind === 'all') return 'All'
  const id = ownerId(owner)
  if (kind === 'crew') {
    const person = lookup.crew.find((c) => c.id === id)
    return person ? `${person.name}, crew` : 'Removed crew member'
  }
  const party = lookup.parties.find((p) => p.id === id)
  const org = party && lookup.orgs.find((o) => o.id === party.orgId)
  return org?.name ?? 'Removed partner'
}

/** Every assignable owner for this event, in the order the picker shows them. */
export function ownerOptions(
  lookup: OwnerLookup,
  includeAll = false,
): { owner: OwnerRef; label: string }[] {
  const options: { owner: OwnerRef; label: string }[] = [
    { owner: 'host', label: `${lookup.hostName}, host` },
  ]
  if (includeAll) options.push({ owner: 'all', label: 'All' })
  for (const party of lookup.parties) {
    const org = lookup.orgs.find((o) => o.id === party.orgId)
    options.push({ owner: partyOwner(party.id), label: org?.name ?? 'Partner' })
  }
  for (const person of lookup.crew) {
    options.push({ owner: crewOwner(person.id), label: `${person.name}, crew` })
  }
  return options
}

/** Two letters for the avatar, from a partner or person name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
