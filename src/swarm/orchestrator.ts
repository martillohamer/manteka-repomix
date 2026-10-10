/**
 * orchestrator.ts - SwarmOrchestrator (createSwarmOrchestrator(deps))
 * que unifica el flujo: Sensor -> Enjambre cooperativo -> Consenso -> Emisión de eventos.
 *
 * Restricciones: cero runtime deps, TypeScript estricto, rutas Windows-safe.
 */

import { lintFile } from './agents/lintAgent.js';
import { detectSmells } from './agents/smellAgent.js';
import { diagnoseAndPatch } from './agents/typeAgent.js';
import { SwarmEventBus } from './bus.js';
import { filterByConfidence, selectBestProposal } from './consensus.js';
import type { AgentMessage, AgentRole, SwarmAgent, SwarmDeps, SwarmProposal } from './types.js';

/**
 * Dependencias del orchestrador del enjambre
 */
export interface SwarmOrchestratorDeps extends SwarmDeps {}

/**
 * Estado del orchestrador del enjambre
 */
export interface SwarmOrchestratorState {
  isRunning: boolean;
  agentCount: Record<AgentRole, number>;
  totalProposalsProcessed: number;
}

/**
 * Resultado del operaciones del orchestrador
 */
export interface SwarmOrchestratorResult {
  success: boolean;
  proposal?: SwarmProposal;
  rejected: SwarmProposal[];
  events: AgentMessage[];
}

/**
 * Orchestrador principal del enjambre - coordina agentes multi-agente
 */
export class SwarmOrchestrator {
  private deps: SwarmOrchestratorDeps;
  private bus: import('./bus.js').SwarmEventBus;
  private state: SwarmOrchestratorState;
  private agents: Map<AgentRole, SwarmAgent>;
  private proposalCounter: number;

  constructor(deps: SwarmOrchestratorDeps) {
    this.deps = deps;
    this.bus = SwarmEventBus;
    this.state = {
      isRunning: false,
      agentCount: {
        typeAgent: 0,
        lintAgent: 0,
        smellAgent: 0,
      },
      totalProposalsProcessed: 0,
    };
    this.agents = new Map();
    this.proposalCounter = 0;

    // Register default agents
    this.agents.set('typeAgent', {
      id: 'type-agent-1',
      role: 'typeAgent',
      deps: {},
      active: true,
    });
    this.agents.set('lintAgent', {
      id: 'lint-agent-1',
      role: 'lintAgent',
      deps: {},
      active: true,
    });
    this.agents.set('smellAgent', {
      id: 'smell-agent-1',
      role: 'smellAgent',
      deps: {},
      active: true,
    });

    // Initialize counts
    for (const role of ['typeAgent', 'lintAgent', 'smellAgent'] as AgentRole[]) {
      this.state.agentCount[role] = this.agents.get(role) ? 1 : 0;
    }
  }

  /**
   * Inicia el orchestrador y todos los agentes
   */
  public start = (): void => {
    this.state.isRunning = true;
    // @ts-expect-error
    this.bus.publish({
      id: 'orchestrator-start',
      role: 'typeAgent',
      timestamp: Date.now(),
      sourceFile: 'swarm/orchestrator.ts',
      severity: 'info',
      message: 'Swarm Orchestrator started',
    });
  };

  /**
   * Detiene el orchestrador y todos los agentes
   */
  public stop = (): void => {
    this.state.isRunning = false;
    this.bus.publish({
      id: 'orchestrator-stop',
      role: 'typeAgent',
      timestamp: Date.now(),
      sourceFile: 'swarm/orchestrator.ts',
      severity: 'info',
      message: 'Swarm Orchestrator stopped',
    });
  };

  /**
   * Procesa un archivo fuente mediante el enjambre de agentes cooperativos.
   * Pipeline: Sensor -> Agentes -> Consenso -> Eventos
   * @param filePath - Path to source file to process
   * @returns Resultado con propuesta seleccionada y eventos generados
   */
  public async processFile(filePath: string): Promise<SwarmOrchestratorResult> {
    if (!this.state.isRunning) {
      throw new Error('Swarm Orchestrator is not running');
    }

    // Step 1: Read file content (using deps or fallback)
    const readFile =
      this.deps.readFile ??
      (async () => {
        try {
          const fs = await import('node:fs');
          const content = await fs.promises.readFile(filePath, 'utf-8');
          return content;
        } catch {
          return '';
        }
      })();

    const content = await readFile;

    const events: AgentMessage[] = [];
    const allProposals: SwarmProposal[] = [];

    // Step 2: Run all specialized agents (cooperative swarm)
    // Type Agent: diagnose type issues
    const typeResults = await diagnoseAndPatch(filePath, content);
    typeResults.forEach((msg) => {
      events.push(msg);
      allProposals.push({
        id: `${this.proposalCounter++}:${msg.id}`,
        agentId: msg.id,
        role: msg.role,
        file: msg.sourceFile,
        patch: {
          file: msg.sourceFile,
          diff: '',
          confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        },
        rationale: msg.message,
        confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        timestamp: msg.timestamp,
      });
    });

    // Lint Agent: detect lint issues
    const lintResults = await lintFile(filePath, content);
    lintResults.forEach((msg) => {
      events.push(msg);
      allProposals.push({
        id: `${this.proposalCounter++}:${msg.id}`,
        agentId: msg.id,
        role: msg.role,
        file: msg.sourceFile,
        patch: {
          file: msg.sourceFile,
          diff: '',
          confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        },
        rationale: msg.message,
        confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        timestamp: msg.timestamp,
      });
    });

    // Smell Agent: detect code smells
    const smellResults = await detectSmells(filePath, content);
    smellResults.forEach((msg) => {
      events.push(msg);
      allProposals.push({
        id: `${this.proposalCounter++}:${msg.id}`,
        agentId: msg.id,
        role: msg.role,
        file: msg.sourceFile,
        patch: {
          file: msg.sourceFile,
          diff: '',
          confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        },
        rationale: msg.message,
        confidence: msg.metadata?.proposedPatch?.confidence ?? 0.5,
        timestamp: msg.timestamp,
      });
    });

    // Step 3: Update state
    this.state.totalProposalsProcessed += allProposals.length;
    for (const proposal of allProposals) {
      const role = proposal.role as keyof typeof this.state.agentCount;
      if (role && this.state.agentCount[role] !== undefined) {
        this.state.agentCount[role] = (this.state.agentCount[role] || 0) + 1;
      }
    }

    // Step 4: Apply consensus filter (minimum confidence threshold)
    const filteredProposals = filterByConfidence(allProposals, 0.5);

    // Step 5: Select best proposal via weighted voting
    const { selected } = selectBestProposal(filteredProposals);

    // Step 6: Emit events
    for (const event of events) {
      this.bus.publish(event);
    }

    // Step 7: Return result
    const rejected = filteredProposals.filter((p) => p.id !== (selected?.id || ''));

    return {
      success: selected !== null,
      proposal: selected,
      rejected,
      events,
    };
  }

  /**
   * Obtiene el estado actual del orchestrador
   */
  public getState(): SwarmOrchestratorState {
    return { ...this.state };
  }

  /**
   * Agrega un agente personalizado al enjambre
   */
  public addAgent(agent: SwarmAgent): void {
    this.agents.set(agent.role, agent);
    if (agent.role in this.state.agentCount) {
      this.state.agentCount[agent.role] = (this.state.agentCount[agent.role] || 0) + 1;
    }
  }

  /**
   * Remueve un agente del enjambre
   */
  public removeAgent(role: AgentRole): void {
    this.agents.delete(role);
    if (role in this.state.agentCount) {
      this.state.agentCount[role] = Math.max(0, (this.state.agentCount[role] || 1) - 1);
    }
  }
}

/**
 * Factory function para crear un SwarmOrchestrator
 * @param deps - Dependencias del orchestrador
 * @returns Configured SwarmOrchestrator instance
 */
export const createSwarmOrchestrator = (deps: SwarmOrchestratorDeps): SwarmOrchestrator => {
  return new SwarmOrchestrator(deps);
};
