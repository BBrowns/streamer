# Incident Triage Standards Baseline

Use this reference to coordinate consequential incidents and post-incident
learning without turning every defect into a ceremony.

## Response Principles

- Reduce user harm first while preserving enough evidence to diagnose safely.
- Assign explicit ownership and maintain one fact-based timeline.
- Separate mitigation, root-cause correction, and long-term prevention.
- Prefer reversible actions under uncertainty.
- State confidence and unknowns; do not fill timeline gaps with assumptions.
- Protect sensitive data in every diagnostic, report, fixture, and tool query.

## Root Cause And Learning

- Explain the system conditions that allowed the failure, not only the final
  human or code action.
- Identify detection, containment, recovery, and communication gaps.
- Add regression coverage at the boundary that can reliably reproduce the
  failure.
- Prioritize follow-ups by expected risk reduction and assign owners.
- Use a blameless record to improve the system, not to erase accountability for
  completing actions.
- Skip a formal post-incident record for low-impact, well-understood defects
  whose correction and regression evidence are already sufficient.

## Primary References

- [Google SRE incident management guide](https://sre.google/resources/practices-and-processes/incident-management-guide/)
- [Google SRE postmortem culture](https://sre.google/sre-book/postmortem-culture/)
