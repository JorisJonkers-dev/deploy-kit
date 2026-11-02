---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-11-02
normative: spec/v1/16-dependencies.md#a-bucket-a-browser-calls
rests-on: ["0004", "0005"]
---

# A bucket a browser calls names the exposures it admits, and the store's catalog method sets its one CORS rule

A bucket entry on an edge into an object store may name the exposures of the
consuming Application whose pages call it from a browser. Each derives one
origin, the catalog carries those origins per bucket, and the store's catalog
method sets one fixed CORS rule on each such bucket and removes any rule from
every other bucket of the catalog. The rules are in
[A bucket a browser calls](../../../spec/v1/16-dependencies.md#a-bucket-a-browser-calls).

## Rests on

A bucket's configuration is the object store's, which every consumer of it
contends for, so the platform applies it
([0004](0004-contention-decides-authority.md)), and an origin is a host an
exposure already declares, so it is derived and never written again
([0005](0005-derivation-is-total.md)).

**False if:** a consumer's pages need a bucket to answer an origin that is no
exposure of its own Application, or need a method beyond the fixed four.
**Settled by:** outline's pages posting an upload to its bucket and reading it
back, with the bucket admitting outline's own origin and no other.

## Why

**Most consumers never need it, so it is opt-in per bucket.** Karakeep and
Overleaf reach their buckets from their own Processes alone. A rule derived
from every consumer's exposures would open each of their buckets to their
pages for nothing. The one consumer whose pages call its bucket, outline,
says so on that bucket and no other.

**The origin is named by exposure, never written as a URL.** The host is
already authored once, on the exposure. A URL in the edge would be a second
copy that drifts the day the host changes, and could name a host the
consuming Application does not serve.

**The methods are fixed.** A browser posts or puts an upload and reads it
back, so `GET`, `HEAD`, `POST` and `PUT` cover every case the estate has. An
authored method list is a field nobody would set to anything else. Leaving
`DELETE` out keeps a page from deleting an object without its application.

**The catalog states every bucket's rule, so a removed `cors` leaves nothing
behind.** The method removes a rule from a bucket that admits no origin. A
method that only ever added rules would leave an origin admitted after the
edge stopped naming it, which nobody reading the document could see.

**The admin API sets the rule.** The store's admin API sets a bucket's CORS
rule with the token the method already signs in with, so no key with
ownership of the bucket is minted to do it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Derive the rule from every exposure of every consumer | no field | opens every consumer's buckets to its pages, Karakeep's and Overleaf's among them, for no request that needs it |
| An authored origin URL on the bucket | one string | a second copy of a host the exposure already holds, free to name a host the Application does not serve |
| An authored method and header list | full S3 CORS vocabulary | provider vocabulary in Project Intent, for a choice with one answer |
| The method only adds rules | simpler method | a `cors` taken off an edge leaves its origin admitted, invisibly |
| Set the rule from a bootstrap job with an owner key | no model change | a step outside the render, and an owner key on the bucket while it runs |

## Reversibility

Undo cost today: one bucket form, one catalog field and one method step: an
hour. Becomes costly once: consumers' pages rely on posting straight to their
buckets, and taking the rule away means routing every upload through the
application.

## Consequences

- A bucket entry is a name, or `{name, cors}`.
- A key in the bucket catalog carries `cors` where any of its buckets admits
  an origin.
- The catalog method sets and removes bucket CORS rules over the admin API,
  and reads each back.
- `E_UNKNOWN_CORS_EXPOSURE` refuses a `cors` entry that names no exposure of
  the consuming Application.
- Reaching the bucket from a browser also needs a route to the store's `s3`
  surface on a host of its own, which is an ordinary exposure of the store,
  restricted by path to the bucket.
