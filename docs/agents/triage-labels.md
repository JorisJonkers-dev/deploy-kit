# Triage Labels

The engineering skills speak in terms of five canonical triage roles. This
file maps those roles to the label strings this repository's issue tracker
actually uses: the estate's prefixed `status:` set.

| Label in mattpocock/skills | Label in this repository | Meaning |
|---|---|---|
| `needs-triage` | `status: triage` | Needs initial review and classification |
| `needs-info` | `status: needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | `status: ready-for-agent` | Fully specified; an agent may take it with nobody watching |
| `ready-for-human` | `status: ready-for-human` | Requires human implementation |
| `wontfix` | `status: declined` | Will not be pursued |

When a skill mentions a role (for example, "apply the AFK-ready triage
label"), use the corresponding label string from the right-hand column.

`status: ready-for-agent` and `status: ready-for-human` join the estate-wide
label taxonomy in `JorisJonkers-dev/.github`'s `labels.yml` as a paired
change (issue #32); until that change merges and `label-sync` runs, both
exist in this repository only. `status: in-progress` is the sixth `status:`
label this repository's own claiming procedure uses
([`AGENTS.md`](../../AGENTS.md#claiming-a-ticket)); it has no canonical role
in the five above and is not one of this table's rows.
