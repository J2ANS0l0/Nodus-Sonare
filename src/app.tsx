import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import GraphView from './components/graph_view'
import PlayerBar from "./components/player_bar/player_bar";
import SideNav, { NavItem } from "./components/side_nav/side_nav";
import Login from "./components/login/login";
import Profile from "./components/profile/profile";
import Post from "./components/post/post";
import CustomCursor from "./components/custom_cursor/custom_cursor";
import { graph_config } from './graph_config'
import type { NodeDatum, LinkDatum, RawNode } from './types/graph'
import type { Music } from "./types/music";
import { auth_headers } from './api/session'

const DEFAULT_TRACK: Music = {
  music_id: "59",
  music_name: "Key",
  music_description: "Key from C418",
  music_author: "C418",
  music_cover_url: "http://localhost:9000/music-cover/c418/volume-alpha.jpg",
  music_url: "http://localhost:9000/music/c418/volume-alpha/01-key.mp3",
  music_album: "Volume Alpha",
  likes: 0,
  views: 0,
  shares: 0,
  comments: 0,
}

const SHUFFLE_STEP_DELAY = 900; // ms between steps

interface GraphData {
  nodes: NodeDatum[]
  links: LinkDatum[]
}

const generate_initial_nodes = (count: number): GraphData => {
  const nodes: NodeDatum[] = [];
  const links: LinkDatum[] = [];
  for (let i = 0; i < count; i++) {
    // Darker grayscale for visibility on white background
    const v = Math.floor(Math.random() * 100) + 20;
    const color = `rgb(${v},${v},${v})`;
    nodes.push({
      id: `initial_${i}`,
      name: `Node ${i}`,
      color: color
    });
  }
  for (let i = 0; i < count; i++) {
    if (Math.random() > 0.7) {
      const target = Math.floor(Math.random() * count);
      if (target !== i) {
        links.push({ source: `initial_${i}`, target: `initial_${target}` });
      }
    }
  }
  return { nodes, links };
};

export default function App() {
  const [is_logged_in, set_is_logged_in] = useState(false)
  const [username, set_username] = useState<string | null>(null)
  const [active_tab, set_active_tab] = useState<NavItem>('Home')
  const [is_transitioning, set_is_transitioning] = useState(false)
  const [graph_data, set_graph_data] = useState<GraphData | null>(() => generate_initial_nodes(200))
  const [raw_nodes, set_raw_nodes] = useState<RawNode[]>([])
  const [connected, set_connected] = useState(false)
  const [error, set_error] = useState<string | null>(null)
  const [current_track, set_current_track] = useState<Music>(DEFAULT_TRACK)
  const [selected_node_id, set_selected_node_id] = useState<string | null>(null)
  const [is_manual_selection, set_is_manual_selection] = useState(false)
  const [should_focus, set_should_focus] = useState(true)
  const [is_comment_active, set_is_comment_active] = useState(false)
  const [is_sharing, set_is_sharing] = useState(false)
  const [auto_play, set_auto_play] = useState(false)
  const [history, set_history] = useState<string[]>([])
  const [search_query, set_search_query] = useState('')
  const [search_trigger, set_search_trigger] = useState(0)
  const [current_config, set_current_config] = useState(graph_config)
  const es_ref = useRef<EventSource | null>(null)
  const initial_search_handled_ref = useRef(false)

  const visible_nodes = useMemo(() => {
    if (!raw_nodes.length || !is_logged_in || !username) return []

    const user_node = raw_nodes.find(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username))
    const liked_music_ids = user_node?.node_music_likes || []
    
    // helper to get all links for BFS
    const get_all_links = (n: RawNode) => [
      ...(n.node_tag_links_next || []),
      ...(n.node_tag_links_previous || []),
      ...(n.node_author_links_next || []),
      ...(n.node_author_links_previous || []),
      ...(n.node_album_links_next || []),
      ...(n.node_album_links_previous || []),
      ...(n.node_music_links_next || []),
      ...(n.node_music_links_previous || [])
    ].filter(id => id && id !== n.node_id);

    const get_reachable_from = (starting_nodes: RawNode[], max_depth: number) => {
      const reachable_ids = new Set<string>()
      const raw_nodes_map = new Map(raw_nodes.map(n => [n.node_id, n]))
      const queue: { id: string, depth: number }[] = []
      
      starting_nodes.forEach(m => {
        reachable_ids.add(m.node_id)
        queue.push({ id: m.node_id, depth: 0 })
      })

      while (queue.length > 0) {
        const { id: current_id, depth } = queue.shift()!
        if (depth >= max_depth) continue
        const current_node = raw_nodes_map.get(current_id)
        if (!current_node) continue
        get_all_links(current_node).forEach(nid => {
          if (!reachable_ids.has(nid)) {
            reachable_ids.add(nid)
            queue.push({ id: nid, depth: depth + 1 })
          }
        })
      }
      return reachable_ids
    }

    // --- SEARCH TAB LOGIC ---
    if (active_tab === 'Search') {
      if (search_query) {
        const q = search_query.toLowerCase()
        const matches = raw_nodes.filter(rn => 
          (rn.node_name?.toLowerCase().includes(q)) ||
          (rn.music_author?.toLowerCase().includes(q)) ||
          (rn.music_description?.toLowerCase().includes(q)) ||
          (rn.author_real_name?.toLowerCase().includes(q)) ||
          (rn.author_name?.toLowerCase().includes(q))
        )

        if (matches.length === 1 && (matches[0].node_type === 'Author' || matches[0].node_type === 'Tag')) {
          const reachable_ids = get_reachable_from([matches[0]], 1)
          return raw_nodes.filter(rn => reachable_ids.has(rn.node_id))
        }

        return matches
      } else {
        // Union of Home and Explore: basically everything reachable
        const home_music = raw_nodes.filter(rn => rn.node_type === 'Music' && liked_music_ids.includes(rn.node_id))
        const explore_music = raw_nodes.filter(rn => rn.node_type === 'Music' && !liked_music_ids.includes(rn.node_id))
        
        const home_reachable = get_reachable_from(home_music, 2)
        const explore_reachable = get_reachable_from(explore_music, 100)
        
        const union_ids = new Set([...home_reachable, ...explore_reachable])
        return raw_nodes.filter(rn => {
          if (rn.node_type === 'Author' && (!rn.node_music_links_next || rn.node_music_links_next.length === 0)) return false
          if (rn.node_id === user_node?.node_id) return true
          return union_ids.has(rn.node_id)
        })
      }
    }

    // --- NORMAL TABS LOGIC ---
    const visible_music_nodes = raw_nodes.filter(rn => {
      if (rn.node_type !== 'Music') return false
      if (active_tab === 'Home') return liked_music_ids.includes(rn.node_id)
      if (active_tab === 'Explore') return !liked_music_ids.includes(rn.node_id)
      return true
    })
    
    const visible_music_ids = new Set(visible_music_nodes.map(m => m.node_id))
    const max_depth = active_tab === 'Home' ? 2 : 100 
    const reachable_ids = get_reachable_from(visible_music_nodes, max_depth)

    return raw_nodes.filter(rn => {
      if (rn.node_type === 'Author' && (!rn.node_music_links_next || rn.node_music_links_next.length === 0)) return false
      if (rn.node_id === user_node?.node_id) return true
      if (rn.node_type === 'Music' && !visible_music_ids.has(rn.node_id)) return false
      return reachable_ids.has(rn.node_id)
    })
  }, [raw_nodes, active_tab, is_logged_in, username, search_query])

  const fixed_node_id = useMemo(() => {
    if (!is_logged_in || !username || !raw_nodes.length) return null
    const user_node = raw_nodes.find(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username))
    if (user_node && user_node.node_music_links_next && user_node.node_music_links_next.length > 0) {
      return user_node.node_id
    }
    return null
  }, [is_logged_in, username, raw_nodes])

  const handle_track_change = useCallback((track: Music, node_id?: string, add_to_history = true, focus = true) => {
    let target_node_id = node_id

    if (!target_node_id) {
      const current_node = visible_nodes.find(rn => rn.music_id === track.music_id)
      if (current_node) target_node_id = current_node.node_id
    }

    if (target_node_id) {
      if (add_to_history && current_track && selected_node_id && selected_node_id !== target_node_id) {
        set_history(prev => [...prev, selected_node_id])
      }
      set_selected_node_id(target_node_id)
      set_should_focus(focus)
    }

    set_auto_play(true)
    if (current_track?.music_id !== track.music_id) {
      set_current_track(track)
    }
  }, [visible_nodes, current_track, selected_node_id])

  const handle_next = useCallback(() => {
    if (!current_track || !visible_nodes.length) return
    const current_node = visible_nodes.find(rn => rn.node_id === selected_node_id)
    const base_node = current_node || visible_nodes.find(rn => rn.music_id === current_track.music_id)
    if (!base_node) return

    if (base_node.node_album_links_next?.length > 0) {
      const next_id = base_node.node_album_links_next[0]
      const next_node = visible_nodes.find(rn => rn.node_id === next_id)
      if (next_node && next_node.node_type === "Music") {
        handle_track_change(next_node as unknown as Music, next_node.node_id, true, is_manual_selection)
        return
      }
    }

    if (base_node.node_author_links_next?.length > 0) {
      const author_id = base_node.node_author_links_next[0]
      if (visible_nodes.some(n => n.node_id === author_id)) {
        set_selected_node_id(author_id)
        set_should_focus(is_manual_selection)
      }
    }
  }, [current_track, visible_nodes, selected_node_id, is_manual_selection, handle_track_change])

  const handle_previous = useCallback(() => {
    if (!current_track || !visible_nodes.length) return
    const current_node = visible_nodes.find(rn => rn.node_id === selected_node_id)
    const base_node = current_node || visible_nodes.find(rn => rn.music_id === current_track.music_id)
    if (!base_node) return

    if (base_node.node_album_links_previous?.length > 0) {
      const prev_id = base_node.node_album_links_previous[0]
      const prev_node = visible_nodes.find(rn => rn.node_id === prev_id)
      if (prev_node && prev_node.node_type === "Music") {
        handle_track_change(prev_node as unknown as Music, prev_node.node_id, false, is_manual_selection)
        return
      }
    }

    if (base_node.node_author_links_next?.length > 0) {
      const author_id = base_node.node_author_links_next[0]
      if (visible_nodes.some(n => n.node_id === author_id)) {
        set_selected_node_id(author_id)
        set_should_focus(is_manual_selection)
      }
    }
  }, [current_track, visible_nodes, selected_node_id, is_manual_selection, handle_track_change])

  const playing_node_id = useMemo(() => {
    if (!current_track) return null
    const node = visible_nodes.find(rn => rn.music_id === current_track.music_id)
    return node?.node_id || null
  }, [current_track, visible_nodes])

  const handle_shuffle = useCallback(async () => {
    if (!visible_nodes.length) return

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const get_random = <T,>(arr: T[]): T | null => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null

    const find_music_from_author = (author_node: RawNode) => {
      const music_ids = author_node.node_music_links_next || []
      const musics = visible_nodes.filter(n => music_ids.includes(n.node_id) && n.node_type === "Music")
      return get_random(musics)
    }

    const find_author_from_tag = (tag_node: RawNode) => {
      const author_ids = tag_node.node_author_links_next || []
      const authors = visible_nodes.filter(n => author_ids.includes(n.node_id) && n.node_type === "Author")
      return get_random(authors)
    }

    let current_node = selected_node_id ? visible_nodes.find(n => n.node_id === selected_node_id) : null

    const start_full_flow = async (): Promise<boolean> => {
      const tags = visible_nodes.filter(n => n.node_type === "Tag" && (n.node_author_links_next?.length ?? 0) > 0)
      const random_tag = get_random(tags.length > 0 ? tags : visible_nodes.filter(n => n.node_type === "Tag"))
      
      if (!random_tag) {
        // Fallback for searches with no tags: pick a random author or music
        const authors = visible_nodes.filter(n => n.node_type === "Author")
        const musics = visible_nodes.filter(n => n.node_type === "Music")
        const fallback = get_random(authors) || get_random(musics) || get_random(visible_nodes)
        if (!fallback) return false
        
        set_selected_node_id(fallback.node_id)
        set_should_focus(true)
        if (fallback.node_type === "Music") {
          handle_track_change(fallback as unknown as Music, fallback.node_id, true, true)
          return true
        }
        // If it's an author, wait a bit then pick a music
        await delay(SHUFFLE_STEP_DELAY)
        const random_music = find_music_from_author(fallback)
        if (random_music) {
          handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
        }
        return true
      }

      set_selected_node_id(random_tag.node_id)
      set_should_focus(true)
      await delay(SHUFFLE_STEP_DELAY)

      const random_author = find_author_from_tag(random_tag)
      if (!random_author) return await start_full_flow()

      set_selected_node_id(random_author.node_id)
      set_should_focus(true)
      await delay(SHUFFLE_STEP_DELAY)

      const random_music = find_music_from_author(random_author)
      if (!random_music) return await start_full_flow()

      handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
      return true
    }

    if (!current_node) {
      await start_full_flow()
      return
    }

    if (current_node.node_type === "Tag") {
      const random_author = find_author_from_tag(current_node)
      if (!random_author) { await start_full_flow(); return }
      set_selected_node_id(random_author.node_id); set_should_focus(true); await delay(SHUFFLE_STEP_DELAY)
      const random_music = find_music_from_author(random_author)
      if (!random_music) { await start_full_flow(); return }
      handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
      return
    }

    if (current_node.node_type === "Author") {
      const random_music = find_music_from_author(current_node)
      if (!random_music) { await start_full_flow(); return }
      handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
      return
    }

    if (current_node.node_type === "Music") {
      const related_ids = [...(current_node.node_tag_links_next || []), ...(current_node.node_author_links_next || [])]
      const related_nodes = visible_nodes.filter(n => related_ids.includes(n.node_id))
      const random_related = get_random(related_nodes)
      if (!random_related) { await start_full_flow(); return }
      set_selected_node_id(random_related.node_id); set_should_focus(true); await delay(SHUFFLE_STEP_DELAY)
      if (random_related.node_type === "Tag") {
        const random_author = find_author_from_tag(random_related)
        if (!random_author) { await start_full_flow(); return }
        set_selected_node_id(random_author.node_id); set_should_focus(true); await delay(SHUFFLE_STEP_DELAY)
        const random_music = find_music_from_author(random_author)
        if (!random_music) { await start_full_flow(); return }
        handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
      } else if (random_related.node_type === "Author") {
        const random_music = find_music_from_author(random_related)
        if (!random_music) { await start_full_flow(); return }
        handle_track_change(random_music as unknown as Music, random_music.node_id, true, true)
      }
      return
    }
  }, [visible_nodes, selected_node_id, handle_track_change])

  const handle_node_click = useCallback((node_id: string, content: any) => {
    set_selected_node_id(node_id)
    set_is_manual_selection(true)
    set_should_focus(true)
    if (content && content.music_id) {
      handle_track_change(content as Music, node_id, true, true)
    }
  }, [handle_track_change])

  const handle_deselect = useCallback(() => {
    set_selected_node_id(null)
    set_is_manual_selection(false)
    set_should_focus(true)
    set_is_comment_active(false)
  }, [])

  const handle_comment_toggle = useCallback(() => {
    if (selected_node_id) {
      set_is_comment_active(prev => !prev)
    }
  }, [selected_node_id])

  const handle_share = useCallback(() => {
    if (!current_track) return
    const share_url = `${window.location.origin}${window.location.pathname}?search=${encodeURIComponent(current_track.music_name)}`
    navigator.clipboard.writeText(share_url).then(() => {
      set_is_sharing(true)
      setTimeout(() => set_is_sharing(false), 600)
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }, [current_track])

  const handle_login_success = useCallback((user: string) => {
    set_is_transitioning(true);
    setTimeout(() => {
      set_username(user);
      set_is_logged_in(true);
      set_is_transitioning(false);
      set_selected_node_id(null); 
    }, 800);
  }, [])

  const handle_nav_select = useCallback((item: NavItem) => {
    set_active_tab(item);
    if (item !== 'Search') {
      set_search_query('')
    }
  }, []);

  const handle_profile_update = useCallback((updated_node: RawNode) => {
    set_raw_nodes(prev => prev.map(n => n.node_id === updated_node.node_id ? updated_node : n));
    if (updated_node.node_name) set_username(updated_node.node_name);
  }, []);

  useEffect(() => {
    const handle_global_key_down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        handle_deselect()
        set_active_tab('Search')
        set_search_query('')
        set_search_trigger(prev => prev + 1)
      }
    }
    window.addEventListener('keydown', handle_global_key_down)
    return () => window.removeEventListener('keydown', handle_global_key_down)
  }, [handle_deselect])

  const handle_search = useCallback((query: string) => {
    set_search_query(query)
    if (!query) return
    const q = query.toLowerCase()
    const matches = raw_nodes.filter(rn => 
      (rn.node_name?.toLowerCase().includes(q)) ||
      (rn.music_author?.toLowerCase().includes(q)) ||
      (rn.music_description?.toLowerCase().includes(q)) ||
      (rn.author_real_name?.toLowerCase().includes(q)) ||
      (rn.author_name?.toLowerCase().includes(q))
    )
    if (matches.length === 1) {
      const match = matches[0]
      if (match.node_type === 'Music') {
        set_selected_node_id(match.node_id); 
        set_is_manual_selection(true); 
        set_should_focus(true)
        handle_track_change(match as unknown as Music, match.node_id, true, true)
      } else {
        // For Author or Tag, we don't just select it, we want to see its neighborhood
        set_selected_node_id(match.node_id);
        set_is_manual_selection(true);
        set_should_focus(true);
        
        // The visible_nodes memo will handle showing the reachable nodes 
        // because it uses activeTab === 'Search' logic.
        // However, we need to ensure the search results visible list 
        // includes the related nodes if it's a single match of Author/Tag.
      }
    }
  }, [raw_nodes, handle_track_change])

  useEffect(() => {
    if (!search_query) { set_current_config(graph_config); return }
    const q = search_query.toLowerCase()
    const matches = raw_nodes.filter(rn => 
      (rn.node_name?.toLowerCase().includes(q)) ||
      (rn.music_author?.toLowerCase().includes(q)) ||
      (rn.music_description?.toLowerCase().includes(q)) ||
      (rn.author_real_name?.toLowerCase().includes(q)) ||
      (rn.author_name?.toLowerCase().includes(q))
    )
    if (matches.length >= 2) {
      set_selected_node_id(null) 
      set_current_config(prev => ({ ...prev, outer_exclusion_radius: matches.length * 5 }))
    } else {
      set_current_config(graph_config)
    }
  }, [search_query, raw_nodes])

  useEffect(() => {
    const nodes: NodeDatum[] = visible_nodes.map(rn => ({
      id: rn.node_id,
      name: rn.node_name,
      color: rn.node_color,
      content: (rn.node_type === "Music" || rn.node_type === "Author" || rn.node_type === "Tag") ? rn : null
    }))
    const filtered_node_ids = new Set(visible_nodes.map(rn => rn.node_id))
    const links: LinkDatum[] = []
    visible_nodes.forEach(rn => {
      const all_links = [
        ...(rn.node_tag_links_next || []), ...(rn.node_tag_links_previous || []),
        ...(rn.node_music_links_next || []), ...(rn.node_music_links_previous || []),
        ...(rn.node_author_links_next || []), ...(rn.node_author_links_previous || []),
        ...(rn.node_album_links_next || []), ...(rn.node_album_links_previous || [])
      ]
      all_links.forEach(target_id => {
        if (filtered_node_ids.has(target_id)) links.push({ source: rn.node_id, target: target_id })
      })
    })
    set_graph_data({ nodes, links })
  }, [visible_nodes])

  const handle_like = useCallback(() => {
    if (!current_track || !username || !raw_nodes.length) return
    const track_node = raw_nodes.find(rn => rn.music_id === current_track.music_id)
    if (!track_node) return
    const track_id = track_node.node_id
    set_raw_nodes(prev => {
      const user_idx = prev.findIndex(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username))
      if (user_idx === -1) return prev
      const new_user_nodes = [...prev]; const user_node = { ...new_user_nodes[user_idx] }
      const likes = user_node.node_music_likes || []
      if (likes.includes(track_id)) user_node.node_music_likes = likes.filter((id: string) => id !== track_id)
      else user_node.node_music_likes = [...likes, track_id]
      new_user_nodes[user_idx] = user_node; return new_user_nodes
    })
    fetch('/api/like', {
      method: 'POST',
      headers: auth_headers(),
      body: JSON.stringify({ username, music_node_id: track_id })
    }).catch(err => console.error('Failed to sync like:', err))
  }, [current_track, username, raw_nodes])

  const is_current_track_liked = useMemo(() => {
    if (!current_track || !username || !raw_nodes.length) return false
    const user_node = raw_nodes.find(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username))
    const track_node = raw_nodes.find(rn => rn.music_id === current_track.music_id)
    return user_node?.node_music_likes?.includes(track_node?.node_id || '') || false
  }, [current_track, username, raw_nodes])

  useEffect(() => {
    if (!is_logged_in) return;
    const connect = () => {
      const es = new EventSource('/api/nodes/stream'); es_ref.current = es
      es.onopen = () => { set_connected(true); set_error(null) }
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.__type === 'track') {
            const track = parsed.track as Music
            if (track && track.music_id) set_current_track(track)
            return
          }
          const incoming_nodes: RawNode[] = parsed
          if (Array.isArray(incoming_nodes) && incoming_nodes.length) set_raw_nodes(incoming_nodes)
        } catch (e) { set_error('parse error') }
      }
      es.onerror = () => { set_connected(false); set_error('connection error'); es.close(); setTimeout(connect, 2000) }
    }
    connect(); return () => { es_ref.current?.close() }
  }, [is_logged_in])

  useEffect(() => {
    if (is_logged_in && raw_nodes.length > 0 && !initial_search_handled_ref.current) {
      const params = new URLSearchParams(window.location.search)
      const query = params.get('search')
      if (query) {
        handle_search(query)
        set_active_tab('Search')
        set_search_trigger(prev => prev + 1)
        
        // Remove search param from URL without refreshing
        const new_url = window.location.pathname
        window.history.replaceState({}, '', new_url)
      }
      initial_search_handled_ref.current = true
    }
  }, [is_logged_in, raw_nodes, handle_search])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#ebebeb' }}>
      <CustomCursor />
      {(!is_logged_in || is_transitioning) && (
        <Login on_login={handle_login_success} is_transitioning={is_transitioning} />
      )}

      <div style={{ width: '100%', height: '100%', pointerEvents: (active_tab === 'Profile' || active_tab === 'Post') ? 'none' : 'auto' }}>
        {graph_data && (
          <GraphView
            nodes={graph_data.nodes}
            links={graph_data.links}
            config={current_config}
            selected_id={selected_node_id}
            playing_node_id={playing_node_id}
            fixed_node_id={fixed_node_id}
            should_focus={should_focus}
            show_comment={is_comment_active}
            is_logged_in={is_logged_in}
            search_query={search_query}
            show_search_bar={active_tab === 'Search'}
            search_trigger={search_trigger}
            on_node_click={handle_node_click}
            on_deselect={handle_deselect}
            on_search={handle_search}
          />
        )}
      </div>

      {is_logged_in && (
        <>
          {active_tab === 'Profile' && (
            (() => {
              const user_node = raw_nodes.find(n => n.node_type === 'Author' && (n.node_name === username || n.author_name === username));
              return user_node ? (
                <Profile 
                  user_node={user_node} 
                  on_update={handle_profile_update} 
                  on_close={() => set_active_tab('Home')} 
                />
              ) : null;
            })()
          )}

          {active_tab === 'Post' && (
            <Post 
              username={username || ''} 
              on_close={() => set_active_tab('Home')} 
              on_success={() => set_active_tab('Home')}
            />
          )}

          <div style={{
            position: 'absolute', top: 12, right: 16, fontSize: 11,
            fontFamily: 'monospace', color: connected ? '#6dbf8a' : '#cf6679',
            letterSpacing: '0.05em', zIndex: 10,
          }}>
            {connected ? 'live' : 'reconnecting...'}
          </div>

          {error && (
            <div style={{
              position: 'absolute', top: 30, right: 16,
              fontSize: 10, fontFamily: 'monospace', color: '#cf6679', zIndex: 10
            }}>{error}</div>
          )}

          <SideNav active_tab={active_tab} on_select={handle_nav_select} />

          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', zIndex: 100 }}>
            <PlayerBar 
              track={current_track} 
              auto_play={auto_play} 
              is_liked={is_current_track_liked}
              is_comment_active={is_comment_active}
              on_next={handle_next}
              on_previous={handle_previous}
              on_shuffle={handle_shuffle}
              on_like={handle_like}
              on_comment_toggle={handle_comment_toggle}
              on_share={handle_share}
              is_sharing={is_sharing}
            />
          </div>
        </>
      )}

      {!graph_data && !is_logged_in && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          fontSize: 12, fontFamily: 'monospace', color: '#999'
        }}>generating background...</div>
      )}
    </div>
  )
}
