/**
 * Sound Manager
 * Handles audio playback for notifications and events
 */

import { getState } from '../core/state.js';

class SoundManager {
  constructor() {
    this.sounds = new Map();
    this.audioContext = null;
    this.initialized = false;
  }

  /**
   * Initialize the sound manager
   */
  async init() {
    if (this.initialized) return;

    // Create AudioContext (lazy initialization for better browser compatibility)
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Generate procedural sounds
    await this.generateSounds();

    this.initialized = true;
  }

  /**
   * Generate procedural sounds using Web Audio API
   */
  async generateSounds() {
    // Success sound: Pleasant ascending tones (C-E-G chord)
    this.sounds.set('success', this.createToneSequence([
      { frequency: 523.25, duration: 0.1 }, // C5
      { frequency: 659.25, duration: 0.1 }, // E5
      { frequency: 783.99, duration: 0.15 } // G5
    ]));

    // Error sound: Descending dissonant tones
    this.sounds.set('error', this.createToneSequence([
      { frequency: 440, duration: 0.1 },  // A4
      { frequency: 369.99, duration: 0.15 } // F#4
    ]));

    // Info sound: Single soft tone
    this.sounds.set('info', this.createToneSequence([
      { frequency: 523.25, duration: 0.12 } // C5
    ]));
  }

  /**
   * Create a tone sequence
   * @param {Array} sequence - Array of {frequency, duration} objects
   * @returns {AudioBuffer}
   */
  createToneSequence(sequence) {
    const sampleRate = this.audioContext.sampleRate;

    // Calculate total duration
    const totalDuration = sequence.reduce((sum, tone) => sum + tone.duration, 0);
    const totalSamples = Math.floor(sampleRate * totalDuration);

    // Create audio buffer
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let currentSample = 0;

    // Generate each tone in sequence
    sequence.forEach((tone, index) => {
      const { frequency, duration } = tone;
      const samples = Math.floor(sampleRate * duration);

      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate;
        const envelope = this.createEnvelope(i, samples);

        // Generate sine wave with envelope
        data[currentSample + i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }

      currentSample += samples;
    });

    return buffer;
  }

  /**
   * Create ADSR envelope for natural sound
   * @param {number} sample - Current sample index
   * @param {number} totalSamples - Total samples in tone
   * @returns {number} Envelope value (0-1)
   */
  createEnvelope(sample, totalSamples) {
    const attackTime = 0.05;
    const releaseTime = 0.2;

    const attackSamples = totalSamples * attackTime;
    const releaseSamples = totalSamples * releaseTime;

    // Attack phase
    if (sample < attackSamples) {
      return sample / attackSamples;
    }

    // Release phase
    if (sample > totalSamples - releaseSamples) {
      return (totalSamples - sample) / releaseSamples;
    }

    // Sustain phase
    return 1.0;
  }

  /**
   * Play a sound
   * @param {string} soundName - Name of the sound ('success', 'error', 'info')
   * @param {number} volume - Volume (0-1), defaults to settings value
   */
  async play(soundName, volume = null) {
    if (!this.initialized) {
      await this.init();
    }

    // Check if sounds are enabled in settings
    const settings = getState('settings');
    if (!settings?.soundEnabled) {
      return;
    }

    // Get volume from settings or parameter
    const finalVolume = volume !== null ? volume : (settings?.soundVolume || 0.7);

    const buffer = this.sounds.get(soundName);
    if (!buffer) {
      console.warn(`Sound "${soundName}" not found`);
      return;
    }

    try {
      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create source and gain nodes
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = buffer;
      gainNode.gain.value = finalVolume;

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Play
      source.start(0);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  /**
   * Play success sound
   */
  playSuccess() {
    return this.play('success');
  }

  /**
   * Play error sound
   */
  playError() {
    return this.play('error');
  }

  /**
   * Play info sound
   */
  playInfo() {
    return this.play('info');
  }
}

// Export singleton instance
export const soundManager = new SoundManager();
