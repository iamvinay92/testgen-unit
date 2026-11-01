# Security

The CLI executes project tools during validation, coverage, compilation/collection and doctor checks. Treat build wrappers, test suites and project configuration as executable code. Use trusted repositories and appropriate isolation.

Generation prints local source context; sharing it with a model is a separate user action. Static review cannot certify that tests are safe or correct.

Report vulnerabilities using [GitHub private vulnerability reporting](https://github.com/iamvinay92/testgen-unit/security/advisories/new). Do not include credentials or exploit details in a public issue. Private vulnerability reporting must be enabled when the repository is made public.
