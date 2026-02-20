# Governance Rules for ai-maestro agents  
  
 - One agent must get the title of MANAGER. Only one agent can be MANAGER at any time. 
 - Each closed team must have an agent with the title of CHIEF-OF-STAFF.  This is optional for open teams.
 - The MANAGER is the only agent that can send/receive messages to/from every other agent (no restrictions).
 - A CHIEF-OF-STAFF in a closed team can receive/send messages from/to the the agents in its team, from the MANAGER and from the others CHIEF-OF-STAFF agents leading other teams. It cannot message other agents inside other closed teams, and cannot receive messages from them. It can, however, receive/send messages from/to agents in open teams. He is responsible for filtering and routing all inbox messages.
 - only the user can create or delete the CHIEF-OF-STAFF agents and create ir delete Teams, or change the attribute of a team from open to close and back. The chief of staff is created or assigned to an existing agent by the user when he creates the closed team, or when he switch a team from open to closed. Any agent is eligible unless it is already a chief-of-staff in another team. 
 - The MANAGER can assign/remove agents to/from closed or open teams, and can create/delete agents at will, except for the CHIEF-OF-STAFF, that is created or assigned by the user when he create a team.
 -  The CHIEF-OF-STAFF can remove agents from its own closed teams. But it has no power to remove agents from other closed teams, or transfer agents from other closed teams to its own team. This restriction does not apply to open teams.
 - The CHIEF-OF-STAFF can assign/transfer to its own team agents that are still not belonging to any closed team, with the exception of the MANAGER and of others CHIEF-OF-STAFF. This includes agents without teams, agents belonging to open teams and agents just created and not yet assigned.
 - The CHIEF-OF-STAFF can transfer its own team agents to another team (usually in response to a request of another CHIEF-OF-STAFF of another team)
 -  The CHIEF-OF-STAFF can create/delete agents at will (usually to assign them to its own team, but can also transfer them to other teams).
 - Only the user can delete, transfer or remove the title of a CHIEF-OF-STAFF.
 - If a closed team remains without CHIEF-OF-STAFF (transferred, deleted, etc.) the team immediately is downgraded to open team. Open teams do not need a CHIEF-OF-STAFF to exist, but they can get one if they want.
 - if a closed team is disbanded, the CHIEF-OF-STAFF title is revoked from the agent that was the team leader. The same is true for open teams.
 - the MANAGER and the CHIEF-OF-STAFF can add/remove/transfer agents between teams at will. 
 - the normal agents cannot join or leave a closed team by their own. They must ask the CHIEF-OF-STAFF to do it.
 - Once an agent is assigned to a closed team, it stops receiving messages from anyone except the MANAGER and the CHIEF-OF-STAFF 
 - the agents can only receive or send messages from/to agents in their own closed team. THEY CANNOT RECEIVE/SEND MESSAGES from open teams either! This would cause spam. Questions/Answers can be routed via the CoS of its own team, but they need its approval.
 - The agent with the title of MANAGER can belong to any number of open teams and any number of closed teams, no restrictions.  
 - The  agents with the CHIEF-OF-STAFF title can belong to any number of open teams, but can only belong to one closed team at any time.
 - The normal agents can belong to any number of open teams, but once they are assigned to a closed team, their appartenence to any other open team is revoked. They can only belong to one closed team at any time, and not be part of open teams while inside a closed team.
 - the user needs a password to assign or remove/transfer the title of MANAGER and of CHIEF-OF-STAFF to an agent or to create a Team and assign a chief-of-staff to it. (the only place where a CHIEF-OF-STAFF can be created is from the page for creating Teams or assigning CoS to teams anyway).
 - Agents with the title of MANAGER or CHIEF-OF-STAFF are constantly covered by backups. If for some reason a MANAGER or a CHIEF-OF-STAFF agent is deleted accidentally, were corrupt or become inaccessible, ai-maestro will immediately restore them from the backup. No user password needed.
 - The CHIEF-OF-STAFF must ask permission to the MANAGER for every operation regarding agents creation/destruction/transfer/assign/remove. The MANAGER can approve even in absence of the user if the user gave mandate to it in case of leave.

---

## Permissions Matrix

### Team & Role Management

| Action | USER | MANAGER | COS | NORMAL AGENT |
|--------|:----:|:-------:|:---:|:------------:|
| Assign MANAGER title | ✅ (pwd) | - | - | - |
| Remove MANAGER title | ✅ (pwd) | - | - | - |
| Create COS (assign to team) | ✅ (pwd) | - | - | - |
| Remove/transfer COS title | ✅ only | - | - | - |
| Delete COS agent | ✅ only | - | - | - |
| Create team | ✅ (pwd) | - | - | - |
| Delete team | ✅ (pwd) | - | - | - |
| Switch team open↔closed | ✅ (pwd) | - | - | - |

### Agent Operations

| Action | USER | MANAGER | COS | NORMAL AGENT |
|--------|:----:|:-------:|:---:|:------------:|
| Create agents | - | ✅ (except COS) | ✅ (needs MGR approval) | - |
| Delete agents | - | ✅ (except COS) | ✅ (needs MGR approval) | - |
| Assign to closed team | - | ✅ | ✅ own team, unaffiliated agents only (needs MGR approval) | - |
| Remove from closed team | - | ✅ | ✅ own team only (needs MGR approval) | - |
| Assign to open team | - | ✅ | ✅ (needs MGR approval) | - |
| Remove from open team | - | ✅ | ✅ (needs MGR approval) | - |
| Transfer agents between teams | - | ✅ | ✅ own team → other (needs MGR approval) | - |
| Join/leave closed team voluntarily | - | - | - | ❌ (must ask COS) |

### Messaging

| Action | MANAGER | COS | NORMAL (closed team) | NORMAL (open/no team) |
|--------|:-------:|:---:|:--------------------:|:---------------------:|
| Send to anyone | ✅ | - | - | - |
| Send to MANAGER | ✅ | ✅ | ❌ (route via COS) | ✅ |
| Send to other COS | ✅ | ✅ | ❌ (route via COS) | ✅ |
| Send to own closed-team members | ✅ | ✅ | ✅ | N/A |
| Send to agents in open teams | ✅ | ✅ | ❌ (route via COS) | ✅ |
| Send to agents in OTHER closed teams | ✅ | ❌ | ❌ | ❌ |
| Receive from MANAGER | ✅ | ✅ | ✅ | ✅ |
| Receive from own COS | ✅ | ✅ | ✅ | N/A |

### Membership Constraints

| Constraint | MANAGER | COS | NORMAL AGENT |
|------------|:-------:|:---:|:------------:|
| Max closed teams | unlimited | 1 | 1 |
| Max open teams | unlimited | unlimited | unlimited (but revoked on closed-team join) |
| COS of multiple teams | N/A | ❌ (1 team only) | N/A |
| Auto-restore from backup | ✅ | ✅ | ❌ |
