# Security Audit Report

## Дата аудита
8 мая 2026

## Что было исправлено

| # | Проблема | Файл |
|---|----------|------|
| 1 | profileMediaUpload — добавлены magic bytes | src/middleware/profileMediaUpload.ts |
| 2 | globalNeedsService — добавлен whitelist | src/services/globalNeedsService.ts |
| 3 | chatPermission — убрана утечка деталей PostgreSQL | src/middleware/chatPermission.ts |
| 4 | messengerRoutes — убраны details и dbCode из ответов | src/routes/messengerRoutes.ts |
| 5 | /api/diagnostics/* — закрыт за requireAuthSession + requireAdmin | src/diagnostics/routes/diagnostics.router.ts |
| 6 | authCookie — SameSite=None принудительно требует Secure | src/config/authCookie.ts |
| 7 | Analytics cookie — добавлен HttpOnly | src/middleware/analyticsMiddleware.ts |
| 8 | Rate limit — in-memory fallback при недоступном Redis | src/middleware/rateLimit.ts |

## Бэклог (приоритет)

1. /api/version — ограничить доступ в production
2. AiAgentError bodySnippet — не отдавать не-админам
3. /api/auth/register — добавить rate limit
4. CSP unsafe-inline — поэтапный план через nonce
5. express.json({ limit: '100kb' }) — явный лимит body

## Оценка безопасности

| Область | До | После |
|---------|-----|-------|
| Auth | 7/10 | 9/10 |
| API | 6/10 | 8/10 |
| Файлы | 5/10 | 9/10 |
| Утечки | 4/10 | 8/10 |
| Итого | 5.5/10 | 8.5/10 |

## Следующий аудит
Рекомендуется через 3 месяца или после крупных изменений в auth/мессенджере.
