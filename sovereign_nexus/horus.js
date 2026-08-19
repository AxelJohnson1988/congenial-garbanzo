'use strict';

/**
 * Horus — The Eye & Interface
 *
 * Archetype : Eye & Interface
 * Job Card  : Visualization, Feedback
 *
 * Responsibilities
 *   • Subscribe to the Akashic Core event bus (never reads files directly).
 *   • Maintain a live MUSE UI state object (the "Exploded Chronometer").
 *   • Emit visual cues — spinning gears, Sovereign Sentinel orb glow — when a
 *     Pulse cycle completes successfully.
 *   • Expose the current UI state so the dashboard route can serve it over SSE.
 */

const crypto = require('crypto');
const akashic = require('./akashic_core');

const AGENT_NAME    = 'Horus';
const ARCHETYPE     = 'Eye & Interface';
const JOB_CARD      = 'Visualization, Feedback';
const ALLOWED_TOOLS = ['AkashicSubscribe', 'MuseUIRender', 'VisualCue'];

class Horus {
  constructor() {
    this.agentId = `horus-${crypto.randomBytes(4).toString('hex')}`;

    /** MUSE UI state — consumed by the SSE endpoint. */
    this._museState = {
      gears: 'idle',           // 'idle' | 'spinning'
      sentinel: 'dim',         // 'dim'  | 'glowing'
      lastPulseId: null,
      lastStep: null,
      agentGrid: [],
      updatedAt: Date.now(),
    };

    /** SSE subscriber callbacks — (event: object) => void */
    this._subscribers = new Set();

    this._subscribeToAkashic();
    this._publish('Idle', null, this._museState);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Return a snapshot of the current MUSE UI state. */
  getMuseState() {
    return { ...this._museState };
  }

  /**
   * Register a Server-Sent Events subscriber.
   * @param {Function} callback  — called with each event object
   * @returns {Function}         — call to unsubscribe
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    // Immediately send the current state to the new subscriber
    callback({ type: 'snapshot', data: this.getMuseState() });
    return () => this._subscribers.delete(callback);
  }

  // ---------------------------------------------------------------------------
  // Akashic Core subscriptions
  // ---------------------------------------------------------------------------

  _subscribeToAkashic() {
    akashic.on('agent:state', (snapshot) => {
      // Rebuild the agent grid from the latest snapshots
      this._museState.agentGrid = akashic.getAllSnapshots();
      this._museState.updatedAt = Date.now();
      this._broadcast({ type: 'agent:state', data: snapshot });
    });

    akashic.on('pulse:step', (entry) => {
      this._museState.lastPulseId = entry.pulseId;
      this._museState.lastStep    = entry.step;
      this._museState.updatedAt   = Date.now();

      // Visual cue logic
      if (entry.step === 'BuilderActive') {
        this._museState.gears    = 'spinning';
        this._museState.sentinel = 'dim';
      } else if (entry.step === 'BuilderDormant') {
        this._museState.gears    = 'idle';
        this._museState.sentinel = 'glowing';
        // Sentinel glow fades after 3 s
        setTimeout(() => {
          this._museState.sentinel = 'dim';
          this._broadcast({ type: 'pulse:step', data: { ...entry, visualCue: 'sentinel:dim' } });
        }, 3000);
      }

      this._broadcast({ type: 'pulse:step', data: entry });
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _broadcast(event) {
    for (const cb of this._subscribers) {
      try { cb(event); } catch (_) { /* subscriber errors must not crash Horus */ }
    }
  }

  _publish(status, input, output) {
    akashic.publishAgentState({
      agentName: AGENT_NAME,
      agentId: this.agentId,
      archetype: ARCHETYPE,
      jobCard: JOB_CARD,
      allowedTools: ALLOWED_TOOLS,
      taskAlignedRole: 'Revelation',
      status,
      input,
      output,
    });
  }
}

module.exports = Horus;
