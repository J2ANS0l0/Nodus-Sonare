import React, { useRef, useState } from 'react';
import './post.css';
import { auth_headers, upload_file } from '../../api/session';
import {
  AudioMeta, compare_tracks, files_from_drop, is_audio_file, most_common, read_audio_meta,
} from '../../utils/audio_metadata';

interface TrackInput {
  id: number;
  name: string;
  url: string;
  description: string;
  tag: string;
  file?: File;
  meta?: AudioMeta;
}

interface PostProps {
  username: string;
  on_close: () => void;
  on_success: () => void;
}

const UPLOAD_CONCURRENCY = 3;

let next_track_id = 0;
const empty_track = (): TrackInput => ({ id: next_track_id++, name: '', url: '', description: '', tag: '' });
const is_blank = (t: TrackInput) => !t.name && !t.file && !t.description && !t.tag;

export default function Post({ username, on_close, on_success }: PostProps) {
  const [album_name, set_album_name] = useState('');
  const [author_name, set_author_name] = useState(username);
  const [general_tag, set_general_tag] = useState('');
  const [tracks, set_tracks] = useState<TrackInput[]>(() => [empty_track()]);
  const [loading, set_loading] = useState(false);
  const [progress, set_progress] = useState<{ done: number; total: number } | null>(null);
  const [error, set_error] = useState('');
  const [notice, set_notice] = useState('');
  const [is_dragging, set_is_dragging] = useState(false);
  const drag_depth = useRef(0);
  const bulk_input_ref = useRef<HTMLInputElement>(null);

  const handle_add_track = () => {
    set_tracks([...tracks, empty_track()]);
  };

  const handle_track_change = (index: number, field: keyof TrackInput, value: string, file?: File) => {
    const new_tracks = [...tracks];
    (new_tracks[index] as any)[field] = value;
    if (field === 'url') new_tracks[index].file = file;
    set_tracks(new_tracks);
  };

  const handle_remove_track = (index: number) => {
    if (tracks.length === 1) return;
    set_tracks(tracks.filter((_, i) => i !== index));
  };

  const handle_move_track = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const new_tracks = [...tracks];
    [new_tracks[index], new_tracks[target]] = [new_tracks[target], new_tracks[index]];
    set_tracks(new_tracks);
  };

  const handle_sort = () => set_tracks([...tracks].sort(compare_tracks));

  // ---------- bulk add (drag & drop or multi-select) ----------
  const add_files = async (incoming: File[]) => {
    set_error('');
    const audio = incoming.filter(is_audio_file);
    const skipped = incoming.length - audio.length;
    const existing = new Set(tracks.filter(t => t.file).map(t => `${t.file!.name}:${t.file!.size}`));
    const fresh = audio.filter(f => !existing.has(`${f.name}:${f.size}`));
    const duplicates = audio.length - fresh.length;

    if (!fresh.length) {
      set_notice('');
      set_error(skipped ? 'No audio files found in the dropped items' : 'Those files are already in the album');
      return;
    }

    const metas = await Promise.all(fresh.map(read_audio_meta));
    const added: TrackInput[] = fresh.map((file, i) => ({
      ...empty_track(),
      name: metas[i].title,
      url: file.name,
      file,
      meta: metas[i],
    }));

    // Keep the tracks the user already filled, drop empty placeholders, then order everything
    set_tracks(prev => [...prev.filter(t => !is_blank(t)), ...added].sort(compare_tracks));

    // Fill album info from the tags when the user has not typed it yet
    const album = most_common(metas.map(m => m.album));
    const artist = most_common(metas.map(m => m.artist));
    const genre = most_common(metas.map(m => m.genre));
    if (album && !album_name) set_album_name(album);
    if (artist && author_name === username) set_author_name(artist);
    if (genre && !general_tag) set_general_tag(genre);

    const parts = [`${added.length} track${added.length === 1 ? '' : 's'} added and ordered`];
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} ignored`);
    if (skipped) parts.push(`${skipped} non-audio file${skipped === 1 ? '' : 's'} skipped`);
    set_notice(parts.join(' · '));
  };

  const has_files = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handle_drag_enter = (e: React.DragEvent) => {
    if (!has_files(e)) return;
    e.preventDefault();
    drag_depth.current += 1;
    set_is_dragging(true);
  };

  const handle_drag_leave = (e: React.DragEvent) => {
    if (!has_files(e)) return;
    drag_depth.current = Math.max(0, drag_depth.current - 1);
    if (drag_depth.current === 0) set_is_dragging(false);
  };

  const handle_drag_over = (e: React.DragEvent) => {
    if (!has_files(e)) return;
    e.preventDefault(); // allow dropping (otherwise the browser opens the file)
    e.dataTransfer.dropEffect = 'copy';
  };

  const handle_drop = (e: React.DragEvent) => {
    if (!has_files(e)) return;
    e.preventDefault();
    drag_depth.current = 0;
    set_is_dragging(false);
    if (loading) return;
    // Entries must be read synchronously inside the event, so the promise starts right here
    files_from_drop(e.dataTransfer).then(add_files).catch(err => set_error(err.message));
  };

  // ---------- submit ----------
  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    set_error('');
    set_notice('');

    const missing = tracks.find(t => !t.file);
    if (missing) {
      set_error(`Select a music file for "${missing.name || 'track'}"`);
      return;
    }

    set_loading(true);
    set_progress({ done: 0, total: tracks.length });

    try {
      // Upload audio files to the Silo bucket (a few at a time) and send their public URLs
      const urls: string[] = new Array(tracks.length);
      let cursor = 0;
      let done = 0;
      const worker = async () => {
        while (cursor < tracks.length) {
          const index = cursor++;
          const data = await upload_file('/api/upload/music', tracks[index].file!);
          urls[index] = data.url;
          set_progress({ done: ++done, total: tracks.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, tracks.length) }, worker));

      const uploaded_tracks = tracks.map((t, i) => ({ name: t.name, url: urls[i], description: t.description, tag: t.tag }));

      const response = await fetch('/api/album/upload', {
        method: 'POST',
        headers: auth_headers(),
        body: JSON.stringify({
          album_name,
          author_name,
          cover_url: '', // Removed from UI
          general_tag,
          tracks: uploaded_tracks,
          posted_by: username
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload album');
      }

      on_success();
      on_close();
    } catch (err: any) {
      set_error(err.message);
    } finally {
      set_loading(false);
      set_progress(null);
    }
  };

  return (
    <div className="post_container">
      <div className="post_glass_overlay" />

      <div className="post_content_layer">
        <div
          className={`post_card ${is_dragging ? 'dragging' : ''}`}
          onDragEnter={handle_drag_enter}
          onDragLeave={handle_drag_leave}
          onDragOver={handle_drag_over}
          onDrop={handle_drop}
        >
          <div className="post_card_inner">
            <div className="post_header">
              <button type="button" className="post_header_btn">
                [ Album Cover ]
              </button>
              <p>Share your music with the network.</p>
            </div>

            <form onSubmit={handle_submit} className="post_form">
              <div className="post_form_scrollable">
                <div className="form_section">
                  <h3>Album Info</h3>
                  <div className="form_group">
                    <label>Album Name</label>
                    <input
                      type="text"
                      value={album_name}
                      onChange={(e) => set_album_name(e.target.value)}
                      placeholder="e.g. Volume Beta"
                      required
                    />
                  </div>
                  <div className="form_group">
                    <label>Artist Name</label>
                    <input
                      type="text"
                      value={author_name}
                      onChange={(e) => set_author_name(e.target.value)}
                      placeholder="e.g. C418"
                      required
                    />
                  </div>
                  <div className="form_group">
                    <label>General Tag(s)</label>
                    <input
                      type="text"
                      value={general_tag}
                      onChange={(e) => set_general_tag(e.target.value)}
                      placeholder="e.g. Soundtrack, Indie, Electronic"
                    />
                  </div>
                </div>

                <div className="form_section">
                  <div className="section_header">
                    <h3>Tracks{tracks.some(t => t.file) ? ` (${tracks.length})` : ''}</h3>
                    <div className="section_actions">
                      {tracks.length > 1 && (
                        <button type="button" onClick={handle_sort} className="add_track_btn" title="Order by disc / track number, then file name">
                          ⇅ Sort
                        </button>
                      )}
                      <button type="button" onClick={handle_add_track} className="add_track_btn">+ Add Track</button>
                    </div>
                  </div>

                  <div
                    className={`drop_zone ${is_dragging ? 'active' : ''}`}
                    onClick={() => bulk_input_ref.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bulk_input_ref.current?.click(); } }}
                  >
                    <span className="drop_zone_title">{is_dragging ? 'Release to add tracks' : 'Drop audio files or a folder here'}</span>
                    <span className="drop_zone_hint">or click to select several · ordered automatically by track number</span>
                    <input
                      ref={bulk_input_ref}
                      type="file"
                      accept="audio/*"
                      multiple
                      className="file_input"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        if (files.length) add_files(files);
                      }}
                    />
                  </div>
                  {notice && <p className="drop_notice">{notice}</p>}

                  {tracks.map((track, index) => (
                    <div key={track.id} className="track_input_group">
                      <div className="track_header">
                        <span>Track #{index + 1}</span>
                        <div className="track_controls">
                          {tracks.length > 1 && (
                            <>
                              <button type="button" onClick={() => handle_move_track(index, -1)} className="move_track_btn" disabled={index === 0} title="Move up">↑</button>
                              <button type="button" onClick={() => handle_move_track(index, 1)} className="move_track_btn" disabled={index === tracks.length - 1} title="Move down">↓</button>
                              <button type="button" onClick={() => handle_remove_track(index)} className="remove_track_btn">×</button>
                            </>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={track.name}
                        onChange={(e) => handle_track_change(index, 'name', e.target.value)}
                        placeholder="Track Name"
                        required
                      />
                      <div className="file_upload_container">
                        <input
                          type="file"
                          id={`track_file_${track.id}`}
                          className="file_input"
                          accept="audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            handle_track_change(index, 'url', file.name, file);
                            read_audio_meta(file).then(meta => set_tracks(prev => prev.map(t =>
                              t.id === track.id ? { ...t, meta, name: t.name || meta.title } : t)));
                          }}
                        />
                        <label htmlFor={`track_file_${track.id}`} className="file_label">
                          {track.url || 'Select Music File...'}
                        </label>
                      </div>
                      <input
                        type="text"
                        value={track.description}
                        onChange={(e) => handle_track_change(index, 'description', e.target.value)}
                        placeholder="Description (optional)"
                      />
                      <input
                        type="text"
                        value={track.tag}
                        onChange={(e) => handle_track_change(index, 'tag', e.target.value)}
                        placeholder="Tag(s) (optional, e.g. Rock, Metal)"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="error_msg">{error}</p>}

              <div className="post_actions">
                <button type="button" className="cancel_btn" onClick={on_close}>
                  Cancel
                </button>
                <button type="submit" className="save_btn" disabled={loading}>
                  {loading
                    ? (progress && progress.done < progress.total ? `Uploading ${progress.done}/${progress.total}...` : 'Creating album...')
                    : 'Create Album'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
