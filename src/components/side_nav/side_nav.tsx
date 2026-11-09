import { useState } from 'react';
import './side_nav.css';

const NAV_ITEMS = ['Home', 'Explore', 'Search', 'Profile', 'Post'] as const;
export type NavItem = typeof NAV_ITEMS[number];

interface SideNavProps {
  active_tab: NavItem;
  on_select?: (item: NavItem) => void;
}

export default function SideNav({ active_tab, on_select }: SideNavProps) {
  const handle_click = (item: NavItem) => {
    on_select?.(item);
  };

  return (
    <div className="side_nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item}
          className={`side_nav_item ${active_tab === item ? 'selected' : ''}`}
          onClick={() => handle_click(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
