import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import {
  Button, Card, Chip, EmptyState, ErrorState, Loading, Sub, SubTitle,
} from '../../ui/primitives'
import { matchingModeLabel } from '../../data/profiles'
import { track } from '../../lib/analytics'
import type { Template } from '../../data/types'
import type { TemplateInput } from '../../data/api'

// Full-width collection, same shape as Partners. Templates are user data:
// nothing here ships with the app, and every card is something the host
// either seeded, saved from an event, or started blank.

const CREATED_FROM: Record<Template['createdFrom'], string> = {
  seed: 'Seeded',
  event: 'From an event',
  blank: 'Started blank',
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** A new template holds nothing. Content is the host's, never the app's. */
function blankTemplate(): TemplateInput {
  return {
    name: 'Untitled template',
    description: '',
    roleSlots: [],
    taskSkeleton: [],
    runOfShowSkeleton: [],
    defaults: {},
    matching: null,
    createdFrom: 'blank',
  }
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const host = useHost()
  const { data, error, loading, reload } = useAsync((api) => api.listTemplates(), [])
  const { mutate, busy } = useMutation(reload)

  const create = () =>
    void mutate(async (api) => {
      const id = await api.createTemplate(blankTemplate(), host.uid)
      track('hp_template_created', { createdFrom: 'blank' })
      navigate(`/app/templates/${id}`)
    })

  const remove = (template: Template) => {
    if (!window.confirm(`Remove ${template.name} from your templates?`)) return
    void mutate(async (api) => {
      await api.deleteTemplate(template.id)
      track('hp_template_deleted', { templateId: template.id })
    })
  }

  const addButton = (
    <Button onClick={create} disabled={busy}>
      <Plus size={13} />
      New template
    </Button>
  )

  return (
    <Page>
      <PageHeader
        title="Templates"
        subtitle="Your own plans. Each one fills in role slots, tasks, and a run of show when you start an event."
        action={addButton}
      />

      {loading && <Loading label="Loading templates" />}
      {error && <ErrorState message={`Templates didn't load (${error}).`} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          title="No templates yet"
          body="Save one from an event you liked, or start blank."
          action={addButton}
        />
      )}

      <div className="grid gap-3">
        {data?.map((template) => (
          <Card key={template.id} className="transition hover:border-viodash">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/app/templates/${template.id}`} className="min-w-0 flex-1">
                <SubTitle className="truncate text-sm">{template.name}</SubTitle>
                {template.description && <Sub className="truncate">{template.description}</Sub>}
                <p className="mt-[3px] text-[11.5px] text-mut">
                  {count(template.roleSlots.length, 'role slot')},{' '}
                  {count(template.taskSkeleton.length, 'task')},{' '}
                  {count(template.runOfShowSkeleton.length, 'run of show item')}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {template.matching && (
                  <Chip tone="vio">{matchingModeLabel(template.matching.mode)}</Chip>
                )}
                <Chip tone="gray">{CREATED_FROM[template.createdFrom]}</Chip>
                <button
                  type="button"
                  aria-label={`Remove ${template.name}`}
                  onClick={() => remove(template)}
                  disabled={busy}
                  className="text-mut transition hover:text-rosek disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  )
}
