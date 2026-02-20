# Teams Service Governance Integration Report
Generated: 2026-02-20

## Task
Enhance `services/teams-service.ts` to integrate governance logic (ACL, TeamValidationException, async/await, UUID validation).

## Changes Made

### 1. Imports Added
- `TeamValidationException` from team-registry
- `loadAgents` added to agent-registry import
- `getManagerId`, `isManager` from governance
- `checkTeamAccess` from team-acl
- `isValidUuid` from validation
- `TeamType` type from types/governance

### 2. Interfaces Updated (governance fields)
- `CreateTeamParams`: +type, +chiefOfStaffId, +requestingAgentId
- `UpdateTeamParams`: +type, +chiefOfStaffId, +requestingAgentId
- `CreateTaskParams`: +requestingAgentId
- `UpdateTaskParams`: +requestingAgentId
- `CreateDocumentParams`: +requestingAgentId
- `UpdateDocumentParams`: +requestingAgentId

### 3. Functions Made Async (with await on lib calls)
- `createNewTeam` -> async, await createTeam()
- `updateTeamById` -> async, await updateTeam()
- `deleteTeamById` -> async, await deleteTeam()
- `createTeamTask` -> async, await createTask()
- `updateTeamTask` -> async, await updateTask()
- `deleteTeamTask` -> async, await deleteTask()
- `createTeamDocument` -> async, await createDocument()
- `updateTeamDocument` -> async, await updateDocument()
- `deleteTeamDocument` -> async, await deleteDocument()

### 4. Governance Logic Added
- `createNewTeam`: type validation, managerId + agentNames passed to createTeam, TeamValidationException catch
- `getTeamById`: UUID validation via isValidUuid, ACL check via checkTeamAccess
- `updateTeamById`: ACL check, managerId + agentNames passed to updateTeam, TeamValidationException catch
- `deleteTeamById`: closed-team guard (requires MANAGER or COS), requestingAgentId param
- All task/document functions: ACL checks via checkTeamAccess, requestingAgentId destructured from params

### 5. Function Signature Changes
- `getTeamById(id, requestingAgentId?)`
- `deleteTeamById(id, requestingAgentId?)`
- `listTeamTasks(teamId, requestingAgentId?)`
- `deleteTeamTask(teamId, taskId, requestingAgentId?)`
- `listTeamDocuments(teamId, requestingAgentId?)`
- `getTeamDocument(teamId, docId, requestingAgentId?)`
- `deleteTeamDocument(teamId, docId, requestingAgentId?)`

## File Modified
- `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`
