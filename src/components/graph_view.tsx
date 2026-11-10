import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { NodeDatum, LinkDatum, GraphConfig } from '../types/graph'
import type { Music } from '../types/music'
import './graph_view.css'
import './login/login.css'

interface Props {
  nodes: NodeDatum[]
  links: LinkDatum[]
  config: GraphConfig
  selected_id?: string | null
  playing_node_id?: string | null
  fixed_node_id?: string | null
  should_focus?: boolean
  show_comment?: boolean
  is_logged_in?: boolean
  search_query?: string
  show_search_bar?: boolean
  search_trigger?: number
  on_node_click: (node_id: string, content: any) => void
  on_deselect?: () => void
  on_search?: (query: string) => void
}

const BASE_COLOR = '#2a2a2a'
const SELECTED_COLOR = '#ab90df'
const LINK_BASE = '#b0aca6'
const LINK_SELECTED = '#ab90df'
const FOCUS_ZOOM_LEVEL = 1.5 // variable to control zoom depth
const SEARCH_FOCUS_ZOOM = 1.0 // Configurable zoom depth for search results
const DESELECT_ZOOM_LEVEL = 0.4 // variable to control zoom when deselecting
const LINK_EXCLUSION_OPACITY = 0.2 // opacity of links when passing through the center (0 to 1)
const EXCLUSION_TRANSITION_SPEED = 200 // speed at which the exclusion radius changes (pixels per tick)
const OUTER_EXCLUSION_TRANSITION_SPEED = 1000 // speed at which the outer radius returns
const ENABLE_DYNAMIC_EXCLUSION = false // true: radius changes on selection, false: radius is constant





export default function GraphView({ nodes, links, config, selected_id, playing_node_id, fixed_node_id, should_focus = true, show_comment = false, is_logged_in, search_query, show_search_bar, search_trigger, on_node_click, on_deselect, on_search }: Props) {
  const svg_ref = useRef<SVGSVGElement>(null)
  const simulation_ref = useRef<d3.Simulation<NodeDatum, undefined> | null>(null)
  const g_ref = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const node_selection_ref = useRef<d3.Selection<SVGCircleElement, NodeDatum, SVGGElement, unknown> | null>(null)
  const label_selection_ref = useRef<d3.Selection<SVGTextElement, NodeDatum, SVGGElement, unknown> | null>(null)
  const link_selection_ref = useRef<d3.Selection<SVGLineElement, any, SVGGElement, unknown> | null>(null)
  const comment_selection_ref = useRef<d3.Selection<SVGForeignObjectElement, NodeDatum, SVGGElement, unknown> | null>(null)
  const on_node_click_ref = useRef(on_node_click)
  const on_deselect_ref = useRef(on_deselect)
  const zoom_ref = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const exclusion_active_ref = useRef(false)
  const current_exclusion_radius_ref = useRef(0)
  const current_outer_exclusion_radius_ref = useRef(10000)
  const is_selected_ref = useRef(false)
  const is_radius_suppressed_ref = useRef(false)
  const mask_circle_ref = useRef<d3.Selection<SVGCircleElement, unknown, null, undefined> | null>(null)
  const mask_outer_circle_ref = useRef<d3.Selection<SVGCircleElement, unknown, null, undefined> | null>(null)
  const config_ref = useRef(config)
  const fixed_node_id_ref = useRef(fixed_node_id)
  const search_input_ref = useRef<HTMLInputElement>(null)
  const [hide_overlay, set_hide_overlay] = useState(false)

  // Focus target configuration. If null, the visual center is used.
  const focus_target = { x: null, y: null };

  useEffect(() => {
    if (show_search_bar) {
      // If there's already a search query when the search bar is triggered (like from a share link), 
      // we hide the overlay immediately to show the result.
      if (search_query) {
        set_hide_overlay(true)
      } else {
        set_hide_overlay(false)
      }
      
      if (svg_ref.current && zoom_ref.current) {
        const rect = svg_ref.current.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        const visual_center_y = (height - 72) / 2

        const target_x = focus_target.x ?? (width / 2)
        const target_y = focus_target.y ?? visual_center_y

        d3.select(svg_ref.current)
          .transition()
          .duration(750)
          .call(
            zoom_ref.current.transform,
            d3.zoomIdentity
              .translate(width / 2, visual_center_y)
              .scale(DESELECT_ZOOM_LEVEL)
              .translate(-target_x, -target_y)
          )
        
        // Increase inner_exclusion_radius to 600
        config_ref.current = {
          ...config_ref.current,
          inner_exclusion_radius: 600,
          outer_exclusion_radius: 600,
        }
        if (simulation_ref.current) {
          simulation_ref.current.alpha(0.3).restart()
        }

        setTimeout(() => {
          search_input_ref.current?.focus()
        }, 100)
      }
    } else {
      // Reset inner_exclusion_radius
      config_ref.current = {
        ...config_ref.current,
        inner_exclusion_radius: 0,
        outer_exclusion_radius: 600,
      }
      if (simulation_ref.current) {
        simulation_ref.current.alpha(0.3).restart()
      }
    }
  }, [show_search_bar, search_trigger])

  useEffect(() => {
    config_ref.current = config
    fixed_node_id_ref.current = fixed_node_id
  }, [config, fixed_node_id])

  useEffect(() => {
    const was_selected = is_selected_ref.current
    is_selected_ref.current = !!selected_id

    // 1. Update suppression state IMMEDIATELY
    if (selected_id || !is_logged_in) {
      is_radius_suppressed_ref.current = true
    } else {
      is_radius_suppressed_ref.current = false
    }

    // 2. Restart simulation IMMEDIATELY with high alpha to overcome friction
    if (simulation_ref.current) {
      simulation_ref.current.alpha(0.5).restart()
    }

    // 3. Handle specific transitions
    if (was_selected && !selected_id) {
      // No extra logic needed here as step 1 & 2 handle it immediately
    }
  }, [selected_id, is_logged_in])

  useEffect(() => {
    exclusion_active_ref.current = true
    if (simulation_ref.current) simulation_ref.current.alpha(0.1).restart()
  }, [])

  useEffect(() => {
    on_node_click_ref.current = on_node_click
    on_deselect_ref.current = on_deselect
  }, [on_node_click, on_deselect])

  useEffect(() => {
    const svg_el = svg_ref.current
    if (!svg_el) return

    const rect = svg_el.getBoundingClientRect()
    const width = rect.width || window.innerWidth
    const height = rect.height || window.innerHeight
    
    // Adjust visual center to account for PlayerBar (72px)
    const player_bar_height = 72
    const visual_center_y = (height - player_bar_height) / 2

    const svg = d3.select(svg_el)
    svg.selectAll('*').remove()

    // Add mask definition
    const defs = svg.append('defs')
    const mask = defs.append('mask')
      .attr('id', 'exclusion_mask')
      .attr('maskUnits', 'userSpaceOnUse')
      .attr('x', -5000)
      .attr('y', -5000)
      .attr('width', 10000)
      .attr('height', 10000)

    mask.append('rect')
      .attr('x', -5000)
      .attr('y', -5000)
      .attr('width', 10000)
      .attr('height', 10000)
      .attr('fill', 'white')

    const v = Math.floor(LINK_EXCLUSION_OPACITY * 255)
    const mask_color = `rgb(${v},${v},${v})`
    mask_circle_ref.current = mask.append('circle')
      .attr('cx', width / 2)
      .attr('cy', visual_center_y)
      .attr('r', 0)
      .attr('fill', mask_color)

    mask_outer_circle_ref.current = mask.append('circle')
      .attr('cx', width / 2)
      .attr('cy', visual_center_y)
      .attr('r', config.outer_exclusion_radius + 5000)
      .attr('stroke-width', 10000)
      .attr('stroke', mask_color)
      .attr('fill', 'none')

    const g = svg.append('g')
    g_ref.current = g

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => g.attr('transform', event.transform))

    zoom_ref.current = zoom
    svg.call(zoom)
    // Disable default double-click zoom
    svg.on("dblclick.zoom", null)

    // Set initial zoom level
    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, visual_center_y)
        .scale(DESELECT_ZOOM_LEVEL)
        .translate(-width / 2, -visual_center_y)
    )

    const simulation = d3.forceSimulation<NodeDatum>()
      .force('link', d3.forceLink<NodeDatum, any>().id(d => d.id))
      .force('charge', d3.forceManyBody())
      .force('center', d3.forceCenter(width / 2, visual_center_y))
      .force('exclusion', () => {
        if (!exclusion_active_ref.current) return
        
        const target_radius = !is_radius_suppressed_ref.current ? config_ref.current.inner_exclusion_radius : 0
        
        // Target outer radius depends on whether it's dynamic or constant
        const target_outer_radius = (config_ref.current.is_outer_boundary_dynamic && is_radius_suppressed_ref.current) 
          ? 10000 
          : config_ref.current.outer_exclusion_radius
        
        // If we just reactivated, jump start the radius so the animation is visible immediately
        if (!is_radius_suppressed_ref.current && current_exclusion_radius_ref.current === 0) {
          current_exclusion_radius_ref.current = 10 
        }

        // Animate Inner Radius
        if (current_exclusion_radius_ref.current < target_radius) {
          current_exclusion_radius_ref.current = Math.min(target_radius, current_exclusion_radius_ref.current + EXCLUSION_TRANSITION_SPEED)
        } else if (current_exclusion_radius_ref.current > target_radius) {
          current_exclusion_radius_ref.current = Math.max(target_radius, current_exclusion_radius_ref.current - EXCLUSION_TRANSITION_SPEED)
        }

        // Animate Outer Radius
        if (current_outer_exclusion_radius_ref.current < target_outer_radius) {
          current_outer_exclusion_radius_ref.current = Math.min(target_outer_radius, current_outer_exclusion_radius_ref.current + OUTER_EXCLUSION_TRANSITION_SPEED)
        } else if (current_outer_exclusion_radius_ref.current > target_outer_radius) {
          current_outer_exclusion_radius_ref.current = Math.max(target_outer_radius, current_outer_exclusion_radius_ref.current - OUTER_EXCLUSION_TRANSITION_SPEED)
        }

        // Update mask visually
        if (mask_circle_ref.current) {
          mask_circle_ref.current.attr('r', is_radius_suppressed_ref.current ? 0 : current_exclusion_radius_ref.current)
        }
        if (mask_outer_circle_ref.current) {
          // If not dynamic, always show mask. If dynamic, follow suppression
          const should_hide_mask = config_ref.current.is_outer_boundary_dynamic && is_radius_suppressed_ref.current
          const visual_outer_r = should_hide_mask ? 0 : current_outer_exclusion_radius_ref.current
          mask_outer_circle_ref.current.attr('r', visual_outer_r > 0 ? visual_outer_r + 5000 : 0)
        }

        const cx = width / 2
        const cy = visual_center_y
        const current_nodes = simulation.nodes()
        const inner_radius = current_exclusion_radius_ref.current
        const outer_radius = current_outer_exclusion_radius_ref.current

        for (let i = 0, n = current_nodes.length; i < n; ++i) {
          const node = current_nodes[i]

          // Skip comment nodes and fixed nodes
          if (node.is_comment) continue

          // Fix user node if applicable
          if (fixed_node_id_ref.current && node.id === fixed_node_id_ref.current) {
            node.x = cx
            node.y = cy
            node.fx = cx
            node.fy = cy
            continue
          }

          let dx = (node.x || 0) - cx
          let dy = (node.y || 0) - cy
          let dist = Math.sqrt(dx * dx + dy * dy)

          // If node is exactly at the center, nudge it slightly so forces can work
          if (dist === 0) {
            node.x = cx + (Math.random() - 0.5) * 2
            node.y = cy + (Math.random() - 0.5) * 2
            continue
          }

          // Inner exclusion (push out)
          if (inner_radius > 0 && dist < inner_radius) {
            const ratio = inner_radius / dist
            node.x = cx + dx * ratio
            node.y = cy + dy * ratio
          }

          // Outer exclusion (pull in)
          if (config_ref.current.enable_outer_exclusion && outer_radius < 10000 && dist > outer_radius) {
            const ratio = outer_radius / dist
            node.x = cx + dx * ratio
            node.y = cy + dy * ratio
          }
        }
      })

    simulation.on('tick', () => {
      // Oscillate gravity between 90% and 110%
      const time = Date.now() / 1000
      const oscillation = 1 + Math.sin(time * 2) * 0.1 // oscillate +/- 10%
      const center_force = simulation.force<d3.ForceCenter<NodeDatum>>('center')
      if (center_force) center_force.strength(config_ref.current.center_force * oscillation)

      if (link_selection_ref.current) {
        link_selection_ref.current
          .attr('x1', d => (d.source as any).x ?? 0)
          .attr('y1', d => (d.source as any).y ?? 0)
          .attr('x2', d => (d.target as any).x ?? 0)
          .attr('y2', d => (d.target as any).y ?? 0)
      }
      if (node_selection_ref.current) {
        node_selection_ref.current
          .attr('cx', d => d.x ?? 0)
          .attr('cy', d => d.y ?? 0)
      }
      if (label_selection_ref.current) {
        label_selection_ref.current
          .attr('x', d => d.x ?? 0)
          .attr('y', d => (d.y ?? 0) + (config_ref.current.node_size + 12))
      }
      if (comment_selection_ref.current && svg_ref.current) {
        const transform = d3.zoomTransform(svg_ref.current)
        const padding = 20
        const w = 220
        const h = 160

        comment_selection_ref.current
          .attr('x', d => {
            const lx = (d.x ?? 0) - w / 2
            const min_lx = (padding - transform.x) / transform.k
            const max_lx = (width - padding - transform.x) / transform.k - w
            return Math.max(min_lx, Math.min(max_lx, lx))
          })
          .attr('y', d => {
            const ly = (d.y ?? 0) - h / 2
            const min_ly = (padding - transform.y) / transform.k
            const max_ly = (height - 72 - padding - transform.y) / transform.k - h
            return Math.max(min_ly, Math.min(max_ly, ly))
          })
      }
    })

    simulation_ref.current = simulation

    return () => { simulation.stop() }
  }, [])

  useEffect(() => {
    const simulation = simulation_ref.current
    const g = g_ref.current
    if (!simulation || !g) return

    const link_force = simulation.force<d3.ForceLink<NodeDatum, any>>('link')
    if (link_force) link_force.strength(config.link_force).distance(config.link_distance)

    const charge_force = simulation.force<d3.ForceManyBody<NodeDatum>>('charge')
    if (charge_force) charge_force.strength(config.repel_force * config.repel_force_percentage)

    const center_force = simulation.force<d3.ForceCenter<NodeDatum>>('center')
    if (center_force) center_force.strength(config.center_force)

    const old_nodes = simulation.nodes()
    const node_map = new Map(old_nodes.map(n => [n.id, n]))
    let new_nodes = nodes.map(n => {
      const old = node_map.get(n.id)
      return old ? { ...old, ...n } : { ...n }
    })

    let new_links = links.map(l => ({ ...l }))

    // Inject comment node if active
    if (show_comment && selected_id) {
      const selected_node = new_nodes.find(n => n.id === selected_id)
      if (selected_node) {
        const description = selected_node.content?.music_description || selected_node.content?.author_description || 'No description available'
        const comment_node: NodeDatum = node_map.get('comment_node') || {
          id: 'comment_node',
          name: 'Comment',
          x: (selected_node.x || 0) + 50,
          y: (selected_node.y || 0) + 50,
        }
        comment_node.content = { ...selected_node.content, display_description: description }
        comment_node.is_comment = true
        
        new_nodes.push(comment_node)
        new_links.push({
          source: selected_id,
          target: 'comment_node'
        })
      }
    }

    if (!g.select('.links_group').size()) {
      g.append('g')
        .attr('class', 'links_group')
    }
    
    // Update mask application based on config
    g.select('.links_group')
      .attr('mask', config.enable_masking ? 'url(#exclusion_mask)' : null)

    if (!g.select('.nodes_group').size()) g.append('g').attr('class', 'nodes_group')
    if (!g.select('.labels_group').size()) g.append('g').attr('class', 'labels_group')
    if (!g.select('.comments_group').size()) g.append('g').attr('class', 'comments_group')

    const link_group = g.select<SVGGElement>('.links_group')
    const node_group = g.select<SVGGElement>('.nodes_group')
    const label_group = g.select<SVGGElement>('.labels_group')
    const comment_group = g.select<SVGGElement>('.comments_group')

    label_group.style('display', config.show_labels ? 'inline' : 'none')

    comment_selection_ref.current = comment_group
      .selectAll<SVGForeignObjectElement, NodeDatum>('foreignObject')
      .data(new_nodes.filter(n => n.is_comment), d => d.id)
      .join(
        enter => enter.append('foreignObject')
          .attr('width', 220)
          .attr('height', 160)
          .call(d3.drag<SVGForeignObjectElement, NodeDatum>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0)
              d.fx = null; d.fy = null
            })
          )
          .html(d => `
            <div class="login_card" style="padding: 20px; width: 100%; height: 100%; box-sizing: border-box; background: rgba(255,255,255,0.01); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: none; pointer-events: auto; font-family: 'Inter', -apple-system, sans-serif; display: flex; flex-direction: column;">
              <div class="login_card_inner" style="position: relative; height: 100%; display: flex; flex-direction: column;">
                <div class="login_header" style="margin-bottom: 12px;">
                  <h2 style="font-size: 0.9rem; font-weight: 400; letter-spacing: 0.5px; margin: 0; color: #000;">[ Description ]</h2>
                </div>
                <div style="font-size: 0.75rem; color: #666; line-height: 1.4; overflow-y: auto; flex: 1; padding-right: 4px;">
                  ${d.content?.display_description || ''}
                </div>
              </div>
            </div>
          `),
        update => update.html(d => `
            <div class="login_card" style="padding: 20px; width: 100%; height: 100%; box-sizing: border-box; background: rgba(255,255,255,0.01); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: none; pointer-events: auto; font-family: 'Inter', -apple-system, sans-serif; display: flex; flex-direction: column;">
              <div class="login_card_inner" style="position: relative; height: 100%; display: flex; flex-direction: column;">
                <div class="login_header" style="margin-bottom: 12px;">
                  <h2 style="font-size: 0.9rem; font-weight: 400; letter-spacing: 0.5px; margin: 0; color: #000;">[ Description ]</h2>
                </div>
                <div style="font-size: 0.75rem; color: #666; line-height: 1.4; overflow-y: auto; flex: 1; padding-right: 4px;">
                  ${d.content?.display_description || ''}
                </div>
              </div>
            </div>
        `),
        exit => exit.remove()
      )

    link_selection_ref.current = link_group
      .selectAll<SVGLineElement, any>('line')
      .data(new_links, (l: any) => `${l.source.id || l.source}-${l.target.id || l.target}`)
      .join(
        enter => enter.append('line')
          .attr('stroke', LINK_BASE)
          .attr('stroke-width', config.link_thickness)
          .attr('stroke-opacity', 0.7),
        update => update.attr('stroke-width', config.link_thickness),
        exit => exit.remove()
      )

    const update_highlight = () => {
      const sel_id = selected_id ?? null
      const q = search_query?.toLowerCase() || ''
      const node_set = new Set<string>()

      if (sel_id !== null) {
        node_set.add(sel_id)
        new_links.forEach((l: any) => {
          const src_id = typeof l.source === 'object' ? l.source.id : l.source
          const tgt_id = typeof l.target === 'object' ? l.target.id : l.target
          if (src_id === sel_id || tgt_id === sel_id) {
            node_set.add(src_id)
            node_set.add(tgt_id)
          }
        })
      }

      if (node_selection_ref.current) {
        node_selection_ref.current
          .transition().duration(300)
          .attr('fill', (n) => {
            if (sel_id === null || node_set.has(n.id)) return n.color || (sel_id === null ? BASE_COLOR : SELECTED_COLOR)
            return BASE_COLOR
          })
          .attr('opacity', (n) => (sel_id === null || node_set.has(n.id)) ? 1 : 0.3)
      }

      if (label_selection_ref.current) {
        label_selection_ref.current
          .transition().duration(300)
          .attr('opacity', (n) => (sel_id === null || node_set.has(n.id)) ? 1 : 0.1)
      }

      if (link_selection_ref.current) {
        link_selection_ref.current
          .transition().duration(300)
          .attr('stroke', (l: any) => {
            const src_id = typeof l.source === 'object' ? l.source.id : l.source
            const tgt_id = typeof l.target === 'object' ? l.target.id : l.target
            return sel_id !== null && (src_id === sel_id || tgt_id === sel_id) ? LINK_SELECTED : LINK_BASE
          })
          .attr('stroke-opacity', (l: any) => {
            const src_id = typeof l.source === 'object' ? l.source.id : l.source
            const tgt_id = typeof l.target === 'object' ? l.target.id : l.target
            const is_related = sel_id !== null && (src_id === sel_id || tgt_id === sel_id)
            if (sel_id === null) return 0.7
            return is_related ? 1 : 0.1
          })
      }
    }

    const zoom_to_node = (id: string) => {
      const node = new_nodes.find(n => n.id === id)
      if (node && svg_ref.current && zoom_ref.current) {
        const svg = d3.select(svg_ref.current)
        const rect = svg_ref.current.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        const visual_center_y = (height - 72) / 2

        const x = node.x ?? width / 2
        const y = node.y ?? visual_center_y

        svg.transition().duration(750).call(
          zoom_ref.current.transform,
          d3.zoomIdentity
            .translate(width / 2, visual_center_y)
            .scale(FOCUS_ZOOM_LEVEL)
            .translate(-x, -y)
        )
      }
    }

    node_selection_ref.current = node_group
      .selectAll<SVGCircleElement, NodeDatum>('circle')
      .data(new_nodes.filter(n => !n.is_comment), d => d.id)
      .join(
        enter => enter.append('circle')
          .attr('r', config.node_size)
          .attr('fill', d => d.color || BASE_COLOR)
          .attr('cursor', 'pointer')
          .call(d3.drag<SVGCircleElement, NodeDatum>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0)
              d.fx = null; d.fy = null
            })
          )
          .on('click', (event, d) => {
            event.stopPropagation()
            
            let content = d.content
            if (typeof content === 'string') {
              try { content = JSON.parse(content) } catch {}
            }

            on_node_click_ref.current(d.id, content)

            fetch('/api/node_selected', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: d.id, name: d.name, content })
            }).catch(err => console.error('Failed to notify backend:', err))
          })
          .on('dblclick', (event, d) => {
            event.stopPropagation()
            zoom_to_node(d.id)
          }),
        update => update.attr('r', config.node_size),
        exit => exit.remove()
      )

    label_selection_ref.current = label_group
      .selectAll<SVGTextElement, NodeDatum>('text')
      .data(new_nodes.filter(n => !n.is_comment), d => d.id)
      .join(
        enter => enter.append('text')
          .text(d => d.name || d.id)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('fill', LINK_BASE)
          .attr('pointer-events', 'none')
          .attr('font-family', 'sans-serif'),
        update => update.text(d => d.name || d.id),
        exit => exit.remove()
      )

    const svg = d3.select(svg_ref.current)
    
    // Clear any existing handlers
    svg.on('click', null)
    svg.on('dblclick', null)

    let click_timer: any = null

    svg.on('click', (event) => {
      // Small delay to see if a double click follows
      if (click_timer) {
        clearTimeout(click_timer)
        click_timer = null
        return
      }

      click_timer = setTimeout(() => {
        if (!event.defaultPrevented) {
          on_deselect_ref.current?.()
          on_search?.('') // This will be handled in App to close search bar
          
          if (zoom_ref.current && svg_ref.current) {
            const rect = svg_ref.current.getBoundingClientRect()
            const visual_center_y = (rect.height - 72) / 2
            d3.select(svg_ref.current).transition().duration(750)
              .call(
                zoom_ref.current.transform, 
                d3.zoomIdentity
                  .translate(rect.width / 2, visual_center_y)
                  .scale(DESELECT_ZOOM_LEVEL)
                  .translate(-rect.width / 2, -visual_center_y)
              )
          }
        }
        click_timer = null
      }, 250)
    })

    svg.on('dblclick', (event) => {
      event.preventDefault()
      if (click_timer) {
        clearTimeout(click_timer)
        click_timer = null
      }
      
      const target_id = selected_id || playing_node_id
      if (target_id) {
        const node = new_nodes.find(n => n.id === target_id)
        if (node) {
          on_node_click_ref.current(node.id, node.content)
          zoom_to_node(target_id)
        }
      }
    })

    simulation.nodes(new_nodes)
    const link_f = simulation.force<d3.ForceLink<NodeDatum, any>>('link')
    if (link_f) link_f.links(new_links)

    simulation.alpha(0.3).restart()
    update_highlight()

    if (selected_id && should_focus) {
      setTimeout(() => zoom_to_node(selected_id), 50)
    } else if (!selected_id && !search_query && svg_ref.current && zoom_ref.current) {
      // Reset zoom to center when no node is selected and nodes change (e.g. after login)
      const rect = svg_ref.current.getBoundingClientRect()
      const visual_center_y = (rect.height - 72) / 2
      d3.select(svg_ref.current).transition().duration(750).call(
        zoom_ref.current.transform,
        d3.zoomIdentity
          .translate(rect.width / 2, visual_center_y)
          .scale(DESELECT_ZOOM_LEVEL)
          .translate(-rect.width / 2, -visual_center_y)
      )
    }

  }, [nodes, links, config, selected_id, playing_node_id, should_focus, show_comment, search_query])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svg_ref}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {show_search_bar && !hide_overlay && (
        <div 
          className="search_bar_container" 
          style={{ width: config.search_bar_width }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="search_input_wrapper">
            <input 
              ref={search_input_ref}
              type="text" 
              className="search_input" 
              placeholder="Search"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value
                  on_search?.(val)
                  set_hide_overlay(true)

                  // 1. Reset inner_exclusion_radius to 0 to collapse nodes
                  config_ref.current = {
                    ...config_ref.current,
                    inner_exclusion_radius: 0
                  }
                  if (simulation_ref.current) {
                    simulation_ref.current.alpha(0.3).restart()
                  }

                  // 2. Focus camera on center with specific zoom variable
                  if (svg_ref.current && zoom_ref.current) {
                    const rect = svg_ref.current.getBoundingClientRect()
                    const width = rect.width
                    const height = rect.height
                    const visual_center_y = (height - 72) / 2
                    
                    d3.select(svg_ref.current)
                      .transition()
                      .duration(750)
                      .call(
                        zoom_ref.current.transform,
                        d3.zoomIdentity
                          .translate(width / 2, visual_center_y)
                          .scale(SEARCH_FOCUS_ZOOM)
                          .translate(-width / 2, -visual_center_y)
                      )
                  }
                }
              }}
            />
            <div className="search_icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>
          <div className="search_subtitle">
            Type keyword to search
          </div>
        </div>
      )}
    </div>
  )
}
