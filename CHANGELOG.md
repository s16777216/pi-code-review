# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 0.2.0 (2026-11-13)

### ⚠ BREAKING CHANGES

* `review` makes about three times more model calls than before (three review agents), plus at most one call for the deduplication step, and one verification call for each file.
* `review` now exits with code 2 when the review engine fails after it loads the merge request. It writes a findings file with a `failed` field, and `publish` posts only a status comment for such a file and exits with code 1.
* remove Code Quality report ([#2](https://github.com/s16777216/pi-code-review/issues/2))

### Features

* add --debug logging via pino, fix maxTokens truncation ([#1](https://github.com/s16777216/pi-code-review/issues/1)) ([03b7066](https://github.com/s16777216/pi-code-review/commit/03b706672d626f4217d7694e2be3f9dffbd67428))
* add a configurable review output language ([53fb3ed](https://github.com/s16777216/pi-code-review/commit/53fb3ed0a6aec0a2032cc872df9d50d01d6dfd8e))
* exit with code 2 for errors ([00719c5](https://github.com/s16777216/pi-code-review/commit/00719c5a00d4f501696ddffac786e285b447e683))
* guide the line of a finding and the evidence of a verdict ([040f898](https://github.com/s16777216/pi-code-review/commit/040f89848e36418f243337bccdf45ad350af0994))
* harden review engine output ([#6](https://github.com/s16777216/pi-code-review/issues/6)) ([3e6a079](https://github.com/s16777216/pi-code-review/commit/3e6a07944095f43967a04c236dd3c2698f19b300))
* let review append review instructions to the system prompt ([#54](https://github.com/s16777216/pi-code-review/issues/54)) ([4f3d7e8](https://github.com/s16777216/pi-code-review/commit/4f3d7e8c1e4c6ba3b2e33599f976764f5684a5d1))
* let the review agent read MR discussions ([9b5a611](https://github.com/s16777216/pi-code-review/commit/9b5a611cace5d8a3abf4392da1a38a7882f307a7))
* limit review input size ([26b7b2f](https://github.com/s16777216/pi-code-review/commit/26b7b2f74a87d31c4b8e59af9c0abe87a9c0a59c))
* log the system prompt under debug ([34bc3d5](https://github.com/s16777216/pi-code-review/commit/34bc3d5a7be196b2dc2b92771b2f36eb70672fc3))
* make review failures visible and retry more ([135841d](https://github.com/s16777216/pi-code-review/commit/135841d445498a5eaf101e50f80b9b0ab91393ea))
* merge findings on publish and match resolved anchors ([e47744a](https://github.com/s16777216/pi-code-review/commit/e47744a05d2689a73da84158d2cdc6d39422eef8))
* publish fills comment text from templates ([0ab89c0](https://github.com/s16777216/pi-code-review/commit/0ab89c00b209a565b422639d3d1253f4be92999c))
* publish into existing MR discussions ([fc130b1](https://github.com/s16777216/pi-code-review/commit/fc130b1964f8e2a3bd4383fdde2b74cd248bd821))
* publish reads its target merge request from the findings file ([361a3e0](https://github.com/s16777216/pi-code-review/commit/361a3e0ece359296454e2d8d2659a1eb9143d214))
* redesign severity into critical/high/medium/low, keep pre_existing ([2e2c194](https://github.com/s16777216/pi-code-review/commit/2e2c1941b1692e0d88f7c9f0ab420a2af7e06295))
* remove Code Quality report ([#2](https://github.com/s16777216/pi-code-review/issues/2)) ([890c854](https://github.com/s16777216/pi-code-review/commit/890c854fc89225a13b3f43cc6c9ddac3403d859c))
* rename CLI binary to picr ([2b2a3ab](https://github.com/s16777216/pi-code-review/commit/2b2a3abb2adfa6154060e200ea72cc5564919ad3))
* report changed files whose diff is not reviewed ([1db4a89](https://github.com/s16777216/pi-code-review/commit/1db4a898352b35220867baffea454fd79bea49d0))
* report review findings via submit_review tool call ([858a780](https://github.com/s16777216/pi-code-review/commit/858a780b7ecdf424c14b1f31eed41e279f54ea8a))
* resolve discussions the agent declares fixed ([5090249](https://github.com/s16777216/pi-code-review/commit/50902498b6f18a9c1531e2b444e04aa5a9b5014f))
* review large merge requests in batches ([e3eb8e0](https://github.com/s16777216/pi-code-review/commit/e3eb8e00f9f594007b01e1866269f32d94f88372))
* review with three agents that each have a review focus ([f1163e2](https://github.com/s16777216/pi-code-review/commit/f1163e291e8913416267d97412ac83f9ca084890))
* ship default publish templates as files ([7271707](https://github.com/s16777216/pi-code-review/commit/7271707448edeb51f7000c2ca5c7b20df45fbf3b))
* split CLI into review/publish commands, simplify GitLab auth ([642cb8e](https://github.com/s16777216/pi-code-review/commit/642cb8e2a4740d4d4325344bb9a7686d1dee8a4d))
* validate the findings file before publish ([f7e61e4](https://github.com/s16777216/pi-code-review/commit/f7e61e461d1725dc40c6917ed21682dda178c492))
* verify the findings of each file with a verifier agent ([72bcc8e](https://github.com/s16777216/pi-code-review/commit/72bcc8e3072eb5cce9228fe09a75fa8b7faf1b9b))

### Bug Fixes

* add shebang to CLI entrypoint, normalize repository URL ([4cb1e28](https://github.com/s16777216/pi-code-review/commit/4cb1e28618709c670bc904d3e34c3d6d5744c5e6))
* drop leading ./ from bin path ([602be45](https://github.com/s16777216/pi-code-review/commit/602be4594a1c8dcec983e84b114b1ab58b86b6e1))
* estimate the real first request in the input-size guard ([e0b2893](https://github.com/s16777216/pi-code-review/commit/e0b2893f4ebe5b002177f6ff12a7408c453f0698))
* ignore the line break at the end of a diff's text ([12d99cd](https://github.com/s16777216/pi-code-review/commit/12d99cd771ff0fb6b1083ca8ca80ad8fef35a2f1))
* keep golden review-output fixture as LF ([e980298](https://github.com/s16777216/pi-code-review/commit/e980298243984a1319804b903f5846de6cbbc25c))
* resolve symlinks before comparing the CLI entrypoint URL ([ad2dc8c](https://github.com/s16777216/pi-code-review/commit/ad2dc8c88a93e8533b5ebbac98b84b4c2a9a9980))
* send old_line when a discussion position is a context line ([6d6592a](https://github.com/s16777216/pi-code-review/commit/6d6592aab4aacd791131f671f214c8e59a600bc4))
