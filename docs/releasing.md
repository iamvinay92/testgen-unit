# Public release checklist

GitHub destination: `iamvinay92/testgen-unit`. GitHub source releases and npm registry publication are separate steps.

- Confirm ownership and license for release. Confirm the MIT license and contributor attribution before publishing.
- Update package metadata, repository URL, README installation instructions and security contact. Check package-name availability separately before any npm registry publication.
- Run `npm test`, `npm run check` and real Go/Python/Maven/Gradle examples locally. Run the CI matrix on a clean checkout before tagging. Keep test and coverage output as release evidence.
- Inspect `npm pack --dry-run` and the tarball contents. Review for credentials, private endpoints, personal paths and third-party documentation. Dependency-free packaging should contain only the CLI, libraries, skill, user documentation, README and license.
- Commit with the required attribution, tag the reviewed version and publish through the chosen account after verification. Enable GitHub private vulnerability reporting for the public repository. No npm publishing automation is enabled.
- Replace article placeholders with reproducible public example results. Disclose that review is heuristic and coverage does not prove regression value.

Version histories are independent. This package follows semantic versioning for its own releases. The executable is `testgen-unit`, so it can coexist with other tools.
