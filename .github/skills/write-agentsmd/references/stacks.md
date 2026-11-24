# Stack notes

Use these as prompts for the recon. Keep only what the repository actually needs.

## Go

- Commands: `go test -race -count=1 ./...`, package-scoped tests, `golangci-lint run`, `go generate ./...`, vendor mode.
- Write: goroutine lifetime, channel ownership, context propagation, consumer-side interfaces, lock ordering, error wrapping.
- Do not write formatting or import order. `gofmt` enforces those; error policy and test scope are yours to specify.
- Generated code: `zz_generated`, `*.pb.go`, mocks, `vendor/`. Record the generator.
- Landmines: build tags, CGO, `-race` cost, global state, the `go` version in `go.mod`, `go mod vendor` after adding a dependency.
- Tests: table-driven with `t.Run`, `t.Parallel`, `httptest`, temp dirs, and the repo's goroutine-leak helper when it has one.

## TypeScript and JavaScript

- Commands: package manager from the lockfile, workspace-scoped test/lint/typecheck, single test file, build, codegen.
- Write: module boundaries, generated clients, server/client split, state ownership, bundle constraints.
- Do not write: indentation, quotes, semicolons, import order. The formatter owns them.
- Landmines: workspace hoisting, package cycles, env vars exposed to the client, generated API types, lockfile churn.
- Tests: Vitest or Jest run modes, Playwright setup, what to mock, snapshot policy.

## Python

- Commands: `uv run`, `poetry run`, `pytest path::test`, `ruff`, `mypy`, `pre-commit`.
- Write: environment manager, Python version floor, import boundaries, migration rules, async/sync parity.
- Do not write: PEP 8 basics, docstring style, line length. The formatter and linter own them.
- Landmines: global state, import-time side effects, test database setup, optional extras, generated clients.
- Tests: fixtures, `parametrize`, `time_machine`, spec or autospec mocks.

## Rust

- Commands: `cargo test`, `cargo clippy`, `cargo fmt`, feature flags, the repo's snapshot update command.
- Write: ownership and lifetime constraints, feature matrix, no_std targets, external subtrees, soundness policy.
- Do not write: rustfmt rules, clippy basics.
- Landmines: feature unification, build scripts, generated code, platform-specific code, MSRV.

## Java and Kotlin

- Commands: `./gradlew test --tests`, `spotlessApply`, module-scoped builds.
- Write: Java language level, module boundaries, public API compatibility, annotation processors.
- Do not write: formatting. Spotless owns it.
- Landmines: Gradle daemon, offline mode, generated sources, shaded jars.

## C and C++

- Commands: `cmake -B build && cmake --build build`, `ctest --test-dir build`, `meson test`, `bazel test //...`, `clang-tidy`, `clang-format`.
- Write: language standard, ABI compatibility, platform targets, sanitizer policy, vendored third-party code.
- Do not write: formatting, include order the build already enforces.
- Landmines: generated headers, out-of-tree builds, ABI breaks, undefined behavior, platform-specific compile flags.
- Tests: unit and integration targets, sanitizer runs, golden files.

## .NET

- Commands: `dotnet build`, `dotnet test --filter`, `dotnet format`, `dotnet run --project`.
- Write: target frameworks, nullable policy, warnings-as-errors, public API compatibility, source generators.
- Do not write: formatting. `dotnet format` owns it.
- Landmines: `global.json` SDK pin, generated `obj/` output, platform-specific target frameworks, package lock files.
- Tests: xUnit or NUnit filters, fixtures, integration containers.

## Swift

- Commands: `swift build`, `swift test`, `xcodebuild -scheme <name> test`, `swift-format`.
- Write: platform availability, concurrency isolation, package versus Xcode project, public API compatibility.
- Do not write: formatting. `swift-format` owns it.
- Landmines: deployment target, generated project files, `Package.resolved` churn, XCTest versus swift-testing.

## Android

- Commands: `./gradlew :app:testDebugUnitTest`, `./gradlew :app:assembleDebug`, `./gradlew lint`, `./gradlew connectedAndroidTest`.
- Write: module graph, minSdk and targetSdk, R8/minify policy, Compose versus views, generated resources.
- Do not write: Kotlin formatting. ktlint or the IDE owns it.
- Landmines: device or emulator requirement, BuildConfig flags, manifest merges, annotation-processor output.
- Tests: JVM unit tests versus instrumented tests, Robolectric setup, screenshot tests.

## Infra and IaC

- Commands: plan, validate, lint, dry-run, apply. State the environment and the approval gate.
- Write: environments, state backends, secret sources, destructive operations, drift policy.
- Do not write: generic "be careful with production".
- Landmines: `apply` without a plan, state locks, force-destroy, DNS and TLS changes, cross-environment references.
- Tests: policy checks, `terraform validate`, `kubeconform`, dry runs.

## Libraries

- Write: public API compatibility, semver policy, deprecation window, supported versions, changelog rules.
- Do not write: internal style rules the compiler or linter enforces.
- Landmines: exported types, interface changes, generated docs, release tooling.

## Services

- Write: startup prerequisites, local dependencies, migration command, deploy cadence, health checks, observability.
- Landmines: background workers, cron, queue consumers, feature flags, config defaults, graceful shutdown.

## Monorepos

- Root: workspace commands, package manager, shared boundaries, generated code.
- Nested: local build and test commands, compatibility contracts, accepted limitations, local review rules.
- The closest file wins. Keep each nested file short.

## Data and ML

- Write: data paths, environment, seeds, hardware, experiment tracking, evaluation command.
- Landmines: large files, non-determinism, GPU memory, cached artifacts, notebooks versus modules.

## Other stacks

Ruby, PHP, Dart, Elixir, Lua, and anything else: find the manifest, the task runner, and the command that runs one test. Write the version floor, the boundary that must not be crossed, and the generated paths. Ask the user for the review contract when the repo has one.
