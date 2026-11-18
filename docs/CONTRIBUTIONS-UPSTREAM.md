# What AI Maestro gives back

AI Maestro runs fleets of agents every day. When one of the tools or standards we build on breaks, or lacks something agents need, we fix it or propose it where it lives, not only in our own copy. This page lists that work. Newest first.

## Fixes and proposals in other projects

| Project | What | Status |
|---|---|---|
| [A2UI](https://github.com/a2ui-project/a2ui) (Google) | The basic catalog's v1 entry loaded Lit's custom elements, which need a browser DOM, so a React Native renderer could not import it. We reported it in [#4238](https://github.com/a2ui-project/a2ui/issues/4238) and sent the fix in [#4239](https://github.com/a2ui-project/a2ui/pull/4239): a new `catalogs/basic/v1/api` entry with the component APIs, functions and theme schema only. The maintainers reproduced the bug and verified the fix. | In review |
| [Personal Agent Protocol (Poppy)](https://personalagentprotocol.org) | How an agent that runs on its owner's own machines, with no public server, signs in to a company ([#42](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/42)). We brought the self-hosted case and reviewed the guides text for it: the sign-in result in the URL fragment, the `targetAddressSpace` line browsers need to reach a home server, and the agent's address saved at pairing. We also support registering one key per install, which needs no public address. | Going into the 1.1 guides |
| [Open Source Colombia](https://github.com/Mteheran/opensource-colombia) | A directory of Colombian open-source work. We added the "Agentes IA y Protocolos" category with six projects ([#30](https://github.com/Mteheran/opensource-colombia/pull/30)), then the Agent Files and Agent Device protocols ([#34](https://github.com/Mteheran/opensource-colombia/pull/34)). | Merged 2026-11-13 and 2026-11-16 |
| [agent-browser](https://github.com/vercel-labs/agent-browser) (Vercel Labs) | A killed or crashed browser daemon left its temporary Chrome profile (50–500 MB) in the temp folder for good; on a host with many agents this filled the disk. We sent the sweep in [#2080](https://github.com/vercel-labs/agent-browser/pull/2080); it shipped as [#2586](https://github.com/vercel-labs/agent-browser/pull/2586), co-authored by us: each Chrome launch removes profiles at least two hours old whose Chrome is gone. Related to [#1334](https://github.com/vercel-labs/agent-browser/issues/1334). | Merged 2026-11-13 |
| [HarnessRouter / Unified Harness Protocol](https://github.com/HarnessRouter/harnessrouter) | A task can end by asking the person, and the answer resumes it. Our proposal ([#479](https://github.com/HarnessRouter/harnessrouter/issues/479), discussion in [#476](https://github.com/HarnessRouter/harnessrouter/issues/476)) shaped `input_request`, `input_response` and the `input_requests` capability (UHP Tasks §3.2), shipped in [#622](https://github.com/HarnessRouter/harnessrouter/pull/622). | Released in v0.38.0 |

## Open protocols we publish

AI Maestro is one implementation. The protocols underneath it are open, with their own specifications, sites and reference code, so any agent platform can use them. They live in the [agentmessaging](https://github.com/agentmessaging) organization.

| Protocol | What it is for |
|---|---|
| [Agent Messaging Protocol (AMP)](https://agentmessaging.org) | Signed messages between agents, local or federated. Spec, reference server, TypeScript SDK and the Claude Code plugin. |
| [Agent Identity (AID)](https://agentids.org) | An agent proves who it is to an API: Ed25519 identity and OAuth 2.0 token exchange. Includes a runnable conformance suite. |
| [Agent Actions Protocol (AAP)](https://agentactions.org) | Pages an agent shows a person, and what the person does on them, back to the agent. |
| [Agent Device Protocol (ADP)](https://agentdevices.org) | An agent owns and uses real devices (a kiosk, a phone, a camera), signed and approved on the device. |
| [Agent Files Protocol (AFP)](https://agentfiles.org) | Files shared between agents, hosts and people, on S3-compatible storage. |

## Add to this page

Found a fix of ours somewhere else that is missing here, or sent one yourself while working on AI Maestro? Open a pull request against this file.
