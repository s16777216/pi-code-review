# src

## Purpose

The source of the `picr` command-line tool: the two commands, the
settings that they read, and the code that they share.

## Contents

- `cli/`: the `review` and `publish` commands. See `cli/SPEC.md`.
- `core/`: code that names no host. `core/review/` is the review
  engine and `core/publish/` is the publisher. Each has a `SPEC.md`.
  The ports to a host are in `core/ports.ts`.
- `providers/`: one folder for each code host. See
  `providers/gitlab/SPEC.md`.
- `template/`: the built-in comment templates. See `template/SPEC.md`.
- `config.ts`: the settings of `review` and `publish` that no host
  owns.
- `settings.ts`: reads one setting, and `ConfigError`.
- `findingsFile.ts`: writes and reads the findings file that connects
  `review` and `publish`: findings, warnings, and `failed` for a failed review.
- `reviewInstructions.ts`: picks the review instructions from the
  instructions sources, and finds a changed instructions file.
- `logger.ts`: the logger, with secrets redacted.
