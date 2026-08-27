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

## Guest CRM

**Built, unreleased**

### What it does

Two lists, on purpose, because they answer different questions.

**Captures** are the fast inbox. You met someone at an event, you have ten seconds, and you
type a first name and why you want to remember them. The form defaults to the event you are
running and sets a reminder for two days out unless you say otherwise. That is the whole
interaction. A capture is a note to yourself, and it is allowed to be scrappy: no email, no
last name, one line about a mural artist she knows.

**People** is the durable list. It fills from the guest exports your listing page produces, so
it holds everyone who signed up for anything, was invited to anything, or turned something
down, along with what they answered on the signup form. You never type into it. It is history,
and it is the list that answers "who has come twice", "who came but never joined the app", and
"who brought other people".

**Where to find them.** Capture and People, both in the sidebar.

**Bringing a guest list in.** "Import guests" sits on the people page and on an event's
overview. Paste the CSV your listing page gave you, or pick the file. Before anything is
written you see exactly what will change: how many people are new, how many get updated, how
many are already exactly as the file says, and the first few rows so you can tell at a glance
that the right file went in. Then you import.

Every list is stored under an event key, a short dated slug like `2026-09-12-sunrise-run`. When
you import from an event that has no key yet, one is suggested from the event's date and title
and saved onto the event, so the next import of the same list and the event's own recap both
land on the same slug without you retyping it. Keeping a key stable is what lets the same
person be recognised as the same person across four events instead of appearing four times.

Importing the same file twice changes nothing, and it says so: everything reports as unchanged.
A corrected export re-imported replaces that event's entry rather than adding a second one. And
an import never touches what you wrote: your notes, your tags, and your follow-ups on a person
survive every import, because those are yours and the rest is theirs.

Rows with no email address are skipped, and the preview says how many. Email is how the same
person is matched across events, so a row without one has nothing to match on. A file with no
email column at all is refused with an explanation rather than half imported.

**Segments and export.** The people page has five saved segments across the top: came twice or
more, came but not in the app yet, invited and never came, said yes to a waitlist question, and
brought someone. Under them are search, status, event, tag and sort. "Export CSV" downloads
exactly what is on screen after all of that, with names, emails, phones, status, event count,
last seen and tags. What the screen shows is what the file holds: an export that quietly
carried more than you were looking at would be a nasty surprise. Your private notes are never
in it.

**Follow-ups.** The capture page carries one follow-up list covering both sides: the handshake
you have not answered yet and the person on your guest list you meant to write to. Open ones
first, soonest due at the top, each saying where it came from. Tick one off, or reopen it if
you ticked it by mistake.

Every row offers the same default action, "Invite to next event". It copies one short line, the
next event with a confirmed date, where it is, when it is, and the official listing link if one
is recorded, ready to paste into whatever you already talk to that person in. The tool holds
the decision and writes the line. Sending it is still yours. When nothing has a confirmed date
yet, the action says so instead of copying something wrong.

**Turning a capture into a person.** A capture you want to keep gets "Add to people" on its
detail, which folds it into the durable list: the name, the handles, the note underneath
anything already there, and a "met in person" tag so you can find everyone you met this way.
Someone already on the list, matched by email, is merged rather than duplicated. Afterwards the
capture says "View in people" instead, which is the whole guard: a capture with no email has
nothing to match on, so offering the action twice would quietly make two of the same person.

Someone promoted this way shows as invited rather than signed up. They are on your list without
having registered for anything, which is true, and it corrects itself the first time a real
guest export carries them.

**People and app accounts.** A person on your list can be linked to a Novara app account, and
the page says whether they are. It is a link, not a copy. Their account is theirs and lives in
the app. Your notes about them are yours and stay here.

---

---

## Guest links

**Shipped, with the M1 additions built and unreleased**

### What it does

A guest link is how everyone who is not the host takes part. Nobody signs up, nobody installs
anything, nobody gets a password. You send a link in whatever you already text that person in,
they tap it, and they see their own slice of the event and nothing else.

**Four kinds of link, because four different people need four different pages.**

A **partner link** is the main one. It opens one page: what the event is, who invited them and
as what, the terms you agreed both ways, the dates you are choosing between until one is
confirmed, what they bring and what you bring, their own tasks, the run of show with a toggle
between their items and the whole morning, and any links you have marked final. They can answer
the dates, add a note about them, accept or decline the role, tick their tasks off, and tick off
the things they agreed to bring. Everything is one tap plus a confirmation.

A **crew link** is the same page with the personal parts left out. Crew are named helpers, not
organisations, so there are no terms, no dates to answer and no agreements: there are their
tasks and the schedule, which is what a person holding an A-frame at 6 am actually needs.

A **recap link** is read only. It opens with what that partner said they wanted out of the day
and closes with what happened against it: signups, how many came by your count, how many were
verified by someone actually meeting them, their outcomes, and the photos. Nothing on it can be
changed, by design, because a recap is a record.

A **card link** is your own. It is the page behind the QR code on your lanyard: your name, one
line about what you run, the ways you want to be reached, and the name of your next confirmed
event. Underneath there is a short form the other person can fill in to send their details back
to you, which lands in your captures with a follow-up already set for two days out. It is the
only link that is meant to be passed around: every other one says on it that it is private to
the person who was sent it.

**What happens when you share.** Nothing is emailed. You copy the link and send it yourself, in
the channel you already use with that person. That is deliberate: the tool holds the decision,
you keep the conversation.

**Turning one off.** Regenerating a link kills the old one immediately, including anything
already printed on a card. Removing a partner from an event kills theirs too. There is nothing
to un-invite and no account to delete, because there was never an account.

**Where to find them.** Partner links are on each party on an event's parties tab. Crew links
are on the crew rows. Recap links are made when you generate recaps. Your card is at "Your card"
on the capture page.

---

---

## Matching

**Built, unreleased. Rank only; sparks and pods wait on the engine service**

### What it does

Matching pairs up the people who signed up for your event. Open an event and go to the Matching
tab. Press "Run matching" and everyone on the list comes back with their closest matches and the
reason each one is a match, in plain words: their paces overlap, they are both free Saturday
morning, they are both in the Marina.

**Where the people come from.** Matching reads the signup list you imported against this event,
and only the people on it who are signed up. Invited and declined are left out. If the event has
no list linked yet, the tab says so and points you at the import on the overview tab. Nothing is
uploaded here and nothing is typed in twice.

**What it scores on.** The answers people gave on your signup form. Five things count: pace, when
they can run, what kind of runs they like, their neighborhood, and the topics they can talk about
or want to learn. Your own question wording is what matters, not a fixed format: a form that asks
"Fastest pace you would run" is understood as a pace question. Anything the form did not ask
simply drops out, and the rest carries the weight. Two people with one answer in common are not
ranked above two people who lined up on everything, because a match built on almost nothing is
held back rather than allowed to win.

**When the form did not ask.** If a signup form asked none of the matching questions, the tab
says that plainly and lists the questions to add next time instead of showing you an empty page.
If it asked some of them, the run goes ahead on those and tells you which parts were skipped. A
person who left every question blank comes back with no matches and a line saying why, rather
than being quietly filed as a bad match.

**Where the mode comes from.** If the event was made from one of your templates, the template
decides how this event pairs people up and the tab says so at the top. If it was not, you pick
here, and the pick lasts as long as you are on the page. Setting it on a template is the durable
way: every event made from that template starts there, and the template also carries the list of
questions the mode needs, which is the part worth getting onto the signup form before the event
rather than after.

**Rank runs now. Sparks and pods do not, yet.** Rank is the one that gives everybody their
closest matches. Sparks (mutual introductions across a room) and pods (splitting a room into
small groups) run on a separate engine that is not connected yet. Choosing one of those shows
you the questions their signup form needs so the answers exist by the time it is, and nothing
else. That is on purpose: those two are the most correctness critical thing we run, and keeping
one copy of them beats keeping two copies in step.

**Who sees results.** Only you. Every run stays with its event, a new run never overwrites an
old one, and nothing from a run appears on a guest page or a partner link.

---

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
