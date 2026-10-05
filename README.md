# THE MIRROR — Math & Physics Science Lab

THE MIRROR is an experimental laboratory for testing mathematical ideas, physical models, formulas, numerical methods, and unverified code.

## What Mirror does

Mirror is the **laboratory**, not the production calculation engine.

```
IDEA / HYPOTHESIS
       ↓
UNVERIFIED SANDBOX
       ↓
TRUSTED THEORY ADAPTER
       ↓
REFERENCE CASES
       ↓
NUMERICAL EVALUATION
       ↓
ERROR + RUNTIME ANALYSIS
       ↓
STABILITY CLASSIFICATION
       ↓
EVIDENCE LEDGER
```

The separate Math/Physics suite remains the owner of canonical formulas, numerical algorithms, symbolic derivations, physical constants, units, and production calculations. Mirror consumes trusted adapters when a theory is ready to be tested.

## Laboratory capabilities

- Standard `BaseTheory` contract for mathematical and physical theories.
- Scalar and vector numerical outputs.
- Reference-case testing with shape validation.
- Absolute error, RMSE, relative error, maximum deviation, and runtime metrics.
- Automatic stability classification:
  - **Gold Standard Tier-1**
  - **Silver Standard Tier-2**
  - **Experimental Tier-3**
  - **Unstable**
  - **Failed**
- Persistent run evidence through the existing Drizzle experiment ledger.
- Isolated Vercel Sandbox execution for unverified JavaScript.
- Network-denied ephemeral execution; sandbox code is never promoted automatically.
- Admin-protected browser laboratory and machine-readable API.

## Scientific meaning of a tier

A tier is an **implementation agreement with supplied reference cases**, not proof that a theory is true.

A Tier-1 result means the implementation produced effectively zero numerical error against the supplied cases under the laboratory thresholds. It does not establish the correctness of the underlying hypothesis outside those cases.

## Adding a theory

Implement `BaseTheory` in `src/lib/science/registry.ts` or split adapters into their own module.

Each adapter supplies:

- stable theory id
- human-readable name
- domain
- version
- description
- source
- input validation
- deterministic or controlled evaluation

For production mathematics/physics, use `source: "automate-adapter"` and keep the actual calculation logic in the separate Math/Physics suite.

## API

- `GET /api/science-lab/theories`
- `POST /api/science-lab/run`
- `GET /api/science-lab/sandbox`
- `POST /api/science-lab/sandbox`

All laboratory endpoints require the controller session or control credential.

## Local development

```bash
npm install
npm run dev
```

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET` for protected access. SQLite is used locally by default; the existing PostgreSQL/Drizzle configuration remains available for deployment.

## Separation rule

Do not put production scientific calculation logic into Mirror merely to make an experiment convenient. Mirror exists to **challenge, measure, compare, record, and reject/promote ideas**.

## License

MIT
