---
tier: decision
status: accepted
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#participants
rests-on: ["0001"]
---

# Participants are listed, bounded by seven days of staleness

Composition reads an enumerated list of expected participants, the Platform
document among them ([0045](0045-platform-intent-is-the-second-authored-document.md)).
A participant absent from the registry is `E_PARTICIPANT_MISSING`; one that has
not published within its `maxAge`, seven days by default, is
`E_PARTICIPANT_STALE`. A `maxAge` other than the default needs a reason, and
`dormant: true` exempts a participant from `maxAge` and from nothing else. An
entry is keyed by its project's name, and a fragment the list does not name is
`E_PARTICIPANT_UNLISTED` and is not composed.

## Rests on
A project that has published nothing for seven days has stopped publishing by
fault, not by cadence. False if: a non-dormant participant routinely goes more
than seven days between publishes while everything about it is healthy, then
the bound fires on normal operation and gets ignored, which is worse than no
bound. Settled by: list each participant's published fragment tags with push
timestamps over 90 days (`oras repo tags` against the GHCR namespace) and take
the maximum inter-publish gap; the claim fails if any non-dormant participant
exceeds 7 days. Baseline today: `CHANGELOG.md` records 26 releases between
2026-06-09 and 2026-08-20, 72 days, one every 2.8 days.

## Why
A render is only as current as the last publish, and a project that has not
published does not contribute. Under per-Project pins an omitted project moves
no pin, so its own objects stay applied
([0051](0051-a-project-is-delivered-as-a-signed-artifact.md)); what it loses is
its share of the estate-scoped paths (its edge routes and secret-sync
policies), which the next estate render would drop from a render that looks
entirely valid. `E_PARTICIPANT_MISSING` and `E_PARTICIPANT_STALE` stand between
a missed publish and that loss.

Deriving the expected set from inbound references was considered and is
insufficient. A leaf Application that nothing depends on can vanish without breaking
any reference, and leaves are the majority: `immich`, `jellyfin`, `sonarr`,
`radarr`, `bazarr`, `prowlarr`, `qbittorrent`. Those seven media applications are
depended on by nothing, so an inbound-edge derivation notices none of them going
missing. The expected set is therefore enumerated, and that enumeration is the
one central artefact that survives composition by fragments
([0042](0042-declarations-compose-from-intent-fragments.md)): it changes when a project or test
project is added or retired, never when a declaration changes.

The old decision said "with a staleness bound" and the review flagged the
adjective. It is not academic: `spec/v1/40-composition.md:209` currently reads
`intent-media: {maxAge: 180d}`, so the media project's publishing pipeline can be
broken for half a year (roughly 64 observed release intervals), before the
error that protects seven applications fires. The default is
therefore **7 days**, about 2.5 observed intervals: long enough to absorb two
consecutive missed releases (2.5 x the observed 2.8-day interval), short enough
that a broken publish job is caught in the same week it breaks. A participant may override it with a
reason. `dormant: true` is the separate exemption, carrying a reason and a
review date like every other entry under
[0038](0038-bidirectional-ledgers.md); it exempts a participant from `maxAge`
and from nothing else, a dormant fragment still unions, and still satisfies the
version range of [0044](0044-artifact-schema-versioning.md).

**The list is the admission, in both directions.** A list that only caught
absence would let a project join the estate by publishing: its fragment would
compose, take paths and reach other Projects' surfaces, and the list would be
corrected afterwards. So a fragment whose project the list does not name is left
out and reported, the same as one that never composed. An entry is keyed by the
project's own name, the one its fragment declares, which is what makes both
checks one lookup; the registry path a fragment is pulled from is the
workflow's business, not the list's. The name is held to what the fragment
carries: one published as a listed project whose own project file declares
another composes as that other project, so it is refused as unlisted rather
than admitted under the name on its manifest.

**A fragment carries no time.** Packing the same inputs twice gives one digest,
which a publish time inside the fragment would break. Staleness is therefore
read from what the registry recorded of the push, written beside the reference
by the workflow that pulls the fragment, against the one clock reading of the
composition.

**A missing participant is recorded without a fragment.** The lock's record of
why a Project stayed where it was names the fragment that was refused. A
participant that published nothing has none, so that name is optional and the
code alone says what happened.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| No list; compose whatever published | zero to build | a broken publish job is indistinguishable from a retirement, and its estate-scoped objects drop silently |
| Derive the expected set from inbound dependency edges | Free, the edge graph already exists in chapter 16. Costs the seven media leaves, which have no inbound edges and would vanish undetected | The majority of the estate is leaves; a guard blind to the majority is not a guard |
| Keep the written 30/90/180-day per-project bounds | No edit. `intent-media` tolerates a 180-day outage, `intent-nodes` 30 | A bound 64× the interval it protects fires only after the damage it exists to prevent |
| Compose a fragment the list does not name, and fix the list afterwards | a new project composes the moment it publishes | publishing would be joining; the list would guard against absence and admit anything |
| Fail the run on an unlisted fragment | the strongest refusal | one stray publish would stop every Project's pin |
| Key an entry by the registry repository a fragment is pulled from | the example the chapter used to carry | a second name per project, and a rule to get from it to what a fragment declares |
| A publish time in the fragment's own manifest | self-contained | packing the same inputs twice would give two digests |
| Let `dormant: true` exempt the version check too | Removes the republish burden on a project nobody is touching | A dormant fragment still unions into `ComposedIntent`; exempting it means a fragment the toolkit cannot read is merged anyway |

## Reversibility
Undo cost today: `participants.yml` is one file plus the two error paths in the
composition resolver that read it. Deleting it removes a guard, not a capability,
no rendered manifest changes, an afternoon. Changing
the number alone is a one-line default. Becomes irreversible once: retiring a
project is performed *by* deleting its row, at which point the list is the
estate's only enumeration of expected projects, with nothing left to rebuild it.

## Consequences
- A publishing pipeline that breaks fails composition within seven days instead
  of silently dropping a project's estate-scoped objects, paid by the project owner, who gets a
  red compose rather than a silent restore.
- A stale participant is isolated at its last composed fragment while every
  other Project still composes
  ([0085](0085-composition-isolates-a-refused-project.md)), paid by its own
  owner, who fixes the publish job.
- A project that genuinely publishes less often than weekly must carry an
  override with a written reason, paid by that project's owner.
- Dormancy costs a reason and a review date and is reviewed as a ledger entry,
  paid by the platform owner at review time.
- A dormant project must still be republished when it falls out of the accepted
  version range, paid by the owner of a repository nobody is otherwise
  touching, which is the least convenient party.
- Seven days is measured against this estate's cadence, not a general constant;
  a change in participant count or release rate invalidates it and the
  measurement has to be rerun, paid by the platform owner.
