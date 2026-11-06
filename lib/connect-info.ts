/**
 * What a phone needs to find this computer: the addresses, best first, and a link the app reads from a QR code (#798).
 * No secrets: the network is the security. If authentication comes, it gets v 2 and a short-lived token.
 */
export interface ConnectInfo {
  v: 1
  hostId: string
  name: string
  organization?: string
  urls: string[]
  link: string
}

interface ConnectInput {
  hostId: string
  name: string
  organization?: string
  port: number
  bindHost: string
  localIPs: { ip: string; interface: string }[]
  tailscaleStatus?: any
  tailscaleServe?: any
}

const isTailscale = (ip: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
// Docker and VM networks live only inside this computer: a phone would wait on each one until it timed out
const isVirtual = (name: string) => /^(bridge|vmnet|vmenet|vnic|vboxnet|virbr|docker|br-|veth|tap|tun|utun)/.test(name)
const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)

export function buildConnectInfo({ hostId, name, organization, port, bindHost, localIPs, tailscaleStatus, tailscaleServe }: ConnectInput): ConnectInfo {
  const urls: string[] = []

  // Only when port 443 really reaches this server: on mac-mini it is another service
  const dnsName = String(tailscaleStatus?.Self?.DNSName || '').replace(/\.$/, '')
  const proxy = dnsName && tailscaleServe?.Web?.[`${dnsName}:443`]?.Handlers?.['/']?.Proxy
  if (typeof proxy === 'string') {
    try {
      if (Number(new URL(proxy).port) === port) urls.push(`https://${dnsName}`)
    } catch { /* not a URL: leave the address out */ }
  }

  const listening = (ip: string) => bindHost === '0.0.0.0' || bindHost === '::' || bindHost === ip
  const tailscaleIPs: string[] = (tailscaleStatus?.Self?.TailscaleIPs || []).filter((ip: string) => isTailscale(ip))
  const lan = localIPs.filter(a => isPrivate(a.ip) && !isVirtual(a.interface)).map(a => a.ip)
  const ips = [...tailscaleIPs, ...localIPs.map(a => a.ip).filter(isTailscale), ...lan]
  for (const ip of new Set(ips)) {
    if (listening(ip)) urls.push(`http://${ip}:${port}`)
  }

  const params = [['v', '1'], ['id', hostId], ['name', name], ...(organization ? [['org', organization]] : []), ...urls.map(u => ['u', u])]
  const link = `aimaestro://connect?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
  return { v: 1, hostId, name, ...(organization ? { organization } : {}), urls, link }
}
