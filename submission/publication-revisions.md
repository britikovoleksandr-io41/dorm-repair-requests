# Ревізії публікації

Публікаційна копія зберігає послідовність і вміст робіт. У ранніх копіях шести файлів Stryker замінено абсолютні локальні шляхи та імена тимчасових каталогів. Вихідні локальні гілки збережено.

SHA у журналах, зокрема значення з `/version`, ідентифікують код, який фактично був запущений. Після очищення Git надав частині комітів нові SHA. Таблиця дозволяє знайти відповідний коміт публікації. Фактичні результати та SHA в журналах збережено.

| Початковий локальний SHA                   | SHA публікаційної копії                    | Коміт                                                                 |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `2d61db36c0e2d4eaf395494d760dc5f081695fdb` | `8ec44b2b0108b1b0fc62825b4544094792a88291` | test: verify concurrent repairs and harden transition coverage        |
| `260292000813a0d1a48b2f61ca80308a8159c1c4` | `0cf3475ccb3e23ac200be5ddd0f3a1868daa1dfb` | ci: verify changes and deploy checked images to staging               |
| `72052790d9e22002559f16f8c700099cfe26cb41` | `bda2957623ffa072c46baa2644ed3a6377964689` | fix(ci): validate workflow context and record local deployment checks |
| `c44bf8e8f81f08f9e04f6c703392cbf57d94b9d6` | `1d1ea1dfcc8ebc95bad7bfd4912526072e76d6c7` | test(perf): make queue load and profiling reproducible                |
| `4d4a25fc98247f23675891a5e092459311df0a1e` | `b03fdebfefa42211841980e1e4b8664e138bdfc7` | perf: index the repair queue and inject a typed reader                |
| `6e6ef09f08f262ee48b57c89285a30947ba86211` | `144c34f53d625398504667c5034e420bf6dcf770` | docs: record before-and-after queue measurements                      |
| `b1d5452491d0cb5fb5f1d1a6228bf9ce73c7bd22` | `228ecc95ac79b8f41f97ff2b5e1e3769d921642e` | docs: clarify verification scope and measurement limits               |
| `502424bfa20fb523ab030d50c88bc52f947c999b` | `bc6fd64254b20461f1a4f1c35b3c06930f0b93a5` | docs(lab03): carry forward the API submission                         |
| `4bd7f1d937a85bc418f8366bfe906be4ce067bba` | `be37ced25423a5f51885c713b6a92100e8ded3d7` | docs(lab03): distinguish mutation and integration evidence            |
| `33c15ff09f9b28d626a064cc865638a819988a85` | `33c190273c3574a7fd3e5fef8abe56b73522cef8` | docs(lab04): carry forward the test submission                        |
| `9db41bdd0d7e68037fd2abb14d37c52e2b1aa786` | `08481152d4713014cdd853670708d677b68209fa` | docs(lab04): separate local CI evidence from hosted acceptance        |
| `24c733c3fcc2a7f4d6c058d0ce9683b28c7ac627` | `2984f708f5def14d5285b54b8961fd7401ed4f90` | docs(lab05): carry forward the CI submission                          |
| `8e4321eed8ecb0c82c80376bac6c9490531819a0` | `87b538760bf5bff0afc0084cc8b7e2d73c00323d` | docs(lab05): index performance measurements and submission evidence   |

[Індекс здачі](README.md) · [Журнал AI](../ai/README.md).
