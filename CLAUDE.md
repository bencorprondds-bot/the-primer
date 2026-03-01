# The Primer

Open-source adaptive learning platform. Personalized, mastery-based education for every kid.

## Why This Exists

AI tutoring produces the largest gains for the students with the least resources (Stanford Tutor CoPilot, 2025). Alpha School charges $40K-$75K/year to route kids through existing EdTech with a custom dashboard. The technology isn't a moat — the price point is. The Primer inverts this: same pedagogical principles, open-source, free, designed for the kids who need it most.

## Architecture

Turborepo monorepo, Next.js 15 App Router, PostgreSQL + Prisma, BKT + FSRS adaptive engine.

```
the-primer/
├── apps/web/                    # Next.js 15 (App Router, TypeScript strict)
├── services/adaptive-engine/    # Python FastAPI (BKT mastery tracking)
├── packages/
│   ├── ui/                      # Shared React components (shadcn/ui)
│   ├── shared/                  # TypeScript types, constants, validators
│   ├── engagement-tracker/      # Browser engagement SDK (Page Visibility API)
│   ├── lti-provider/            # LTI 1.3 implementation (ltijs)
│   ├── ai-tutor/                # Claude Haiku 4.5 + Ollama/Phi-4-mini
│   └── math-renderer/           # KaTeX wrapper
├── content/                     # Content JSON (OATutor format, CC BY 4.0)
└── docker-compose.yml           # postgres, redis, ollama, adaptive-engine
```

## Commands

```bash
pnpm dev              # Start all services (Turborepo)
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm typecheck        # Type-check all packages
pnpm db:generate      # Prisma client generation
pnpm db:push          # Push schema to DB (dev only)
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Prisma Studio
docker compose up -d  # Start Docker services (postgres, redis)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript 5.7 strict |
| UI | shadcn/ui + Tailwind CSS 4 |
| ORM | Prisma 6.x |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | Clerk (with custom COPPA consent layer) |
| Math | KaTeX 0.16.x |
| AI Tutor | Claude Haiku 4.5 (primary), Phi-4-mini-reasoning via Ollama (fallback) |
| Adaptive | BKT (Bayesian Knowledge Tracing) + ts-fsrs (FSRS v6 spaced repetition) |
| LTI | ltijs (IMS-certified, LTI 1.3) |
| Testing | Vitest (unit), Playwright (E2E), pytest (adaptive engine) |

## Key Concepts

- **Knowledge Component (KC)**: Atomic unit of learning (e.g., "Distributive Property"). Has prerequisite graph.
- **BKT**: Bayesian Knowledge Tracing. Tracks P(mastery) per student per KC. Four parameters: P(L₀), P(T), P(G), P(S).
- **FSRS**: Free Spaced Repetition Scheduler. Manages post-mastery review scheduling. 21 parameters, DSR model.
- **Mastery threshold**: P(L) >= 0.95 means mastered. KC transitions from BKT active learning to FSRS review.
- **Check Chart**: Daily playlist of learning tasks. Student chooses order, can't skip prerequisites.
- **Guide**: Adult in the room. Not a teacher — hired for emotional intelligence and mentorship. Dashboard shows who needs help.

## Code Style

- TypeScript strict mode everywhere
- Prisma for all database access (no raw SQL)
- Server Components by default, Client Components only when needed
- Server Actions for mutations
- All math in KaTeX notation ($...$ inline, $$...$$ display)
- Components use shadcn/ui primitives
- Tailwind for styling, no CSS modules

## Content Licensing

- OpenStax: CC BY 4.0 — safe to use, modify, redistribute
- Illustrative Mathematics: CC BY 4.0 — safe
- Khan Academy: CC BY-NC-SA 3.0 — CANNOT use (NC restriction)
- CK-12: Proprietary — CANNOT use
- Always add attribution for CC BY content

## Regulatory Constraints

- COPPA: Verifiable parental consent for under-13 before ANY data collection
- FERPA: AI-generated mastery scores are education records. Never fine-tune on student data.
- EU AI Act: Adaptive learning = high-risk AI. Log everything, human oversight required.
- Never capture: keystrokes, screen content, webcam, mouse coordinates
- Only capture: time-on-task, activity indicators, problem responses, mastery states

## Environment

- `.env` file required (copy from `.env.example`)
- PostgreSQL runs in Docker: `docker compose up -d postgres`
- Clerk keys from https://dashboard.clerk.com
- Anthropic API key for AI tutor (Sprint 5+)
