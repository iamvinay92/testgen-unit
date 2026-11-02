# Contributor guidance

This repository develops the testing toolkit itself; consumer test-only restrictions do not prevent toolkit implementation changes here.

Keep the runtime dependency free and provider neutral. Preserve existing target files, never auto-install project dependencies, and never report missing/stale coverage as success. Invoke subprocesses with argument arrays and no shell. Test discovery, failure propagation, path boundaries and real language examples when changing adapters. Update the README and bundled skill together.

Do not include private endpoints, credentials or personal filesystem paths. Do not publish a package or remote repository before the release checklist is satisfied. Include `Co-authored-by: Codex <noreply@openai.com>` in commits authored with Codex.
