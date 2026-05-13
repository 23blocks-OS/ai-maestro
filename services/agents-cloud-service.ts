/**
 * Agents Cloud Service
 *
 * Business logic for creating agents on AWS cloud infrastructure via Terraform.
 * Supports EC2 (dedicated VM, native install) and ECS Fargate (serverless container).
 *
 * EC2: Installs Node.js, tmux, AI CLIs natively on the VM. No Docker/ECR needed.
 * ECS: Auto-builds and pushes Docker image from agent-container/Dockerfile if no ECR URL provided.
 *
 * Routes are thin wrappers that call these functions.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import { createAgent, getAgent, deleteAgent } from '@/lib/agent-registry'
import { bootstrapAmpIdentity } from '@/services/agents-docker-service'
import { type ServiceResult, missingField, operationFailed, invalidRequest, notFound } from '@/services/service-errors'
import type { Agent } from '@/types/agent'

const execAsync = promisify(exec)

// ── Types ────────────────────────────────────────────────────────────────────

export type CloudProviderType = 'ec2' | 'ecs'

export interface CloudCreateRequest {
  name: string
  provider: CloudProviderType
  ecrImageUrl?: string // ECS only. Auto-built if omitted. Ignored for EC2.
  // AWS config
  awsRegion?: string
  awsProfile?: string
  // Networking
  domainName?: string
  sslEmail?: string
  // Secrets
  githubToken?: string
  anthropicApiKey?: string
  // EC2-specific
  instanceType?: string
  keyName?: string
  allowedSshCidr?: string
  // ECS-specific
  cpu?: number
  memory?: number
  // Agent metadata
  program?: string
  model?: string
  taskDescription?: string
  label?: string
  avatar?: string
  tags?: string[]
}

interface TerraformOutputs {
  [key: string]: { value: unknown; type?: string }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const AIMAESTRO_HOME = path.join(os.homedir(), '.aimaestro')

async function checkTerraformAvailable(): Promise<boolean> {
  try {
    await execAsync('terraform version', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

async function checkAwsCredentials(profile: string): Promise<boolean> {
  try {
    await execAsync(`aws sts get-caller-identity --profile ${profile}`, { timeout: 10000 })
    return true
  } catch {
    return false
  }
}

async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info', { timeout: 10000 })
    return true
  } catch {
    return false
  }
}

function getTerraformWorkDir(agentId: string): string {
  return path.join(AIMAESTRO_HOME, 'agents', agentId, 'terraform')
}

function getTerraformModulePath(provider: CloudProviderType): string {
  const moduleDir = provider === 'ec2' ? 'aws-agent' : 'aws-agent-ecs'
  return path.join(process.cwd(), 'infrastructure', 'terraform', moduleDir)
}

/**
 * Map program display names to CLI tool identifiers.
 */
function mapProgramToTool(program?: string): string {
  if (!program) return 'claude'
  const lower = program.toLowerCase().replace(/\s+/g, '')
  if (lower.includes('claude') || lower === 'claude-code') return 'claude'
  if (lower.includes('gemini')) return 'gemini'
  if (lower.includes('codex')) return 'codex'
  if (lower === 'terminal' || lower === 'none') return ''
  return 'claude'
}

function copyTerraformModule(provider: CloudProviderType, workDir: string): void {
  const srcDir = getTerraformModulePath(provider)
  fs.mkdirSync(workDir, { recursive: true })

  // Copy all .tf files and template files from the module
  const entries = fs.readdirSync(srcDir)
  for (const entry of entries) {
    // Skip .terraform dir, state files, tfvars
    if (
      entry === '.terraform' ||
      entry === '.terraform.lock.hcl' ||
      entry.endsWith('.tfstate') ||
      entry.endsWith('.tfstate.backup') ||
      entry === 'terraform.tfvars'
    ) continue

    const srcPath = path.join(srcDir, entry)
    const destPath = path.join(workDir, entry)
    const stat = fs.statSync(srcPath)

    if (stat.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }

  // For EC2, also copy agent-server.js and package.json from agent-container/
  // so that Terraform's file() function can reference them
  if (provider === 'ec2') {
    const containerDir = path.join(process.cwd(), 'agent-container')
    const serverSrc = path.join(containerDir, 'agent-server.js')
    const pkgSrc = path.join(containerDir, 'package.json')

    if (fs.existsSync(serverSrc)) {
      fs.copyFileSync(serverSrc, path.join(workDir, 'agent-server.js'))
    }
    if (fs.existsSync(pkgSrc)) {
      fs.copyFileSync(pkgSrc, path.join(workDir, 'agent-package.json'))
    }
  }
}

function writeTfVars(workDir: string, vars: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(workDir, 'terraform.tfvars.json'),
    JSON.stringify(vars, null, 2)
  )
}

async function runTerraformCommand(
  workDir: string,
  command: string,
  timeoutMs: number = 600000
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(command, {
    cwd: workDir,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    env: { ...process.env, TF_IN_AUTOMATION: 'true' },
  })
}

async function terraformApply(
  workDir: string,
  timeoutMs: number = 600000
): Promise<ServiceResult<TerraformOutputs>> {
  try {
    // Init
    await runTerraformCommand(workDir, 'terraform init -input=false', 120000)
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr || String(err)
    return operationFailed(`terraform init failed: ${stderr.substring(0, 500)}`)
  }

  try {
    // Apply
    await runTerraformCommand(workDir, 'terraform apply -auto-approve -input=false', timeoutMs)
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr || String(err)
    // Attempt cleanup on failure
    try {
      await runTerraformCommand(workDir, 'terraform destroy -auto-approve -input=false', 300000)
    } catch { /* best effort */ }
    return operationFailed(`terraform apply failed: ${stderr.substring(0, 500)}`)
  }

  try {
    // Get outputs
    const { stdout } = await runTerraformCommand(workDir, 'terraform output -json', 30000)
    const outputs: TerraformOutputs = JSON.parse(stdout)
    return { data: outputs, status: 200 }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr || String(err)
    return operationFailed(`terraform output failed: ${stderr.substring(0, 500)}`)
  }
}

async function terraformDestroy(
  workDir: string,
  timeoutMs: number = 600000
): Promise<ServiceResult<void>> {
  try {
    await runTerraformCommand(workDir, 'terraform destroy -auto-approve -input=false', timeoutMs)
    return { data: undefined, status: 200 }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr || String(err)
    return operationFailed(`terraform destroy failed: ${stderr.substring(0, 500)}`)
  }
}

// ── ECR Auto-Build Helpers (ECS only) ────────────────────────────────────────

/**
 * Create ECR repository if it doesn't exist, return repository URI.
 */
async function ensureEcrRepository(
  repoName: string,
  region: string,
  profile: string
): Promise<ServiceResult<string>> {
  try {
    // Try to describe existing repo
    const { stdout } = await execAsync(
      `aws ecr describe-repositories --repository-names ${repoName} --region ${region} --profile ${profile} --output json`,
      { timeout: 15000 }
    )
    const data = JSON.parse(stdout)
    const uri = data.repositories?.[0]?.repositoryUri
    if (uri) return { data: uri, status: 200 }
  } catch {
    // Repo doesn't exist, create it
  }

  try {
    const { stdout } = await execAsync(
      `aws ecr create-repository --repository-name ${repoName} --region ${region} --profile ${profile} --output json`,
      { timeout: 15000 }
    )
    const data = JSON.parse(stdout)
    const uri = data.repository?.repositoryUri
    if (!uri) return operationFailed('ECR create-repository returned no URI')
    return { data: uri, status: 200 }
  } catch (err) {
    return operationFailed(`Failed to create ECR repository: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Build agent Docker image for linux/arm64 from agent-container/Dockerfile.
 */
async function buildAgentImage(ecrUri: string, tag: string = 'latest'): Promise<ServiceResult<string>> {
  const dockerfilePath = path.join(process.cwd(), 'agent-container')
  if (!fs.existsSync(path.join(dockerfilePath, 'Dockerfile'))) {
    return operationFailed('agent-container/Dockerfile not found. Cannot auto-build image.')
  }

  const fullTag = `${ecrUri}:${tag}`
  try {
    console.log(`[Cloud Service] Building image: ${fullTag}`)
    await execAsync(
      `docker build --platform linux/arm64 -t ${fullTag} ${dockerfilePath}`,
      { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
    )
    return { data: fullTag, status: 200 }
  } catch (err) {
    return operationFailed(`Docker build failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Login to ECR and push image.
 */
async function pushToEcr(
  ecrUri: string,
  tag: string,
  region: string,
  profile: string
): Promise<ServiceResult<void>> {
  const registryHost = ecrUri.split('/')[0]
  try {
    // ECR login
    await execAsync(
      `aws ecr get-login-password --region ${region} --profile ${profile} | docker login --username AWS --password-stdin ${registryHost}`,
      { timeout: 30000 }
    )
    // Push
    console.log(`[Cloud Service] Pushing image: ${ecrUri}:${tag}`)
    await execAsync(
      `docker push ${ecrUri}:${tag}`,
      { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
    )
    return { data: undefined, status: 200 }
  } catch (err) {
    return operationFailed(`ECR push failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Public Functions ─────────────────────────────────────────────────────────

/**
 * Create a new agent on AWS cloud infrastructure.
 */
export async function createCloudAgent(body: CloudCreateRequest): Promise<ServiceResult<Record<string, unknown>>> {
  // Validate required fields
  if (!body.name?.trim()) return missingField('name')
  if (!body.provider || !['ec2', 'ecs'].includes(body.provider)) return invalidRequest('provider must be "ec2" or "ecs"')

  const name = body.name.trim()
  const provider = body.provider
  const awsProfile = body.awsProfile || 'default'
  const awsRegion = body.awsRegion || 'us-east-1'

  // EC2: require domain, ssl_email, key_name. NO ecrImageUrl needed.
  if (provider === 'ec2') {
    if (!body.domainName?.trim()) return missingField('domainName (required for EC2)')
    if (!body.sslEmail?.trim()) return missingField('sslEmail (required for EC2)')
    if (!body.keyName?.trim()) return missingField('keyName (required for EC2)')
  }

  // ECS without explicit ECR image: need Docker locally to auto-build
  if (provider === 'ecs' && !body.ecrImageUrl?.trim()) {
    if (!await checkDockerAvailable()) {
      return invalidRequest(
        'Docker is required to auto-build the agent image for ECS. ' +
        'Either install Docker or provide --ecr-image with a pre-built image URL.'
      )
    }
  }

  // Check terraform
  if (!await checkTerraformAvailable()) {
    return invalidRequest('terraform CLI is required but not found on PATH. Install from https://terraform.io')
  }

  // Check AWS credentials
  if (!await checkAwsCredentials(awsProfile)) {
    return invalidRequest(`AWS credentials not configured for profile "${awsProfile}". Run: aws configure --profile ${awsProfile}`)
  }

  // ECS auto-build flow: build + push image if no ecrImageUrl provided
  let ecsImageUrl = body.ecrImageUrl?.trim() || ''
  if (provider === 'ecs' && !ecsImageUrl) {
    console.log('[Cloud Service] ECS: No ECR image provided, auto-building...')

    // 1. Ensure ECR repository exists
    const repoName = `aimaestro-agent-${name}`
    const repoResult = await ensureEcrRepository(repoName, awsRegion, awsProfile)
    if (repoResult.status !== 200 || !repoResult.data || typeof repoResult.data !== 'string') {
      const errMsg = repoResult.data && typeof repoResult.data === 'object' && 'message' in repoResult.data
        ? (repoResult.data as { message: string }).message : 'ensure ECR repository'
      return operationFailed(errMsg)
    }
    const ecrUri = repoResult.data

    // 2. Build image
    const buildResult = await buildAgentImage(ecrUri, 'latest')
    if (buildResult.status !== 200 || !buildResult.data || typeof buildResult.data !== 'string') {
      const errMsg = buildResult.data && typeof buildResult.data === 'object' && 'message' in buildResult.data
        ? (buildResult.data as { message: string }).message : 'build agent image'
      return operationFailed(errMsg)
    }

    // 3. Push to ECR
    const pushResult = await pushToEcr(ecrUri, 'latest', awsRegion, awsProfile)
    if (pushResult.status !== 200) {
      const errMsg = pushResult.data && typeof pushResult.data === 'object' && 'message' in pushResult.data
        ? (pushResult.data as { message: string }).message : 'push image to ECR'
      return operationFailed(errMsg)
    }

    ecsImageUrl = `${ecrUri}:latest`
    console.log(`[Cloud Service] ECS: Image pushed successfully: ${ecsImageUrl}`)
  }

  // Generate agent ID and create working directory
  const agentId = uuidv4()
  const workDir = getTerraformWorkDir(agentId)

  try {
    // Copy terraform module
    copyTerraformModule(provider, workDir)

    // Build tfvars
    const tfVars: Record<string, unknown> = {
      agent_name: name,
      aws_region: awsRegion,
      aws_profile: awsProfile,
      github_token: body.githubToken || '',
      anthropic_api_key: body.anthropicApiKey || '',
    }

    if (provider === 'ec2') {
      // EC2: native install — no ECR, pass ai_tool instead
      tfVars.ai_tool = mapProgramToTool(body.program)
      tfVars.domain_name = body.domainName!
      tfVars.ssl_email = body.sslEmail!
      tfVars.key_name = body.keyName!
      tfVars.instance_type = body.instanceType || 't4g.small'
      if (body.allowedSshCidr) tfVars.allowed_ssh_cidr = body.allowedSshCidr
    } else {
      // ECS: pass the image URL (either user-provided or auto-built)
      tfVars.ecr_image_url = ecsImageUrl
      if (body.domainName) tfVars.domain_name = body.domainName
      if (body.cpu) tfVars.cpu = body.cpu
      if (body.memory) tfVars.memory = body.memory
    }

    writeTfVars(workDir, tfVars)

    // Run terraform
    const applyResult = await terraformApply(workDir)
    if (applyResult.status !== 200 || !applyResult.data) {
      // Clean up agent dir on failure
      try { fs.rmSync(path.join(AIMAESTRO_HOME, 'agents', agentId), { recursive: true, force: true }) } catch {}
      return applyResult as ServiceResult<Record<string, unknown>>
    }

    const outputs = applyResult.data as TerraformOutputs

    // Extract output values
    const websocketUrl = (outputs.websocket_url?.value as string) || ''
    const healthCheckUrl = (outputs.health_check_url?.value as string) || ''
    const dnsInstructions = (outputs.dns_instructions?.value as string) || ''

    // Build cloud deployment metadata — use the AgentDeployment.cloud shape
    // plus extra fields stored as passthrough for the UI / status queries
    const cloudBase: Agent['deployment']['cloud'] = {
      provider: 'aws',
      region: awsRegion,
      websocketUrl,
      healthCheckUrl,
      status: 'running',
    }

    // Additional metadata stored alongside the typed cloud object
    const cloudExtra: Record<string, unknown> = {
      terraformWorkDir: workDir,
    }

    if (provider === 'ec2') {
      cloudBase.instanceId = (outputs.instance_id?.value as string) || ''
      cloudBase.publicIp = (outputs.public_ip?.value as string) || ''
      cloudBase.instanceType = body.instanceType || 't4g.small'
      cloudExtra.domain = body.domainName
      cloudExtra.ssl = 'letsencrypt'
      cloudExtra.runtime = 'ec2-native'
      cloudExtra.aiTool = mapProgramToTool(body.program)
    } else {
      cloudExtra.clusterArn = (outputs.cluster_arn?.value as string) || ''
      cloudExtra.serviceName = (outputs.service_name?.value as string) || ''
      cloudExtra.albDnsName = (outputs.alb_dns_name?.value as string) || ''
      cloudExtra.domain = body.domainName || ''
      cloudExtra.cpu = body.cpu || 512
      cloudExtra.memory = body.memory || 1024
      cloudExtra.ssl = body.domainName ? 'acm' : 'none'
      cloudExtra.runtime = 'ecs-fargate'
      cloudExtra.ecrImageUrl = ecsImageUrl
    }

    // Merge typed + extra into the registry record
    const cloudMeta = { ...cloudBase, ...cloudExtra }

    // Register agent
    const agentRecord: Partial<Agent> = {
      id: agentId,
      name,
      label: body.label || name,
      avatar: body.avatar,
      program: body.program || 'Claude Code',
      model: body.model || 'Sonnet 4.5',
      status: 'active',
      deployment: {
        type: 'cloud',
        cloud: cloudMeta as unknown as Agent['deployment']['cloud'],
      } as Agent['deployment'],
      tags: body.tags,
    }

    createAgent(agentRecord as Agent)

    // Bootstrap AMP identity
    try {
      await bootstrapAmpIdentity(agentId, name)
    } catch (err) {
      console.warn(`[Cloud Service] AMP bootstrap failed for ${name}: ${err}`)
    }

    return {
      data: {
        agent: {
          id: agentId,
          name,
          provider,
          websocketUrl,
          healthCheckUrl,
        },
        cloud: cloudMeta,
        dnsInstructions: dnsInstructions || undefined,
      },
      status: 201,
    }
  } catch (err) {
    // Clean up on unexpected error
    try { fs.rmSync(path.join(AIMAESTRO_HOME, 'agents', agentId), { recursive: true, force: true }) } catch {}
    console.error('[Cloud Service] Unexpected error:', err)
    return operationFailed(`cloud agent creation failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Destroy cloud infrastructure for an agent.
 */
export async function destroyCloudAgent(agentId: string): Promise<ServiceResult<{ destroyed: boolean }>> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('agent', agentId)

  if (agent.deployment?.type !== 'cloud') {
    return invalidRequest(`Agent ${agentId} is not a cloud agent (type: ${agent.deployment?.type || 'unknown'})`)
  }

  const workDir = getTerraformWorkDir(agentId)
  if (!fs.existsSync(path.join(workDir, 'main.tf'))) {
    return invalidRequest(`No terraform state found for agent ${agentId}. Infrastructure may have been manually deleted.`)
  }

  const result = await terraformDestroy(workDir)
  if (result.status !== 200) {
    return result as unknown as ServiceResult<{ destroyed: boolean }>
  }

  // Remove agent from registry
  deleteAgent(agentId)

  return { data: { destroyed: true }, status: 200 }
}

/**
 * Get cloud infrastructure status for an agent.
 */
export async function getCloudAgentStatus(agentId: string): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('agent', agentId)

  if (agent.deployment?.type !== 'cloud') {
    return invalidRequest(`Agent ${agentId} is not a cloud agent`)
  }

  const workDir = getTerraformWorkDir(agentId)
  const hasTfState = fs.existsSync(path.join(workDir, 'terraform.tfstate'))

  const status: Record<string, unknown> = {
    agentId,
    name: agent.name,
    provider: agent.deployment.cloud?.provider || 'aws',
    runtime: (agent.deployment.cloud as Record<string, unknown>)?.runtime || 'unknown',
    hasTerraformState: hasTfState,
    cloud: agent.deployment.cloud,
  }

  // Try to get current terraform state
  if (hasTfState) {
    try {
      const { stdout } = await runTerraformCommand(workDir, 'terraform output -json', 30000)
      const outputs: TerraformOutputs = JSON.parse(stdout)
      status.outputs = Object.fromEntries(
        Object.entries(outputs).map(([k, v]) => [k, v.value])
      )
      status.infrastructureStatus = 'active'
    } catch {
      status.infrastructureStatus = 'unknown'
    }
  } else {
    status.infrastructureStatus = 'no-state'
  }

  return { data: status, status: 200 }
}
