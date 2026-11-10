import { expect, type Locator, type Page } from '@playwright/test';

export type NavItem = 'Home' | 'Explore' | 'Search' | 'Profile' | 'Post';

/** Left navigation shared by every logged-in screen (SRP: only knows how to move between tabs and log out). */
export class SideNav {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator('.side_nav');
  }

  private item(name: NavItem | 'Logout'): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  async expect_visible(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async go_to(name: NavItem): Promise<void> {
    await this.item(name).click();
    await this.expect_selected(name);
  }

  async expect_selected(name: NavItem): Promise<void> {
    await expect(this.item(name)).toHaveClass(/\bselected\b/);
  }

  async logout(): Promise<void> {
    await this.item('Logout').click();
    await expect(this.root).toBeHidden();
  }
}
