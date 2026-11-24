# Перевірка GitHub і staging

## Підтверджено локально

- У `7205279` локальні `actionlint` і перевірка Conventional Commits завершилися з кодом 0 після виправлення. `make ci-negative` зупинилася на Prettier з кодом 2. [Журнал CI](lab04-ci-local.txt) · [Негативний прогін](lab04-ci-negative.txt).
- Ізольований контейнер застосував міграцію й повернув у `/version` SHA коду `260292000813a0d1a48b2f61ca80308a8159c1c4`. Сценарій ремонту пройшов. Після зупинки БД `/ready` повернув 503, `/health` — 200. [Команда та вивід](lab04-container.txt).
- GitHub checks, merge gate та публічний staging окремо очікують виконання за кроками нижче. [Spec](../submission/lab04-spec.md).

## GitHub checks і merge gate

1. Після дозволу опублікувати гілку й відкрити PR ЛР4 на зазначену в індексі базу. Зберегти URL PR і URL запуску `Verify` із SHA. [Локальний індекс](../submission/README.md).
2. Для `main` увімкнути вимогу PR, зробити check `Verify` обов’язковим, заборонити force push. Якщо використовується squash merge, встановити Conventional Commit як заголовок фінального коміту. За потреби вимагати актуальність PR відносно бази.
3. На тимчасовій гілці створити явно неформатований fixture, наприклад `src/ci-intentional-format-failure.js`, і відкрити окремий тестовий PR на захищену гілку. Зафіксувати URL червоного check і стан заблокованого merge. Прибрати fixture наступним комітом і зафіксувати зелений check. Ручний workflow dispatch з `negative=true` перевіряє CI, а доказом блокування служить саме PR з обов’язковим check.

## Публічний staging

1. Підготувати Render image-backed web service, окрему PostgreSQL staging і GHCR image з доступом на читання для Render, якщо пакет приватний. Шлях образу в Render має збігатись із `ghcr.io/<owner>/<repository>` workflow.
2. У середовищі Render задати `DATABASE_URL`, `ACTOR_TOKENS` і health check path `/ready`. Для першого запуску застосувати `node dist/migrate-cli.js` у середовищі staging і додати дозволених тестових користувачів до `users` окремою операцією. Для перемикання трафіку потрібен тариф з одночасною роботою двох версій.
3. У GitHub environment `staging` додати `RENDER_DEPLOY_HOOK` як secret і `STAGING_URL` як variable. Workflow публікує образ, передає digest у deploy hook і опитує публічні endpoints.
4. Після merge в `main` зберегти URL GitHub run, URL deployment, SHA і digest. На публічному URL виконати `curl -fsS "${STAGING_URL%/}/ready"` і `curl -fsS "${STAGING_URL%/}/version"`. Очікується успішна готовність і точний SHA push у `main`. Перевірити чергу й перехід статусу на тестовій заявці зі staging-токенами. Зберегти sanitized результат без токенів, DSN та deploy hook.
5. В історії deployment звірити, що попередня версія обслуговувала трафік до готовності нової. [ADR](../adr/0003-container-staging.md).
