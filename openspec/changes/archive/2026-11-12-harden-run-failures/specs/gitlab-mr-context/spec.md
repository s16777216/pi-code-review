## ADDED Requirements

### Requirement: Retry a read request to GitLab
The system SHALL send a read request (`GET`) to the GitLab API at most 3 times in total, and SHALL wait 2 seconds before the second try and 4 seconds before the third. The system SHALL retry a request when it ends with a network error, with a status of 500 or more, or with the status 429. The system MUST NOT retry a request that ends with another status. The system MUST NOT retry a request that is not a `GET` request. Each retry MUST write one `warn` log line with the method, the path, the try number, and the cause. The system MUST NOT write the access token or the request headers in the log line.

#### Scenario: A read request passes on the second try
- **WHEN** the first try of a `GET` request ends with a network error and the second try returns status 200
- **THEN** the system uses the response of the second try, and writes one `warn` log line

#### Scenario: A server error is tried again
- **WHEN** a `GET` request returns the status 502 on the first try and the status 200 on the second try
- **THEN** the system uses the response of the second try

#### Scenario: Too many requests
- **WHEN** a `GET` request returns the status 429 on the first try
- **THEN** the system waits 2 seconds and sends the request again

#### Scenario: A client error is not tried again
- **WHEN** a `GET` request returns the status 404 or 401
- **THEN** the system does not send the request again, and reports the status

#### Scenario: The last try fails
- **WHEN** the third try of a `GET` request ends with the status 503
- **THEN** the system reports the failure with the status 503

#### Scenario: A write request is not tried again
- **WHEN** a `POST` request to create a discussion ends with a network error
- **THEN** the system does not send the request again

#### Scenario: The log has no secret
- **WHEN** the system retries a request
- **THEN** the `warn` log line does not hold the access token
