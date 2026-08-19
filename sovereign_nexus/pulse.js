'use strict';

/**
 * Pulse — Plan-First, Execute-Second Workflow Orchestrator
 *
 * Sequence
 *   1. Request Intake  → Phoenix runs T0_GATE + Context Debt
 *   2. Plan            → Phoenix formulates and signs the plan
 *   3. Audit & Grant   → Warden hashes plan, verifies signature, issues Ephemeral Grant
 *   4. Execution       → Builder validates grant, runs task in Docker Sandbox, goes Dormant
 *   5. Revelation      → Horus reads Akashic Core state delta, updates MUSE UI
 */

const crypto = require('crypto');
const akashic = require('./akashic_core');
const Phoenix = require('./phoenix');
const Warden  = require('./warden');
const Builder = require('./builder');
const Horus   = require('./horus');

class Pulse {
  constructor() {
    this.phoenix = new Phoenix();
    this.warden  = new Warden();
    this.builder = new Builder(this.warden);
    this.horus   = new Horus();
  }

  /**
   * Run a complete Pulse cycle for the given request.
   *
   * @param {object} request  — must contain at minimum { task: string }
   * @returns {object}        — { pulseId, plan, grant, result, museState }
   */
  async run(request) {
    const pulseId = `pulse-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    akashic.publishPulseStep(pulseId, 'RequestIntake', { request });

    // Step 1 & 2 — Phoenix
    const phoenixOutput = await this.phoenix.process(request, pulseId);

    // Step 3 — Warden
    const grant = await this.warden.audit(phoenixOutput, pulseId);

    // Step 4 — Builder
    const result = await this.builder.execute(phoenixOutput.plan, grant, pulseId);

    // Step 5 — Revelation (Horus reacts via Akashic Core events automatically;
    //           we just read its current state here)
    const museState = this.horus.getMuseState();

    return { pulseId, plan: phoenixOutput.plan, grant: { grantId: grant.grantId }, result, museState };
  }

  /** Expose Horus so the route can set up SSE subscriptions. */
  getHorus() {
    return this.horus;
  }

  /** Expose the Warden artifact log for auditing. */
  getArtifactLog() {
    return this.warden.getArtifactLog();
  }
}

module.exports = Pulse;
