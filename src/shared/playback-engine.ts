import { nextIndex, previousIndex } from './playlist';

export type EnginePhase =
  | 'idle'
  | 'loading'
  | 'showing'
  | 'error'
  | 'paused-loading'
  | 'paused-showing'
  | 'paused-error';

export interface EngineState {
  phase: EnginePhase;
  generation: number;
  index: number;
  siteCount: number;
  paused: boolean;
}

export type EngineEvent =
  | { type: 'start' }
  | { type: 'loaded'; generation: number }
  | { type: 'load-failed'; generation: number }
  | { type: 'load-timeout'; generation: number }
  | { type: 'display-elapsed'; generation: number }
  | { type: 'error-elapsed'; generation: number }
  | { type: 'page-crashed'; generation: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'exit' };

export type EngineEffect =
  | { type: 'clear-timers' }
  | { type: 'close-active-view' }
  | { type: 'clear-error' }
  | { type: 'show-error'; index: number }
  | { type: 'start-load-timer'; generation: number }
  | { type: 'start-display-timer'; generation: number }
  | { type: 'start-error-timer'; generation: number }
  | { type: 'open-view'; index: number; generation: number }
  | { type: 'pause-timer' }
  | { type: 'resume-timer' }
  | { type: 'exit-playback' };

export interface ReduceResult {
  state: EngineState;
  effects: EngineEffect[];
}

export function createEngine(siteCount: number): EngineState {
  return { phase: 'idle', generation: 0, index: 0, siteCount, paused: false };
}

export function reduce(state: EngineState, event: EngineEvent): ReduceResult {
  switch (event.type) {
    case 'start':
      if (state.siteCount <= 0) return none(state);
      return beginLoad(state, 0);
    case 'loaded':
      if (!sameGeneration(state, event.generation) || state.phase !== 'loading') return none(state);
      return {
        state: { ...state, phase: 'showing', paused: false },
        effects: [
          { type: 'clear-timers' },
          { type: 'clear-error' },
          { type: 'start-display-timer', generation: state.generation },
        ],
      };
    case 'load-failed':
    case 'load-timeout':
      if (!sameGeneration(state, event.generation) || state.phase !== 'loading') return none(state);
      return fail(state);
    case 'display-elapsed':
      if (!sameGeneration(state, event.generation) || state.phase !== 'showing') return none(state);
      return beginLoad(state, nextIndex(state.index, state.siteCount));
    case 'error-elapsed':
      if (!sameGeneration(state, event.generation) || state.phase !== 'error') return none(state);
      return beginLoad(state, nextIndex(state.index, state.siteCount));
    case 'page-crashed':
      if (!sameGeneration(state, event.generation)) return none(state);
      if (state.phase !== 'loading' && state.phase !== 'showing' && !state.paused) return none(state);
      if (state.phase === 'paused-error' || state.phase === 'error') return none(state);
      return fail(state);
    case 'pause':
      if (state.paused || state.phase === 'idle') return none(state);
      return {
        state: { ...state, paused: true, phase: pausedPhase(state.phase) },
        effects: [{ type: 'pause-timer' }],
      };
    case 'resume':
      if (!state.paused) return none(state);
      return {
        state: { ...state, paused: false, phase: resumedPhase(state.phase) },
        effects: [{ type: 'resume-timer' }],
      };
    case 'next':
      if (state.phase === 'idle') return none(state);
      return beginLoad(state, nextIndex(state.index, state.siteCount));
    case 'previous':
      if (state.phase === 'idle') return none(state);
      return beginLoad(state, previousIndex(state.index, state.siteCount));
    case 'exit':
      if (state.phase === 'idle') return none(state);
      return {
        state: { ...state, phase: 'idle', paused: false, generation: state.generation + 1 },
        effects: [
          { type: 'clear-timers' },
          { type: 'close-active-view' },
          { type: 'clear-error' },
          { type: 'exit-playback' },
        ],
      };
    default:
      return none(state);
  }
}

function beginLoad(state: EngineState, index: number): ReduceResult {
  const generation = state.generation + 1;
  const normalized = state.siteCount <= 0 ? 0 : ((index % state.siteCount) + state.siteCount) % state.siteCount;
  return {
    state: {
      phase: 'loading',
      generation,
      index: normalized,
      siteCount: state.siteCount,
      paused: false,
    },
    effects: [
      { type: 'clear-timers' },
      { type: 'close-active-view' },
      { type: 'clear-error' },
      { type: 'start-load-timer', generation },
      { type: 'open-view', index: normalized, generation },
    ],
  };
}

function fail(state: EngineState): ReduceResult {
  return {
    state: { ...state, phase: 'error', paused: false },
    effects: [
      { type: 'clear-timers' },
      { type: 'close-active-view' },
      { type: 'show-error', index: state.index },
      { type: 'start-error-timer', generation: state.generation },
    ],
  };
}

function sameGeneration(state: EngineState, generation: number): boolean {
  return state.phase !== 'idle' && state.generation === generation;
}

function pausedPhase(phase: EnginePhase): EnginePhase {
  if (phase === 'loading') return 'paused-loading';
  if (phase === 'showing') return 'paused-showing';
  if (phase === 'error') return 'paused-error';
  return phase;
}

function resumedPhase(phase: EnginePhase): EnginePhase {
  if (phase === 'paused-loading') return 'loading';
  if (phase === 'paused-showing') return 'showing';
  if (phase === 'paused-error') return 'error';
  return phase;
}

function none(state: EngineState): ReduceResult {
  return { state, effects: [] };
}
