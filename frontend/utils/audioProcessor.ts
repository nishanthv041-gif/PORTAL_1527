/**
 * Smart Voice Message Amplification & Audio Stabilization Engine
 * 
 * Provides:
 * 1. Real-time microphone processing pipeline (AGC, High-Pass filter, Dynamics Compressor, Limiter)
 * 2. Visual audio-level analyzer for live recording waveform meters
 * 3. Shared playback audio enhancement engine (loudness normalization, soft-knee compression, boost)
 * 4. Zero feedback loops: mic audio is strictly routed to MediaStreamDestination, never to speakers
 * 5. Single shared AudioContext for playback to respect browser context limits (max 6 per page)
 */

// Supported constraints helper
export function getOptimalAudioConstraints(): MediaTrackConstraints {
  const supported = typeof navigator !== "undefined" && navigator.mediaDevices?.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints()
    : null;

  const constraints: MediaTrackConstraints = {
    channelCount: 1, // Mono voice is optimal for voice messages & saves bandwidth
    sampleRate: 48000,
  };

  if (!supported || supported.echoCancellation) {
    constraints.echoCancellation = true;
  }
  if (!supported || supported.noiseSuppression) {
    constraints.noiseSuppression = true;
  }
  if (!supported || supported.autoGainControl) {
    constraints.autoGainControl = true;
  }

  return constraints;
}

// Check if Web Audio API is available
export function isWebAudioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
}

function createAudioContext(options?: AudioContextOptions): AudioContext | null {
  if (!isWebAudioSupported()) return null;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return new AudioContextClass(options);
  } catch (err) {
    console.warn("Failed to create AudioContext:", err);
    return null;
  }
}

/* =================================================================================
 * 1. REAL-TIME RECORDING AUDIO PIPELINE
 * ================================================================================= */

export interface VoiceRecorderPipeline {
  stream: MediaStream; // Processed stream with stabilized volume & anti-clipping
  audioContext: AudioContext;
  analyserNode: AnalyserNode;
  getAudioLevel: () => number; // Normalized RMS audio level 0.0 to 1.0
  cleanup: () => void;
}

/**
 * Creates an in-line real-time Web Audio pipeline for microphone recording:
 * rawMic -> High-Pass (85Hz) -> Pre-Gain (+2.5dB) -> Dynamics Compressor -> Makeup Gain -> MediaStreamDestination
 * Parallel tap: -> AnalyserNode (for live visual audio waveform)
 */
export function createVoiceRecordingPipeline(rawMicStream: MediaStream): VoiceRecorderPipeline | null {
  const audioContext = createAudioContext({ latencyHint: "interactive" });
  if (!audioContext) return null;

  try {
    // Resume context if suspended by browser autoplay policy
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const source = audioContext.createMediaStreamSource(rawMicStream);

    // 1. High-Pass Filter: Cuts sub-vocal rumble (<85Hz), table knocks, AC hum, and breath pops
    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = 85;
    highPassFilter.Q.value = 0.7;

    // 2. Pre-Amplification Gain: Gently boosts low-level vocal input
    const preGain = audioContext.createGain();
    preGain.gain.value = 1.35; // ~+2.6 dB base speech lift

    // 3. Dynamics Compressor: Automatic Level Control & Anti-Clipping
    // Smooths out differences between quiet whispers and loud speaking
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -22; // dB - captures quiet and normal speech
    compressor.knee.value = 20;      // dB - smooth soft knee to avoid abrupt pumping
    compressor.ratio.value = 4.5;    // 4.5:1 ratio for steady vocal leveling
    compressor.attack.value = 0.003; // 3ms fast attack catches loud spikes & plosives
    compressor.release.value = 0.22; // 220ms natural vocal decay

    // 4. Post-Compression Makeup Gain: Restores presence without digital clipping
    const makeupGain = audioContext.createGain();
    makeupGain.gain.value = 1.35; // ~+2.6 dB makeup

    // 5. Analyser Node for live visual audio metering
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.8;

    // 6. Output Destination: Connect strictly to MediaStreamDestination (NEVER to audioContext.destination)
    const destinationNode = audioContext.createMediaStreamDestination();

    // Wiring graph:
    // source -> highPass -> preGain -> compressor -> makeupGain -> destinationNode
    source.connect(highPassFilter);
    highPassFilter.connect(preGain);
    preGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(destinationNode);

    // Parallel tap for visual analyzer
    makeupGain.connect(analyserNode);

    // Time-domain data buffer for RMS calculation
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    const getAudioLevel = (): number => {
      try {
        analyserNode.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        // Normalize and scale with a natural perceptual curve
        return Math.min(1.0, Math.max(0, rms * 3.5));
      } catch {
        return 0;
      }
    };

    const cleanup = () => {
      try {
        source.disconnect();
        highPassFilter.disconnect();
        preGain.disconnect();
        compressor.disconnect();
        makeupGain.disconnect();
        analyserNode.disconnect();
        destinationNode.disconnect();
      } catch {}

      if (audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
    };

    return {
      stream: destinationNode.stream,
      audioContext,
      analyserNode,
      getAudioLevel,
      cleanup,
    };
  } catch (err) {
    console.warn("Failed to initialize voice recording pipeline:", err);
    if (audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
    return null;
  }
}

/* =================================================================================
 * 2. SHARED PLAYBACK AUDIO ENHANCEMENT SYSTEM
 * ================================================================================= */

interface ElementEnhancementNodes {
  source: MediaElementAudioSourceNode;
  compressor: DynamicsCompressorNode;
  filter: BiquadFilterNode;
  gainNode: GainNode;
  boostGain: GainNode;
  isEnhanced: boolean;
  userVolume: number;
}

class PlaybackEnhancementManager {
  private sharedContext: AudioContext | null = null;
  private elementMap = new WeakMap<HTMLMediaElement, ElementEnhancementNodes>();
  private activeElements = new Set<HTMLMediaElement>();

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.sharedContext || this.sharedContext.state === "closed") {
      this.sharedContext = createAudioContext({ latencyHint: "playback" });
    }
    if (this.sharedContext && this.sharedContext.state === "suspended") {
      this.sharedContext.resume().catch(() => {});
    }
    return this.sharedContext;
  }

  /**
   * Connect an HTML5 audio element to the shared Web Audio enhancement pipeline.
   * Caches the MediaElementAudioSourceNode to avoid "already connected" errors.
   */
  public attachElement(
    element: HTMLMediaElement,
    initialEnhanced = true,
    initialVolume = 1.0
  ): {
    setEnhanced: (enabled: boolean) => void;
    setVolume: (vol: number) => void;
    disconnect: () => void;
    isEnhanced: boolean;
  } | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    // Check if element is already wired
    let nodes = this.elementMap.get(element);

    if (!nodes) {
      try {
        // Only set crossOrigin if loading from a distinct third-party remote origin
        const src = element.src || "";
        const isThirdPartyRemote = 
          (src.startsWith("http://") || src.startsWith("https://")) &&
          typeof window !== "undefined" && 
          !src.startsWith(window.location.origin);

        if (isThirdPartyRemote && !element.crossOrigin) {
          element.crossOrigin = "anonymous";
        }

        const source = ctx.createMediaElementSource(element);

        // High-pass filter (50Hz) to clean deep sub-bass rumble on playback
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 50;

        // Dynamics compressor for playback volume leveling (normalizes quiet recordings)
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 16;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.2;

        // Voice boost makeup gain node
        const boostGain = ctx.createGain();
        boostGain.gain.value = initialEnhanced ? 1.55 : 1.0; // +3.8 dB boost when active

        // User volume control node (0.0 to 2.0)
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(2.0, initialVolume));

        // Connect graph: source -> filter -> compressor -> boostGain -> userGain -> ctx.destination
        source.connect(filter);
        filter.connect(compressor);
        compressor.connect(boostGain);
        boostGain.connect(gainNode);
        gainNode.connect(ctx.destination);

        nodes = {
          source,
          filter,
          compressor,
          boostGain,
          gainNode,
          isEnhanced: initialEnhanced,
          userVolume: initialVolume,
        };

        this.elementMap.set(element, nodes);
        this.activeElements.add(element);
      } catch (err) {
        console.warn("Playback enhancement attach error (falling back to standard HTML5 audio):", err);
        return null;
      }
    }

    const setEnhanced = (enabled: boolean) => {
      if (!nodes || !ctx) return;
      nodes.isEnhanced = enabled;
      const targetGain = enabled ? 1.55 : 1.0;
      try {
        nodes.boostGain.gain.cancelScheduledValues(ctx.currentTime);
        nodes.boostGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
      } catch {
        nodes.boostGain.gain.value = targetGain;
      }
    };

    const setVolume = (vol: number) => {
      if (!nodes || !ctx) return;
      const safeVol = Math.max(0, Math.min(2.0, vol));
      nodes.userVolume = safeVol;
      try {
        nodes.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        nodes.gainNode.gain.setTargetAtTime(safeVol, ctx.currentTime, 0.03);
      } catch {
        nodes.gainNode.gain.value = safeVol;
      }
    };

    const disconnect = () => {
      // Keep source node attached to avoid the "already connected" re-connection error,
      // but ensure context is resumed when element plays.
      this.activeElements.delete(element);
    };

    return {
      setEnhanced,
      setVolume,
      disconnect,
      isEnhanced: nodes.isEnhanced,
    };
  }

  /**
   * Resumes shared audio context on user interaction (Play button click)
   */
  public async resumeContext(): Promise<void> {
    const ctx = this.getContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("Failed to resume playback AudioContext:", err);
      }
    }
  }
}

// Global shared playback enhancer singleton
export const playbackEnhancer = new PlaybackEnhancementManager();
