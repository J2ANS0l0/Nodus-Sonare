import { fileURLToPath } from 'node:url';

export interface UserData {
  email: string;
  username: string;
  password: string;
}

// Smoke user: fixed credentials so the run is easy to follow in the demo.
export const SMOKE_USER: UserData = {
  email: 'FeelingBlew@gmail.com',
  username: 'Feeling Blew',
  password: 'FeelingBlew1234',
};

// Audio files dropped by the smoke test (repo root /album)
export const ALBUM_DIR = fileURLToPath(new URL('../../album/', import.meta.url));
export const SMOKE_GENERAL_TAG = 'Rock Alternativo';

/**
 * E2E_REUSE_USER=1 lets the smoke log in when the user already exists; E2E_REUSE_USER=0 forbids it.
 * Unset: allowed on a developer machine, forbidden in CI (the pipeline resets the data before this stage).
 */
export const REUSE_EXISTING_USER = process.env.E2E_REUSE_USER
  ? process.env.E2E_REUSE_USER === '1'
  : !process.env.CI;
