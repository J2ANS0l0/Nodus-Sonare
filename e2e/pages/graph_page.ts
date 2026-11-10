import { expect, type Locator, type Page } from '@playwright/test';

/** D3 graph shown in Home / Explore / Search: circles are the nodes, texts their names. */
export class GraphPage {
  private readonly svg: Locator;
  private readonly circles: Locator;
  private readonly labels: Locator;
  private readonly live_indicator: Locator;

  constructor(private readonly page: Page) {
    this.svg = page.locator('svg').filter({ has: page.locator('.nodes_group') });
    this.circles = this.svg.locator('.nodes_group circle');
    this.labels = this.svg.locator('.labels_group text');
    this.live_indicator = page.getByText('live', { exact: true });
  }

  /** The home page is ready when the live stream (SSE) of nodes is connected. */
  async expect_loaded(): Promise<void> {
    await expect(this.svg).toBeVisible();
    await expect(this.live_indicator).toBeVisible();
  }

  async expect_node(name: string): Promise<void> {
    await expect(this.labels.filter({ hasText: new RegExp(`^${escape_regex(name)}$`) })).toHaveCount(1);
  }

  /**
   * Clicks the node with that name. Nodes keep floating (force simulation), so instead of clicking
   * coordinates that may move, the click event is dispatched on the circle bound to that node.
   */
  async select_node(name: string): Promise<void> {
    await this.expect_node(name);
    const index = await this.circles.evaluateAll(
      (els, node_name) => els.findIndex((el) => (el as any).__data__?.name === node_name),
      name,
    );
    expect(index, `circle for node "${name}"`).toBeGreaterThanOrEqual(0);
    await this.circles.nth(index).dispatchEvent('click');
  }
}

function escape_regex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
