# Public release checklist

The local repository is a release candidate, not a published npm package or GitHub repository.

- Confirm ownership and organizational approval for release. The new implementation omits the internal repository's source/history; confirm the proposed MIT license and contributor attribution before publishing. Do not relicense internal company code by assumption.
- Choose the public GitHub owner/repository and verify the npm package name is available. Update package metadata, repository URL, README installation instructions and security contact.
- Run `npm test`, `npm run check`, real Go/Python/Maven/Gradle examples and the CI matrix on a clean checkout. Keep test and coverage output as release evidence.
- Inspect `npm pack --dry-run` and the tarball contents. Review for credentials, private endpoints, personal paths and copied internal documentation. Dependency-free packaging should contain only the CLI, libraries, skill, README and license.
- Commit with the required attribution, tag the reviewed version, create the public repository, and publish through the chosen account. No publishing automation is enabled in this draft.
- Replace article placeholders with reproducible public example results. Disclose that review is heuristic and coverage does not prove regression value.

The old toolkit and this package have separate version histories. This package starts at 0.1.0 and does not claim compatibility with every internal testgen flag. The executable is `testgen-unit`, so it can coexist with other testgen tools.
