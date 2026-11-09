import React, { useState, useEffect, useRef } from 'react';
import './profile.css';
import { RawNode } from '../../types/graph';
import { auth_headers, upload_file } from '../../api/session';

interface ProfileProps {
  user_node: RawNode;
  on_update: (updated_node: RawNode) => void;
  on_close: () => void;
}

export default function Profile({ user_node, on_update, on_close }: ProfileProps) {
  const [node_name, set_node_name] = useState(user_node.node_name || '');
  const [author_name, set_author_name] = useState(user_node.author_name || '');
  const [description, set_description] = useState(user_node.author_description || '');
  const [node_color, set_node_color] = useState(user_node.node_color || '#000000');
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);

  const handle_picture_change = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    set_error('');
    set_loading(true);
    try {
      const data = await upload_file('/api/profile/picture', file);
      on_update(data.node);
    } catch (err: any) {
      set_error(err.message);
    } finally {
      set_loading(false);
    }
  };

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    set_error('');
    set_loading(true);

    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: auth_headers(),
        body: JSON.stringify({
          node_id: user_node.node_id,
          node_name: node_name,
          author_name: author_name,
          author_description: description,
          node_color: node_color,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Update failed');
      }

      const data = await response.json();
      on_update(data.node);
      on_close();
    } catch (err: any) {
      set_error(err.message);
    } finally {
      set_loading(false);
    }
  };

  return (
    <div className="profile_container" style={{ backgroundImage: `url(${user_node.author_profile_picture || ''})` }}>
      <div className="glass_effect_layer" />
      
      <div className="profile_content_layer">
        <div className="profile_card">
          <div className="profile_card_inner">
            <div className="profile_avatar_section">
              <div className="profile_avatar_container">
                <img 
                  src={user_node.author_profile_picture || 'https://via.placeholder.com/150'} 
                  alt="Profile" 
                  className="profile_avatar_image"
                />
              </div>
            </div>
            
            <div className="profile_header">
              <button type="button" className="change_photo_btn_header" onClick={() => file_input_ref.current?.click()} disabled={loading}>
                [ Change Profile Picture ]
              </button>
              <input ref={file_input_ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handle_picture_change} />
              <p>Customize your identity in the network.</p>
            </div>

            <form onSubmit={handle_submit}>
              <div className="form_group">
                <label>Node Name</label>
                <input 
                  type="text" 
                  value={node_name} 
                  onChange={(e) => set_node_name(e.target.value)} 
                  placeholder="Enter node name"
                  required 
                />
              </div>
              <div className="form_group">
                <label>Author Name</label>
                <input 
                  type="text" 
                  value={author_name} 
                  onChange={(e) => set_author_name(e.target.value)} 
                  placeholder="Enter author name"
                  required 
                />
              </div>
              <div className="form_group">
                <label>Description</label>
                <textarea 
                  value={description} 
                  onChange={(e) => set_description(e.target.value)} 
                  placeholder="Tell us about yourself"
                  rows={4}
                  className="profile_textarea"
                />
              </div>
              <div className="form_group">
                <label>Node Color</label>
                <input 
                  type="color" 
                  value={node_color} 
                  onChange={(e) => set_node_color(e.target.value)} 
                  className="color_picker"
                />
              </div>
              
              {error && <p className="error_msg">{error}</p>}
              
              <div className="profile_actions">
                <button type="button" className="cancel_btn" onClick={on_close}>
                  Cancel
                </button>
                <button type="submit" className="save_btn" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
