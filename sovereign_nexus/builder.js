'use strict';

/**
 * The Builder — The Hands & Engine
 *
 * Archetype : Hands & Engine
 * Job Card  : Execution, File I/O
 *
 * Responsibilities
 *   • Remain Dormant until it receives a valid Ephemeral Grant from the Warden.
 *   • Execute the strategy produced by Phoenix (file writes, script calls) once
 *     the grant is validated.
 *   • Return to Dormant state immediately after each task.
 *
 * Sandbox note: In production the Builder runs inside a Docker container with
 * a restricted filesystem mount (the registered workspace only).  This module
 * implements the Builder's control logic; actual sandboxed execution would be
 * delegated to a container runtime via a Docker API call.
 */

const crypto = require('crypto');
const akashic = require('./akashic_core');

const AGENT_NAME    = 'The Builder';
const ARCHETYPE     = 'Hands & Engine';
const JOB_CARD      = 'Execution, File I/O';
const ALLOWED_TOOLS = ['FileWrite', 'ScriptExecute', 'DockerSandbox'];

class Builder {
  constructor(warden) {
    if (!warden) throw new Error('Builder requires a Warden instance');
    this.agentId  = `builder-${crypto.randomBytes(4).toString('hex')}`;
    this._warden  = warden;
    this._dormant = true;
    this._publish('Dormant', null, null);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Wake the Builder, validate the Ephemeral Grant, execute the plan's
   * strategy, then immediately return to Dormant.
   *
   * @param {object} plan      — from Phoenix
   * @param {object} grant     — { grantId, grantToken } from Warden
   * @param {string} pulseId
   * @returns {object}         — execution result
   */
  async execute(plan, grant, pulseId) {
    this._publish('Awaiting Grant', { plan, grant }, null);
    akashic.publishPulseStep(pulseId, 'BuilderAwaitingGrant', { grantId: grant.grantId });

    // Validate the Ephemeral Grant before doing anything
    const grantValid = this._warden.validateGrant(grant.grantId, grant.grantToken);
    if (!grantValid) {
      this._publish('Dormant', { plan, grant }, { error: 'Invalid or expired grant' });
      throw new Error('Builder: Ephemeral Grant invalid or expired');
    }

    this._dormant = false;
    this._publish('Active', plan, null);
    akashic.publishPulseStep(pulseId, 'BuilderActive', { pulseId });

    let result;
    try {
      result = await this._runInSandbox(plan.strategy, pulseId);
    } finally {
      // Always return to Dormant — even on error
      this._dormant = true;
      this._publish('Dormant', plan, result || { error: 'Execution failed' });
    }

    akashic.publishPulseStep(pulseId, 'BuilderDormant', { result });
    return result;
  }

  get isDormant() {
    return this._dormant;
  }

  // ---------------------------------------------------------------------------
  // Internal sandbox execution
  // ---------------------------------------------------------------------------

  /**
   * Simulate sandboxed execution.
   *
   * In production this dispatches to a Docker container via the Docker Engine
   * API (e.g., POST /containers/{id}/exec).  Here we model the outcome without
   * performing real I/O so that the module is safe to run in any environment.
   *
   * @param {object} strategy  — the strategy object from Phoenix
   * @param {string} pulseId
   */
  async _runInSandbox(strategy, pulseId) {
    // Simulate async work (e.g., a Docker exec round-trip)
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      pulseId,
      executed: true,
      steps: strategy.steps,
      taskSummary: strategy.taskSummary,
      sandbox: 'docker',
      completedAt: Date.now(),
    };
  }

  _publish(status, input, output) {
    akashic.publishAgentState({
      agentName: AGENT_NAME,
      agentId: this.agentId,
      archetype: ARCHETYPE,
      jobCard: JOB_CARD,
      allowedTools: ALLOWED_TOOLS,
      taskAlignedRole: 'Task Execution',
      status,
      input,
      output,
    });
  }
}

module.exports = Builder;
