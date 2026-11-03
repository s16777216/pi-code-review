# Spec Delta

## ADDED Requirements

### Requirement: Fetch merge request discussions on demand
The system SHALL fetch the merge request's discussions from the GitLab API when the review step requests them, with pagination. The system SHALL return each discussion's ID, its file and new-file line when it is a diff discussion, the head commit SHA of its position, its resolved state, and its notes with author username and body. The system MUST leave out GitLab system notes. The system SHALL fetch the discussions at most one time per review.

#### Scenario: Discussions fetch succeeds
- **WHEN** the review step requests the discussions of a merge request with one diff discussion and one general discussion
- **THEN** the system returns two discussions, and only the diff discussion has a file and a line

#### Scenario: System notes are left out
- **WHEN** a discussion contains a GitLab system note, for example "added 1 commit"
- **THEN** the system does not return that note

#### Scenario: A discussion was started by this tool
- **WHEN** the first note of a discussion contains the marker that this tool adds to its comments
- **THEN** the system marks that discussion as started by this tool

#### Scenario: Discussions fetch fails
- **WHEN** the GitLab API returns an error for the discussions request
- **THEN** the system returns an error message instead of the discussions, and the review step continues

#### Scenario: Discussions are requested two times
- **WHEN** the review step requests the discussions two times in one review
- **THEN** the system calls the GitLab discussions API for the first request only
