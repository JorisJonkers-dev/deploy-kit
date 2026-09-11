# Contributing

This is a source-available proprietary project owned by Joris Jonkers.

External contributions are not accepted unless Joris Jonkers explicitly asks
for them. Public pull requests may be closed without review.

If you were invited to contribute:

1. keep changes scoped to the requested repository and issue
2. do not include secrets, private data, local scratch files, or generated
   planning artifacts
3. do not hand-edit `CHANGELOG.md`; release-please owns changelog updates
4. include the relevant tests or validation output in the pull request
5. use impersonal, professional commit and pull request wording

New prose is written without em-dashes: use a comma, a colon, a full stop or
parentheses instead. A test (`npm test`) fails if a tracked text file gains an
em-dash, and the same test flags any file on the transitional allow list that
no longer has one, so rewrite batches take their files off the list in the same
pull request.

Security vulnerabilities must be reported privately as described in
`SECURITY.md`.
