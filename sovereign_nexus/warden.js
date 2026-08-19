'use strict';

/**
 * The Warden — The Shield & Auditor
 *
 * Archetype : Shield & Auditor
 * Job Card  : Security, Privacy, Integrity
 *
 * Responsibilities
 *   • Maintain the PHOENIX_AGENT_SYSTEM_ARTIFACT_LOG — an append-only ledger of
 *     every action taken in the system.
 *   • Hash Phoenix's plan with SHA-256 and verify its HMAC signature.
 *   • Issue an Ephemeral Grant (time-boxed token) when the plan is verified.
 *   • Revoke the Ephemeral Grant after the configured TTL.
 *
 * Security note: The Warden does NOT store, read, or expose any credential
 * files.  The Ephemeral Grant is a short-lived in-memory token only; it is
 * passed to the Builder so the Builder knows the plan was audited.
 */

const crypto = require('crypto');
const akashic = require('./akashic_core');

const AGENT_NAME    = 'The Warden';
const ARCHETYPE     = 'Shield & Auditor';
const JOB_CARD      = 'Security, Privacy, Integrity';
const ALLOWED_TOOLS = ['SHA256Hash', 'HMACVerify', 'EphemeralGrant', 'ArtifactLog'];
const GRANT_TTL_MS  = 50; // Ephemeral Grant lifetime

class Warden {
  constructor() {
    this.agentId = `warden-${crypto.randomBytes(4).toString('hex')}`;
    /** PHOENIX_AGENT_SYSTEM_ARTIFACT_LOG — append-only array. */
    this._artifactLog = [];
    /** Active grants keyed by grantId. */
    this._activeGrants = new Map();
    this._publish('Idle', null, null);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Audit the plan produced by Phoenix.
   *
   * @param {{ plan: object, signature: string }} phoenixOutput
   * @param {string} pulseId
   * @returns {{ grantId: string, grantToken: string, expiresAt: number }}
   */
  async audit(phoenixOutput, pulseId) {
    this._publish('Active', phoenixOutput, null);

    const { plan, signature } = phoenixOutput;

    // 1. SHA-256 hash of the raw plan JSON (integrity fingerprint)
    const planJson  = JSON.stringify(plan);
    const planHash  = crypto.createHash('sha256').update(planJson).digest('hex');

    // 2. Re-derive and verify the HMAC signature from Phoenix
    const secret      = process.env.NEXUS_PLAN_SECRET || 'sovereign-nexus-dev-secret';
    const expectedSig = crypto.createHmac('sha256', secret).update(planJson).digest('hex');
    const sigValid    = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSig, 'hex'),
    );

    this._appendLog({ pulseId, planHash, sigValid, ts: Date.now() });
    akashic.publishPulseStep(pulseId, 'WardenAudit', { planHash, sigValid });

    if (!sigValid) {
      this._publish('Idle', phoenixOutput, { error: 'Signature mismatch — plan rejected' });
      throw new Error('Warden: plan signature verification failed');
    }

    // 3. Issue Ephemeral Grant
    const grant = this._issueGrant(pulseId, planHash);

    this._publish('Idle', phoenixOutput, { grantId: grant.grantId, expiresAt: grant.expiresAt });
    akashic.publishPulseStep(pulseId, 'EphemeralGrantIssued', {
      grantId: grant.grantId,
      expiresAt: grant.expiresAt,
    });

    return grant;
  }

  /**
   * Validate that a grant token is still active.
   * Called by the Builder before executing.
   */
  validateGrant(grantId, grantToken) {
    const grant = this._activeGrants.get(grantId);
    if (!grant) return false;
    if (Date.now() > grant.expiresAt) {
      this._activeGrants.delete(grantId);
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(grant.token, 'hex'),
      Buffer.from(grantToken, 'hex'),
    );
  }

  /** Return a read-only copy of the artifact log. */
  getArtifactLog() {
    return this._artifactLog.slice();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _issueGrant(pulseId, planHash) {
    const grantId    = crypto.randomBytes(16).toString('hex');
    const grantToken = crypto.randomBytes(32).toString('hex');
    const expiresAt  = Date.now() + GRANT_TTL_MS;

    this._activeGrants.set(grantId, { token: grantToken, expiresAt, pulseId, planHash });

    // Auto-revoke after TTL
    setTimeout(() => {
      this._activeGrants.delete(grantId);
    }, GRANT_TTL_MS);

    return { grantId, grantToken, expiresAt };
  }

  _appendLog(entry) {
    // Immutability: freeze each entry so it cannot be mutated after logging.
    this._artifactLog.push(Object.freeze({ ...entry }));
  }

  _publish(status, input, output) {
    akashic.publishAgentState({
      agentName: AGENT_NAME,
      agentId: this.agentId,
      archetype: ARCHETYPE,
      jobCard: JOB_CARD,
      allowedTools: ALLOWED_TOOLS,
      taskAlignedRole: 'Security Audit',
      status,
      input,
      output,
    });
  }
}

module.exports = Warden;
