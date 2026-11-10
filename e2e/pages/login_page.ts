import { expect, type Locator, type Page } from '@playwright/test';
import type { UserData } from '../support/test_data';

/** Login / register card: the only screen a visitor without a session sees. */
export class LoginPage {
  private readonly card: Locator;
  private readonly title: Locator;
  private readonly email: Locator;
  private readonly username: Locator;
  private readonly password: Locator;
  private readonly submit: Locator;
  private readonly error: Locator;

  constructor(private readonly page: Page) {
    this.card = page.locator('.login_card');
    this.title = this.card.locator('.login_header h2');
    this.email = this.card.getByPlaceholder('Enter your email');
    this.username = this.card.getByPlaceholder('Enter your username');
    this.password = this.card.getByPlaceholder('Enter your password');
    this.submit = this.card.locator('button.login_btn');
    this.error = this.card.locator('.error_msg');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await this.expect_visible();
  }

  async expect_visible(): Promise<void> {
    await expect(this.card).toBeVisible();
    await expect(this.title).toContainText('Access your account');
  }

  async go_to_register(): Promise<void> {
    await this.card.locator('.toggle_auth span', { hasText: 'Register' }).click();
    await expect(this.title).toContainText('Create an account');
  }

  async go_to_login(): Promise<void> {
    await this.card.locator('.toggle_auth span', { hasText: 'Log in' }).click();
    await expect(this.title).toContainText('Access your account');
  }

  /** Fills and sends the register form; returns the HTTP status of POST /api/register. */
  async register(user: UserData): Promise<number> {
    await this.go_to_register();
    await this.email.fill(user.email);
    await this.username.fill(user.username);
    await this.password.fill(user.password);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/register') && r.request().method() === 'POST'),
      this.submit.click(),
    ]);
    return response.status();
  }

  async login(user: UserData): Promise<void> {
    await this.username.fill(user.username);
    await this.password.fill(user.password);
    await this.submit.click();
  }

  /**
   * Registers the user. When `allow_existing` is true and a previous run already created it
   * (409 "already taken"), logs in instead, so the smoke can be repeated locally without resetting data.
   * With `allow_existing` false (the default in CI) a 409 fails the test: registration is always proven.
   * Returns true when the account was created in this run.
   */
  async register_or_login(user: UserData, allow_existing: boolean): Promise<boolean> {
    const status = await this.register(user);
    if (status === 201) return true;

    expect(status, allow_existing ? 'register status (201, or 409 when the user exists)' : 'register status').toBe(
      allow_existing ? 409 : 201,
    );
    await expect(this.error).toContainText(/already/i);
    await this.go_to_login();
    await this.login(user);
    return false;
  }
}
