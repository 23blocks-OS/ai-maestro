# Research: how directories solve replication, and what AI Maestro takes from them

2026-11-06. Input to [SPEC-MESH-ENTITIES.md](SPEC-MESH-ENTITIES.md). The question: AI Maestro's hosts need to share who exists in an
organization, with no central server, on machines that sleep.

Marked **[background]** where the point comes from general knowledge and was not confirmed in these sources.

## 1. The finding that matters most

Active Directory has no central server either. Every domain controller is a full, writable copy. "Domain controller" sounds like the
central thing we lack, but it is the opposite: **each AI Maestro host would be a domain controller.** The mesh is not new. It is the
multi-master model AD has run for 25 years.

## 2. Active Directory

Source: [Microsoft Learn: USNs, replication vectors and object metadata](https://learn.microsoft.com/en-us/training/modules/active-directory-site-replication/4-replication-metadata-vectors).

- **A counter, not the clock, orders changes.** Each DC has its own USN, incremented on every write. Created and modified times are
  informational; "the USN is the authority for ordering and replication".
- **Originating stamp.** A change keeps where it began (originating DSA, USN and time) as it travels. Only the local USN changes.
- **Replication is per attribute, not per object.** Each attribute has its own version, originating DSA, originating USN and time. So
  two people editing different fields of one record never collide.
- **Conflict rule:** highest version wins; ties break on timestamp, then on originating DSA GUID. **The clock is not the first test.**
- **Two vectors.** High-watermark: "what is the next change from you?", per partner. Up-to-dateness: "what have I already seen from
  everyone?", which stops the same change arriving twice by different paths.
- **Linked values.** Group membership replicates per value, so two admins adding different members do not overwrite each other.
- **A delete is a change.** It leaves a tombstone, kept for `tombstoneLifetime` (180 days by default), so every DC learns of it.
- **Lingering objects.** A DC offline longer than that can bring deleted things back
  ([Microsoft KB 910205](https://support.microsoft.com/kb/910205/cs)).
- **Restoring from a backup is dangerous.** A restored database reuses old numbers, and partners ignore its new changes, without any
  error. A new invocation ID marks a new incarnation
  ([USN rollback, same module](https://learn.microsoft.com/en-us/training/modules/active-directory-site-replication/4-replication-metadata-vectors)).
- **Not everything is multi-master.** Some tasks do not suit it, so AD keeps five single-master roles (FSMO). "Certain updates are only
  accepted if the DC is the single designated master" ([MS-ADTS](https://learn.microsoft.com/cs-cz/openspecs/windows_protocols/ms-adts/bf8afb5f-1ae0-45de-8445-8a717ea5124a),
  [Understand FSMO roles](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-fsmo-roles)). By default they all
  sit on the first DC, and can be moved. **[background]** Password changes and lockouts go to the PDC emulator first, so they are not delayed
  by ordinary replication.

## 3. LDAP servers

- **OpenLDAP.** Multi-provider syncrepl orders by `entryCSN`. Resolution is per entry and deterministic; the higher server id wins ties. It
  "requires tightly synchronized clocks"
  ([Howard Chu](https://www.openldap.org/lists/openldap-technical/201102/msg00226.html),
  [design notes](https://www.openldap.org/lists/openldap-devel/200702/msg00015.html)). A cautionary case: per entry, and dependent on clocks.
- **389 Directory Server.** Eventually consistent; the most recent change wins, but **some conflicts need a person**. When two suppliers create
  the same name, it keeps both and renames the later one with its unique id, for an admin to resolve. The replica update vector tracks
  who has what, and removed suppliers must be cleaned from it
  ([Red Hat Directory Server](https://docs.redhat.com/en/documentation/red_hat_directory_server/13/html/configuring_and_managing_replication/solving-common-replication-problems)).

## 4. Mesh systems with no directory heritage

- **Syncthing.** Peers with no server. A version vector (a counter per device) detects a true conflict: two counters went up. It then
  **keeps the loser as a conflict copy**, because the machine "can't know which version is best"
  ([docs](https://docs.syncthing.net/users/syncing.html), [forum](https://forum.syncthing.net/t/how-does-conflict-resolution-work/15113)).
- **Serf and Consul.** Gossip based on SWIM, with failure detection shared by every node, plus a periodic full state sync to recover
  from partitions ([Serf](https://www.serf.io/docs/internals/gossip.html)).

## 5. Last write wins

Your idea, and AD's core, with one catch. Plain wall-clock last-write-wins lets a host with a fast clock silently beat newer changes. A
hybrid logical clock keeps time moving forward, but two truly concurrent writes still lose one
([summary](https://kindatechnical.com/system-design-interview/clocks-and-ordering-lamport-vector-and-hybrid-logical-clocks.html); original
paper: Kulkarni et al., 2014, not read here). Implementations also refuse timestamps too far in the future
([example](https://www.mintlify.com/estebanrfp/gdb/advanced/hybrid-logical-clock)). These sources are secondary.

**[background]** Consensus (Raft, Paxos, etcd) is the other family. It needs a majority awake to accept a write. With a few machines that
sleep, it would stop working when you need it most, so it does not fit.

## 6. What this says for AI Maestro

| Lesson | Source | For us |
|---|---|---|
| Every host a full, writable peer | AD | Fits a mesh with no center |
| Order by version, clock only as a tiebreak | AD | Do not trust laptop clocks first |
| Stamp per field, not per record | AD (against OpenLDAP) | Two edits to one person both survive |
| Sets merge per value | AD linked values | Team members; a person's keys |
| Vector of what each host has seen | AD, 389, Syncthing | A change reaches a host through any peer. Sleeping hosts catch up |
| A delete is a record, with a lifetime | AD | Tombstones. A host away longer must rejoin clean |
| A host restored from backup needs a new identity | AD | Otherwise peers ignore it silently |
| A few things stay single-master | AD FSMO | Name them on purpose |
| Roles default to the first server, and can move | AD | mac-mini |
| Do not hide the loser | Syncthing, 389 | Show a name clash; keep the losing value |
| Security changes do not wait | AD **[background]** | A revoked key must not lose to a clock, and goes out at once |
| Periodic full sync as a safety net | Serf | Repairs anything missed |
| No consensus | **[background]** | Laptops sleep |
