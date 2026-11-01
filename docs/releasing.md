# Public release checklist

GitHub destination: `iamvinay92/testgen-unit`. GitHub source releases and npm registry publication are separate steps.

- Confirm ownership and organizational approval for release. The new implementation omits the internal repository's source/history; confirm the proposed MIT license and contributor attribution before publishing. Do not relicense internal company code by assumption.
- Update package metadata, repository URL, README installation instructions and security contact. Check package-name availability separately before any npm registry publication.
- Run `npm test`, `npm run check` and real Go/Python/Maven/Gradle examples locally. Stage the repository privately and run the CI matrix on a clean checkout before making it public. Keep test and coverage output as release evidence.
- Inspect `npm pack --dry-run` and the tarball contents. Review for credentials, private endpoints, personal paths and copied internal documentation. Dependency-free packaging should contain only the CLI, libraries, skill, README and license.
- Commit with the required attribution, tag the reviewed version and publish through the chosen account after approval and verification. Enable GitHub private vulnerability reporting when making the repository public. No npm publishing automation is enabled.
- Replace article placeholders with reproducible public example results. Disclose that review is heuristic and coverage does not prove regression value.

The old toolkit and this package have separate version histories. This package starts at 0.1.0 and does not claim compatibility with every internal testgen flag. The executable is `testgen-unit`, so it can coexist with other testgen tools.
