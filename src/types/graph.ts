export interface NodeDatum {
  id: string
  name?: string
  color?: string
  content?: any
  is_comment?: boolean
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface RawNode {
  node_id: string
  node_type: 'Tag' | 'Author' | 'Music' | 'Album'
  node_name: string
  node_color: string

  node_music_links_next: string[]
  node_music_links_previous: string[]

  node_tag_links_next: string[]
  node_tag_links_previous: string[]

  node_author_links_next: string[]
  node_author_links_previous: string[]

  node_album_links_next: string[]
  node_album_links_previous: string[]

  // Flattened Music properties (if node_type === 'Music')
  music_id?: string
  music_name?: string
  music_description?: string
  music_author?: string
  music_cover_url?: string
  music_url?: string
  music_album?: string
  likes?: number
  views?: number
  shares?: number
  comments?: number

  // Flattened Author properties (if node_type === 'Author')
  author_id?: string
  author_name?: string
  author_real_name?: string
  author_description?: string
  author_profile_picture?: string

  [key: string]: any
}

export interface LinkDatum {
  source: string | NodeDatum
  target: string | NodeDatum
}

export interface GraphConfig {
  node_size: number
  link_thickness: number
  center_force: number
  repel_force: number
  repel_force_percentage: number
  link_force: number
  link_distance: number
  show_labels: boolean
  inner_exclusion_radius: number
  outer_exclusion_radius: number
  enable_outer_exclusion: boolean
  is_outer_boundary_dynamic: boolean
  enable_masking: boolean
  search_bar_width: number
}
