import { useEffect, useRef } from 'react';
import './custom_cursor.css';

export default function CustomCursor() {
  const dot_ref = useRef<HTMLDivElement>(null);
  const ring_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let raf_id: number;

    const on_mouse_move = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };

    const loop = () => {
      rx += (mx - rx) * 0.5;
      ry += (my - ry) * 0.5;

      if (dot_ref.current) {
        dot_ref.current.style.left = `${mx}px`;
        dot_ref.current.style.top = `${my}px`;
      }
      if (ring_ref.current) {
        ring_ref.current.style.left = `${rx}px`;
        ring_ref.current.style.top = `${ry}px`;
      }

      raf_id = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', on_mouse_move);
    raf_id = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', on_mouse_move);
      cancelAnimationFrame(raf_id);
    };
  }, []);

  return (
    <>
      <div ref={dot_ref} className="cursor_dot" />
      <div ref={ring_ref} className="cursor_ring" />
    </>
  );
}
