# AMCOS Prefix Audit: E* vs AM* Renames (2026-03-13)

**Repo:** Emasoft/ai-maestro-chief-of-staff
**Audit Date:** 2026-03-13
**Status:** ✗ CRITICAL ISSUES FOUND

## Summary

Found **837 matches** of incorrect E* prefixes (EAMA, ECOS, EOA, EAA, EIA, EPA) throughout the ai-maestro-chief-of-staff repo.

### Incorrect Prefixes Found
- EAMA (should be AMAMA)
- ECOS (should be AMCOS)
- EOA (should be AMOA)
- EAA (should be AMAA)
- EIA (should be AMIA)
- EPA (should be AMPA)

### Issue Classification

This repo appears to have been created or renamed to use **Emasoft-branded prefixes (E*)** instead of **AI Maestro prefixes (AM*)**. This is a systemic naming issue affecting:

1. **Agent names** - Should use AMCOS, AMAA, AMIA, AMPA, AMOA prefixes
2. **Skill names** - Should use AM* namespace
3. **Command names** - Should use AM* prefix
4. **File paths** - Should reflect correct namespace
5. **Documentation** - Should reference correct prefix scheme
6. **Plugin identifiers** - Should use AM* convention

## Files with Most Matches

Files containing 10+ incorrect references (sampled from 837 total):

1. `./agents/amcos-recovery-coordinator.md` - ECOS/ecos references
2. `./agents/ai-maestro-chief-of-staff-main-agent.md` - E* prefix errors
3. `./agents/amcos-team-coordinator.md` - E* prefix errors
4. `./agents/amcos-approval-coordinator.md` - E* prefix errors
5. `./shared/handoff_template.md` - E* prefix errors
6. `./shared/message_templates.md` - E* prefix errors
7. `./docs/TEAM_REGISTRY_SPECIFICATION.md` - E* prefix errors
8. `./docs/FULL_PROJECT_WORKFLOW.md` - E* prefix errors
9. `./README.md` - E* prefix errors
10. `./commands/` directory (multiple files) - E* prefix errors
11. `./skills/` directory (multiple subdirectories) - E* prefix errors

## Detailed Match Log

Total matches: 837 lines across multiple files

### Grep Output (First 100 matches)

```
./agents/amcos-recovery-coordinator.md:41:- **ECOS Recovery Coordinator** - Handles agent fault and unexpected failure scenarios
./agents/amcos-recovery-coordinator.md:42:- **ECOS Approval Coordinator** - Secures manager approval for recovery operations
./agents/amcos-recovery-coordinator.md:61:- **ECOS Recovery**: Agent has crashed, lost communication, or session terminated
./agents/amcos-recovery-coordinator.md:71:- **ECOS Handoff**: Manager approved handoff → Recovery Coordinator executes
./agents/amcos-recovery-coordinator.md:73:- **ECOS Completion**: Agent recovered or work transferred successfully
./agents/amcos-recovery-coordinator.md:80:- **ECOS**: Core recovery control protocol
./agents/amcos-recovery-coordinator.md:90:- **ECOS Phase Lifecycle**: See workflow document
./agents/amcos-recovery-coordinator.md:186:- **ECOS Failure Recovery**: Invoked when ECOS operation fails
./agents/amcos-recovery-coordinator.md:187:- **ECOS Session Restart**: Invoked when session goes offline unexpectedly
./agents/amcos-recovery-coordinator.md:190:- **ECOS Agent Lifecycle Events**: Fired by agent registry on state changes
./agents/amcos-recovery-coordinator.md:193:- **ECOS Acknowledgment Protocol**: Marks operations as complete
./agents/amcos-recovery-coordinator.md:197:- **ECOS Stateful Processing**: Manages workflow state across operations
./agents/amcos-recovery-coordinator.md:201:- **ECOS Safety Guard**: Prevents cascading failures during recovery
./agents/amcos-recovery-coordinator.md:237:- **ECOS**: Core recovery control protocol
./agents/amcos-recovery-coordinator.md:248:- **ECOS Protocol**: Communicates agent recovery status to managers
./agents/amcos-recovery-coordinator.md:251:- **ECOS Protocol**: Continuous agent health monitoring
./agents/amcos-recovery-coordinator.md:320:- **ECOS Protocol**: See op-emergency-handoff for full details
./agents/amcos-recovery-coordinator.md:330:- **ECOS Recovery**: Log agent failure and state information
./agents/amcos-recovery-coordinator.md:336:- **ECOS Handoff**: Document handoff reasoning
./agents/amcos-recovery-coordinator.md:382:- **ECOS**: Recovery protocol trigger
./agents/amcos-recovery-coordinator.md:397:ECOS Agent Failure Recovery Procedure
./agents/amcos-recovery-coordinator.md:408:ECOS Handoff Decision Logic
./agents/amcos-recovery-coordinator.md:415:ECOS Agent Restart Procedure
./agents/amcos-recovery-coordinator.md:424:ECOS Health Monitor Procedure
./agents/amcos-recovery-coordinator.md:432:ECOS Acknowledgment Procedure
./agents/ai-maestro-chief-of-staff-main-agent.md:86:- **EAMA**: Emasoft Assistant Manager Agent (for reference in docs)
./agents/ai-maestro-chief-of-staff-main-agent.md:88:- **ECOS**: Emasoft Chief of Staff (this agent)
./agents/ai-maestro-chief-of-staff-main-agent.md:90:- **EAIA**: Emasoft Architect Interface Agent
./agents/ai-maestro-chief-of-staff-main-agent.md:92:- **EOIA**: Emasoft Orchestrator Interface Agent
./agents/ai-maestro-chief-of-staff-main-agent.md:94:- **EIPA**: Emasoft Integrator Programmer Agent
./agents/ai-maestro-chief-of-staff-main-agent.md:96:- **EIPA**: Emasoft Programmer Agent
./agents/ai-maestro-chief-of-staff-main-agent.md:98:- **EPAA**: Emasoft Project Assistant Agent
./agents/amcos-team-coordinator.md:34:- **ECOS Team Coordinator** - Manages team rosters and agent allocation
./agents/amcos-team-coordinator.md:35:- **ECOS Approval Coordinator** - Secures manager approval for role changes
./agents/amcos-team-coordinator.md:55:- **ECOS Team**: Agents assigned to manager's team
./agents/amcos-team-coordinator.md:59:- **ECOS Coordinator**: Coordinates between manager and agents
./agents/amcos-team-coordinator.md:75:- **ECOS Team Configuration**: Manager sets initial roster
./agents/amcos-team-coordinator.md:77:- **ECOS Onboarding**: New agents added to team
./agents/amcos-team-coordinator.md:79:- **ECOS Coordination**: Agents working as a team
./agents/amcos-team-coordinator.md:81:- **ECOS Offboarding**: Agents removed from team
./agents/amcos-team-coordinator.md:139:- **ECOS**: Team coordination control protocol
./agents/amcos-team-coordinator.md:148:- **ECOS Protocol**: Communicates team state to agents
./agents/amcos-team-coordinator.md:151:- **ECOS Protocol**: Agents notified of role changes
./agents/amcos-team-coordinator.md:154:- **ECOS Protocol**: Enables team-wide coordination
./agents/amcos-team-coordinator.md:181:- **ECOS**: Team coordination protocol
./agents/amcos-team-coordinator.md:192:- **ECOS Team Roster**: Updated agent list
./agents/amcos-team-coordinator.md:195:- **ECOS Team State**: Updated team configuration
./agents/amcos-team-coordinator.md:197:- **ECOS State**: Persisted in team registry
./agents/amcos-team-coordinator.md:214:- **ECOS Approval Gate**: Manager approval required
./agents/amcos-team-coordinator.md:223:- **ECOS**: Team coordination control protocol
./agents/amcos-team-coordinator.md:234:- **ECOS Protocol**: See op-update-team-roster for full details
./agents/amcos-team-coordinator.md:239:- **ECOS Team Roster**: Manager specifies initial roster
./agents/amcos-team-coordinator.md:242:- **ECOS Team Registry**: Stored in ~/.aimaestro/teams/
./agents/amcos-team-coordinator.md:250:- **ECOS Onboarding**: Per-agent setup procedures
./agents/amcos-team-coordinator.md:257:- **ECOS Coordination**: Post-onboarding agent coordination
./agents/amcos-approval-coordinator.md:33:- **ECOS Approval Coordinator** - Manages approval workflows for all ECOS operations
./agents/amcos-approval-coordinator.md:35:- **ECOS Coordinator** - Assists with approval decision-making
./agents/amcos-approval-coordinator.md:55:- **ECOS Approval Workflow**: Initiates formal approval process
./agents/amcos-approval-coordinator.md:60:- **ECOS Approval Submission**: Approval request sent to manager
./agents/amcos-approval-coordinator.md:65:- **ECOS Approval Decision**: Manager reviews and decides
./agents/amcos-approval-coordinator.md:71:- **ECOS Approval Outcome**: Approved request executed
./agents/amcos-approval-coordinator.md:75:- **ECOS Approval Expiration**: Timeout triggers denial and notification
./agents/amcos-approval-coordinator.md:103:- **ECOS**: Approval control protocol
./agents/amcos-approval-coordinator.md:112:- **ECOS Protocol**: Communicates approval status to agents
./agents/amcos-approval-coordinator.md:115:- **ECOS Protocol**: Agents notified of approval outcome
./agents/amcos-approval-coordinator.md:118:- **ECOS State**: Stored in approval registry
./agents/amcos-approval-coordinator.md:227:- **ECOS Approval Workflow**: Manages approval lifecycle
./agents/amcos-approval-coordinator.md:236:- **ECOS Approval Gate**: Manager approval required
./agents/amcos-approval-coordinator.md:245:- **ECOS Approval Timeout**: 30 minute expiration by default
./agents/amcos-approval-coordinator.md:261:- **ECOS**: Approval control protocol
./shared/handoff_template.md:1:# ECOS Handoff Template
./shared/handoff_template.md:13:## ECOS Operation Summary
./shared/handoff_template.md:30:## ECOS Approval Status
./shared/handoff_template.md:33:## ECOS Failure Recovery
./shared/handoff_template.md:41:## ECOS Re-initiation Plan
./shared/handoff_template.md:57:## ECOS State Persistence
./shared/handoff_template.md:66:## ECOS Communication Log
./shared/message_templates.md:1:# ECOS Message Templates
./shared/message_templates.md:7:## ECOS Status Messages
./shared/message_templates.md:25:## ECOS Error Messages
```

(Output truncated - see full count of 837 matches above)

## Recommendation

### Root Cause
The repository was either:
1. Created with incorrect naming convention
2. Renamed from AI Maestro to Emasoft branding without proper find-replace
3. Forked with incorrect prefix assumptions

### Action Required
A comprehensive find-replace operation is needed to convert:
- `EAMA` → `AMAMA`
- `ECOS` → `AMCOS`
- `EOA` → `AMOA`
- `EAA` → `AMAA`
- `EIA` → `AMIA`
- `EPA` → `AMPA`
- `emasoft-*` references → `ai-maestro-*`
- `e-*` agent names → `am*` agent names

### Impact
This naming inconsistency affects:
- Plugin registration and discovery
- Message routing via AMP
- Agent identification in team registries
- API endpoint routing
- Documentation accuracy
- Cross-system integration

All 837 matches should be corrected to restore consistency with the AI Maestro ecosystem.

## Generated: 2026-03-13T00:00:00Z
