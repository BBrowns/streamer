# Security Standards Baseline

Use OWASP ASVS as a verification catalog, not as a claim of certification.
Reference the ASVS version when citing a requirement.

## Review Areas

- Input validation, encoding, and injection prevention.
- Authentication, session handling, and recovery.
- Object-level and function-level authorization.
- Sensitive-data classification, storage, transport, retention, and deletion.
- Cryptography and key management through established implementations.
- Safe error handling, logging, audit events, and telemetry.
- Network destination validation, redirect handling, SSRF, and private networks.
- File, archive, process, and command safety.
- Browser, renderer, origin, navigation, CSP, and IPC isolation.
- Resource limits, concurrency, idempotency, and denial of service.
- Dependency provenance, updates, lifecycle scripts, and vulnerability response.
- Secure configuration, defaults, deployment, and rollback.

## Severity

Prioritize with concrete exploitability and impact:

- **Critical:** practical compromise of high-value assets or broad remote code
  execution with no meaningful prerequisite.
- **High:** serious confidentiality, integrity, availability, or privilege
  impact under plausible conditions.
- **Medium:** limited impact, stronger prerequisites, or a meaningful
  defense-in-depth gap.
- **Low:** hardening opportunity with small direct impact.

Increase urgency when a control failure is silent, broadly exposed, persistent,
or difficult to recover from.

## Primary References

- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [SLSA supply-chain framework](https://slsa.dev/spec/)
