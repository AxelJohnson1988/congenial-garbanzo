'use strict';

/**
 * Akashic Core — Shared Event Bus
 *
 * All agents publish state changes here; Horus (and the dashboard SSE
 * endpoint) subscribe to these events instead of polling agents directly.
 *
 * Events emitted:
 *   'agent:state'  — { agentName, agentId, status, input, output, ts }
 *   'pulse:step'   — { step, pulseId, data, ts }
 */

const EventEmitter = require('events');

class AkashicCore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    /** @type {Map<string, object>} agentId → latest state snapshot */
    this._agentSnapshots = new Map();
    /** @type {Array<object>} ordered log of all pulse steps */
    this._pulseLog = [];
  }

  /**
   * Publish an agent state update.
   * @param {object} snapshot
   * @param {string} snapshot.agentName
   * @param {string} snapshot.agentId
   * @param {string} snapshot.status   — 'Idle'|'Active'|'Dormant'|'Awaiting Grant'
   * @param {*}      snapshot.input
   * @param {*}      snapshot.output
   */
  publishAgentState(snapshot) {
    const event = { ...snapshot, ts: Date.now() };
    this._agentSnapshots.set(snapshot.agentId, event);
    this.emit('agent:state', event);
  }

  /**
   * Publish a step in the Pulse workflow.
   * @param {string} pulseId
   * @param {string} step
   * @param {object} data
   */
  publishPulseStep(pulseId, step, data) {
    const entry = { pulseId, step, data, ts: Date.now() };
    this._pulseLog.push(entry);
    this.emit('pulse:step', entry);
  }

  /** Return the current snapshot for every registered agent. */
  getAllSnapshots() {
    return Array.from(this._agentSnapshots.values());
  }

  /** Return the pulse log (most-recent-first). */
  getPulseLog(limit = 100) {
    return this._pulseLog.slice(-limit).reverse();
  }
}

// Singleton — the whole process shares one event bus.
module.exports = new AkashicCore();
