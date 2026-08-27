# Novara feature handbook

What every shipped feature does, in the user's language. Written for an end user, a new
hire, or a support answer. No file paths, no collection names.

> **Generated — do not edit.** Built from the "What it does" section of each doc in
> `docs/features/` by `scripts/eng/build_feature_handbook.py`. An edit here is destroyed
> the next time it runs. Change the feature doc instead.
>
> The engineering half of each feature (the surface map, the change protocol, the
> cross-product stakes) stays in `docs/features/` next to the code. Only the user-facing
> half is extracted here, so the two cannot drift: there is one author and one source.


---

## Templates

**Built, unreleased**

### What it does

A template is your plan for a kind of event: the roles you need filled, the tasks that have to
happen and how far ahead of the day each one lands, the run of show minute by minute, and the
defaults you always start from. Templates are yours. Nothing ships with the product, and
nothing you write in one is visible to anyone else.

**Where to find them.** Templates in the sidebar, between Events and Calendar. Every template
you have shows its name, what is in it, and where it came from: seeded when it was loaded into
your account at setup, from an event when you saved one, or started blank.

**Making one.** Two ways. "New template" gives you an empty one and opens it for editing. Or
plan an event the way you want it, then open its overview and use "Save as template": the
tasks, the run of show, and the roles come across as they stand. Dates become offsets from the
event day, so the plan is reusable rather than stuck to one morning. Partner names stay behind.
A slot that said a partner's name in the event becomes the role they played, and you choose who
fills it next time.

**What you can change.** Everything, in the template editor:

- **Name and description**, so you know which plan this is at a glance.
- **Defaults**: start time, how long it runs, and the capacity you aim for. These fill in when
  you create an event and stay editable there.
- **Role slots**: the roles this kind of event needs. Each slot has a name you write yourself, a
  partner type, and a required or optional mark. Required only means the flow reminds you. You
  can always plan solo, and a template with no slots at all is a perfectly good checklist.
- **Tasks**: what has to happen, with a day offset. Minus 14 means two weeks before the event,
  2 means two days after. The order you put them in is the order they appear on the board.
- **Run of show**: the morning in order, each item a number of minutes from the start time.
  Minus 45 is 45 minutes before, 90 is an hour and a half in.
- **Matching**: whether this kind of event pairs people up, which profile it scores on, and the
  signup questions those answers have to come from. Rank runs today. Sparks and pods are
  written down here so the questions get onto the signup form, and they start working when the
  matching service is connected.

Renaming a slot carries the tasks and run of show items assigned to it, so nothing quietly
loses its owner. Removing a slot leaves anything assigned to it showing as no longer a slot, so
you can see what to reassign rather than having it silently become yours.

Changes save when you press "Save template". Until then the editor says you have unsaved
changes, and leaving asks first.

**Using one.** Start a new event and pick a template on the first step. Its role slots become a
partner picker, its defaults fill the basics, and the tasks and run of show arrive in the
workspace right away. Tasks get their real dates when you confirm one of the date options. If
the event is close, the early tasks compress into the runway you actually have instead of
landing in the past. Everything is editable in the event afterwards, and editing the event
never changes the template.

**Removing one.** The remove control on a template card, which asks first. Events already made
from it keep everything they were given.

---
