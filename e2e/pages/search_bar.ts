import { expect, type Locator, type Page } from '@playwright/test';

/** Search overlay shown over the graph when the "Search" tab is open. Only knows how to type a query. */
export class SearchBar {
  private readonly container: Locator;
  private readonly input: Locator;

  constructor(page: Page) {
    this.container = page.locator('.search_bar_container');
    this.input = this.container.getByPlaceholder('Search');
  }

  async expect_visible(): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.input).toBeFocused();
  }

  /** Types the keyword and presses Enter: the overlay closes and the graph keeps only the matches. */
  async search(query: string): Promise<void> {
    await this.input.fill(query);
    await this.input.press('Enter');
    await expect(this.container).toBeHidden();
  }
}
