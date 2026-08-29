# AutomaERP - PRD

## Original Problem
ERP SaaS focado em automação residencial/comercial para empresas brasileiras. Landing page com planos de assinatura (R$100/mês, R$250/3 meses, R$900/ano). Após pagar, usuário cria empresa e cadastra funcionários com permissões granulares por aba. Abas: Dashboard, Agenda (O.S. com assinatura digital), Garagem, Obras (clientes), Estoque, RMA, Minha Agenda. Sistema bloqueia acesso quando assinatura expira.

## Stack
- Backend: FastAPI + MongoDB (motor) + JWT (HS256) + bcrypt
- Frontend: React 19 + Tailwind + Shadcn + react-signature-canvas + sonner
- Payments: Stripe (claimable sandbox, BRL, one-time payment per plan)
- Storage: Emergent Object Storage (product photos, O.S. attachments, signatures)

## Personas
- CEO/Owner: registra, paga assinatura, cria empresa, gerencia tudo (default full perms)
- Funcionário interno: usa abas conforme permissões concedidas pelo CEO
- Funcionário externo: aba "Minha Agenda" mostra apenas suas O.S. atribuídas

## Core Requirements (delivered - Feb 2026)
- Landing page com pricing tiers + hero + bento features
- Auth JWT (register/login/me) com bcrypt
- Stripe checkout BRL para 3 planos (100/250/900), status polling, webhook idempotente
- Gate: sem plano pago → /planos; sem empresa → /onboarding/company; expirada → /planos
- Multi-tenant: tenant isolation via `company_id` em todas as queries
- CEO permissions (DEFAULT_CEO_PERMS) — CEO tem tudo por padrão
- Funcionário: permissões granulares view/edit por aba (Dashboard, Agenda, Garage, Obras, Estoque, RMA, MyAgenda, Employees)
- Dashboard: agenda semanal + notas (CEO/perm-edit) + veículos disponíveis
- Agenda/O.S.: cliente, funcionários, veículo, materiais, anexos, assinatura digital canvas, previous_notes automático da última O.S. do mesmo cliente
- Materiais: reserva ao criar O.S. → baixa efetiva no finalize (com qty_used ≤ qty_taken)
- Garagem: CRUD veículo + histórico manutenção; status transitions in_use/available via O.S.
- Obras: CRUD cliente + histórico de O.S. ordenado desc
- Estoque: categorias dinâmicas + produtos com foto + ajuste ±  + reserved
- RMA: abre chamado + decrementa 1 unidade em stock_movements
- Assinatura expirada bloqueia todas as rotas com 402

## Backend Test Result (iteration_1)
- 17/17 backend tests PASSED (100%) — auth, payments, CRUD, materials lifecycle, tenant isolation, permissions, subscription gating, uploads.

## Backlog / Deferred (P1/P2)
- P1: Recharts para gráficos no Dashboard (uso de estoque, carga semanal)
- P1: Notificações email quando assinatura próxima de expirar (Resend)
- P1: Modo edição rápida (inline) para tabelas grandes
- P2: PDF export da O.S. finalizada com assinatura para envio ao cliente
- P2: Cupom/desconto Stripe
- P2: Dark mode toggle
- P2: Chat interno da equipe
