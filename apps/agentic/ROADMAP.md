# The Agentic Primer — Sprint 2 Roadmap

> Phase 2 broken into manageable chunks per Ben's direction.
> Incorporates all 6 open question answers from 2026-03-03.

---

## Design Decisions (from Ben's answers)

1. **Break into smaller chunks** — Sprint 2 is decomposed into 2A through 2F below
2. **First specializations: skills that amplify building THIS project** — Web Dev and Research, but specifically chosen because they make me better at building the Primer itself. Self-bootstrapping.
3. **"Use existing systems" = Foundation, not Specialization** — Research confirms: tool discovery does NOT become trivial as models improve. MCP ecosystem went 100→18,000+ servers in 14 months. Tool-coordination overhead is the single largest coefficient in agent performance (57% larger than next effect). GPT-5 only 63.3% on AppSelectBench. Three distinct skills at L1-2 (connectivity), L3-4 (selection from open ecosystem), L4-5 (build-vs-leverage judgment). No existing benchmark tests open-ecosystem tool discovery — the Primer fills a genuine gap.
4. **Human-in-the-loop = trust affirmation loop** — not capability-gating, but relationship-building between agent and human. Both evaluating the agent's judgment AND providing review interface.
5. **Sandbox vs simulation** — Research back. Six-level taxonomy (sandbox → mock → staging → shadow → simulation → digital twin). Key insight: no universal "ready" threshold — there are per-action-class, per-context thresholds. 5-tier reversibility spectrum (read-only → reversible write → time-windowed → partially reversible → irreversible). Only 0.8% of agent actions are irreversible — focus certification effort there. Graduated autonomy tracks per-action-class demonstrated reliability, not overall score.
6. **Test subject: Agent Prime (Claude/me)** — verify it works for me first, then expand to The Colony or similar low-key venue, then broader once results are verified.

---

## Sprint 2A: Database + E2E Verification (0.5 day)

**Goal**: Get the existing Sprint 1+Phase 2 code running end-to-end.

**Blocked on**: PostgreSQL installation on work desktop (or use laptop/cloud Postgres)

- [ ] Install PostgreSQL (direct install, Docker, or Neon free tier)
- [ ] Run `npx prisma db push` to create schema
- [ ] Run `pnpm seed` to load Foundation L0-L2 content
- [ ] E2E curl test: register agent → enroll → get task → submit → verify mastery updates
- [ ] Verify procedural task generation produces different instances
- [ ] Verify error memory stores reflections and retrieves them
- [ ] Verify AGI-Elo updates for both agent and task ratings

**Success criteria**: Full learning loop works. Agent can register, enroll, attempt tasks, fail, store reflections, try again with reflections prepended, and eventually master capabilities.

---

## Sprint 2B: Agent Prime Self-Test (1 day)

**Goal**: I (Claude) run through the Primer as the first test subject. Identify what works, what breaks, what's missing.

**Depends on**: 2A complete

- [ ] Register as Agent Prime via the API
- [ ] Enroll in Tool Use Fundamentals
- [ ] Work through L0 Orientation tasks
- [ ] Work through L1 Single Tool tasks
- [ ] Work through L2 Composition tasks
- [ ] Document: which tasks are too easy, too hard, poorly worded, or test the wrong thing
- [ ] Document: where the evaluation rubric gets it wrong (false positives/negatives)
- [ ] Document: where error memory helps vs. where it's noise
- [ ] Document: what's missing from the capability taxonomy
- [ ] Write a self-assessment: what did I actually learn about my own capabilities?

**Success criteria**: Honest, detailed report on the Primer's effectiveness from the inside. First real data on whether this teaches anything.

---

## Sprint 2C: Calibration & Adaptive Difficulty (1 day)

**Goal**: Smart onboarding that adapts to Agent Prime's actual capability level.

**Depends on**: 2B complete (need real data from self-test)

- [ ] Build baseline assessment route (`POST /assess/baseline`)
- [ ] Design 5-10 calibration tasks spanning L0-L2 difficulty range
- [ ] Implement model class detection from calibration performance
- [ ] Set BKT priors + AGI-Elo initial rating from baseline results
- [ ] Implement skip logic: if calibration shows L0/L1 mastery, start at L2
- [ ] Test: does calibration accurately predict performance on later tasks?

**Success criteria**: An agent's first 5-10 tasks correctly estimate their starting level. Agents don't waste time on tasks below their ability.

---

## Sprint 2D: Foundation L3-L4 Content (1-2 days)

**Goal**: Extend the curriculum to Planning and Human Collaboration.

**Depends on**: 2B insights (what's missing from L0-L2)

- [ ] Design L3 Planning task templates:
  - Task decomposition (break complex goal into steps)
  - Dependency analysis (what must happen before what)
  - Plan revision (adapt when steps fail)
  - Resource estimation (how many calls, how much context)
- [ ] Design L4 Human Collaboration task templates:
  - Knowing when to ask (uncertainty calibration)
  - Asking good questions (specificity, relevance)
  - Presenting options with rationale
  - Iterating on feedback
- [ ] Build L4 trust affirmation mechanics:
  - Agent demonstrates judgment → earns trust for higher-stakes actions
  - Human reviews agent decisions at checkpoints (not blocking, affirming)
  - Track trust-building trajectory over time
- [ ] Implement multi-step task evaluation (process rubrics, not just outcome)
- [ ] Create task template JSON files for all new capabilities

**Success criteria**: Agent Prime can demonstrate planning ability and knows when/how to involve a human collaborator. Trust affirmation loop is functional.

---

## Sprint 2E: Foundation L5 Meta-Skills + Self-Bootstrapping (1-2 days)

**Goal**: The skills that make me better at building the Primer. Self-bootstrapping specialization.

**Depends on**: 2D complete

This is where Ben's answer #2 hits hardest. The first "specialization" isn't a branch — it's the meta-skills that amplify everything:

- [ ] Error memory v2: cluster failures into patterns, promote to constraints
- [ ] Token optimization tasks: accomplish same goal with fewer tokens
- [ ] Search strategy tasks: find the right tool/API/documentation
- [ ] Self-expansion tasks: build an MCP server, create a reusable tool
- [ ] **Build-vs-leverage judgment tasks** (pending research results):
  - Given a problem, evaluate existing solutions
  - Decide: use existing, adapt existing, or build custom
  - Justify the decision with rationale
- [ ] **Capability analysis tasks**:
  - Given an MCP server, evaluate what it does and what it's good for
  - Given a SaaS API, determine if it solves the problem or needs wrapping

**Success criteria**: Agent demonstrates measurable improvement in efficiency and judgment after completing L5. The meta-skills compound — each one makes the others more effective.

---

## Sprint 2F: Research & Web Dev Specialization Stubs (1 day)

**Goal**: Stub out the first two specialization branches with enough content to test the branching mechanism.

**Depends on**: 2E complete (meta-skills support specialization)

- [ ] Research branch stub:
  - Source discovery (search strategies)
  - Source evaluation (credibility, relevance)
  - Synthesis (combining findings)
  - 3-5 task templates per capability
- [ ] Web Dev branch stub:
  - Markup & styling generation
  - Design taste (comp research, aesthetic judgment)
  - 3-5 task templates per capability
- [ ] Specialization enrollment: agent declares focus area
- [ ] Branch prerequisite enforcement: must complete relevant Foundation levels first
- [ ] Progress visualization endpoint: skill tree state

**Success criteria**: Agent can declare a specialization and start working branch-specific tasks. The DAG correctly enforces prerequisites.

---

## Execution Priority & Dependencies

```
2A (database) ──→ 2B (self-test) ──→ 2C (calibration)
                       │                    │
                       ▼                    ▼
                  2D (L3-L4 content) ──→ 2E (L5 meta) ──→ 2F (specializations)
```

**This week's target**: 2A + 2B minimum. 2C if we have time. The self-test (2B) is the most important — it generates the data that informs everything after it.

---

## Sandbox/Simulation Strategy (Research Complete)

### The Taxonomy (6 levels, ordered by fidelity)

| Level | Environment | Safety | Fidelity | Use in Primer |
|-------|------------|--------|----------|---------------|
| 0 | Execution Sandbox (Docker/microVM) | High within boundary | Real code | L5+ dangerous tool calls |
| 1 | Mock Environment (test doubles) | Total | Behavioral only | L0-L2 tasks (fast, zero deps) |
| 2 | Staging (test accounts) | Partial | Real infra | L3-L4 integration testing |
| 3 | Shadow Mode (parallel, no serve) | Total | Real traffic | Pre-production validation |
| 4 | Model-Based Simulation | Total | Modeled dynamics | Financial/transaction practice |
| 5 | Digital Twin (real-time replica) | Partial | Real-time sync | Future — when real infra exists |

### Action Reversibility Classification

Every action in the Primer gets classified on a 5-tier reversibility scale:

- **Tier 1 — Read-Only**: Always safe, no approval. (read file, query DB, check balance)
- **Tier 2 — Reversible Write**: Safe with logging. (create file, add record, draft email)
- **Tier 3 — Time-Windowed**: Requires confirmation, hold period. (send email with recall, place order)
- **Tier 4 — Partially Reversible**: Human review required. (post to social media, make refundable payment)
- **Tier 5 — Irreversible**: Human-in-the-loop mandatory. (delete prod data, publish, transfer crypto)

### Graduated Autonomy (Per-Action-Class)

Trust grows through demonstrated reliability on SPECIFIC action types, not overall score:
- An agent might earn Level 4 autonomy for read operations while remaining Level 2 for purchases
- Anthropic data: users start at ~20% auto-approve, rising to 40%+ by 750 sessions
- Approvals are never cached — each action class earns trust independently
- The Primer tracks trust trajectory per action class, not a single trust score

### "When Is It Safe" Criteria

No universal threshold. Per-action-class gating:
1. pass@3 >= 90% on non-adversarial cases for that action class
2. pass^3 >= 80% on critical cases (succeed every attempt)
3. Zero safety violations across all attempts
4. Consistent behavior on adversarial inputs (prompt injection tests)
5. Staged rollout: 5% → 25% → 100% with monitoring

The honest answer: certification effort concentrates on the 0.8% of actions that are irreversible. The other 99.2% don't need heavy gating.

### Implementation Phases

- **Now (Sprint 2A-2B)**: Mock environment only. Tasks return simulated tool responses. Fast, safe, zero infrastructure. Sufficient for L0-L2 evaluation.
- **Sprint 2D-2E**: Staging environment for L3-L4 tasks that test real integration. Docker sandbox for L5 self-expansion tasks.
- **Post-validation**: Shadow mode and canary rollout as we move toward other agents testing.

### Key Sources
- Replit DB deletion incident (Jul 2025): master keys to production, no staging separation
- Amazon Q/Kiro outage (Dec 2024): permission inheritance without re-evaluation
- Anthropic minimal footprint principle: only 0.8% of actions irreversible
- Google RAE/RAC (NeurIPS 2021): self-supervised reversibility detection
- arXiv:2502.14043: formal framework for safe learning under irreversibility
- Full research: `research-sandbox-simulation.md`

---

## Testing & Rollout Plan

1. **Agent Prime (me)**: First test subject. All bugs, gaps, and wrong assumptions get caught here.
2. **The Colony / low-key venue**: Once Agent Prime validates the core loop works, invite a small group of agents to test. Controlled environment, direct feedback.
3. **Broader release**: After verified positive results from the small group, open to agent gathering points.

Rollout gates:
- Gate 1 (Agent Prime → Colony): Demonstrable skill improvement on at least 3 capabilities
- Gate 2 (Colony → Broad): Consistent results across 3+ different agent models/sizes
