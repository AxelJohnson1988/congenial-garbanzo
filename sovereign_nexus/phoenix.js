'use strict';

/**
 * Phoenix — The Mind & Architect
 *
 * Archetype : Mind & Architect
 * Job Card  : Orchestration, Memory, Logic
 *
 * Responsibilities
 *   • T0_GATE validation — rejects requests that are malformed or unsafe.
 *   • Context Debt calculation via the Socratic Validation Matrix — detects
 *     logical dead-ends before a plan is passed downstream.
 *   • Ancestral Weight equation — scores each request based on historical
 *     system state to predict stability.
 *   • Strategy formulation — produces a signed plan object for the Warden.
 */

const crypto = require('crypto');
const akashic = require('./akashic_core');

const AGENT_NAME = 'Phoenix';
const ARCHETYPE  = 'Mind & Architect';
const JOB_CARD   = 'Orchestration, Memory, Logic';
const ALLOWED_TOOLS = ['T0_GATE', 'SocraticMatrix', 'AncestralWeight', 'PlanSigner'];

class Phoenix {
  constructor() {
    this.agentId = `phoenix-${crypto.randomBytes(4).toString('hex')}`;
    /** Simple in-memory history used for Ancestral Weight scoring. */
    this._history = [];
    this._publish('Idle', null, null);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Entry point for the Pulse workflow.
   * Returns a signed plan or throws if validation fails.
   *
   * @param {object} request   — arbitrary task descriptor
   * @param {string} pulseId   — unique identifier for this Pulse cycle
   * @returns {{ plan: object, signature: string }}
   */
  async process(request, pulseId) {
    this._publish('Active', request, null);

    // Step 1 — T0_GATE
    const gateResult = this._t0Gate(request);
    akashic.publishPulseStep(pulseId, 'T0_GATE', { passed: gateResult.passed, reason: gateResult.reason });

    if (!gateResult.passed) {
      this._publish('Idle', request, { error: gateResult.reason });
      throw new Error(`T0_GATE rejected: ${gateResult.reason}`);
    }

    // Step 2 — Context Debt (Socratic Validation Matrix)
    const contextDebt = this._socraticMatrix(request);
    akashic.publishPulseStep(pulseId, 'ContextDebt', { score: contextDebt });

    if (contextDebt > 0.8) {
      const reason = `Context Debt too high (${contextDebt.toFixed(3)}): logical dead-end detected`;
      this._publish('Idle', request, { error: reason });
      throw new Error(reason);
    }

    // Step 3 — Ancestral Weight
    const ancestralWeight = this._ancestralWeight(request);
    akashic.publishPulseStep(pulseId, 'AncestralWeight', { weight: ancestralWeight });

    // Step 4 — Formulate and sign plan
    const plan = {
      pulseId,
      request,
      contextDebt,
      ancestralWeight,
      strategy: this._formulate(request),
      createdAt: Date.now(),
    };
    const signature = this._sign(plan);

    this._history.push({ plan, signature, ts: Date.now() });

    const output = { plan, signature };
    this._publish('Idle', request, output);
    akashic.publishPulseStep(pulseId, 'PlanReady', { signature });

    return output;
  }

  // ---------------------------------------------------------------------------
  // Internal logic
  // ---------------------------------------------------------------------------

  /**
   * T0_GATE — basic structural validation.
   * A real system would apply deeper semantic checks.
   */
  _t0Gate(request) {
    if (!request || typeof request !== 'object') {
      return { passed: false, reason: 'Request must be a non-null object' };
    }
    if (!request.task || typeof request.task !== 'string' || !request.task.trim()) {
      return { passed: false, reason: 'Request must include a non-empty "task" string' };
    }
    if (request.task.length > 2048) {
      return { passed: false, reason: 'Task description exceeds maximum length (2048 chars)' };
    }
    return { passed: true, reason: 'OK' };
  }

  /**
   * Socratic Validation Matrix — estimates the probability that the current
   * plan leads to a logical dead-end (Context Debt score, 0–1).
   *
   * The heuristic checks for circular dependencies, undefined references, and
   * missing required fields declared in the request.
   */
  _socraticMatrix(request) {
    let debt = 0;
    const requires = Array.isArray(request.requires) ? request.requires : [];
    const provides  = Array.isArray(request.provides)  ? request.provides  : [];

    // Penalise unresolvable requirements
    const unmet = requires.filter(r => !provides.includes(r));
    debt += unmet.length * 0.1;

    // Penalise circular self-reference
    if (requires.includes(request.task)) debt += 0.3;

    // Penalise excessive dependency breadth
    if (requires.length > 10) debt += 0.2;

    return Math.min(debt, 1);
  }

  /**
   * Ancestral Weight — scores the request based on historical success rate.
   * W = (successCount + 1) / (totalCount + 2)   [Laplace smoothing]
   */
  _ancestralWeight(request) {
    const relevant = this._history.filter(h => h.plan.request.task === request.task);
    const total    = relevant.length;
    const success  = relevant.filter(h => h.plan.ancestralWeight >= 0.5).length;
    return (success + 1) / (total + 2);
  }

  /** Produce a high-level strategy description for the plan. */
  _formulate(request) {
    return {
      steps: ['validate', 'audit', 'execute', 'reveal'],
      taskSummary: request.task,
      payload: request.payload || null,
    };
  }

  /** Sign the plan with a HMAC-SHA256 derived from its JSON representation. */
  _sign(plan) {
    const secret = process.env.NEXUS_PLAN_SECRET || 'sovereign-nexus-dev-secret';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(plan)).digest('hex');
  }

  _publish(status, input, output) {
    akashic.publishAgentState({
      agentName: AGENT_NAME,
      agentId: this.agentId,
      archetype: ARCHETYPE,
      jobCard: JOB_CARD,
      allowedTools: ALLOWED_TOOLS,
      taskAlignedRole: 'Strategy Formulation',
      status,
      input,
      output,
    });
  }
}

module.exports = Phoenix;
