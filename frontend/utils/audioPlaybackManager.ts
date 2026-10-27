/**
 * Global Audio Playback Coordinator
 * Ensures only one voice message or audio preview plays at a time across the entire application.
 * When a user presses Play on any audio message, any currently playing audio is paused cleanly.
 */

type StopHandler = () => void;

class AudioPlaybackCoordinator {
  private activeId: string | null = null;
  private activeStopHandler: StopHandler | null = null;

  /**
   * Request permission to play an audio track.
   * If another track is currently playing, pauses it first.
   */
  public requestPlayback(id: string, onStop: StopHandler) {
    if (this.activeId && this.activeId !== id && this.activeStopHandler) {
      try {
        this.activeStopHandler();
      } catch (err) {
        console.warn("Failed to stop previous audio:", err);
      }
    }
    this.activeId = id;
    this.activeStopHandler = onStop;
  }

  /**
   * Notify that playback for this track has stopped or ended.
   */
  public releasePlayback(id: string) {
    if (this.activeId === id) {
      this.activeId = null;
      this.activeStopHandler = null;
    }
  }

  /**
   * Check if a specific track is the currently registered active track.
   */
  public isActive(id: string): boolean {
    return this.activeId === id;
  }
}

export const audioPlaybackCoordinator = new AudioPlaybackCoordinator();
