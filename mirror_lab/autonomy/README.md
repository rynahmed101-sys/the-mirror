# Imported Automate autonomy machinery

This directory is the isolated home for the autonomous development/control machinery that was removed from the Automate mathematics/physics engine.

Source:
- repository: rynahmed101-sys/automate
- source revision: c8079fd72e38e3c8ba4923a1ebb08b30bff05c0b
- purpose: autonomous discovery, worker orchestration, recovery, reconciliation, promotion, bookkeeping, readiness, and related control contracts

Boundary:
- Automate main remains a first-class mathematics/physics reasoning and verification engine.
- This package is experimental Mirror-side machinery and is not part of Automate core.
- The imported Python modules retain their original Automate module references intentionally for provenance. They are not claimed to be production-integrated into Mirror by this import alone.
- Canonical scientific truth and certification remain outside this package.

Next integration work belongs here, not in Automate.
