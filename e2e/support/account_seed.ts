import { expect, type APIRequestContext } from '@playwright/test';
import type { UserData } from './test_data';

/**
 * Accounts that a journey needs to exist before it starts, created through the API.
 * Only knows about accounts; publishing content is CatalogSeed's job.
 */
export class AccountSeed {
  constructor(private readonly api: APIRequestContext) {}

  /** Registers the user; when it already exists (409), logs in. Returns the JWT. Idempotent. */
  async token_for(user: UserData): Promise<string> {
    const register = await this.api.post('/api/register', { data: user });
    if (register.status() === 201) return (await register.json()).token;
    expect(register.status(), `register ${user.username} (201 or 409)`).toBe(409);

    const login = await this.api.post('/api/login', { data: { username: user.username, password: user.password } });
    expect(login.status(), `login ${user.username}`).toBe(200);
    return (await login.json()).token;
  }

  /** Makes sure the account exists and its password is the expected one. */
  async ensure_user(user: UserData): Promise<void> {
    await this.token_for(user);
  }
}
