import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'

/**
 * Graph Query API for AI Agents
 *
 * GET /api/agents/:id/graph/query?q=<query_type>&...
 *
 * Query types:
 * - find-callers: Find all functions that call a given function
 * - find-callees: Find all functions called by a given function
 * - find-related: Find all related components (extends, includes, associations)
 * - find-path: Find path between two components
 * - find-by-type: Find all components of a given type (model, serializer, controller, etc.)
 * - find-associations: Find model associations (belongs_to, has_many, etc.)
 * - find-serializers: Find serializers for a model
 * - describe: Get full description of a component and its relationships
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const queryType = searchParams.get('q')
    const name = searchParams.get('name')
    const type = searchParams.get('type')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    console.log(`[Graph Query API] Agent: ${agentId}, Query: ${queryType}, Name: ${name}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (queryType) {
      case 'find-callers': {
        // Find all functions that call a given function
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'find-callers requires "name" parameter' },
            { status: 400 }
          )
        }

        const callersResult = await agentDb.run(`
          ?[caller_name, caller_file] :=
            *functions{fn_id: callee, name: callee_name},
            callee_name = '${escapeString(name)}',
            *calls{caller_fn: caller, callee_fn: callee},
            *functions{fn_id: caller, name: caller_name, file_id: caller_file_id},
            *files{file_id: caller_file_id, path: caller_file}
        `)

        result = {
          function: name,
          callers: callersResult.rows.map((r: any[]) => ({
            name: r[0],
            file: r[1],
          })),
          count: callersResult.rows.length,
        }
        break
      }

      case 'find-callees': {
        // Find all functions called by a given function
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'find-callees requires "name" parameter' },
            { status: 400 }
          )
        }

        const calleesResult = await agentDb.run(`
          ?[callee_name, callee_file] :=
            *functions{fn_id: caller, name: caller_name},
            caller_name = '${escapeString(name)}',
            *calls{caller_fn: caller, callee_fn: callee},
            *functions{fn_id: callee, name: callee_name, file_id: callee_file_id},
            *files{file_id: callee_file_id, path: callee_file}
        `)

        result = {
          function: name,
          callees: calleesResult.rows.map((r: any[]) => ({
            name: r[0],
            file: r[1],
          })),
          count: calleesResult.rows.length,
        }
        break
      }

      case 'find-related': {
        // Find all components related to a given component
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'find-related requires "name" parameter' },
            { status: 400 }
          )
        }

        const related: any = {
          component: name,
          extends_from: [],
          extended_by: [],
          includes: [],
          included_by: [],
          associations: [],
          associated_by: [],
          serializes: null,
          serialized_by: [],
        }

        // Find parent class (what this component extends)
        try {
          const extendsResult = await agentDb.run(`
            ?[parent_name] :=
              *components{component_id: child, name: child_name},
              child_name = '${escapeString(name)}',
              *extends{child_class: child, parent_class: parent},
              *components{component_id: parent, name: parent_name}
          `)
          related.extends_from = extendsResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        // Find child classes (what extends this component)
        try {
          const extendedByResult = await agentDb.run(`
            ?[child_name] :=
              *components{component_id: parent, name: parent_name},
              parent_name = '${escapeString(name)}',
              *extends{child_class: child, parent_class: parent},
              *components{component_id: child, name: child_name}
          `)
          related.extended_by = extendedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        // Find included modules
        try {
          const includesResult = await agentDb.run(`
            ?[module_name] :=
              *components{component_id: class_id, name: class_name},
              class_name = '${escapeString(name)}',
              *includes{class_id, module_name}
          `)
          related.includes = includesResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        // Find classes that include this module
        try {
          const includedByResult = await agentDb.run(`
            ?[class_name] :=
              *components{component_id: module_id, name: module_name},
              module_name = '${escapeString(name)}',
              *includes{class_id, module_name: module_id_str},
              module_id_str = module_id,
              *components{component_id: class_id, name: class_name}
          `)
          related.included_by = includedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        // Find associations (belongs_to, has_many, etc.)
        try {
          const associationsResult = await agentDb.run(`
            ?[to_class_name, assoc_type] :=
              *components{component_id: from_id, name: from_name},
              from_name = '${escapeString(name)}',
              *associations{from_class: from_id, to_class, assoc_type},
              *components{component_id: to_class, name: to_class_name}
          `)
          related.associations = associationsResult.rows.map((r: any[]) => ({
            target: r[0],
            type: r[1],
          }))
        } catch { /* table may not exist */ }

        // Find models that have associations to this component
        try {
          const associatedByResult = await agentDb.run(`
            ?[from_class_name, assoc_type] :=
              *components{component_id: to_id, name: to_name},
              to_name = '${escapeString(name)}',
              *associations{from_class, to_class: to_id, assoc_type},
              *components{component_id: from_class, name: from_class_name}
          `)
          related.associated_by = associatedByResult.rows.map((r: any[]) => ({
            source: r[0],
            type: r[1],
          }))
        } catch { /* table may not exist */ }

        // Find what this serializer serializes
        try {
          const serializesResult = await agentDb.run(`
            ?[model_name] :=
              *components{component_id: serializer_id, name: serializer_name},
              serializer_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: model_id, name: model_name}
          `)
          if (serializesResult.rows.length > 0) {
            related.serializes = serializesResult.rows[0][0]
          }
        } catch { /* table may not exist */ }

        // Find serializers for this model
        try {
          const serializedByResult = await agentDb.run(`
            ?[serializer_name] :=
              *components{component_id: model_id, name: model_name},
              model_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: serializer_id, name: serializer_name}
          `)
          related.serialized_by = serializedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        result = related
        break
      }

      case 'find-by-type': {
        // Find all components of a given type
        if (!type) {
          return NextResponse.json(
            { success: false, error: 'find-by-type requires "type" parameter' },
            { status: 400 }
          )
        }

        try {
          const componentsResult = await agentDb.run(`
            ?[name, file_path] :=
              *components{component_id, name, file_id, class_type},
              class_type = '${escapeString(type)}',
              *files{file_id, path: file_path}
          `)

          result = {
            type,
            components: componentsResult.rows.map((r: any[]) => ({
              name: r[0],
              file: r[1],
            })),
            count: componentsResult.rows.length,
          }
        } catch {
          // class_type might not exist in older schemas
          result = {
            type,
            components: [],
            count: 0,
            error: 'class_type not available in this database',
          }
        }
        break
      }

      case 'find-associations': {
        // Find all associations for a model
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'find-associations requires "name" parameter' },
            { status: 400 }
          )
        }

        try {
          const outgoingResult = await agentDb.run(`
            ?[to_class_name, assoc_type] :=
              *components{component_id: from_id, name: from_name},
              from_name = '${escapeString(name)}',
              *associations{from_class: from_id, to_class, assoc_type},
              *components{component_id: to_class, name: to_class_name}
          `)

          const incomingResult = await agentDb.run(`
            ?[from_class_name, assoc_type] :=
              *components{component_id: to_id, name: to_name},
              to_name = '${escapeString(name)}',
              *associations{from_class, to_class: to_id, assoc_type},
              *components{component_id: from_class, name: from_class_name}
          `)

          result = {
            model: name,
            outgoing: outgoingResult.rows.map((r: any[]) => ({
              target: r[0],
              type: r[1],
            })),
            incoming: incomingResult.rows.map((r: any[]) => ({
              source: r[0],
              type: r[1],
            })),
          }
        } catch {
          result = {
            model: name,
            outgoing: [],
            incoming: [],
            error: 'associations table not available',
          }
        }
        break
      }

      case 'find-serializers': {
        // Find serializers for a model
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'find-serializers requires "name" parameter' },
            { status: 400 }
          )
        }

        try {
          const serializersResult = await agentDb.run(`
            ?[serializer_name, file_path] :=
              *components{component_id: model_id, name: model_name},
              model_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: serializer_id, name: serializer_name, file_id},
              *files{file_id, path: file_path}
          `)

          result = {
            model: name,
            serializers: serializersResult.rows.map((r: any[]) => ({
              name: r[0],
              file: r[1],
            })),
            count: serializersResult.rows.length,
          }
        } catch {
          result = {
            model: name,
            serializers: [],
            count: 0,
            error: 'serializes table not available',
          }
        }
        break
      }

      case 'find-path': {
        // Find path between two components
        if (!from || !to) {
          return NextResponse.json(
            { success: false, error: 'find-path requires "from" and "to" parameters' },
            { status: 400 }
          )
        }

        // Use recursive query to find call path
        try {
          const pathResult = await agentDb.run(`
            path[start, end, depth, via] :=
              *functions{fn_id: start, name: start_name},
              start_name = '${escapeString(from)}',
              *calls{caller_fn: start, callee_fn: end},
              depth = 1,
              via = [start_name]

            path[start, end, depth, via] :=
              path[start, mid, d1, via1],
              *calls{caller_fn: mid, callee_fn: end},
              depth = d1 + 1,
              depth <= 5,
              *functions{fn_id: mid, name: mid_name},
              via = append(via1, mid_name)

            ?[depth, via] :=
              path[start, end, depth, via],
              *functions{fn_id: end, name: end_name},
              end_name = '${escapeString(to)}'

            :order depth
            :limit 5
          `)

          result = {
            from,
            to,
            paths: pathResult.rows.map((r: any[]) => ({
              depth: r[0],
              via: r[1],
            })),
            found: pathResult.rows.length > 0,
          }
        } catch (error) {
          result = {
            from,
            to,
            paths: [],
            found: false,
            error: error instanceof Error ? error.message : 'Path query failed',
          }
        }
        break
      }

      case 'describe': {
        // Get full description of a component
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'describe requires "name" parameter' },
            { status: 400 }
          )
        }

        const description: any = {
          name,
          found: false,
        }

        // Try to find as component (class)
        try {
          const componentResult = await agentDb.run(`
            ?[component_id, name, file_path, class_type] :=
              *components{component_id, name, file_id, class_type},
              name = '${escapeString(name)}',
              *files{file_id, path: file_path}
          `)

          if (componentResult.rows.length > 0) {
            const r = componentResult.rows[0]
            description.found = true
            description.type = 'component'
            description.class_type = r[3]
            description.file = r[2]

            // Get related info (reuse find-related logic)
            const relatedResponse = await GET(request, { params })
            if (relatedResponse.ok) {
              const relatedData = await relatedResponse.json()
              if (relatedData.success && relatedData.result) {
                description.relationships = relatedData.result
              }
            }
          }
        } catch { /* ignore */ }

        // Try to find as function
        if (!description.found) {
          try {
            const functionResult = await agentDb.run(`
              ?[fn_id, name, file_path, is_export] :=
                *functions{fn_id, name, file_id, is_export},
                name = '${escapeString(name)}',
                *files{file_id, path: file_path}
            `)

            if (functionResult.rows.length > 0) {
              const r = functionResult.rows[0]
              description.found = true
              description.type = 'function'
              description.file = r[2]
              description.is_export = r[3]

              // Get callers and callees
              const callersResult = await agentDb.run(`
                ?[caller_name] :=
                  *functions{fn_id: callee, name: callee_name},
                  callee_name = '${escapeString(name)}',
                  *calls{caller_fn: caller, callee_fn: callee},
                  *functions{fn_id: caller, name: caller_name}
              `)

              const calleesResult = await agentDb.run(`
                ?[callee_name] :=
                  *functions{fn_id: caller, name: caller_name},
                  caller_name = '${escapeString(name)}',
                  *calls{caller_fn: caller, callee_fn: callee},
                  *functions{fn_id: callee, name: callee_name}
              `)

              description.callers = callersResult.rows.map((r: any[]) => r[0])
              description.callees = calleesResult.rows.map((r: any[]) => r[0])
            }
          } catch { /* ignore */ }
        }

        result = description
        break
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown query type: ${queryType}`,
            available_queries: [
              'find-callers',
              'find-callees',
              'find-related',
              'find-by-type',
              'find-associations',
              'find-serializers',
              'find-path',
              'describe',
            ],
          },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      query: queryType,
      result,
    })
  } catch (error) {
    console.error('[Graph Query API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Escape single quotes in strings for CozoDB
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}
