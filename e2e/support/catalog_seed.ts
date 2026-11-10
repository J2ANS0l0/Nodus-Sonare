import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';
import type { UserData } from './test_data';

interface RawNode {
  node_id: string;
  node_type: string;
  node_name: string;
}

export interface SeedTrack {
  name: string;
  album: string;
  file: string;
}

/**
 * Arranges test data through the API instead of the UI (setup via API, verify via UI).
 * A journey that needs existing content does not depend on another test having posted it:
 * each test can run alone, in any order, against an empty environment.
 */
export class CatalogSeed {
  constructor(
    private readonly api: APIRequestContext,
    private readonly base_url: string,
  ) {}

  /** First event of the SSE stream: the full node list the app would draw. */
  async nodes(): Promise<RawNode[]> {
    const controller = new AbortController();
    const response = await fetch(new URL('/api/nodes/stream', this.base_url), { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`nodes stream: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('nodes stream closed before the first snapshot');
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!event.startsWith('data: ')) continue; // keepalive comment
          const parsed = JSON.parse(event.slice('data: '.length));
          if (Array.isArray(parsed)) return parsed as RawNode[];
        }
      }
    } finally {
      controller.abort();
    }
  }

  /** Publishes the track as `publisher` unless a Music node with that name already exists. Idempotent. */
  async ensure_track(publisher: UserData, track: SeedTrack): Promise<'created' | 'existing'> {
    const existing = (await this.nodes()).filter((n) => n.node_type === 'Music' && n.node_name === track.name);
    expect(existing.length, `Music nodes named "${track.name}"`).toBeLessThanOrEqual(1);
    if (existing.length === 1) return 'existing';

    const token = await this.token_for(publisher);
    const headers = { Authorization: `Bearer ${token}` };

    const upload = await this.api.post('/api/upload/music', {
      headers,
      multipart: {
        file: { name: path.basename(track.file), mimeType: 'audio/mpeg', buffer: fs.readFileSync(track.file) },
      },
    });
    expect(upload.status(), 'POST /api/upload/music').toBe(201);
    const { url, cover_url } = await upload.json();

    const album = await this.api.post('/api/album/upload', {
      headers,
      data: {
        album_name: track.album,
        author_name: publisher.username,
        general_tag: '',
        tracks: [{ name: track.name, url, cover_url: cover_url ?? '' }],
      },
    });
    expect(album.status(), 'POST /api/album/upload').toBe(201);
    return 'created';
  }

  /** Registers the user; when it already exists (409), logs in. Returns the JWT. */
  private async token_for(user: UserData): Promise<string> {
    const register = await this.api.post('/api/register', { data: user });
    if (register.status() === 201) return (await register.json()).token;
    expect(register.status(), 'register publisher (201 or 409)').toBe(409);

    const login = await this.api.post('/api/login', { data: { username: user.username, password: user.password } });
    expect(login.status(), 'login publisher').toBe(200);
    return (await login.json()).token;
  }
}
