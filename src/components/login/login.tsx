import React, { useState } from 'react';
import './login.css';
import { set_token } from '../../api/session';

interface LoginProps {
  on_login: (username: string) => void;
  is_transitioning: boolean;
}

export default function Login({ on_login, is_transitioning }: LoginProps) {
  const [is_register, set_is_register] = useState(false);
  const [email, set_email] = useState('');
  const [username, set_username] = useState('');
  const [password, set_password] = useState('');
  const [error, set_error] = useState('');

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    set_error('');

    try {
      const response = await fetch(is_register ? '/api/register' : '/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(is_register ? {
          email,
          username,
          password,
          real_name: username, // For now, use username as real name
        } : { username, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || (is_register ? 'Registration failed' : 'Invalid credentials'));
      }

      set_token(data.token);
      // The graph identifies the user by its Author node name
      on_login(data.node?.node_name || data.user?.username || username);
    } catch (err: any) {
      set_error(err.message);
    }
  };

  return (
    <div className={`login_container ${is_transitioning ? 'fade_out' : ''}`}>
      {/* 2nd layer: Glass Effect */}
      <div className="glass_effect_layer" />

      {/* 3rd layer: Login Content */}
      <div className="login_content_layer">
        <div className="login_card">
          <div className="login_card_inner">
            <div className="logo_icon">▢</div>
            
            <div className="login_header">
              <h2>[ {is_register ? 'Create an account' : 'Access your account'} ]</h2>
              <p>{is_register ? 'Join the network to sync your data.' : 'Log in to sync your cloud data.'}</p>
            </div>

            <form onSubmit={handle_submit}>
              {is_register && (
                <div className="form_group">
                  <label>Email</label>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => set_email(e.target.value)} 
                    placeholder="Enter your email"
                    required 
                  />
                </div>
              )}
              <div className="form_group">
                <label>Username</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => set_username(e.target.value)} 
                  placeholder="Enter your username"
                  required 
                />
              </div>
              <div className="form_group">
                <label>Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => set_password(e.target.value)} 
                  placeholder="Enter your password"
                  required 
                />
              </div>
              
              {error && <p className="error_msg">{error}</p>}
              
              <button type="submit" className="login_btn">
                {is_register ? 'Register' : 'Log in'}
              </button>
            </form>

            {!is_register && <span className="forgot_pw">Forgot password</span>}

            <p className="toggle_auth">
              {is_register ? 'Already have an account?' : "Don't have an account?"}{' '}
              <span onClick={() => set_is_register(!is_register)}>
                {is_register ? 'Log in' : 'Register'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
