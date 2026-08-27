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

## Recap and ROI

**Built, unreleased**

### What it does

After an event, the recap is where you write down what happened, once, and every partner gets
their own page from it. Before the event, the same records carry what each side agreed to do
and what the place is going to ask of you.

**Deliverables, both directions.** Every partner card on an event has two short lists: what
they deliver, and what you deliver. Each line has a title, an optional date, and a tick. The
card shows the count without opening anything: "2 of 3 from them, 1 of 2 from you". This is
the effort ledger. An arrangement where one side is quietly doing everything shows up as a
number instead of as a feeling, early enough to say something.

**Spend.** The recap holds a spend log for the event: a line, an amount, whether it was cash
or in-kind, and which partner it sits with. It totals cash and in-kind separately, because a
DJ playing for free is worth saying out loud even though no money moved. Spend is private to
you. It never appears on a guest page or a recap link.

**Where people came from.** When an event's guest list has been imported, the recap groups
signups by the source they arrived through and shows how many signed up from each. Once a
guest export carries check-in times, the same table shows how many actually came and the show
rate per source. Until then it shows the typical rates instead, so you have something to
compare against rather than a blank: about 62 percent from your own reach, 27 from partner
reach, 20 from featured listings.

**Each partner's page.** Every partner section on the recap opens with the goal you recorded
for them, holds up to three outcomes you fill in, and closes with the spend attributed to them
and its total. Goal at the top, what happened at the bottom.

**Attendance stays uncounted.** Your own headcount is the baseline, every person you captured
at the event counts as verified presence, and you can add names you remember. There is no
check-in of any kind and there never will be. Free community events must never feel gated.

**Site lessons.** When a venue is one of the parties on the event, the recap asks what the day
taught you about the place. What you write goes onto the venue, not onto the event, so it comes
back the next time you plan there. The venue's page in your partner directory shows every
lesson with the event it came from, the headcount that needs a permit, whether amplified sound
needs one, and any standing notes. All of it is yours alone.

**Permit and date warnings.** With a venue on the event, the overview shows a quiet chip when
your capacity target passes that site's permit threshold, and another when the site needs a
permit for amplified sound. A second chip appears when one of your other events sits on the
same day, on the overview and beside the date option itself. None of them block anything. They
are the things nobody remembers until the morning of.

**Talk tracks and the shot list.** The overview holds a short list of prompts for the day, in
your words. The run of show holds a shot list: what to photograph and who is holding the
camera, assignable to you, a partner, a crew person, or everyone.

---

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
