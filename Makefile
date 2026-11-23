.PHONY: test mutation

test:
	npm run build
	node --test --experimental-test-coverage '--test-coverage-include=src/policy.js' --test-coverage-branches=100 test/policy.unit.test.js
	npm run smoke
	sh scripts/with-db.sh node --test --test-concurrency=1 test/concurrency.integration.test.js test/postgres-verification.test.js test/e2e.test.js

mutation:
	npm exec -- stryker run

.PHONY: ci-negative
ci-negative:
	sh scripts/ci-negative.sh
