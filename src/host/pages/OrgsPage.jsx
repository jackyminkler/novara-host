import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'
import {
  ORG_TYPES,
  orgTypeLabel,
  listOrgs,
  createOrg,
  updateOrg,
  deleteOrg,
} from '../../lib/orgs.js'

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-accent'
const labelClass = 'mb-1 block text-xs font-medium text-ink/60'

const emptyContact = {
  name: '',
  role: '',
  email: '',
  phone: '',
  instagram: '',
  linkedin: '',
}

function cleanContacts(contacts) {
  return contacts
    .map((c) =>
      Object.fromEntries(
        Object.entries(c)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value !== ''),
      ),
    )
    .filter((c) => Object.keys(c).length > 0)
}

function contactsSummary(org) {
  const contacts = org.contacts ?? []
  return contacts
    .map((c) => (c.role ? `${c.name ?? c.role} (${c.role})` : c.name))
    .filter(Boolean)
    .join(', ')
}

function OrgForm({ initial, busy, error, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? 'cohost')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [contacts, setContacts] = useState(
    initial?.contacts?.length
      ? initial.contacts.map((c) => ({ ...emptyContact, ...c }))
      : [{ ...emptyContact }],
  )

  const setContactField = (index, field, value) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      type,
      notes: notes.trim(),
      contacts: cleanContacts(contacts),
    })
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={labelClass} htmlFor="org-name">
            Name
          </label>
          <input
            id="org-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who you plan with"
            autoFocus
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="org-type">
            Type
          </label>
          <select
            id="org-type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <span className={labelClass}>Contacts</span>
        <div className="grid gap-3">
          {contacts.map((contact, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-ink/10 bg-canvas p-3"
            >
              <div className="grid grow gap-2 sm:grid-cols-3">
                <input
                  className={inputClass}
                  value={contact.name}
                  onChange={(e) => setContactField(i, 'name', e.target.value)}
                  placeholder="Name"
                  aria-label="Contact name"
                />
                <input
                  className={inputClass}
                  value={contact.role}
                  onChange={(e) => setContactField(i, 'role', e.target.value)}
                  placeholder="Role"
                  aria-label="Contact role"
                />
                <input
                  className={inputClass}
                  value={contact.email}
                  onChange={(e) => setContactField(i, 'email', e.target.value)}
                  placeholder="Email"
                  aria-label="Contact email"
                  type="email"
                />
                <input
                  className={inputClass}
                  value={contact.phone}
                  onChange={(e) => setContactField(i, 'phone', e.target.value)}
                  placeholder="Phone"
                  aria-label="Contact phone"
                />
                <input
                  className={inputClass}
                  value={contact.instagram}
                  onChange={(e) =>
                    setContactField(i, 'instagram', e.target.value)
                  }
                  placeholder="Instagram"
                  aria-label="Contact Instagram"
                />
                <input
                  className={inputClass}
                  value={contact.linkedin}
                  onChange={(e) =>
                    setContactField(i, 'linkedin', e.target.value)
                  }
                  placeholder="LinkedIn URL"
                  aria-label="Contact LinkedIn"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setContacts((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="mt-1 shrink-0 text-ink/40 transition hover:text-ink"
                aria-label="Remove contact"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setContacts((prev) => [...prev, { ...emptyContact }])}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-ink/60 transition hover:text-ink"
        >
          <Plus size={14} />
          Add contact
        </button>
      </div>

      <div className="mb-4">
        <label className={labelClass} htmlFor="org-notes">
          Notes
        </label>
        <textarea
          id="org-notes"
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Lead times, preferences, anything worth remembering"
          rows={2}
        />
      </div>

      {error && (
        <p className="mb-4 text-sm text-ink/60">
          Saving didn't work ({error}). Try again in a moment.
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="accent-gradient rounded-xl px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm font-medium text-ink/60 transition hover:text-ink"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-sm font-medium text-ink/40 transition hover:text-coral-accent"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}

export default function OrgsPage() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | an org id
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      setOrgs(await listOrgs())
    } catch (err) {
      setLoadError(err?.code ?? 'unknown')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const startEdit = (id) => {
    setEditing(id)
    setSaveError(null)
  }

  const handleSave = async (data) => {
    setBusy(true)
    setSaveError(null)
    try {
      if (editing === 'new') {
        await createOrg(data, user.uid)
      } else {
        await updateOrg(editing, data)
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      setSaveError(err?.code ?? 'unknown')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this partner?')) return
    setBusy(true)
    setSaveError(null)
    try {
      await deleteOrg(editing)
      setEditing(null)
      await refresh()
    } catch (err) {
      setSaveError(err?.code ?? 'unknown')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Partners</h1>
        <button
          onClick={() => startEdit('new')}
          className="accent-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus size={16} />
          Add partner
        </button>
      </div>

      {editing === 'new' && (
        <div className="mb-4">
          <OrgForm
            busy={busy}
            error={saveError}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loadError ? (
        <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-ink/70">Partners didn't load ({loadError}).</p>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink transition hover:opacity-70"
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : orgs === null ? (
        <p className="animate-pulse text-ink/50">Loading partners</p>
      ) : orgs.length === 0 && editing !== 'new' ? (
        <div className="rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-1 font-semibold">No partners yet</h2>
          <p className="text-ink/70">
            Add the co-hosts, sponsors, and vendors you plan events with.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orgs.map((org) =>
            editing === org.id ? (
              <OrgForm
                key={org.id}
                initial={org}
                busy={busy}
                error={saveError}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
                onDelete={handleDelete}
              />
            ) : (
              <div
                key={org.id}
                className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{org.name}</h2>
                      <span className="rounded-full border border-ink/15 px-2 py-0.5 text-xs text-ink/70">
                        {orgTypeLabel(org.type)}
                      </span>
                    </div>
                    {contactsSummary(org) && (
                      <p className="mt-1 truncate text-sm text-ink/70">
                        {contactsSummary(org)}
                      </p>
                    )}
                    {org.notes && (
                      <p className="mt-1 text-sm text-ink/50">{org.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(org.id)}
                    className="shrink-0 text-ink/40 transition hover:text-ink"
                    aria-label={`Edit ${org.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}
