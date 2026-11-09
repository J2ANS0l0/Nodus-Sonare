import type { GraphConfig } from './types/graph'

export const graph_config: GraphConfig = {
  node_size: 6,
  link_thickness: 1,
  center_force: 1,
  repel_force: -1000,
  repel_force_percentage: 1.0,
  link_force: 0.4,
  link_distance: 60,
  show_labels: true,
  inner_exclusion_radius: 0,
  outer_exclusion_radius: 600,
  enable_outer_exclusion: true,
  is_outer_boundary_dynamic: false, // Set to false to make the outer boundary permanent
  enable_masking: true,
  search_bar_width: 350,
}
