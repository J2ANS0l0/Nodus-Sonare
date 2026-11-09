import React, { useState } from 'react';
import './post.css';
import { auth_headers, upload_file } from '../../api/session';

interface TrackInput {
  name: string;
  url: string;
  description: string;
  tag: string;
  file?: File;
}

interface PostProps {
  username: string;
  on_close: () => void;
  on_success: () => void;
}

export default function Post({ username, on_close, on_success }: PostProps) {
  const [album_name, set_album_name] = useState('');
  const [author_name, set_author_name] = useState(username);
  const [general_tag, set_general_tag] = useState('');
  const [tracks, set_tracks] = useState<TrackInput[]>([{ name: '', url: '', description: '', tag: '' }]);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');

  const handle_add_track = () => {
    set_tracks([...tracks, { name: '', url: '', description: '', tag: '' }]);
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

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    set_loading(true);
    set_error('');

    try {
      // Upload audio files to the Silo bucket and send their public URLs
      const uploaded_tracks = await Promise.all(tracks.map(async ({ file, ...track }) => {
        if (!file) throw new Error(`Select a music file for "${track.name || 'track'}"`);
        const data = await upload_file('/api/upload/music', file);
        return { ...track, url: data.url };
      }));

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
    }
  };

  return (
    <div className="post_container">
      <div className="post_glass_overlay" />
      
      <div className="post_content_layer">
        <div className="post_card">
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
                    <h3>Tracks</h3>
                    <button type="button" onClick={handle_add_track} className="add_track_btn">+ Add Track</button>
                  </div>
                  
                  {tracks.map((track, index) => (
                    <div key={index} className="track_input_group">
                      <div className="track_header">
                        <span>Track #{index + 1}</span>
                        {tracks.length > 1 && (
                          <button type="button" onClick={() => handle_remove_track(index)} className="remove_track_btn">×</button>
                        )}
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
                          id={`track_file_${index}`}
                          className="file_input"
                          accept="audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handle_track_change(index, 'url', file.name, file);
                          }}
                        />
                        <label htmlFor={`track_file_${index}`} className="file_label">
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
                  {loading ? 'Uploading...' : 'Create Album'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
