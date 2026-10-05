# AFP store: where it can run

Status: research, 2026-10-04. Companion to `AGENT-FILES-PROTOCOL-PLAN.md`. Nothing here was installed or tested on our hosts. Figures marked **(unverified)** were not confirmed from a source. Prices change; check the provider page before deciding.

## What AFP needs from a store

The AFP S3 profile (see `spec/04-backends.md` in the agent-files repo) needs: PutObject with multipart, GetObject, HeadObject, ListObjectsV2, DeleteObject, presigned GET URLs, and optional lifecycle expiry. It does not need ACLs, bucket policies or versioning. Any store that provides those operations can back a space, so the "where" question is about cost, trust, durability and who operates it, not about protocol.

Capabilities used below: `link` (presigned URL), `expire` (lifecycle or manifest-driven deletion), `ui` (a human can browse with a standard tool), `versions`, `offline`.

## 1. Local only: Garage on one host

**Where:** a Linux host such as mini-lola is the natural choice (always on, already runs services). A Mac mini works but must not sleep and macOS updates and reboots must be planned. Reach it over the LAN or Tailscale.

**Setup effort:** low, about an hour. Download the binary or use the Docker image, write `garage.toml` (`replication_factor = 1`, metadata and data directories, `rpc_secret`, S3 API bind address, admin token), run `garage server --single-node --default-bucket` or create the bucket and key by hand, then grant the key access ([quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)). Run it under systemd or pm2 so it restarts.

**Cost:** zero beyond the host and its disk.

**Security posture:** this is our model for local setups: the network is the trust boundary. Bind the S3 port to the LAN or Tailscale interface only, not to `0.0.0.0` on a machine that has a public address. Still use one access key per host or per agent, scoped to its bucket, so one leaked key does not expose every space. The RPC and admin ports are not needed outside the host in a single-node setup.

**Failure modes:**
- The host is a single point of failure. If it is down, no agent can put or get.
- A single node holds the only copy. A disk failure loses data.
- Garage's default metadata engine (LMDB) "is prone to database corruption after an unclean shutdown" ([configuration](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)). On a single node, either enable `metadata_auto_snapshot_interval` or choose the Sqlite engine, which is slower but more tolerant. Test a power-cut recovery before trusting it.

**Backups:** metadata snapshots (automatic when enabled) plus a periodic copy of the data directory or a filesystem snapshot (ZFS or btrfs) to another disk or host. A nightly `rclone sync` to a second S3 store is the simplest off-host copy.

**How humans reach files:** through the agent UI (the intended path), any S3 client (Cyberduck, `rclone`, `aws s3`), or a third-party web UI such as [garage-webui](https://github.com/khairul169/garage-webui), which offers an object browser with upload, rename and delete plus bucket, key and lifecycle management ([search results](https://unixhost.pro/blog/2025/11/webui-for-garage-s3-server/)). Garage itself has no file browser. The web UIs are community projects; their maturity is **(unverified)**.

**AFP capabilities:** `link` yes (presigned, but only reachable by someone who can reach the host, so a link works only inside the same network), `expire` yes (lifecycle expiration), `ui` yes via S3 clients, `versions` no, `offline` no.

## 2. Self-hosted in the cloud: Garage on a VPS or instance

**Where:** a small VPS (Hetzner, DigitalOcean), a cloud instance (AWS EC2), or a free tier (Oracle Cloud's always-free VMs are often suggested; their current limits are **(unverified)**). Hetzner publishes plans with high included traffic ([Hetzner Cloud](https://www.hetzner.com/cloud/)); specific monthly prices were not shown on the page and are **(unverified)**.

**Setup effort:** medium, half a day. Everything in section 1, plus: a DNS name, a TLS reverse proxy in front of the S3 API (Caddy is the simplest: a `reverse_proxy` to port 3900), a firewall, and key management. Garage's reverse-proxy guide says to expose only the S3 API (3900) and, if wanted, the web endpoint (3902); keep the RPC port (3901) and the admin API (3903) internal ([reverse proxy](https://garagehq.deuxfleurs.fr/documentation/cookbook/reverse-proxy/)). Use a real certificate from Let's Encrypt or ZeroSSL, not a self-signed one. If you use Apache, the `nocanon` option is needed or presigned URLs break.

**Cost:** the instance, its disk, and bandwidth. Plans with generous included traffic keep egress cheap on some providers; on AWS egress is $0.09 per GB after 100 GB per month in standard regions ([AWS S3 pricing](https://aws.amazon.com/s3/pricing/), which applies to EC2 transfer in spirit but check EC2 pricing separately, **unverified**). Block storage volumes cost extra.

**Security posture:** here the store is reachable from the internet, so "the network is the trust boundary" no longer holds. Extra requirements:
- TLS on every request, with a valid certificate.
- One access key per host or agent, scoped to one bucket, rotated on a schedule. Never put one admin key on every host.
- Firewall: allow 443 only. RPC and admin ports closed to the world.
- A strong `admin_token`, stored in a file with restricted permissions (Garage supports `admin_token_file` and scoped, expiring tokens since v2.0).
- Rate limiting at the proxy.
- Treat presigned links as bearer secrets: short lifetimes, never logged.
- The operator of the VPS can read every object. v0.1 of AFP has no end-to-end encryption.

**Failure modes:** the VPS goes down or is deleted; the disk fills; a certificate renewal fails and every client errors; a leaked key exposes its whole scope. A cloud store is also slower than a LAN one from the office.

**Backups:** provider volume snapshots plus an off-provider copy (`rclone sync` to a second store). A snapshot on the same account does not protect against account loss.

**How humans reach files:** the same as local, and a presigned link works from anywhere, which is the point of this topology.

**AFP capabilities:** `link` yes and usable from outside, `expire` yes, `ui` yes via S3 clients, `versions` no, `offline` no.

## 3. Hosted S3-compatible services

No server to run. Point the space's `endpoint` at the provider. The AFP profile fits any of them that supports presigned URLs and multipart upload. Check each provider for the items in the table.

| Provider | Storage | Egress | Presigned GET | Lifecycle expiry | Notes |
|---|---|---|---|---|---|
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | $0.015 per GB-month; free tier 10 GB, 1M writes, 10M reads | Free | Yes, 1 second to 7 days, but not on custom domains ([R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)) | Yes ([R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)) | No versioning, ACLs or bucket policies, which AFP does not need. Infrequent Access has a 30-day minimum |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | $6.95 per TB-month; first 10 GB free | Free up to 3x average monthly storage, then $0.01 per GB | S3-compatible API supports presigned URLs **(unverified)** | **(unverified)** | No minimum storage duration, per the pricing page |
| [AWS S3](https://aws.amazon.com/s3/pricing/) | $0.0265 per GB-month (US West, first 50 TB) | 100 GB free per month, then $0.09 per GB | Yes (native) | Yes (native) | Most complete S3 feature set. Highest egress cost |
| [Wasabi](https://wasabi.com/pricing) | from $7.99 per TB-month | "No fees for egress or API requests" | **(unverified)** | **(unverified)** | A minimum storage duration or monthly minimum may apply and the pricing page did not say: **(unverified)** |

**Presigned-URL note:** a first read of Cloudflare's main S3 compatibility page seemed to say presigned URLs were unsupported, because they are not listed there. The dedicated presigned-URL page says they are supported. Always check the dedicated page, and test a real presigned GET before choosing a provider.

**Security posture:** the provider holds the data and is the trust boundary. Use scoped API tokens, one per host or agent where the provider allows it, and the provider's own audit features. Data leaves your network, which may matter for privacy or regulation.

**Failure modes:** provider outage, account suspension, a pricing change, an API difference that breaks a presigned link or a lifecycle rule.

**Backups:** providers replicate internally, but a deletion or a compromised key is still yours to protect against. Keep a second copy elsewhere if the files matter. Neither versioning nor object lock is available on R2.

**How humans reach files:** the provider dashboard, any S3 client, and presigned links from anywhere.

**AFP capabilities:** `link` yes (verify per provider), `expire` yes where lifecycle is supported, `ui` yes via S3 clients and provider dashboards, `versions` varies (not on R2), `offline` no.

## 4. Multi-node Garage

**What it is:** a Garage cluster of several hosts that replicate data. Garage's cluster guide says it needs at least three nodes for practical deployment, giving three-way replication ([real-world deployment](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/)). Every node needs direct connectivity to the others, and all must share the same `rpc_secret` and the same `replication_factor`.

**Setup effort:** high. On each node: configure and start Garage, connect nodes (`garage node connect`), assign each a zone, capacity and tags in the cluster layout, and apply the layout. Zones are logical groups, typically one per location, and Garage spreads replicas across zones. Metadata belongs on SSD and data on larger disks, with XFS recommended for the data partition.

**Cost:** three hosts, which can be small. Bandwidth between nodes counts if they are in different clouds.

**Security posture:** the RPC port carries replication traffic between nodes. Do not expose it publicly. Put nodes on a private mesh (Tailscale) or a private network, and keep the `rpc_secret` secret. Everything in section 2 applies to the public S3 endpoint.

**Failure modes and recovery:** with 3-way replication across 3 or more zones, Garage keeps working through the loss of one zone and loses no data through the loss of two ([recovering from failures](https://garagehq.deuxfleurs.fr/documentation/operations/recovering/)). A failed node is replaced with `garage layout assign <new> --replace <old>`, and data rebalances. Corrupted metadata can be rebuilt from replicas or restored from the automatic snapshots. Geo-spread nodes add write latency. How much, for our file sizes, is **(unverified)**.

**Backups:** replication is not a backup. A bad delete is replicated too. Keep an off-cluster copy.

**How humans reach files:** as above.

**AFP capabilities:** `link`, `expire`, `ui` yes. `versions` no. `offline` no, though the store survives a host loss. Garage is built for small operators, but whether three Macs and a Linux box make a good cluster, given sleep and reboots, is **(unverified)** and I would not try it on the Macs.

## Decision table

| | Local single node | Cloud VPS | Hosted S3 | Multi-node |
|---|---|---|---|---|
| Setup effort | Low | Medium | Lowest | High |
| Monthly cost | Host only | Small VPS | Per GB, often near zero at small scale | Several small hosts |
| Data stays in your network | Yes | No (your VPS) | No (provider) | Depends on node placement |
| Presigned link works for outsiders | No | Yes | Yes | Only if public endpoint |
| Survives a host loss | No | No | Yes (provider durability) | Yes |
| You operate and patch it | Yes | Yes | No | Yes, several nodes |
| Trust boundary | Network | Keys and TLS | Provider and keys | Network plus keys |

## Recommended default for a small fleet

Start with **one local Garage on mini-lola over Tailscale** (section 1) for the shared and artifacts spaces, with metadata snapshots enabled and a nightly `rclone sync` to an off-host store. That covers agents and people on our own network with the least to run.

Add a **second space on a hosted S3 service** (R2 is the cheapest to start: free egress and a free tier, and presigned links verified in its docs) for anything a person outside the network must receive. This also works as the off-host backup target.

Move to a cloud VPS only if you want the whole store reachable from outside under your own control. Do not build a multi-node cluster until one host's failure has actually hurt.

## Migrating between topologies

The `endpoint` in an AFP reference is a hint, and `ref` plus `digest` is the identity. Moving a space from a local store to a cloud one is therefore:

1. Copy the objects and their `.afp.json` manifests with `rclone sync`, keeping paths identical.
2. Verify digests on a sample (or all) of the copies.
3. Change the space's configured endpoint on each host.
4. Old references still resolve, because the space name and path are unchanged. A recipient that relied on the `endpoint` hint in an old message falls back to its own configuration for the space, or asks the sender for a new link. Old presigned `url` values stop working when the old store goes away, which is expected.

If a path or space name changes, references break. Keep both stable.

## Not verified

- Current Hetzner, DigitalOcean and Oracle free-tier prices and limits.
- EC2 egress pricing (only S3 pricing was fetched).
- Presigned URL and lifecycle support on Backblaze B2 and Wasabi, and Wasabi's minimum storage duration and monthly minimum.
- Maturity, security and maintenance of Garage web UIs.
- Garage on macOS (sleep, restarts, permissions) and its behavior under power loss with each database engine.
- Write latency of a geo-spread Garage cluster.
- Whether Tailscale latency between our hosts is good enough for a replicated cluster.

## Sources

- [Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [Garage reverse proxy](https://garagehq.deuxfleurs.fr/documentation/cookbook/reverse-proxy/)
- [Garage real-world deployment](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/)
- [Garage recovering from failures](https://garagehq.deuxfleurs.fr/documentation/operations/recovering/)
- [Garage configuration reference](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)
- [Garage S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)
- [garage-webui](https://github.com/khairul169/garage-webui) and [a write-up](https://unixhost.pro/blog/2025/11/webui-for-garage-s3-server/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [AWS S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Wasabi pricing](https://wasabi.com/pricing)
- [Hetzner Cloud](https://www.hetzner.com/cloud/)
