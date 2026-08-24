# Feature Framing Standards

Use this as a decision aid, not as a product requirements template that must be
completed for every small change.

## Quality Bar

- A user or operator can recognize the desired outcome without reading the
  implementation proposal.
- Acceptance criteria describe observable behavior and important failure states.
- Assumptions are labeled and consequential unknowns are resolved before code.
- Non-goals prevent scope expansion while leaving room for a better component
  shape when evidence supports it.
- The smallest slice still preserves security, compatibility, ownership, and
  rollback obligations.

## Evidence Order

1. User outcome and explicit constraints.
2. Local source, tests, contracts, and runtime evidence.
3. Current external documentation or research when requested or necessary.
4. General product and engineering principles.

Do not let a generic pattern override a repository contract without naming the
gap and planning its migration.

## Primary References

- [OpenAI Codex best practices](https://learn.chatgpt.com/guides/best-practices)
- [Google engineering design documentation](https://google.github.io/eng-practices/review/design-documents/)
- [Google small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
