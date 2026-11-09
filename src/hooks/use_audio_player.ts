import { useRef, useState, useEffect, useCallback } from "react";
import type { Music } from "../types/music";

export function use_audio_player(track: Music | null, auto_play = false, on_ended_callback?: () => void) {
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const [is_playing, set_is_playing] = useState(false);
  const [current_time, set_current_time] = useState(0);
  const [duration, set_duration] = useState(0);
  const [volume, set_volume] = useState(1);
  const [is_muted, set_is_muted] = useState(false);
  const volume_ref = useRef(1);

  const on_ended_ref = useRef(on_ended_callback);
  useEffect(() => {
    on_ended_ref.current = on_ended_callback;
  }, [on_ended_callback]);

  useEffect(() => {
    if (!track?.music_url) return;
    
    const audio = new Audio(track.music_url);
    audio.crossOrigin = "anonymous";
    audio_ref.current = audio;
    audio.volume = volume_ref.current;

    const on_time_update = () => set_current_time(audio.currentTime);
    const on_loaded = () => {
      set_duration(audio.duration);
      if (auto_play) {
        audio.play().then(() => set_is_playing(true)).catch(() => {})
      }
    };
    const on_ended = () => {
      set_is_playing(false);
      on_ended_ref.current?.();
    };

    audio.addEventListener("timeupdate", on_time_update);
    audio.addEventListener("loadedmetadata", on_loaded);
    audio.addEventListener("ended", on_ended);

    set_current_time(0);
    set_duration(0);
    set_is_playing(false);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", on_time_update);
      audio.removeEventListener("loadedmetadata", on_loaded);
      audio.removeEventListener("ended", on_ended);
      audio_ref.current = null;
    };
  }, [track?.music_url, auto_play]);

  const toggle_play = useCallback(() => {
    const audio = audio_ref.current;
    if (!audio) return;
    if (is_playing) {
      audio.pause();
      set_is_playing(false);
    } else {
      audio.play().then(() => set_is_playing(true)).catch(() => {});
    }
  }, [is_playing]);

  const seek = useCallback((time: number) => {
    const audio = audio_ref.current;
    if (!audio) return;
    audio.currentTime = time;
    set_current_time(time);
  }, []);

  const change_volume = useCallback((val: number) => {
    const audio = audio_ref.current;
    const clamped = Math.min(1, Math.max(0, val));
    set_volume(clamped);
    volume_ref.current = clamped;
    set_is_muted(clamped === 0);
    if (audio) audio.volume = clamped;
  }, []);

  const toggle_mute = useCallback(() => {
    const audio = audio_ref.current;
    if (!audio) return;
    const next = !is_muted;
    set_is_muted(next);
    audio.volume = next ? 0 : volume_ref.current;
  }, [is_muted]);

  const restart = useCallback(() => {
    const audio = audio_ref.current;
    if (!audio) return;
    audio.currentTime = 0;
    set_current_time(0);
    if (!is_playing) {
      audio.play().then(() => set_is_playing(true)).catch(() => {});
    }
  }, [is_playing]);

  return { is_playing, current_time, duration, volume, is_muted, toggle_play, seek, change_volume, toggle_mute, restart };
}
