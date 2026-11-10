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

// User of the "search and play" journey
export const SEARCH_USER: UserData = {
  email: 'SmokeTest@gmail.com',
  username: 'Smoke',
  password: 'Smoke1234',
};

// Precondition of the search journey: a track published by another user, seeded through the API
export const SEED_PUBLISHER: UserData = {
  email: 'seed.artist@example.com',
  username: 'Seed Artist',
  password: 'SeedArtist1234',
};
export const SEED_TRACK = {
  name: 'Nodo Semilla E2E',
  album: 'Semillas',
  file: fileURLToPath(new URL('../../album/01 Primer Ensayo.mp3', import.meta.url)),
};

// User of the "edit profile" journey: it starts by logging in, so the account is created through the API first
export const PROFILE_USER: UserData = {
  email: 'profile.tester@example.com',
  username: 'Profile Tester',
  password: 'ProfileTester1234',
};
// Real 128x128 PNG (solid color, generated with ffmpeg) used as the new profile picture
export const AVATAR_FILE = fileURLToPath(new URL('../fixtures/avatar.png', import.meta.url));

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
