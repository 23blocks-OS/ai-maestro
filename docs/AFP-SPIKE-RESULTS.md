# AFP spike results: Garage on mini-lola

Date: 2026-10-04. Part of F024 Phase 1. Single measurements, one network path (Mac to mini-lola over Tailscale), not a benchmark.

## Setup

- Host: mini-lola, Ubuntu 24.04, x86_64, 3.8 GB RAM, 19 GB free disk (80% used before the spike).
- Garage v2.4.1 from the `dxflrs/garage` Docker image, single node (`--single-node --default-bucket`), `replication_factor = 1`, `db_engine = "sqlite"`, metadata snapshots every 6 hours.
- Container `garage-afp`, restart policy `unless-stopped`. S3 API published only on the Tailscale address (port 3900). Admin API published on 127.0.0.1 only. The RPC port is not published.
- Config, data and keys live in `~/garage/` on mini-lola (mode 700, secrets mode 600). Nothing else on the host was touched.
- Setup took one command and about a minute, most of it pulling the image.
- Test client: `curl --aws-sigv4` plus a small Python presigner. No S3 CLI was installed.

## Results

| Check | Result |
|-------|--------|
| Put and get, 1 MB | 0.11 s up, 0.22 s down, SHA-256 identical |
| Put and get, 500 MB | 24.8 s up, 22.2 s down (about 20 MB/s), SHA-256 identical |
| Presigned GET with no credentials | HTTP 200, bytes identical |
| Presigned GET after it expired (5 s link, tried after 7 s) | HTTP 400 |
| Request with no credentials and no link | HTTP 403 |
| Lifecycle rule (expire `tmp/` after 7 days) | Accepted and read back |
| Listing by prefix | Works |

## Not run

- **Restart and stop tests.** The permission check blocked a batch that included stopping and restarting the container on mini-lola. Not retried. Still open: data surviving a restart (expected, since it is on a mounted volume), the client error when the store is down (the spec says `unreachable`), and recovery after an unclean shutdown.
- A presigned link from outside the tailnet (expected to fail on a local-only store, which is why the cloud topology exists).
- Behavior when the disk is full, and when a Mac client sleeps mid-transfer.
- A hosted S3 service and a VPS Garage, for comparison.
- Whether the lifecycle rule actually deletes objects at the stated age (needs days to observe).

## Findings for the spec

- The S3 profile works as written on Garage: put, get, list, delete, presigned GET and lifecycle expiry. No ACLs, versioning or quotas were needed.
- Garage answers 400 for an expired presigned link and 403 for a missing signature. The spec should say a client treats either as "link not usable", not as a missing object.
- Single-node mode needs no cluster layout step with the `--single-node` flag in v2.3 and later.

## Cleanup

The 500 MB test object was deleted. The bucket `afp-spike` and a 1 MB object remain, and so does the container. Remove them with `docker rm -f garage-afp` and deleting `~/garage` on mini-lola when the spike is over.
