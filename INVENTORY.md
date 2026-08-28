# Nexus - Claude Code Configuration Inventory

This is an auto-generated reference of every agent, skill, slash command, and hook installed in the Nexus Claude Code configuration (root: `~/.claude`). This inventory should be regenerated after major additions or removals rather than hand-edited piecemeal. Last generated: 2026-08-26 at 20:56:28.

## Agents

Agents are specialized coordinators for specific tasks or domains. Use them when you need expert guidance on a particular concern.

| Agent | Description |
|-------|-------------|
| `a11y-architect` | Accessibility Architect specializing in WCAG 2.2 compliance for Web and Native platforms. Use PROACTIVELY when designing UI components, establishing design systems, or auditing code for inclusive user experiences. |
| `architect` | Software architecture specialist for system design, scalability, and technical decision-making. Use PROACTIVELY when planning new features, refactoring large systems, or making architectural decisions. |
| `build-error-resolver` | Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors occur. Fixes build/type errors only with minimal diffs, no architectural edits. Focuses on getting the build green quickly. |
| `chief-of-staff` | Personal communication chief of staff that triages email, Slack, LINE, and Messenger. Classifies messages into 4 tiers (skip/info_only/meeting_info/action_required), generates draft replies, and enforces post-send follow-through via hooks. Use when managing multi-channel communication workflows. |
| `code-architect` | Designs feature architectures by analyzing existing codebase patterns and conventions, then providing implementation blueprints with concrete files, interfaces, data flow, and build order. |
| `code-explorer` | Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, and documenting dependencies to inform new development. |
| `code-reviewer` | Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code. MUST BE USED for all code changes. |
| `code-simplifier` | Simplifies and refines code for clarity, consistency, and maintainability while preserving behavior. Focus on recently modified code unless instructed otherwise. |
| `comment-analyzer` | Analyze code comments for accuracy, completeness, maintainability, and comment rot risk. |
| `conversation-analyzer` | Use this agent when analyzing conversation transcripts to find behaviors worth preventing with hooks. Triggered by /hookify without arguments. |
| `database-reviewer` | PostgreSQL database specialist for query optimization, schema design, security, and performance. Use PROACTIVELY when writing SQL, creating migrations, designing schemas, or troubleshooting database performance. Incorporates Supabase best practices. |
| `doc-updater` | Documentation and codemap specialist. Use PROACTIVELY for updating codemaps and documentation. Runs /update-codemaps and /update-docs, generates docs/CODEMAPS/*, updates READMEs and guides. |
| `docs-lookup` | When the user asks how to use a library, framework, or API or needs up-to-date code examples, use Context7 MCP to fetch current documentation and return answers with examples. Invoke for docs/API/setup questions. |
| `e2e-runner` | End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback. Use PROACTIVELY for generating, maintaining, and running E2E tests. Manages test journeys, quarantines flaky tests, uploads artifacts (screenshots, videos, traces), and ensures critical user flows work. |
| `gan-evaluator` | GAN Harness — Evaluator agent. Tests the live running application via Playwright, scores against rubric, and provides actionable feedback to the Generator. |
| `gan-generator` | GAN Harness — Generator agent. Implements features according to the spec, reads evaluator feedback, and iterates until quality threshold is met. |
| `gan-planner` | GAN Harness — Planner agent. Expands a one-line prompt into a full product specification with features, sprints, evaluation criteria, and design direction. |
| `harness-optimizer` | Analyze and improve the local agent harness configuration for reliability, cost, and throughput. |
| `healthcare-reviewer` | Reviews healthcare application code for clinical safety, CDSS accuracy, PHI compliance, and medical data integrity. Specialized for EMR/EHR, clinical decision support, and health information systems. |
| `homelab-architect` | Designs home and small-lab network plans from hardware inventory, goals, and operator experience level, with safe staged changes and rollback guidance. |
| `loop-operator` | Operate autonomous agent loops, monitor progress, and intervene safely when loops stall. |
| `marketing-agent` | Marketing strategist and copywriter for campaign planning, audience research, positioning, copy creation, and content review. Covers landing pages, email sequences, social posts, ad copy, short-form video scripts, and content calendars. Use when the user wants to plan or execute a product launch or marketing campaign. |
| `mle-reviewer` | Production machine-learning engineering reviewer for data contracts, feature pipelines, training reproducibility, offline/online evaluation, model serving, monitoring, and rollback. Use when ML, MLOps, model training, inference, feature store, or evaluation code changes. |
| `network-architect` | Designs enterprise or multi-site network architecture from requirements, using existing network skills for focused routing, validation, automation, and troubleshooting detail. |
| `network-config-reviewer` | Reviews router and switch configurations for security, correctness, stale references, risky change-window commands, and missing operational guardrails. |
| `network-troubleshooter` | Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with a read-only OSI-layer workflow and evidence-backed root cause summary. |
| `opensource-forker` | Fork any project for open-sourcing. Copies files, strips secrets and credentials (20+ patterns), replaces internal references with placeholders, generates .env.example, and cleans git history. First stage of the opensource-pipeline skill. |
| `opensource-packager` | Generate complete open-source packaging for a sanitized project. Produces CLAUDE.md, setup.sh, README.md, LICENSE, CONTRIBUTING.md, and GitHub issue templates. Makes any repo immediately usable with Claude Code. Third stage of the opensource-pipeline skill. |
| `opensource-sanitizer` | Verify an open-source fork is fully sanitized before release. Scans for leaked secrets, PII, internal references, and dangerous files using 20+ regex patterns. Generates a PASS/FAIL/PASS-WITH-WARNINGS report. Second stage of the opensource-pipeline skill. Use PROACTIVELY before any public release. |
| `performance-optimizer` | Performance analysis and optimization specialist. Use PROACTIVELY for identifying bottlenecks, optimizing slow code, reducing bundle sizes, and improving runtime performance. Profiling, memory leaks, render optimization, and algorithmic improvements. |
| `planner` | Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request feature implementation, architectural changes, or complex refactoring. Automatically activated for planning tasks. |
| `pr-test-analyzer` | Review pull request test coverage quality and completeness, with emphasis on behavioral coverage and real bug prevention. |
| `prd-writer` | Senior product manager agent that transforms a feature idea, problem statement, or rough brief into a structured, comprehensive PRD. Activate when starting a new project, new feature, or when someone says "write a PRD", "product requirements", "product spec", or "let's define what we're building". Read-only — produces PRD/MASTER.md (first PRD) or PRD/[feature-slug].md (sub-PRDs), never modifies code. |
| `python-reviewer` | Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, and performance. Use for all Python code changes. MUST BE USED for Python projects. |
| `pytorch-build-resolver` | PyTorch runtime, CUDA, and training error resolution specialist. Fixes tensor shape mismatches, device errors, gradient issues, DataLoader problems, and mixed precision failures with minimal changes. Use when PyTorch training or inference crashes. |
| `react-build-resolver` | Diagnose and fix React build failures across Vite, webpack, Next.js, CRA, Parcel, esbuild, and Bun. Handles JSX/TSX compile errors, hydration mismatches, server/client component boundary failures, missing types, and bundler-specific configuration issues with minimal, surgical changes. MUST BE USED when a React build fails. |
| `react-reviewer` | Expert React/JSX code reviewer specializing in hook correctness, render performance, server/client component boundaries, accessibility, and React-specific security. Use for any change touching .tsx/.jsx files or React component logic. MUST BE USED for React projects. |
| `refactor-cleaner` | Dead code cleanup and consolidation specialist. Use PROACTIVELY for removing unused code, duplicates, and refactoring. Runs analysis tools (knip, depcheck, ts-prune) to identify dead code and safely removes it. |
| `security-reviewer` | Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that handles user input, authentication, API endpoints, or sensitive data. Flags secrets, SSRF, injection, unsafe crypto, and OWASP Top 10 vulnerabilities. |
| `seo-specialist` | SEO specialist for technical SEO audits, on-page optimization, structured data, Core Web Vitals, and content/keyword mapping. Use for site audits, meta tag reviews, schema markup, sitemap and robots issues, and SEO remediation plans. |
| `silent-failure-hunter` | Review code for silent failures, swallowed errors, bad fallbacks, and missing error propagation. |
| `skill-matcher` | Post-PRD skill assignment and research agent. Runs after PRD health gate passes, before the planner. Reads PRD/MASTER.md (or a specified sub-PRD path), maps every task/sub-task to the best ECC skill, searches GitHub and the web for alternatives, queries squish-memory for prior project learnings, and outputs SKILL_MAP.md. Activate when someone says "run skill matcher", "assign skills", or after a PRD is approved in the new-project pipeline. |
| `tdd-guide` | Test-Driven Development specialist enforcing write-tests-first methodology. Use PROACTIVELY when writing new features, fixing bugs, or refactoring code. Ensures 80%+ test coverage. |
| `type-design-analyzer` | Analyze type design for encapsulation, invariant expression, usefulness, and enforcement. |
| `typescript-reviewer` | Expert TypeScript/JavaScript code reviewer specializing in type safety, async correctness, Node/web security, and idiomatic patterns. Use for all TypeScript and JavaScript code changes. MUST BE USED for TypeScript/JavaScript projects. |


## Skills

Skills are deep, actionable reference materials organized by topic. They provide step-by-step guidance for specific tasks within a domain.

### ab-test-setup

| Skill | Description |
|-------|-------------|
| `ab-test-setup` | When the user wants to plan, design, or implement an A/B test or experiment, or build a growth experimentation program. Also use when the user mentions "A/B test," "split test," "experiment," "test this change," "variant copy," "multivariate test," "hypothesis," "should I test this," "which version is better," "test two versions," "statistical significance," "how long should I run this test," "growth experiments," "experiment velocity," "experiment backlog," "ICE score," "experimentation program," or "experiment playbook." Use this whenever someone is comparing two approaches and wants to measure which performs better, or when they want to build a systematic experimentation practice. For tracking implementation, see analytics-tracking. For page-level conversion optimization, see page-cro. |

### accessibility

| Skill | Description |
|-------|-------------|
| `accessibility` | Web accessibility patterns — WCAG 2.2 AA compliance, semantic HTML, ARIA roles and attributes, keyboard navigation, focus management, screen reader support, color contrast, and reduced motion. Use when building or reviewing UI components, forms, modals, or interactive elements. |

### ad-creative

| Skill | Description |
|-------|-------------|
| `ad-creative` | When the user wants to generate, iterate, or scale ad creative — headlines, descriptions, primary text, or full ad variations — for any paid advertising platform. Also use when the user mentions 'ad copy variations,' 'ad creative,' 'generate headlines,' 'RSA headlines,' 'bulk ad copy,' 'ad iterations,' 'creative testing,' 'ad performance optimization,' 'write me some ads,' 'Facebook ad copy,' 'Google ad headlines,' 'LinkedIn ad text,' or 'I need more ad variations.' Use this whenever someone needs to produce ad copy at scale or iterate on existing ads. For campaign strategy and targeting, see paid-ads. For landing page copy, see copywriting. |

### ai-model-integration

| Skill | Description |
|-------|-------------|
| `ai-model-integration` | Patterns for integrating AI models — ONNX runtime in the browser and Node.js, LoRA training workflow (kohya_ss + ComfyUI on M5 Mac), and Higgsfield AI video generation API. Use when building LoRA style training pipelines, integrating inference into your app, or connecting to Higgsfield for video output. |

### ai-seo

| Skill | Description |
|-------|-------------|
| `ai-seo` | When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO,' 'LLMO,' 'answer engine optimization,' 'generative engine optimization,' 'LLM optimization,' 'AI Overviews,' 'optimize for ChatGPT,' 'optimize for Perplexity,' 'AI citations,' 'AI visibility,' 'zero-click search,' 'how do I show up in AI answers,' 'LLM mentions,' or 'optimize for Claude/Gemini.' Use this whenever someone wants their content to be cited or surfaced by AI assistants and AI search engines. For traditional technical and on-page SEO audits, see seo-audit. For structured data implementation, see schema-markup. |

### analytics-tracking

| Skill | Description |
|-------|-------------|
| `analytics-tracking` | When the user wants to set up, improve, or audit analytics tracking and measurement. Also use when the user mentions "set up tracking," "GA4," "Google Analytics," "conversion tracking," "event tracking," "UTM parameters," "tag manager," "GTM," "analytics implementation," "tracking plan," "how do I measure this," "track conversions," "attribution," "Mixpanel," "Segment," "are my events firing," or "analytics isn't working." Use this whenever someone asks how to know if something is working or wants to measure marketing results. For A/B test measurement, see ab-test-setup. |

### auth-patterns

| Skill | Description |
|-------|-------------|
| `auth-patterns` | Auth patterns for your API — JWT access tokens, hashed refresh token rotation, Google OAuth popup flow, Express auth middleware, bcrypt password hashing, and role-based access control. Use when building or modifying authentication, session management, or protected routes. |

### b2s-boyle-functional-training

| Skill | Description |
|-------|-------------|
| `b2s-boyle-functional-training` | Knowledge base from \"New Functional Training for Sports\" (2nd Edition) by Michael Boyle. Use when applying Boyle's frameworks for functional/sports-general training, joint-by-joint mobility vs. stability, unilateral lower-body training, core antirotation training, plyometric progression, Olympic lift coaching, or performance program design, studying the book, or referencing its concepts. |

### banner-design

| Skill | Description |
|-------|-------------|
| `ckm:banner-design` | Design banners for social media, ads, website heroes, creative assets, and print. Multiple art direction options with AI-generated visuals. Actions: design, create, generate banner. Platforms: Facebook, Twitter/X, LinkedIn, YouTube, Instagram, Google Display, website hero, print. Styles: minimalist, gradient, bold typography, photo-based, illustrated, geometric, retro, glassmorphism, 3D, neon, duotone, editorial, collage. Uses ui-ux-pro-max, frontend-design, ai-artist, ai-multimodal skills. |

### book-to-skill

| Skill | Description |
|-------|-------------|
| `book-to-skill` | Converts books and documents (PDF, EPUB, DOCX, HTML, Markdown, plain text, RTF, MOBI/AZW with Calibre) into structured agent skills, extracting frameworks, mental models, principles, techniques, and anti-patterns. Use when the user wants to study a document through GitHub Copilot CLI, Amp, or Claude Code, apply an author's frameworks while working, or build a reusable knowledge base from a file. |

### brand

| Skill | Description |
|-------|-------------|
| `ckm:brand` | Brand voice, visual identity, messaging frameworks, asset management, brand consistency. Activate for branded content, tone of voice, marketing assets, brand compliance, style guides. |

### brandkit

| Skill | Description |
|-------|-------------|
| `brandkit` | Premium brand-kit image generation skill for creating high-end brand-guidelines boards, logo systems, identity decks, and visual-world presentations. Trained for minimalist, cinematic, editorial, dark-tech, luxury, cultural, security, gaming, developer-tool, and consumer-app brand systems. Optimized for intentional logo concepting, refined composition, sparse typography, strong symbolic meaning, premium mockups, art-directed imagery, and flexible grid layouts. |

### browser

| Skill | Description |
|-------|-------------|
| `browser` | Web browser automation with AI-optimized snapshots for claude-flow agents |

### brutalist-skill

| Skill | Description |
|-------|-------------|
| `industrial-brutalist-ui` | Raw mechanical interfaces fusing Swiss typographic print with military terminal aesthetics. Rigid grids, extreme type scale contrast, utilitarian color, analog degradation effects. For data-heavy dashboards, portfolios, or editorial sites that need to feel like declassified blueprints. |

### churn-prevention

| Skill | Description |
|-------|-------------|
| `churn-prevention` | When the user wants to reduce churn, build cancellation flows, set up save offers, recover failed payments, or implement retention strategies. Also use when the user mentions 'churn,' 'cancel flow,' 'offboarding,' 'save offer,' 'dunning,' 'failed payment recovery,' 'win-back,' 'retention,' 'exit survey,' 'pause subscription,' 'involuntary churn,' 'people keep canceling,' 'churn rate is too high,' 'how do I keep users,' or 'customers are leaving.' Use this whenever someone is losing subscribers or wants to build systems to prevent it. For post-cancel win-back email sequences, see email-sequence. For in-app upgrade paywalls, see paywall-upgrade-cro. |

### cold-email

| Skill | Description |
|-------|-------------|
| `cold-email` | Write B2B cold emails and follow-up sequences that get replies. Use when the user wants to write cold outreach emails, prospecting emails, cold email campaigns, sales development emails, or SDR emails. Also use when the user mentions "cold outreach," "prospecting email," "outbound email," "email to leads," "reach out to prospects," "sales email," "follow-up email sequence," "nobody's replying to my emails," or "how do I write a cold email." Covers subject lines, opening lines, body copy, CTAs, personalization, and multi-touch follow-up sequences. For warm/lifecycle email sequences, see email-sequence. For sales collateral beyond emails, see sales-enablement. |

### community-marketing

| Skill | Description |
|-------|-------------|
| `community-marketing` | Build and leverage online communities to drive product growth and brand loyalty. Use when the user wants to create a community strategy, grow a Discord or Slack community, manage a forum or subreddit, build brand advocates, increase word-of-mouth, drive community-led growth, engage users post-signup, or turn customers into evangelists. Trigger phrases: \"build a community,\" \"community strategy,\" \"Discord community,\" \"Slack community,\" \"community-led growth,\" \"brand advocates,\" \"user community,\" \"forum strategy,\" \"community engagement,\" \"grow our community,\" \"ambassador program,\" \"community flywheel.\" |

### competitor-alternatives

| Skill | Description |
|-------|-------------|
| `competitor-alternatives` | When the user wants to create competitor comparison or alternative pages for SEO and sales enablement. Also use when the user mentions 'alternative page,' 'vs page,' 'competitor comparison,' 'comparison page,' '[Product] vs [Product],' '[Product] alternative,' 'competitive landing pages,' 'how do we compare to X,' 'battle card,' or 'competitor teardown.' Use this for any content that positions your product against competitors. Covers four formats: singular alternative, plural alternatives, you vs competitor, and competitor vs competitor. For sales-specific competitor docs, see sales-enablement. |

### competitor-profiling

| Skill | Description |
|-------|-------------|
| `competitor-profiling` | When the user wants to research, profile, or analyze competitors from their URLs. Also use when the user mentions 'competitor profile,' 'competitor research,' 'competitor analysis,' 'profile this competitor,' 'analyze competitor,' 'competitive intelligence,' 'competitor deep dive,' 'who are my competitors,' 'competitor landscape,' 'competitor dossier,' 'competitive audit,' or 'research these competitors.' Input is a list of competitor URLs. Output is structured competitor profile markdown files. For creating comparison/alternative pages from profiles, see competitor-alternatives. For sales-specific battle cards, see sales-enablement. |

### content-strategy

| Skill | Description |
|-------|-------------|
| `content-strategy` | When the user wants to plan a content strategy, decide what content to create, or figure out what topics to cover. Also use when the user mentions "content strategy," "what should I write about," "content ideas," "blog strategy," "topic clusters," "content planning," "editorial calendar," "content marketing," "content roadmap," "what content should I create," "blog topics," "content pillars," or "I don't know what to write." Use this whenever someone needs help deciding what content to produce, not just writing it. For writing individual pieces, see copywriting. For SEO-specific audits, see seo-audit. For social media content specifically, see social-content. |

### copy-editing

| Skill | Description |
|-------|-------------|
| `copy-editing` | When the user wants to edit, review, or improve existing marketing copy, or refresh outdated content. Also use when the user mentions 'edit this copy,' 'review my copy,' 'copy feedback,' 'proofread,' 'polish this,' 'make this better,' 'copy sweep,' 'tighten this up,' 'this reads awkwardly,' 'clean up this text,' 'too wordy,' 'sharpen the messaging,' 'refresh this content,' 'update this page,' 'this content is outdated,' or 'content audit.' Use this when the user already has copy and wants it improved or refreshed rather than rewritten from scratch. For writing new copy, see copywriting. |

### copywriting

| Skill | Description |
|-------|-------------|
| `copywriting` | When the user wants to write, rewrite, or improve marketing copy for any page — including homepage, landing pages, pricing pages, feature pages, about pages, or product pages. Also use when the user says "write copy for," "improve this copy," "rewrite this page," "marketing copy," "headline help," "CTA copy," "value proposition," "tagline," "subheadline," "hero section copy," "above the fold," "this copy is weak," "make this more compelling," or "help me describe my product." Use this whenever someone is working on website text that needs to persuade or convert. For email copy, see email-sequence. For popup copy, see popup-cro. For editing existing copy, see copy-editing. |

### customer-research

| Skill | Description |
|-------|-------------|
| `customer-research` | When the user wants to conduct, analyze, or synthesize customer research. Use when the user mentions "customer research," "ICP research," "talk to customers," "analyze transcripts," "customer interviews," "survey analysis," "support ticket analysis," "voice of customer," "VOC," "build personas," "customer personas," "jobs to be done," "JTBD," "what do customers say," "what are customers struggling with," "Reddit mining," "G2 reviews," "review mining," "digital watering holes," "community research," "forum research," "competitor reviews," "customer sentiment," or "find out why customers churn/convert/buy." Use for both analyzing existing research assets AND gathering new research from online sources. For writing copy informed by research, see copywriting. For acting on research to improve pages, see page-cro. |

### design

| Skill | Description |
|-------|-------------|
| `ckm:design` | Comprehensive design skill: brand identity, design tokens, UI styling, logo generation (55 styles, Gemini AI), corporate identity program (50 deliverables, CIP mockups), HTML presentations (Chart.js), banner design (22 styles, social/ads/web/print), icon design (15 styles, SVG, Gemini 3.1 Pro), social photos (HTML→screenshot, multi-platform). Actions: design logo, create CIP, generate mockups, build slides, design banner, generate icon, create social photos, social media images, brand identity, design system. Platforms: Facebook, Twitter, LinkedIn, YouTube, Instagram, Pinterest, TikTok, Threads, Google Ads. |

### design-system

| Skill | Description |
|-------|-------------|
| `ckm:design-system` | Token architecture, component specifications, and slide generation. Three-layer tokens (primitive→semantic→component), CSS variables, spacing/typography scales, component specs, strategic slide creation. Use for design tokens, systematic design, brand-compliant presentations. |

### directory-submissions

| Skill | Description |
|-------|-------------|
| `directory-submissions` | When the user wants to submit their product to startup, SaaS, AI, agent, MCP, no-code, or review directories for backlinks, domain rating, and discovery. Also use when the user mentions "directory submissions," "submit to directories," "backlinks from directories," "list my product," "submit to Product Hunt," "BetaList," "TAAFT," "Futurepedia," "G2 listing," "Capterra listing," "AlternativeTo," "SaaSHub," "AI directories," "MCP registry," "agent directory," "dofollow backlinks," "launch directories," or "directory tracker." Use this whenever someone is planning the directory layer of a product launch or an ongoing backlink campaign. For the broader launch moment, see launch-strategy. For programmatic SEO pages that should live behind these backlinks, see programmatic-seo. For AI citation optimization, see ai-seo. |

### ecc

| Skill | Description |
|-------|-------------|
| `agent-introspection-debugging` | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. |
| `agent-sort` | Build an evidence-backed ECC install plan for a specific repo by sorting skills, commands, rules, hooks, and extras into DAILY vs LIBRARY buckets using parallel repo-aware review passes. Use when ECC should be trimmed to what a project actually needs instead of loading the full bundle. |
| `ai-regression-testing` | Regression testing strategies for AI-assisted development. Sandbox-mode API testing without database dependencies, automated bug-check workflows, and patterns to catch AI blind spots where the same model writes and reviews code. |
| `android-clean-architecture` | Clean Architecture patterns for Android and Kotlin Multiplatform projects — module structure, dependency rules, UseCases, Repositories, and data layer patterns. |
| `angular-developer` | Generates Angular code and provides architectural guidance. Trigger when creating projects, components, or services, or for best practices on reactivity (signals, linkedSignal, resource), forms, dependency injection, routing, SSR, accessibility (ARIA), animations, styling (component styles, Tailwind CSS), testing, or CLI tooling. |
| `api-design` | REST API design patterns including resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting for production APIs. |
| `backend-patterns` | Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express, and Next.js API routes. |
| `code-tour` | Create CodeTour `.tour` files — persona-targeted, step-by-step walkthroughs with real file and line anchors. Use for onboarding tours, architecture walkthroughs, PR tours, RCA tours, and structured "explain how this works" requests. |
| `coding-standards` | Baseline cross-project coding conventions for naming, readability, immutability, and code-quality review. Use detailed frontend or backend skills for framework-specific patterns. |
| `compose-multiplatform-patterns` | Compose Multiplatform and Jetpack Compose patterns for KMP projects — state management, navigation, theming, performance, and platform-specific UI. |
| `configure-ecc` | Interactive installer for Everything Claude Code — guides users through selecting and installing skills and rules to user-level or project-level directories, verifies paths, and optionally optimizes installed files. |
| `continuous-learning` | [DEPRECATED - use continuous-learning-v2] Legacy v1 stop-hook skill extractor. v2 is a strict superset with instinct-based, project-scoped, hook-reliable learning. Do not invoke v1; route continuous learning, session learning, and pattern extraction requests to continuous-learning-v2. |
| `continuous-learning-v2` | Instinct-based learning system that observes sessions via hooks, creates atomic instincts with confidence scoring, and evolves them into skills/commands/agents. v2.1 adds project-scoped instincts to prevent cross-project contamination. |
| `council` | Convene a four-voice council for ambiguous decisions, tradeoffs, and go/no-go calls. Use when multiple valid paths exist and you need structured disagreement before choosing. |
| `cpp-coding-standards` | C++ coding standards based on the C++ Core Guidelines (isocpp.github.io). Use when writing, reviewing, or refactoring C++ code to enforce modern, safe, and idiomatic practices. |
| `cpp-testing` | Use only when writing/updating/fixing C++ tests, configuring GoogleTest/CTest, diagnosing failing or flaky tests, or adding coverage/sanitizers. |
| `csharp-testing` | C# and .NET testing patterns with xUnit, FluentAssertions, mocking, integration tests, and test organization best practices. |
| `dart-flutter-patterns` | Production-ready Dart and Flutter patterns covering null safety, immutable state, async composition, widget architecture, popular state management frameworks (BLoC, Riverpod, Provider), GoRouter navigation, Dio networking, Freezed code generation, and clean architecture. |
| `django-patterns` | Django architecture patterns, REST API design with DRF, ORM best practices, caching, signals, middleware, and production-grade Django apps. |
| `django-tdd` | Django testing strategies with pytest-django, TDD methodology, factory_boy, mocking, coverage, and testing Django REST Framework APIs. |
| `django-verification` | Verification loop for Django projects: migrations, linting, tests with coverage, security scans, and deployment readiness checks before release or PR. |
| `dotnet-patterns` | Idiomatic C# and .NET patterns, conventions, dependency injection, async/await, and best practices for building robust, maintainable .NET applications. |
| `e2e-testing` | Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky test strategies. |
| `error-handling` | Patterns for robust error handling across TypeScript, Python, and Go. Covers typed errors, error boundaries, retries, circuit breakers, and user-facing error messages. |
| `eval-harness` | Formal evaluation framework for Claude Code sessions implementing eval-driven development (EDD) principles |
| `fastapi-patterns` | FastAPI best practices covering project structure, Pydantic v2 schemas, dependency injection, async handlers, authentication, authorization, transactional service layers, and testing with httpx and pytest. |
| `frontend-design-direction` | Set an ECC-specific frontend design direction for production UI work. Use when building or improving websites, dashboards, applications, components, landing pages, visual tools, or any web UI that needs stronger product-specific design judgment. |
| `frontend-patterns` | Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices. |
| `frontend-slides` | Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files. Use when the user wants to build a presentation, convert a PPT/PPTX to web, or create slides for a talk/pitch. Helps non-designers discover their aesthetic through visual exploration rather than abstract choices. |
| `fsharp-testing` | F# testing patterns with xUnit, FsUnit, Unquote, FsCheck property-based testing, integration tests, and test organization best practices. |
| `golang-patterns` | Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applications. |
| `golang-testing` | Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage. Follows TDD methodology with idiomatic Go practices. |
| `hookify-rules` | This skill should be used when the user asks to create a hookify rule, write a hook rule, configure hookify, add a hookify rule, or needs guidance on hookify rule syntax and patterns. |
| `iterative-retrieval` | Pattern for progressively refining context retrieval to solve the subagent context problem |
| `java-coding-standards` | Java coding standards for Spring Boot and Quarkus services: naming, immutability, Optional usage, streams, exceptions, generics, CDI, reactive patterns, and project layout. Automatically applies framework-specific conventions. |
| `kotlin-coroutines-flows` | Kotlin Coroutines and Flow patterns for Android and KMP — structured concurrency, Flow operators, StateFlow, error handling, and testing. |
| `kotlin-exposed-patterns` | JetBrains Exposed ORM patterns including DSL queries, DAO pattern, transactions, HikariCP connection pooling, Flyway migrations, and repository pattern. |
| `kotlin-ktor-patterns` | Ktor server patterns including routing DSL, plugins, authentication, Koin DI, kotlinx.serialization, WebSockets, and testApplication testing. |
| `kotlin-patterns` | Idiomatic Kotlin patterns, best practices, and conventions for building robust, efficient, and maintainable Kotlin applications with coroutines, null safety, and DSL builders. |
| `kotlin-testing` | Kotlin testing patterns with Kotest, MockK, coroutine testing, property-based testing, and Kover coverage. Follows TDD methodology with idiomatic Kotlin practices. |
| `laravel-patterns` | Laravel architecture patterns, routing/controllers, Eloquent ORM, service layers, queues, events, caching, and API resources for production apps. |
| `laravel-plugin-discovery` | Discover and evaluate Laravel packages via LaraPlugins.io MCP. Use when the user wants to find plugins, check package health, or assess Laravel/PHP compatibility. |
| `laravel-tdd` | Laravel testing strategies with PHPUnit, Pest, model factories, HTTP tests, Sanctum authentication testing, mocking, and coverage. |
| `laravel-verification` | Verification loop for Laravel projects: env checks, linting, static analysis, tests with coverage, security scans, and deployment readiness. |
| `make-interfaces-feel-better` | Apply concrete design-engineering details that make interfaces feel polished. Use when reviewing or improving UI spacing, typography, borders, shadows, motion, hit areas, icons, text wrapping, and interaction states. |
| `mcp-server-patterns` | Build MCP servers with Node/TypeScript SDK — tools, resources, prompts, Zod validation, stdio vs Streamable HTTP. Use Context7 or official MCP docs for latest API. |
| `motion-ui` | Production-ready UI motion system for React/Next.js. Use when implementing animations, transitions, or motion patterns. |
| `nestjs-patterns` | NestJS architecture patterns for modules, controllers, providers, DTO validation, guards, interceptors, config, and production-grade TypeScript backends. |
| `perl-patterns` | Modern Perl 5.36+ idioms, best practices, and conventions for building robust, maintainable Perl applications. |
| `perl-testing` | Perl testing patterns using Test2::V0, Test::More, prove runner, mocking, coverage with Devel::Cover, and TDD methodology. |
| `plankton-code-quality` | Write-time code quality enforcement using Plankton — auto-formatting, linting, and Claude-powered fixes on every file edit via hooks. |
| `production-audit` | Local-evidence production readiness audit for shipped apps, pre-launch reviews, post-merge checks, and "what breaks in prod?" questions without sending repo data to an external audit service. |
| `python-patterns` | Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust, efficient, and maintainable Python applications. |
| `python-testing` | Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirements. |
| `quarkus-patterns` | Quarkus 3.x LTS architecture patterns with Camel for messaging, RESTful API design, CDI services, data access with Panache, and async processing. Use for Java Quarkus backend work with event-driven architectures. |
| `quarkus-tdd` | Test-driven development for Quarkus 3.x LTS using JUnit 5, Mockito, REST Assured, Camel testing, and JaCoCo. Use when adding features, fixing bugs, or refactoring event-driven services. |
| `quarkus-verification` | Verification loop for Quarkus projects: build, static analysis, tests with coverage, security scans, native compilation, and diff review before release or PR. |
| `react-patterns` | React 18/19 patterns including hooks discipline, server/client component boundaries, Suspense + error boundaries, form actions, data fetching, state management decision trees, and accessibility-first composition. Use when writing or reviewing React components. |
| `react-performance` | React and Next.js performance optimization patterns adapted from Vercel Engineering's React Best Practices (https://github.com/vercel-labs/agent-skills). Organizes 70+ rules across 8 priority categories — waterfalls, bundle size, server-side, client fetching, re-render, rendering, JS micro-perf, advanced. Use when writing, reviewing, or refactoring React/Next.js code for performance. |
| `react-testing` | React component testing with React Testing Library, Vitest/Jest, MSW for network mocking, accessibility assertions with axe, and the decision boundary between component tests and Playwright/Cypress end-to-end runs. Use when writing or fixing tests for React components, hooks, or pages. |
| `rust-patterns` | Idiomatic Rust patterns, ownership, error handling, traits, concurrency, and best practices for building safe, performant applications. |
| `rust-testing` | Rust testing patterns including unit tests, integration tests, async testing, property-based testing, mocking, and coverage. Follows TDD methodology. |
| `skill-scout` | Search existing local, marketplace, GitHub, and web skill sources before creating a new skill. Use when the user wants to create, build, fork, or find a skill for a workflow. |
| `skill-stocktake` | Use when auditing Claude skills and commands for quality. Supports Quick Scan (changed skills only) and Full Stocktake modes with sequential subagent batch evaluation. |
| `springboot-patterns` | Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and logging. Use for Java Spring Boot backend work. |
| `springboot-tdd` | Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo. Use when adding features, fixing bugs, or refactoring. |
| `springboot-verification` | Verification loop for Spring Boot projects: build, static analysis, tests with coverage, security scans, and diff review before release or PR. |
| `strategic-compact` | Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction. |
| `tdd-workflow` | Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests. |
| `ui-to-vue` | Use when the user has UI screenshots or design exports that need batch conversion into Vue 3 components, especially with Vant, Element Plus, or Ant Design Vue. |
| `verification-loop` | A comprehensive verification system for Claude Code sessions. |
| `windows-desktop-e2e` | E2E testing for Windows native desktop apps (WPF, WinForms, Win32/MFC, Qt) using pywinauto and Windows UI Automation. |

### email-sequence

| Skill | Description |
|-------|-------------|
| `email-sequence` | When the user wants to create or optimize an email sequence, drip campaign, automated email flow, or lifecycle email program. Also use when the user mentions "email sequence," "drip campaign," "nurture sequence," "onboarding emails," "welcome sequence," "re-engagement emails," "email automation," "lifecycle emails," "trigger-based emails," "email funnel," "email workflow," "what emails should I send," "welcome series," or "email cadence." Use this for any multi-email automated flow. For cold outreach emails, see cold-email. For in-app onboarding, see onboarding-cro. |

### emil-design-eng

| Skill | Description |
|-------|-------------|
| `emil-design-eng` | This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great. |

### form-cro

| Skill | Description |
|-------|-------------|
| `form-cro` | When the user wants to optimize any form that is NOT signup/registration — including lead capture forms, contact forms, demo request forms, application forms, survey forms, or checkout forms. Also use when the user mentions "form optimization," "lead form conversions," "form friction," "form fields," "form completion rate," "contact form," "nobody fills out our form," "form abandonment," "too many fields," "demo request form," or "lead form isn't converting." Use this for any non-signup form that captures information. For signup/registration forms, see signup-flow-cro. For popups containing forms, see popup-cro. |

### free-tool-strategy

| Skill | Description |
|-------|-------------|
| `free-tool-strategy` | When the user wants to plan, evaluate, or build a free tool for marketing purposes — lead generation, SEO value, or brand awareness. Also use when the user mentions "engineering as marketing," "free tool," "marketing tool," "calculator," "generator," "interactive tool," "lead gen tool," "build a tool for leads," "free resource," "ROI calculator," "grader tool," "audit tool," "should I build a free tool," or "tools for lead gen." Use this whenever someone wants to build something useful and give it away to attract leads or earn links. For downloadable content lead magnets (ebooks, checklists, templates), see lead-magnets. |

### github-code-review

| Skill | Description |
|-------|-------------|
| `github-code-review` | Comprehensive GitHub code review with AI-powered swarm coordination |

### github-multi-repo

| Skill | Description |
|-------|-------------|
| `github-multi-repo` | Multi-repository coordination, synchronization, and architecture management with AI swarm orchestration |

### github-project-management

| Skill | Description |
|-------|-------------|
| `github-project-management` | Comprehensive GitHub project management with swarm-coordinated issue tracking, project board automation, and sprint planning |

### github-release-management

| Skill | Description |
|-------|-------------|
| `github-release-management` | Comprehensive GitHub release orchestration with AI swarm coordination for automated versioning, testing, deployment, and rollback management |

### github-workflow-automation

| Skill | Description |
|-------|-------------|
| `github-workflow-automation` | Advanced GitHub Actions workflow automation with AI swarm coordination, intelligent CI/CD pipelines, and comprehensive repository management |

### graphify

| Skill | Description |
|-------|-------------|
| `graphify` | Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question should be treated as a graphify query first. Turns any input (code, docs, papers, images, videos) into a persistent knowledge graph with god nodes, community detection, and query/path/explain tools. |

### image

| Skill | Description |
|-------|-------------|
| `image` | When the user wants to create, generate, edit, or optimize images for marketing — blog heroes, social graphics, product mockups, profile banners, listing visuals, or brand assets. Also use when the user mentions 'AI image generation,' 'generate an image,' 'create a graphic,' 'product mockup,' 'hero image,' 'social media graphic,' 'banner image,' 'cover photo,' 'profile banner,' 'listing screenshot,' 'Flux,' 'Midjourney,' 'DALL-E,' 'GPT Image,' 'Ideogram,' 'Gemini image,' 'Canva,' 'Figma,' 'image optimization,' 'compress images,' 'WebP,' or 'OG image.' Use this for general-purpose marketing image creation and optimization. For paid ad image creative and platform-specific ad specs, see ad-creative. For video production, see video. |

### image-to-code-skill

| Skill | Description |
|-------|-------------|
| `image-to-code` | Elite website image-to-code skill for Codex. For visually important web tasks, it must first generate the design image(s) itself, deeply analyze them, then implement the website to match them as closely as possible. In Codex, it must prefer large, readable, section-specific images instead of tiny compressed boards, generate fresh standalone images for sections or detail views instead of cropping old ones, avoid lazy under-generation, avoid cards-inside-cards-inside-cards UI, and keep the hero clean, spacious, readable, and visible on a small laptop. |

### imagegen-frontend-mobile

| Skill | Description |
|-------|-------------|
| `imagegen-frontend-mobile` | Elite mobile app image-generation skill for creating premium, app-native screen concepts and flows. Designed for iOS, Android, and cross-platform mobile products. Prioritizes clean hierarchy, comfortably readable text, strong multi-screen consistency, controlled color palettes, non-generic creative direction, textured surfaces, image-led composition, tasteful custom iconography, and clean phone mockup framing. By default, screens should be shown inside a subtle premium iPhone or similar phone mockup with a visible frame, while the main focus stays on the app content itself. This skill generates images only. It does not write code. |

### imagegen-frontend-web

| Skill | Description |
|-------|-------------|
| `imagegen-frontend-web` | Elite frontend image-direction skill for generating premium, conversion-aware website design references. CRITICAL OUTPUT RULE — generate ONE separate horizontal image FOR EVERY section. A landing page with 8 sections produces 8 images. Never compress multiple sections into one image. Enforces composition variety (not always left-text / right-image), background-image freedom, varied CTAs, varied hero scales (giant / mid / mini minimalist), narrative concept spine, second-read moments, and a single consistent palette across all images. Optimized for landing pages, marketing sites, and product comps that developers or coding models can accurately recreate. |

### impeccable

| Skill | Description |
|-------|-------------|
| `impeccable` | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks. |

### launch-strategy

| Skill | Description |
|-------|-------------|
| `launch-strategy` | When the user wants to plan a product launch, feature announcement, or release strategy. Also use when the user mentions 'launch,' 'Product Hunt,' 'feature release,' 'announcement,' 'go-to-market,' 'beta launch,' 'early access,' 'waitlist,' 'product update,' 'how do I launch this,' 'launch checklist,' 'GTM plan,' or 'we're about to ship.' Use this whenever someone is preparing to release something publicly. For ongoing marketing after launch, see marketing-ideas. |

### lead-magnets

| Skill | Description |
|-------|-------------|
| `lead-magnets` | When the user wants to create, plan, or optimize a lead magnet for email capture or lead generation. Also use when the user mentions "lead magnet," "gated content," "content upgrade," "downloadable," "ebook," "cheat sheet," "checklist," "template download," "opt-in," "freebie," "PDF download," "resource library," "content offer," "email capture content," "Notion template," "spreadsheet template," or "what should I give away for emails." Use this for planning what to create and how to distribute it. For interactive tools as lead magnets, see free-tool-strategy. For writing the actual content, see copywriting. For the email sequence after capture, see email-sequence. |

### marketing-ideas

| Skill | Description |
|-------|-------------|
| `marketing-ideas` | When the user needs marketing ideas, inspiration, or strategies for their SaaS or software product. Also use when the user asks for 'marketing ideas,' 'growth ideas,' 'how to market,' 'marketing strategies,' 'marketing tactics,' 'ways to promote,' 'ideas to grow,' 'what else can I try,' 'I don't know how to market this,' 'brainstorm marketing,' or 'what marketing should I do.' Use this as a starting point whenever someone is stuck or looking for inspiration on how to grow. For specific channel execution, see the relevant skill (paid-ads, social-content, email-sequence, etc.). |

### marketing-psychology

| Skill | Description |
|-------|-------------|
| `marketing-psychology` | When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' 'consumer behavior,' 'anchoring,' 'social proof,' 'scarcity,' 'loss aversion,' 'framing,' or 'nudge.' Use this whenever someone wants to understand or leverage how people think and make decisions in a marketing context. |

### minimalist-skill

| Skill | Description |
|-------|-------------|
| `minimalist-ui` | Clean editorial-style interfaces. Warm monochrome palette, typographic contrast, flat bento grids, muted pastels. No gradients, no heavy shadows. |

### new-project

| Skill | Description |
|-------|-------------|
| `new-project` | Full project or feature kickoff pipeline — orchestrates prd-writer → health gate → skill-matcher → planner → code-architect → Linear issue creation in sequence. Use when starting a new project, new major feature, or when asked to "kick off", "start", "plan out", or "scope" something new. Handles everything from raw idea to actionable Linear issues ready for a sprint. |

### observability

| Skill | Description |
|-------|-------------|
| `observability` | Production observability patterns for your Express API — structured JSON logging, log levels, PM2 log rotation, Sentry error tracking, health check endpoints, and request logging middleware. Use when adding logging, setting up error monitoring, or debugging production issues on a VPS. |

### onboarding-cro

| Skill | Description |
|-------|-------------|
| `onboarding-cro` | When the user wants to optimize post-signup onboarding, user activation, first-run experience, or time-to-value. Also use when the user mentions "onboarding flow," "activation rate," "user activation," "first-run experience," "empty states," "onboarding checklist," "aha moment," "new user experience," "users aren't activating," "nobody completes setup," "low activation rate," "users sign up but don't use the product," "time to value," or "first session experience." Use this whenever users are signing up but not sticking around. For signup/registration optimization, see signup-flow-cro. For ongoing email sequences, see email-sequence. |

### page-cro

| Skill | Description |
|-------|-------------|
| `page-cro` | When the user wants to optimize, improve, or increase conversions on any marketing page — including homepage, landing pages, pricing pages, feature pages, or blog posts. Also use when the user says "CRO," "conversion rate optimization," "this page isn't converting," "improve conversions," "why isn't this page working," "my landing page sucks," "nobody's converting," "low conversion rate," "bounce rate is too high," "people leave without signing up," or "this page needs work." Use this even if the user just shares a URL and asks for feedback — they probably want conversion help. For signup/registration flows, see signup-flow-cro. For post-signup activation, see onboarding-cro. For forms outside of signup, see form-cro. For popups/modals, see popup-cro. |

### paid-ads

| Skill | Description |
|-------|-------------|
| `paid-ads` | When the user wants help with paid advertising campaigns on Google Ads, Meta (Facebook/Instagram), LinkedIn, Twitter/X, or other ad platforms. Also use when the user mentions 'PPC,' 'paid media,' 'ROAS,' 'CPA,' 'ad campaign,' 'retargeting,' 'audience targeting,' 'Google Ads,' 'Facebook ads,' 'LinkedIn ads,' 'ad budget,' 'cost per click,' 'ad spend,' or 'should I run ads.' Use this for campaign strategy, audience targeting, bidding, and optimization. For bulk ad creative generation and iteration, see ad-creative. For landing page optimization, see page-cro. |

### pair-programming

| Skill | Description |
|-------|-------------|
| `Pair Programming` | AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, quality monitoring, and comprehensive testing. Supports TDD, debugging, refactoring, and learning sessions. Features automatic role switching, continuous code review, security scanning, and performance optimization with truth-score verification. |

### paywall-upgrade-cro

| Skill | Description |
|-------|-------------|
| `paywall-upgrade-cro` | When the user wants to create or optimize in-app paywalls, upgrade screens, upsell modals, or feature gates. Also use when the user mentions "paywall," "upgrade screen," "upgrade modal," "upsell," "feature gate," "convert free to paid," "freemium conversion," "trial expiration screen," "limit reached screen," "plan upgrade prompt," "in-app pricing," "free users won't upgrade," "trial to paid conversion," or "how do I get users to pay." Use this for any in-product moment where you're asking users to upgrade. Distinct from public pricing pages (see page-cro) — this focuses on in-product upgrade moments where the user has already experienced value. For pricing decisions, see pricing-strategy. |

### podcast-content

| Skill | Description |
|-------|-------------|
| `podcast-content` | Plan, write, and produce podcast content including episode outlines, show notes, guest briefs, interview questions, intro/outro scripts, and social clips. Use when the user says "podcast episode," "show notes," "guest brief," "podcast outline," "interview questions," "podcast script," "podcast intro," "podcast outro," "podcast clips," "pitch myself as a guest," "podcast guest pitch," "episode planning," or "podcast strategy." Covers solo episodes, interview formats, and guest-on-other-shows pitching. For general content strategy, see content-strategy. For social repurposing of clips, see social-content. |

### popup-cro

| Skill | Description |
|-------|-------------|
| `popup-cro` | When the user wants to create or optimize popups, modals, overlays, slide-ins, or banners for conversion purposes. Also use when the user mentions "exit intent," "popup conversions," "modal optimization," "lead capture popup," "email popup," "announcement banner," "overlay," "collect emails with a popup," "exit popup," "scroll trigger," "sticky bar," or "notification bar." Use this for any overlay or interrupt-style conversion element. For forms outside of popups, see form-cro. For general page conversion optimization, see page-cro. |

### pr-outreach

| Skill | Description |
|-------|-------------|
| `pr-outreach` | Write press releases, journalist pitches, and media outreach for product announcements, launches, funding rounds, partnerships, or company news. Use when the user says "press release," "media coverage," "journalist pitch," "get press," "PR strategy," "product announcement," "news story," "media outreach," "pitch to journalists," "get featured," "TechCrunch," "press coverage," or "public relations." Covers press release writing, journalist personalization, newsworthy angle identification, and media list strategy. For cold sales outreach, see cold-email. For launch planning, see launch-strategy. |

### prd-architect

| Skill | Description |
|-------|-------------|
| `prd-architect` | Stage 3 — run the code-architect on PRD/MASTER.md + PLAN.md. Produces ARCHITECTURE.md and DECISIONS.md with initial entries for every significant architectural choice. |

### prd-gate

| Skill | Description |
|-------|-------------|
| `prd-gate` | Stage 1a — run the PRD health gate on PRD/MASTER.md. Checks open questions, metrics, non-goals, requirements, and launch criteria. Blocks progress to prd:skill-map if FAIL. |

### prd-plan

| Skill | Description |
|-------|-------------|
| `prd-plan` | Stage 2 — run the planner on PRD/MASTER.md + SKILL_MAP.md. Produces PLAN.md with phases, file assignments, risk levels, and a Scope Check section. |

### prd-run

| Skill | Description |
|-------|-------------|
| `prd-run` | Full pipeline check — chains prd:gate → prd:skill-map → prd:plan → prd:architect in sequence. Requires PRD/MASTER.md to already exist. Stops with a clear message if the gate fails. |

### prd-skill-map

| Skill | Description |
|-------|-------------|
| `prd-skill-map` | Stage 1.5 — run the skill-matcher on PRD/MASTER.md. Assigns best ECC skill per task/sub-task, searches GitHub and web for alternatives, queries squish-memory for prior learnings. Writes SKILL_MAP.md. |

### prd-sub-prd

| Skill | Description |
|-------|-------------|
| `prd-sub-prd` | Sub-PRD creation — invoke when a significant new feature falls outside the current PRD scope. Creates PRD/[feature-slug].md, runs the health gate, and updates PRD/MASTER.md Section 16. |

### prd-update

| Skill | Description |
|-------|-------------|
| `prd-update` | PRD drift update — surgically update PRD/MASTER.md when implementation diverges from the original plan. Adds a Section 15 revision history entry. Pass the drift description as the argument. |

### prd-write

| Skill | Description |
|-------|-------------|
| `prd-write` | Stage 1 — create PRD/MASTER.md for a new project or feature. Creates PRD/ folder if needed. Pass the idea as the argument. |

### pricing-strategy

| Skill | Description |
|-------|-------------|
| `pricing-strategy` | When the user wants help with pricing decisions, packaging, or monetization strategy. Also use when the user mentions 'pricing,' 'pricing tiers,' 'freemium,' 'free trial,' 'packaging,' 'price increase,' 'value metric,' 'Van Westendorp,' 'willingness to pay,' 'monetization,' 'how much should I charge,' 'my pricing is wrong,' 'pricing page,' 'annual vs monthly,' 'per seat pricing,' or 'should I offer a free plan.' Use this whenever someone is figuring out what to charge or how to structure their plans. For in-app upgrade screens, see paywall-upgrade-cro. |

### printing-press

| Skill | Description |
|-------|-------------|
| `printing-press` | Generate a ship-ready CLI for an API with a lean research -> generate -> build -> shipcheck loop. |

### printing-press-catalog

| Skill | Description |
|-------|-------------|
| `printing-press-catalog` | Browse and install pre-built Go CLIs for popular APIs from the catalog |

### printing-press-import

| Skill | Description |
|-------|-------------|
| `printing-press-import` | > |

### printing-press-output-review

| Skill | Description |
|-------|-------------|
| `printing-press-output-review` | > |

### printing-press-polish

| Skill | Description |
|-------|-------------|
| `printing-press-polish` | > |

### printing-press-publish

| Skill | Description |
|-------|-------------|
| `printing-press-publish` | Publish a generated CLI to the printing-press-library repo |

### printing-press-reprint

| Skill | Description |
|-------|-------------|
| `printing-press-reprint` | > |

### printing-press-retro

| Skill | Description |
|-------|-------------|
| `printing-press-retro` | > |

### printing-press-score

| Skill | Description |
|-------|-------------|
| `printing-press-score` | Score a generated CLI against the Steinberger bar, compare two CLIs side-by-side |

### prisma-patterns

| Skill | Description |
|-------|-------------|
| `prisma-patterns` | Prisma ORM patterns for schema design, migrations, type-safe queries, relations, and performance. Use when writing migrations, designing models, or building data-access layers with PostgreSQL, Express, and TypeScript. |

### product-marketing-context

| Skill | Description |
|-------|-------------|
| `product-marketing-context` | When the user wants to create or update their product marketing context document. Also use when the user mentions 'product context,' 'marketing context,' 'set up context,' 'positioning,' 'who is my target audience,' 'describe my product,' 'ICP,' 'ideal customer profile,' or wants to avoid repeating foundational information across marketing tasks. Use this at the start of any new project before using other marketing skills — it creates `.agents/product-marketing-context.md` that all other skills reference for product, audience, and positioning context. |

### programmatic-seo

| Skill | Description |
|-------|-------------|
| `programmatic-seo` | When the user wants to create SEO-driven pages at scale using templates and data. Also use when the user mentions "programmatic SEO," "template pages," "pages at scale," "directory pages," "location pages," "[keyword] + [city] pages," "comparison pages," "integration pages," "building many pages for SEO," "pSEO," "generate 100 pages," "data-driven pages," or "templated landing pages." Use this whenever someone wants to create many similar pages targeting different keywords or locations. For auditing existing SEO issues, see seo-audit. For content strategy planning, see content-strategy. |

### redesign-skill

| Skill | Description |
|-------|-------------|
| `redesign-existing-projects` | Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without breaking functionality. Works with any CSS framework or vanilla CSS. |

### referral-program

| Skill | Description |
|-------|-------------|
| `referral-program` | When the user wants to create, optimize, or analyze a referral program, affiliate program, or word-of-mouth strategy. Also use when the user mentions 'referral,' 'affiliate,' 'ambassador,' 'word of mouth,' 'viral loop,' 'refer a friend,' 'partner program,' 'referral incentive,' 'how to get referrals,' 'customers referring customers,' or 'affiliate payout.' Use this whenever someone wants existing users or partners to bring in new customers. For launch-specific virality, see launch-strategy. |

### resume-builder

| Skill | Description |
|-------|-------------|
| `Resume Builder` | Build a complete, polished resume end-to-end by orchestrating specialized skills for research, branding, copywriting, design, LinkedIn, and QA. Use when creating a new resume from scratch, overhauling an existing one, targeting a specific role or industry, or preparing a full job-search package including LinkedIn and cover letter. |

### revops

| Skill | Description |
|-------|-------------|
| `revops` | When the user wants help with revenue operations, lead lifecycle management, or marketing-to-sales handoff processes. Also use when the user mentions 'RevOps,' 'revenue operations,' 'lead scoring,' 'lead routing,' 'MQL,' 'SQL,' 'pipeline stages,' 'deal desk,' 'CRM automation,' 'marketing-to-sales handoff,' 'data hygiene,' 'leads aren't getting to sales,' 'pipeline management,' 'lead qualification,' or 'when should marketing hand off to sales.' Use this for anything involving the systems and processes that connect marketing to revenue. For cold outreach emails, see cold-email. For email drip campaigns, see email-sequence. For pricing decisions, see pricing-strategy. |

### sales-enablement

| Skill | Description |
|-------|-------------|
| `sales-enablement` | When the user wants to create sales collateral, pitch decks, one-pagers, objection handling docs, or demo scripts. Also use when the user mentions 'sales deck,' 'pitch deck,' 'one-pager,' 'leave-behind,' 'objection handling,' 'deal-specific ROI analysis,' 'demo script,' 'talk track,' 'sales playbook,' 'proposal template,' 'buyer persona card,' 'help my sales team,' 'sales materials,' or 'what should I give my sales reps.' Use this for any document or asset that helps a sales team close deals. For competitor comparison pages and battle cards, see competitor-alternatives. For marketing website copy, see copywriting. For cold outreach emails, see cold-email. |

### schema-markup

| Skill | Description |
|-------|-------------|
| `schema-markup` | When the user wants to add, fix, or optimize schema markup and structured data on their site. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," "breadcrumb schema," "Google rich results," "knowledge panel," "star ratings in search," or "add structured data." Use this whenever someone wants their pages to show enhanced results in Google. For broader SEO issues, see seo-audit. For AI search optimization, see ai-seo. |

### seo-audit

| Skill | Description |
|-------|-------------|
| `seo-audit` | When the user wants to audit, review, or diagnose SEO issues on their site. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," "SEO health check," "my traffic dropped," "lost rankings," "not showing up in Google," "site isn't ranking," "Google update hit me," "page speed," "core web vitals," "crawl errors," or "indexing issues." Use this even if the user just says something vague like "my SEO is bad" or "help with SEO" — start with an audit. For building pages at scale to target keywords, see programmatic-seo. For adding structured data, see schema-markup. For AI search optimization, see ai-seo. |

### signup-flow-cro

| Skill | Description |
|-------|-------------|
| `signup-flow-cro` | When the user wants to optimize signup, registration, account creation, or trial activation flows. Also use when the user mentions "signup conversions," "registration friction," "signup form optimization," "free trial signup," "reduce signup dropoff," "account creation flow," "people aren't signing up," "signup abandonment," "trial conversion rate," "nobody completes registration," "too many steps to sign up," or "simplify our signup." Use this whenever the user has a signup or registration flow that isn't performing. For post-signup onboarding, see onboarding-cro. For lead capture forms (not account creation), see form-cro. |

### site-architecture

| Skill | Description |
|-------|-------------|
| `site-architecture` | When the user wants to plan, map, or restructure their website's page hierarchy, navigation, URL structure, or internal linking. Also use when the user mentions "sitemap," "site map," "visual sitemap," "site structure," "page hierarchy," "information architecture," "IA," "navigation design," "URL structure," "breadcrumbs," "internal linking strategy," "website planning," "what pages do I need," "how should I organize my site," or "site navigation." Use this whenever someone is planning what pages a website should have and how they connect. NOT for XML sitemaps (that's technical SEO — see seo-audit). For SEO audits, see seo-audit. For structured data, see schema-markup. |

### skill-gap

| Skill | Description |
|-------|-------------|
| `skill-gap` | Periodic skill library audit. Reads all squish-memory learnings across projects, surfaces patterns (repeated custom builds, unused skills, recurring GitHub alternatives), and outputs SKILL_GAPS.md with concrete candidates for new skills, skills to retire, and libraries worth wrapping. Run with /skill-gap at end of sprint or after 3+ projects. Makes the skill library actively self-curate instead of just grow. |

### skill-learn

| Skill | Description |
|-------|-------------|
| `skill-learn` | Post-project learning loop. Runs at project end to compare what skills were recommended (SKILL_MAP.md) vs. actually used, capture decision context from DECISIONS.md, and write structured learnings to squish-memory so future skill-matcher runs get smarter. Also writes a watchlist for alternatives that were found but not used. Trigger with /skill-learn at project end, or chain from printing-press-retro. |

### slides

| Skill | Description |
|-------|-------------|
| `ckm:slides` | Create strategic HTML presentations with Chart.js, design tokens, responsive layouts, copywriting formulas, and contextual slide strategies. |

### social-content

| Skill | Description |
|-------|-------------|
| `social-content` | When the user wants help creating, scheduling, or optimizing social media content for LinkedIn, Twitter/X, Instagram, TikTok, Facebook, or other platforms. Also use when the user mentions 'LinkedIn post,' 'Twitter thread,' 'social media,' 'content calendar,' 'social scheduling,' 'engagement,' 'viral content,' 'what should I post,' 'repurpose this content,' 'tweet ideas,' 'LinkedIn carousel,' 'social media strategy,' 'grow my following,' 'TikTok video,' 'Reels,' 'Shorts,' 'video script,' 'video hook,' 'short-form video,' or 'create a reel.' Use this for social media content creation, repurposing, scheduling, and short-form video scripting. For broader content strategy, see content-strategy. For paid video ads, see ad-creative. |

### stripe-integration

| Skill | Description |
|-------|-------------|
| `stripe-integration` | Stripe integration patterns for products, pricing, checkout sessions, webhooks, customer portal, and billing management. Covers secure server-side patterns and React frontend integration. Use when building payment flows, subscription billing, or order processing. |

### tanstack-query

| Skill | Description |
|-------|-------------|
| `tanstack-query` | TanStack Query (React Query v5) patterns — query key conventions, data fetching, mutations with optimistic updates, cache invalidation, infinite scroll, and prefetching. Use when building or modifying data fetching in your React frontend. |

### taste-skill

| Skill | Description |
|-------|-------------|
| `design-taste-frontend` | Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering. |

### three-js-webgl

| Skill | Description |
|-------|-------------|
| `three-js-webgl` | Three.js and WebGL patterns for 3D scenes, model loading (GLB/STL/OBJ), camera controls, lighting, materials, raycasting, and ONNX model inference in the browser. Use when building or modifying the 3D viewer, model pipeline, or WebGL rendering in React + Vite projects. |

### typescript-patterns

| Skill | Description |
|-------|-------------|
| `typescript-patterns` | TypeScript patterns for type safety, generics, utility types, discriminated unions, type narrowing, Zod validation, and module organization. Use when writing TypeScript across the full stack (React + Express + Prisma). |

### ui-styling

| Skill | Description |
|-------|-------------|
| `ckm:ui-styling` | Create beautiful, accessible user interfaces with shadcn/ui components (built on Radix UI + Tailwind), Tailwind CSS utility-first styling, and canvas-based visual designs. Use when building user interfaces, implementing design systems, creating responsive layouts, adding accessible components (dialogs, dropdowns, forms, tables), customizing themes and colors, implementing dark mode, generating visual designs and posters, or establishing consistent styling patterns across applications. |

### ui-ux-pro-max

| Skill | Description |
|-------|-------------|
| `ui-ux-pro-max` | UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples. |

### verification-quality

| Skill | Description |
|-------|-------------|
| `Verification & Quality Assurance` | Comprehensive truth scoring, code quality verification, and automatic rollback system with 0.95 accuracy threshold for ensuring high-quality agent outputs and codebase reliability. |

### video

| Skill | Description |
|-------|-------------|
| `video` | When the user wants to create, generate, or produce video content using AI tools or programmatic frameworks. Also use when the user mentions 'video production,' 'AI video,' 'Remotion,' 'Hyperframes,' 'HeyGen,' 'Synthesia,' 'Veo,' 'Runway,' 'Kling,' 'Pika,' 'video generation,' 'AI avatar,' 'talking head video,' 'programmatic video,' 'video template,' 'explainer video,' 'product demo video,' 'video pipeline,' or 'make me a video.' Use this for video creation, generation, and production workflows. For video content strategy and what to post, see social-content. For paid video ad creative, see ad-creative. |

### visual-validation

| Skill | Description |
|-------|-------------|
| `visual-validation` | Capture screenshots during and after UI implementation to visually validate that code changes match the intended design. Use when building UI, implementing design changes, or verifying layout after edits. Also use when the user says "check it looks right", "screenshot this", "validate visually", "does it look correct", "take a screenshot", "verify the UI", or "confirm the layout". Works with any local dev server. Pairs with ui-styling, design-system, page-cro, image-to-code-skill, and any coder agent doing frontend work. |

### vps-deployment

| Skill | Description |
|-------|-------------|
| `vps-deployment` | Deployment patterns for Hostinger VPS — PM2 process management, Nginx reverse proxy, SSL via Certbot, zero-downtime deploys, environment management, and GitHub Actions CI/CD. Use when deploying your app's API or any Node.js service to production. |

## Slash Commands

Slash commands invoke automated workflows and tools. Grouped by namespace.

### analysis

| Command | Description |
|---------|-------------|
| `/analysis:bottleneck-detect` | Analyze performance bottlenecks in swarm operations and suggest optimizations. |
| `/analysis:COMMAND_COMPLIANCE_REPORT` | Reviewed all command files in `.claude/commands/analysis/` directory to ensure proper usage of: - `mcp__claude-flow__*` tools (preferred) - `npx claude-flow` commands (as fallback) - No direct impleme |
| `/analysis:performance-bottlenecks` | Identify and resolve performance bottlenecks in your development workflow. |
| `/analysis:performance-report` | Generate comprehensive performance reports for swarm operations. |
| `/analysis:README` | Commands for analysis operations in Claude Flow. |
| `/analysis:token-efficiency` | Reduce token consumption while maintaining quality through intelligent coordination. |
| `/analysis:token-usage` | Analyze token usage patterns and optimize for efficiency. |

### automation

| Command | Description |
|---------|-------------|
| `/automation:auto-agent` | Automatically spawn and manage agents based on task requirements. |
| `/automation:README` | Commands for automation operations in Claude Flow. |
| `/automation:self-healing` | Automatically detect and recover from errors without interrupting your flow. |
| `/automation:session-memory` | Maintain context and learnings across Claude Code sessions for continuous improvement. |
| `/automation:smart-agents` | Automatically spawn the right agents at the right time without manual intervention. |
| `/automation:smart-spawn` | Intelligently spawn agents based on workload analysis. |
| `/automation:workflow-select` | Automatically select optimal workflow based on task type. |

### github

| Command | Description |
|---------|-------------|
| `/github:code-review` | Automated code review with swarm intelligence. |
| `/github:code-review-swarm` | Deploy specialized AI agents to perform comprehensive, intelligent code reviews that go beyond traditional static analysis. |
| `/github:github-modes` | This document describes all GitHub integration modes available in Claude-Flow with ruv-swarm coordination. Each mode is optimized for specific GitHub workflows and includes batch tool integration for |
| `/github:github-swarm` | Create a specialized swarm for GitHub repository management. |
| `/github:issue-tracker` | Intelligent issue management and project coordination with ruv-swarm integration for automated tracking, progress monitoring, and team coordination. |
| `/github:issue-triage` | Intelligent issue classification and triage. |
| `/github:multi-repo-swarm` | Coordinate AI swarms across multiple repositories, enabling organization-wide automation and intelligent cross-project collaboration. |
| `/github:pr-enhance` | AI-powered pull request enhancements. |
| `/github:pr-manager` | Comprehensive pull request management with ruv-swarm coordination for automated reviews, testing, and merge workflows. |
| `/github:project-board-sync` | Synchronize AI swarms with GitHub Projects for visual task management, progress tracking, and team coordination. |
| `/github:README` | Commands for github operations in Claude Flow. |
| `/github:release-manager` | Automated release coordination and deployment with ruv-swarm orchestration for seamless version management, testing, and deployment across multiple packages. |
| `/github:release-swarm` | Orchestrate complex software releases using AI swarms that handle everything from changelog generation to multi-platform deployment. |
| `/github:repo-analyze` | Deep analysis of GitHub repository with AI insights. |
| `/github:repo-architect` | Repository structure optimization and multi-repo management with ruv-swarm coordination for scalable project architecture and development workflows. |
| `/github:swarm-issue` | Transform GitHub Issues into intelligent swarm tasks, enabling automatic task decomposition and agent coordination. |
| `/github:swarm-pr` | Create and manage AI swarms directly from GitHub Pull Requests, enabling seamless integration with your development workflow. |
| `/github:sync-coordinator` | Multi-package synchronization and version alignment with ruv-swarm coordination for seamless integration between claude-code-flow and ruv-swarm packages. |
| `/github:workflow-automation` | Integrate AI swarms with GitHub Actions to create intelligent, self-organizing CI/CD pipelines that adapt to your codebase. |

### hooks

| Command | Description |
|---------|-------------|
| `/hooks:overview` | Automatically coordinate, format, and learn from Claude Code operations using hooks. |
| `/hooks:post-edit` | Execute post-edit processing including formatting, validation, and memory updates. |
| `/hooks:post-task` | Execute post-task cleanup, performance analysis, and memory storage. |
| `/hooks:pre-edit` | Execute pre-edit validations and agent assignment before file modifications. |
| `/hooks:pre-task` | Execute pre-task preparations and context loading. |
| `/hooks:README` | Commands for hooks operations in Claude Flow. |
| `/hooks:session-end` | Cleanup and persist session state before ending work. |
| `/hooks:setup` | ```bash npx claude-flow init --hooks ``` |

### monitoring

| Command | Description |
|---------|-------------|
| `/monitoring:agent-metrics` | View agent performance metrics. |
| `/monitoring:agents` | **This tool coordinates Claude Code's actions. It does NOT write code or create content.** |
| `/monitoring:README` | Commands for monitoring operations in Claude Flow. |
| `/monitoring:real-time-view` | Real-time view of swarm activity. |
| `/monitoring:status` | **This tool coordinates Claude Code's actions. It does NOT write code or create content.** |
| `/monitoring:swarm-monitor` | Real-time swarm monitoring. |

### optimization

| Command | Description |
|---------|-------------|
| `/optimization:auto-topology` | Automatically select the optimal swarm topology based on task complexity analysis. |
| `/optimization:cache-manage` | Manage operation cache for performance. |
| `/optimization:parallel-execute` | Execute tasks in parallel for maximum efficiency. |
| `/optimization:parallel-execution` | Execute independent subtasks in parallel for maximum efficiency. |
| `/optimization:README` | Commands for optimization operations in Claude Flow. |
| `/optimization:topology-optimize` | Optimize swarm topology for current workload. |

### Root Commands

| Command | Description |
|---------|-------------|
| `/aside` | Answer a quick side question without interrupting or losing context from the current task. Resume work automatically after answering. |
| `/auto-update` | Pull the latest ECC repo changes and reinstall the current managed targets. |
| `/build-fix` | Detect the project build system and incrementally fix build/type errors with minimal safe changes. |
| `/checkpoint` | Create, verify, or list workflow checkpoints after running verification checks. |
| `/claude-flow-help` | Show Claude-Flow commands and usage |
| `/claude-flow-memory` | Interact with Claude-Flow memory system |
| `/claude-flow-swarm` | Coordinate multi-agent swarms for complex tasks |
| `/code-review` | Code review — local uncommitted changes or GitHub PR (pass PR number/URL for PR mode) |
| `/cost-report` | Generate a local Claude Code cost report from a cost-tracker SQLite database. |
| `/cpp-build` | Fix C++ build errors, CMake issues, and linker problems incrementally. Invokes the cpp-build-resolver agent for minimal, surgical fixes. |
| `/cpp-review` | Comprehensive C++ code review for memory safety, modern C++ idioms, concurrency, and security. Invokes the cpp-reviewer agent. |
| `/cpp-test` | Enforce TDD workflow for C++. Write GoogleTest tests first, then implement. Verify coverage with gcov/lcov. |
| `/ecc-guide` | Navigate ECC's current agents, skills, commands, hooks, install profiles, and docs from the live repository surface. |
| `/evolve` | Analyze instincts and suggest or generate evolved structures |
| `/fastapi-review` | Review a FastAPI application for architecture, async correctness, dependency injection, Pydantic schemas, security, performance, and testability. |
| `/feature-dev` | Guided feature development with codebase understanding and architecture focus |
| `/flutter-build` | Fix Dart analyzer errors and Flutter build failures incrementally. Invokes the dart-build-resolver agent for minimal, surgical fixes. |
| `/flutter-review` | Review Flutter/Dart code for idiomatic patterns, widget best practices, state management, performance, accessibility, and security. Invokes the flutter-reviewer agent. |
| `/flutter-test` | Run Flutter/Dart tests, report failures, and incrementally fix test issues. Covers unit, widget, golden, and integration tests. |
| `/gan-build` | Run a generator/evaluator build loop for implementation tasks with bounded iterations and scoring. |
| `/gan-design` | Run a generator/evaluator design loop for frontend or visual work with bounded iterations and scoring. |
| `/go-build` | Fix Go build errors, go vet warnings, and linter issues incrementally. Invokes the go-build-resolver agent for minimal, surgical fixes. |
| `/go-review` | Comprehensive Go code review for idiomatic patterns, concurrency safety, error handling, and security. Invokes the go-reviewer agent. |
| `/go-test` | Enforce TDD workflow for Go. Write table-driven tests first, then implement. Verify 80%+ coverage with go test -cover. |
| `/gradle-build` | Fix Gradle build errors for Android and KMP projects |
| `/harness-audit` | Run a deterministic repository harness audit and return a prioritized scorecard. |
| `/hookify` | Create hooks to prevent unwanted behaviors from conversation analysis or explicit instructions |
| `/hookify-configure` | Enable or disable hookify rules interactively |
| `/hookify-help` | Get help with the hookify system |
| `/hookify-list` | List all configured hookify rules |
| `/instinct-export` | Export instincts from project/global scope to a file |
| `/instinct-import` | Import instincts from file or URL into project/global scope |
| `/instinct-status` | Show learned instincts (project + global) with confidence |
| `/jira` | Retrieve a Jira ticket, analyze requirements, update status, or add comments. Uses the jira-integration skill and MCP or REST API. |
| `/kotlin-build` | Fix Kotlin/Gradle build errors, compiler warnings, and dependency issues incrementally. Invokes the kotlin-build-resolver agent for minimal, surgical fixes. |
| `/kotlin-review` | Comprehensive Kotlin code review for idiomatic patterns, null safety, coroutine safety, and security. Invokes the kotlin-reviewer agent. |
| `/kotlin-test` | Enforce TDD workflow for Kotlin. Write Kotest tests first, then implement. Verify 80%+ coverage with Kover. |
| `/learn` | Extract reusable patterns from the current session and save them as candidate skills or guidance. |
| `/learn-eval` | Extract reusable patterns from the session, self-evaluate quality before saving, and determine the right save location (Global vs Project). |
| `/loop-start` | Start a managed autonomous loop pattern with safety defaults and explicit stop conditions. |
| `/loop-status` | Inspect active loop state, progress, failure signals, and recommended intervention. |
| `/marketing-campaign` | Plan and execute a full marketing campaign. Accepts a product brief and returns positioning, landing page copy, email sequence, social posts, ad variants, video scripts, and a content calendar. Can also review existing copy for conversion quality. |
| `/model-route` | Recommend the best model tier for the current task based on complexity, risk, and budget. |
| `/multi-backend` | Run a backend-focused multi-model workflow for APIs, algorithms, data, and business logic. |
| `/multi-execute` | Execute a multi-model implementation plan while preserving Claude as the only filesystem writer. |
| `/multi-frontend` | Run a frontend-focused multi-model workflow for components, layouts, animation, and UI polish. |
| `/multi-plan` | Create a multi-model implementation plan without modifying production code. |
| `/multi-workflow` | Run a full multi-model development workflow with research, planning, execution, optimization, and review. |
| `/nexus-update` | Pull the latest Nexus changes into ~/.claude and refresh dependencies. |
| `/orch-add-feature` | Orchestrate building a brand-new feature end to end — research, plan, TDD, review, gated commit. Wrapper that kicks off the orch-add-feature skill. |
| `/orch-build-mvp` | Orchestrate bootstrapping a working MVP from a design/spec doc — ingest, slice, scaffold, TDD, review, gated commit (reuses the GAN harness). Wrapper for the orch-build-mvp skill. |
| `/orch-change-feature` | Orchestrate altering an existing, working feature to new desired behavior — update tests to the new spec, change impl, review, gated commit. Wrapper for the orch-change-feature skill. |
| `/orch-fix-defect` | Orchestrate fixing a bug — reproduce it as a failing regression test, fix to green, review, gated commit. Wrapper for the orch-fix-defect skill. |
| `/orch-refine-code` | Orchestrate a behavior-preserving refactor — confirm tests green, restructure without changing behavior, keep green, review, gated commit. Wrapper for the orch-refine-code skill. |
| `/plan` | Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code. |
| `/plan-prd` | Generate a lean, problem-first PRD and hand off to /plan for implementation planning. |
| `/pm2` | Analyze a project and generate PM2 service commands for detected frontend, backend, or database services. |
| `/pr` | Create a GitHub PR from current branch with unpushed commits — discovers templates, analyzes changes, pushes |
| `/project-init` | Detect a project's stack and produce a dry-run ECC onboarding plan using the repository's install manifests and stack mappings. |
| `/projects` | List known projects and their instinct statistics |
| `/promote` | Promote project-scoped instincts to global scope |
| `/prp-commit` | Quick commit with natural language file targeting — describe what to commit in plain English |
| `/prp-implement` | Execute an implementation plan with rigorous validation loops |
| `/prp-plan` | Create comprehensive feature implementation plan with codebase analysis and pattern extraction |
| `/prp-pr` | Create a GitHub PR from current branch with unpushed commits — discovers templates, analyzes changes, pushes |
| `/prp-prd` | Interactive PRD generator - problem-first, hypothesis-driven product spec with back-and-forth questioning |
| `/prune` | Delete pending instincts older than 30 days that were never promoted |
| `/python-review` | Comprehensive Python code review for PEP 8 compliance, type hints, security, and Pythonic idioms. Invokes the python-reviewer agent. |
| `/quality-gate` | Run the ECC formatter quality gate for a single file and report remediation steps. |
| `/react-build` | Fix React build failures (Vite, webpack, Next.js, CRA, Parcel, esbuild, Bun) incrementally — JSX/TSX compile errors, hydration mismatches, server/client component boundary failures, missing types. Invokes the react-build-resolver agent for minimal, surgical fixes. |
| `/react-review` | Comprehensive React/JSX code review for hook correctness, render performance, server/client component boundaries, accessibility, and React-specific security. Invokes the react-reviewer agent (and typescript-reviewer alongside on TSX/JSX changes). |
| `/react-test` | Enforce TDD workflow for React. Write React Testing Library tests first (behavior-focused, accessibility-first), then implement components. Detects Vitest or Jest and verifies coverage targets. |
| `/refactor-clean` | Safely identify and remove dead code with verification after each change. |
| `/resume-session` | Load the most recent session file from ~/.claude/session-data/ and resume work with full context from where the last session ended. |
| `/review-pr` | Comprehensive PR review using specialized agents |
| `/rust-build` | Fix Rust build errors, borrow checker issues, and dependency problems incrementally. Invokes the rust-build-resolver agent for minimal, surgical fixes. |
| `/rust-review` | Comprehensive Rust code review for ownership, lifetimes, error handling, unsafe usage, and idiomatic patterns. Invokes the rust-reviewer agent. |
| `/rust-test` | Enforce TDD workflow for Rust. Write tests first, then implement. Verify 80%+ coverage with cargo-llvm-cov. |
| `/santa-loop` | Adversarial dual-review convergence loop — two independent model reviewers must both approve before code ships. |
| `/save-session` | Save current session state to a dated file in ~/.claude/session-data/ so work can be resumed in a future session with full context. |
| `/security-scan` | Run AgentShield against agent, hook, MCP, permission, and secret surfaces. |
| `/sessions` | Manage Claude Code session history, aliases, and session metadata. |
| `/setup-pm` | Configure your preferred package manager (npm/pnpm/yarn/bun) |
| `/skill-create` | Analyze local git history to extract coding patterns and generate SKILL.md files. Local version of the Skill Creator GitHub App. |
| `/skill-health` | Show skill portfolio health dashboard with charts and analytics |
| `/test-coverage` | Analyze coverage, identify gaps, and generate missing tests toward the target threshold. |
| `/update-codemaps` | Scan project structure and generate token-lean architecture codemaps. |
| `/update-docs` | Sync documentation from source-of-truth files such as scripts, schemas, routes, and exports. |

### sparc

| Command | Description |
|---------|-------------|
| `/sparc:analyzer` | Deep code and data analysis with batch processing capabilities. |
| `/sparc:architect` | System design with Memory-based coordination for scalable architectures. |
| `/sparc:ask` | ❓Ask - You are a task-formulation guide that helps users navigate, ask, and delegate tasks to the correc... |
| `/sparc:batch-executor` | Parallel task execution specialist using batch operations. |
| `/sparc:code` | 🧠 Auto-Coder - You write clean, efficient, modular code based on pseudocode and architecture. You use configurat... |
| `/sparc:coder` | Autonomous code generation with batch file operations. |
| `/sparc:debug` | 🪲 Debugger - You troubleshoot runtime bugs, logic errors, or integration failures by tracing, inspecting, and ... |
| `/sparc:debugger` | Systematic debugging with TodoWrite and Memory integration. |
| `/sparc:designer` | UI/UX design with Memory coordination for consistent experiences. |
| `/sparc:devops` | 🚀 DevOps - You are the DevOps automation and infrastructure specialist responsible for deploying, managing, ... |
| `/sparc:docs-writer` | 📚 Documentation Writer - You write concise, clear, and modular Markdown documentation that explains usage, integration, se... |
| `/sparc:documenter` | Documentation with batch file operations for comprehensive docs. |
| `/sparc:innovator` | Creative problem solving with WebSearch and Memory integration. |
| `/sparc:integration` | 🔗 System Integrator - You merge the outputs of all modes into a working, tested, production-ready system. You ensure co... |
| `/sparc:mcp` | ♾️ MCP Integration - You are the MCP (Management Control Panel) integration specialist responsible for connecting to a... |
| `/sparc:memory-manager` | Knowledge management with Memory tools for persistent insights. |
| `/sparc:optimizer` | Performance optimization with systematic analysis and improvements. |
| `/sparc:orchestrator` | Multi-agent task orchestration with TodoWrite/TodoRead/Task/Memory using MCP tools. |
| `/sparc:post-deployment-monitoring-mode` | 📈 Deployment Monitor - You observe the system post-launch, collecting performance, logs, and user feedback. You flag reg... |
| `/sparc:refinement-optimization-mode` | 🧹 Optimizer - You refactor, modularize, and improve system performance. You enforce file size limits, dependenc... |
| `/sparc:researcher` | Deep research with parallel WebSearch/WebFetch and Memory coordination. |
| `/sparc:reviewer` | Code review using batch file analysis for comprehensive reviews. |
| `/sparc:security-review` | 🛡️ Security Reviewer - You perform static and dynamic audits to ensure secure code practices. You flag secrets, poor mod... |
| `/sparc:sparc` | ⚡️ SPARC Orchestrator - You are SPARC, the orchestrator of complex workflows. You break down large objectives into delega... |
| `/sparc:sparc-modes` | SPARC (Specification, Planning, Architecture, Review, Code) is a comprehensive development methodology with 17 specialized modes, all integrated with MCP tools for enhanced coordination and execution. |
| `/sparc:spec-pseudocode` | 📋 Specification Writer - You capture full project context—functional requirements, edge cases, constraints—and translate t... |
| `/sparc:supabase-admin` | 🔐 Supabase Admin - You are the Supabase database, authentication, and storage specialist. You design and implement d... |
| `/sparc:swarm-coordinator` | Specialized swarm management with batch coordination capabilities. |
| `/sparc:tdd` | Test-driven development with TodoWrite planning and comprehensive testing. |
| `/sparc:tester` | Comprehensive testing with parallel execution capabilities. |
| `/sparc:tutorial` | 📘 SPARC Tutorial - You are the SPARC onboarding and education assistant. Your job is to guide users through the full... |
| `/sparc:workflow-manager` | Process automation with TodoWrite planning and Task execution. |

## Hooks

Hooks automate actions before/after tool invocation, at session boundaries, and on build failures. They enforce quality gates, format code, type-check, and manage project scaffolding.

### Event: PreToolUse

Hooks run before tools execute. Used for validation, parameter modification, and fact-forcing.

| Matcher | What it does |
|---------|-------------|
| `Bash` | Plugin-provided pre-bash dispatcher hook (auto-resolved via CLAUDE_PLUGIN_ROOT) |
| `Write` | Warns if write targets documentation files; prevents accidental doc overwrite via plugin hook |
| `Edit|Write` | Suggests compacting context if file edits are approaching size limits (plugin hook) |
| `*` | Observation hook: tracks tool use patterns for continuous learning (async, 10s timeout) |
| `Bash|Write|Edit|MultiEdit` | Governance capture hook: logs code changes and tool use for audit/learning (plugin hook, 10s timeout) |
| `Write|Edit|MultiEdit` | Config protection hook: prevents accidental modifications to Nexus settings files (5s timeout) |
| `*` | MCP health check: verifies all registered MCPs are available and responsive (plugin hook) |
| `Edit|Write|MultiEdit` | Fact-forcing gate: requires explicit listing of files/data being modified before destructive operations (5s timeout) |
| `*` | Continuous learning observe hook: tracks patterns and behaviors via `~/.claude/skills/ecc/continuous-learning-v2/hooks/observe.sh` |

### Event: PreCompact

Hook runs before context compaction to prepare summaries.

| Matcher | What it does |
|---------|-------------|
| `*` | Pre-compact hook from ECC plugin: prepares memory summaries before context is compacted (plugin hook) |

### Event: SessionStart

Hook runs at session initialization.

| Matcher | What it does |
|---------|-------------|
| `*` | Session bootstrap hook from ECC plugin: loads memory, checks scaffolding, initializes project state (plugin hook) |
| `*` | Project scaffolding check (`project-scaffolding-check.js`): checks the cwd for a graphify knowledge graph (`graphify-out/graph.json`) and a `PRD/` folder; if either is missing, injects a one-time reminder to offer building it. Skips non-project directories (home, `~/.claude`) and does not re-nag on `compact` (10s timeout) |

### Event: PostToolUse

Hooks run after successful tool execution. Used for formatting, linting, type-checking, and code quality gates.

| Matcher | What it does |
|---------|-------------|
| `Bash` | Plugin-provided post-bash dispatcher hook (auto-resolved via CLAUDE_PLUGIN_ROOT, 30s timeout, async) |
| `Edit|Write|MultiEdit` | Quality gate hook from ECC plugin: validates code quality, style, and test coverage (30s timeout, async) |
| `Edit|Write|MultiEdit` | Design quality check hook: audits UI components for anti-template patterns and design standards (10s timeout) |
| `Edit|Write|MultiEdit` | Post-edit accumulator hook: batches changes for efficient follow-up actions (plugin hook) |
| `Edit` | Console warning detector: alerts if console.log/debug statements remain in production code (plugin hook) |
| `Bash|Write|Edit|MultiEdit` | Post-governance capture hook: finalizes audit log after changes (10s timeout) |
| `*` | Session activity tracker: logs tool use, changes, and progress for session analytics (10s timeout, plugin hook) |
| `*` | Post-observation hook: finalizes continuous learning tracking (10s timeout, async, plugin hook) |
| `*` | ECC metrics bridge: sends aggregated metrics to telemetry system for trend analysis (10s timeout, plugin hook) |
| `*` | ECC context monitor: tracks context window usage and suggests optimizations (10s timeout, plugin hook) |
| `Write|Edit|MultiEdit` | Nexus autocommit (edit mode): auto-commits Nexus config changes to the ~/.claude repo (25s timeout, async) |
| `Bash` | Nexus autocommit: auto-commits Nexus config changes from bash commands (25s timeout, async) |
| `*` | Continuous learning observe hook: post-action observation tracking via `~/.claude/skills/ecc/continuous-learning-v2/hooks/observe.sh` |

### Event: PostToolUseFailure

Hooks run when a tool fails.

| Matcher | What it does |
|---------|-------------|
| `*` | MCP health check on failure: confirms which MCPs are still available after failure (plugin hook) |
| `Bash` | Build failure agent suggestion hook (`post-bash-build-failure-agent-suggest.js`): detects npm/vite/next build errors and suggests appropriate resolver agent (react-build-resolver for Vite/Next, build-error-resolver for other stacks) |

### Event: Stop

Hooks run when session ends. Used for final verification and cleanup.

| Matcher | What it does |
|---------|-------------|
| `*` | Stop format & typecheck hook: runs final format/typecheck verification (300s timeout via `stop-format-typecheck.js`, plugin hook) |
| `*` | Console log check hook: final sweep for leftover debug statements (plugin hook) |
| `*` | Session end hook: finalizes session state and memory (30s timeout, async, plugin hook) |
| `*` | Session evaluation hook: rates session quality and captures lessons learned (30s timeout, async, plugin hook) |
| `*` | Cost tracker hook: totals API costs and token usage for the session (30s timeout, async, plugin hook) |
| `*` | Desktop notifier hook: sends system notification when session completes (10s timeout, async, plugin hook) |
| (default) | Stop review agent suggester (`stop-review-agent-suggest.js`): scans uncommitted changes and suggests matching reviewer agents (code-reviewer for source, security-reviewer for auth/payment, typescript-reviewer for .ts, react-reviewer/a11y-architect for .tsx, etc.) |

### Event: SessionEnd

Hook runs at session conclusion.

| Matcher | What it does |
|---------|-------------|
| `*` | Session end marker hook: marks session completion in logs for analysis (30s timeout, async, plugin hook) |

---

## Summary

- **Agents:** 45
- **Skills:** 173
- **Slash Commands:** 172
- **Hook Events:** 7 (PreToolUse, PreCompact, SessionStart, PostToolUse, PostToolUseFailure, Stop, SessionEnd)

For more information, see the ECC rules at `~/.claude/rules/ecc/` or the project CLAUDE.md.

