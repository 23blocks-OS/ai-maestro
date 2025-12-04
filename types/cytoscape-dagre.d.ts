declare module 'cytoscape-dagre' {
  import { Core, LayoutOptions } from 'cytoscape'

  interface DagreLayoutOptions extends LayoutOptions {
    name: 'dagre'
    rankDir?: 'TB' | 'BT' | 'LR' | 'RL'
    rankSep?: number
    nodeSep?: number
    edgeSep?: number
    ranker?: 'network-simplex' | 'tight-tree' | 'longest-path'
    minLen?: (edge: any) => number
    edgeWeight?: (edge: any) => number
  }

  function register(cytoscape: (options?: any) => Core): void
  export = register
}
