# Security

The CLI executes project tools during validation, coverage, compilation/collection and doctor checks. Treat build wrappers, test suites and project configuration as executable code. Use trusted repositories and appropriate isolation.

Generation prints local source context; sharing it with a model is a separate user action. Static review cannot certify that tests are safe or correct.

Until a private reporting channel is configured for the public repository, report a potential vulnerability privately to the repository owner. Do not include credentials or exploit details in a public issue. The reporting channel must be set before publication.
