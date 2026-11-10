// Test data builders shared by every case (loaded with require("./lib/fixtures") in pre-request scripts).
// Each case creates its own users/albums through the public API, so cases are independent of each other
// and repeatable against a persistent environment (no database reset).

const PASSWORD = "secret123";

function suffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A username of exactly `length` characters that is unique per run (the random part goes at the end).
function uniqueName(length, prefix = "it") {
  const base = prefix + suffix() + suffix();
  if (length <= base.length) return base.slice(0, 2) + base.slice(base.length - (length - 2));
  return base.padStart(length, "u");
}

// Two random characters from the username alphabet (letters and digits).
function twoChars() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  return pick() + pick();
}

function url(bru, path) {
  return bru.interpolate("{{baseUrl}}") + path;
}

async function post(bru, path, data, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await bru.sendRequest({ method: "POST", url: url(bru, path), headers, data });
  return { status: res.status, data: res.data };
}

function expectStatus(res, status, what) {
  if (res.status !== status) {
    throw new Error(`fixture "${what}" expected ${status} but got ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// Registers a fresh user and returns { token, nodeId, userId, username, email, password }.
async function newUser(bru, overrides = {}) {
  const s = suffix();
  const body = { email: `it_${s}@example.com`, username: `it_${s}`, password: PASSWORD, ...overrides };
  const data = expectStatus(await post(bru, "/api/register", body), 201, "register");
  return {
    token: data.token,
    nodeId: data.node.node_id,
    userId: data.user.id,
    username: body.username,
    email: body.email,
    password: body.password,
  };
}

// Uploads an album with `count` tracks (no audio files: the url is any string) and returns the Music node ids.
async function newAlbum(bru, token, count = 1) {
  const tracks = Array.from({ length: count }, (_, i) => ({ name: `Track ${i + 1}`, url: `it://track-${i + 1}` }));
  const body = { album_name: `Album ${suffix()}`, author_name: "Integration", tracks };
  const data = expectStatus(await post(bru, "/api/album/upload", body, token), 201, "album upload");
  return data.nodes.map((n) => n.node_id);
}

async function like(bru, token, musicNodeId) {
  return expectStatus(await post(bru, "/api/like", { music_node_id: musicNodeId }, token), 200, "like");
}

async function login(bru, username, password) {
  return post(bru, "/api/login", { username, password });
}

module.exports = { PASSWORD, suffix, uniqueName, twoChars, newUser, newAlbum, like, login };
