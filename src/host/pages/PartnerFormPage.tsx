import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { BackLink, FocusColumn } from './Page'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import { Button, Card, Chip, GhostButton, KV, Loading, PageTitle, QuietButton } from '../../ui/primitives'
import { Field, Input, Label, Select, Textarea } from '../../ui/form'
import { ORG_TYPES, profileFields } from '../../data/profiles'
import type { Contact, CustomField, Org, OrgType } from '../../data/types'
import type { OrgInput } from '../../data/api'

// Same form for create and edit, per the wireframes. The type dropdown sets
// which built-in fields appear; any record also takes custom labelled fields.

const EMPTY_CONTACT: Contact = { name: '', role: '', email: '', phone: '', instagram: '', linkedin: '' }

function blankOrg(): OrgInput {
  return {
    name: '',
    type: 'vendor',
    description: '',
    contacts: [{ ...EMPTY_CONTACT }],
    profile: {},
    customFields: [],
    via: '',
    relationshipTerms: '',
    notes: '',
    // M1 fields, empty until their own editors land. Set here rather than left
    // out so a record created today is not missing what a reader expects.
    siteProfile: null,
    standing: [],
  }
}

/** Drops empty strings so a half-filled contact never persists as noise. */
function cleanContacts(contacts: Contact[]): Contact[] {
  return contacts
    .map(
      (c) =>
        Object.fromEntries(
          Object.entries(c)
            .map(([key, value]) => [key, (value ?? '').trim()])
            .filter(([, value]) => value !== ''),
        ) as Contact,
    )
    .filter((c) => Boolean(c.name))
}

function PrivateLabel({ children }: { children: string }) {
  return (
    <Label aside={<Chip tone="gray">Only you see this</Chip>}>{children}</Label>
  )
}

export default function PartnerFormPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const host = useHost()
  const editing = Boolean(orgId)

  const { data: existing, loading } = useAsync(
    async (api) => (orgId ? api.getOrg(orgId) : null),
    [orgId],
  )

  if (editing && loading) return <FocusColumn><Loading label="Loading partner" /></FocusColumn>

  return (
    <FocusColumn>
      <BackLink to={orgId ? `/app/partners/${orgId}` : '/app/partners'}>
        {orgId ? 'Partner' : 'Partners'}
      </BackLink>
      <PageTitle className="mb-3 text-lg">{editing ? 'Edit partner' : 'New partner'}</PageTitle>
      <PartnerForm
        key={existing?.id ?? 'new'}
        initial={existing}
        onSaved={(id) => navigate(`/app/partners/${id}`)}
        onCancel={() => navigate(orgId ? `/app/partners/${orgId}` : '/app/partners')}
        onDeleted={() => navigate('/app/partners')}
        hostUid={host.uid}
      />
    </FocusColumn>
  )
}

function PartnerForm({
  initial,
  onSaved,
  onCancel,
  onDeleted,
  hostUid,
}: {
  initial: Org | null
  onSaved: (id: string) => void
  onCancel: () => void
  onDeleted: () => void
  hostUid: string
}) {
  const [form, setForm] = useState<OrgInput>(() =>
    initial
      ? {
          name: initial.name,
          type: initial.type,
          description: initial.description ?? '',
          contacts: initial.contacts.length ? initial.contacts.map((c) => ({ ...EMPTY_CONTACT, ...c })) : [{ ...EMPTY_CONTACT }],
          profile: { ...initial.profile },
          customFields: [...initial.customFields],
          via: initial.via ?? '',
          relationshipTerms: initial.relationshipTerms ?? '',
          notes: initial.notes ?? '',
          // Carried through untouched. This form writes the whole record, so
          // dropping a field it does not edit would quietly erase it.
          siteProfile: initial.siteProfile ?? null,
          standing: initial.standing ?? [],
        }
      : blankOrg(),
  )
  const { mutate, busy, error } = useMutation()

  const set = <K extends keyof OrgInput>(key: K, value: OrgInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setContact = (index: number, key: keyof Contact, value: string) =>
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, [key]: value } : c)),
    }))

  const setCustom = (index: number, key: keyof CustomField, value: string) =>
    setForm((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => (i === index ? { ...f, [key]: value } : f)),
    }))

  const save = () => {
    if (!form.name.trim()) return
    const payload: OrgInput = {
      ...form,
      name: form.name.trim(),
      contacts: cleanContacts(form.contacts),
      customFields: form.customFields.filter((f) => f.label.trim() && f.value.trim()),
    }
    void mutate(async (api) => {
      if (initial) {
        await api.updateOrg(initial.id, payload)
        onSaved(initial.id)
      } else {
        onSaved(await api.createOrg(payload, hostUid))
      }
    })
  }

  const remove = () => {
    if (!initial) return
    if (!window.confirm(`Remove ${initial.name} from the directory?`)) return
    void mutate(async (api) => {
      await api.deleteOrg(initial.id)
      onDeleted()
    })
  }

  const fields = profileFields(form.type)

  return (
    <Card>
      <Field label="Name" htmlFor="org-name">
        <Input
          id="org-name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Who you plan with"
          autoFocus
        />
      </Field>

      <Field
        label="Type"
        htmlFor="org-type"
        hint="Co-host, sponsor, vendor, activation partner, venue. The type sets the built-in fields below."
      >
        <Select
          id="org-type"
          value={form.type}
          onChange={(e) => set('type', e.target.value as OrgType)}
        >
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="What they do" htmlFor="org-description">
        <Input
          id="org-description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="One line, so you remember at a glance"
        />
      </Field>

      {fields.length > 0 && (
        <div className="grid gap-x-[10px] sm:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`profile-${field.key}`}>
              <Input
                id={`profile-${field.key}`}
                value={form.profile[field.key] ?? ''}
                onChange={(e) => set('profile', { ...form.profile, [field.key]: e.target.value })}
                placeholder={field.placeholder}
              />
            </Field>
          ))}
        </div>
      )}

      <Label>Contacts</Label>
      <div className="mb-2 grid gap-2">
        {form.contacts.map((contact, i) => (
          <div key={i} className="hairline rounded-xl border-line bg-field p-[10px]">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={contact.name ?? ''}
                onChange={(e) => setContact(i, 'name', e.target.value)}
                placeholder="Name"
                aria-label="Contact name"
              />
              <Input
                value={contact.role ?? ''}
                onChange={(e) => setContact(i, 'role', e.target.value)}
                placeholder="Role"
                aria-label="Contact role"
              />
              <Input
                value={contact.email ?? ''}
                onChange={(e) => setContact(i, 'email', e.target.value)}
                placeholder="Email"
                aria-label="Contact email"
                type="email"
              />
              <Input
                value={contact.phone ?? ''}
                onChange={(e) => setContact(i, 'phone', e.target.value)}
                placeholder="Phone"
                aria-label="Contact phone"
              />
              <Input
                value={contact.instagram ?? ''}
                onChange={(e) => setContact(i, 'instagram', e.target.value)}
                placeholder="Instagram"
                aria-label="Contact Instagram"
              />
              <Input
                value={contact.linkedin ?? ''}
                onChange={(e) => setContact(i, 'linkedin', e.target.value)}
                placeholder="LinkedIn URL"
                aria-label="Contact LinkedIn"
              />
            </div>
            {form.contacts.length > 1 && (
              <div className="mt-2 flex justify-end">
                <QuietButton
                  onClick={() => set('contacts', form.contacts.filter((_, idx) => idx !== i))}
                  aria-label="Remove contact"
                >
                  <X size={12} />
                  Remove
                </QuietButton>
              </div>
            )}
          </div>
        ))}
      </div>
      <QuietButton
        className="mb-[10px]"
        onClick={() => set('contacts', [...form.contacts, { ...EMPTY_CONTACT }])}
      >
        <Plus size={12} />
        Add contact
      </QuietButton>

      <PrivateLabel>Via</PrivateLabel>
      <Input
        className="mb-[10px]"
        value={form.via}
        onChange={(e) => set('via', e.target.value)}
        placeholder="Who the relationship came through"
        aria-label="Via"
      />

      <PrivateLabel>Relationship terms</PrivateLabel>
      <Input
        className="mb-[10px]"
        value={form.relationshipTerms}
        onChange={(e) => set('relationshipTerms', e.target.value)}
        placeholder="Friend rate versus market rate, who owes who"
        aria-label="Relationship terms"
      />

      <Field label="Notes" htmlFor="org-notes">
        <Textarea
          id="org-notes"
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Lead times, preferences, anything worth remembering"
        />
      </Field>

      {form.customFields.map((field, i) => (
        <div key={i} className="mb-[10px] grid gap-2 sm:grid-cols-2">
          <Input
            value={field.label}
            onChange={(e) => setCustom(i, 'label', e.target.value)}
            placeholder="Field name"
            aria-label="Custom field name"
          />
          <div className="flex gap-2">
            <Input
              value={field.value}
              onChange={(e) => setCustom(i, 'value', e.target.value)}
              placeholder="Value"
              aria-label="Custom field value"
            />
            <button
              type="button"
              aria-label="Remove field"
              onClick={() => set('customFields', form.customFields.filter((_, idx) => idx !== i))}
              className="shrink-0 text-mut transition hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <QuietButton
        className="mb-3"
        onClick={() => set('customFields', [...form.customFields, { label: '', value: '' }])}
      >
        <Plus size={12} />
        Add a field
      </QuietButton>

      {error && (
        <KV label="Saving">
          <span className="text-rosek">Saving didn't work ({error}). Try again in a moment.</span>
        </KV>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !form.name.trim()}>
          {busy ? 'Saving' : 'Save partner'}
        </Button>
        <GhostButton onClick={onCancel} disabled={busy}>
          Cancel
        </GhostButton>
        {initial && (
          <GhostButton className="ml-auto" onClick={remove} disabled={busy}>
            Remove
          </GhostButton>
        )}
      </div>
    </Card>
  )
}
