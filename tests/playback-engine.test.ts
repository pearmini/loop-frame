import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngine, reduce, type EngineEffect, type EngineState } from '../src/shared/playback-engine';

function effectTypes(effects: EngineEffect[]): string[] {
  return effects.map((effect) => effect.type);
}

describe('playback engine', () => {
  it('starts the display clock only after the page loads', () => {
    const started = reduce(createEngine(2), { type: 'start' });
    assert.equal(started.state.phase, 'loading');
    assert.deepEqual(effectTypes(started.effects), [
      'clear-timers',
      'close-active-view',
      'clear-error',
      'start-load-timer',
      'open-view',
    ]);
    const loaded = reduce(started.state, { type: 'loaded', generation: started.state.generation });
    assert.equal(loaded.state.phase, 'showing');
    assert.ok(effectTypes(loaded.effects).includes('start-display-timer'));
    assert.equal(effectTypes(loaded.effects).includes('start-load-timer'), false);
  });

  it('shows an error and then advances after a failed or stalled load', () => {
    const started = reduce(createEngine(2), { type: 'start' });
    const failed = reduce(started.state, { type: 'load-timeout', generation: started.state.generation });
    assert.equal(failed.state.phase, 'error');
    assert.ok(effectTypes(failed.effects).includes('close-active-view'));
    assert.ok(effectTypes(failed.effects).includes('show-error'));
    assert.ok(effectTypes(failed.effects).includes('start-error-timer'));
    const advanced = reduce(failed.state, { type: 'error-elapsed', generation: failed.state.generation });
    assert.equal(advanced.state.index, 1);
    assert.equal(advanced.state.phase, 'loading');
    assert.ok(effectOrder(advanced.effects, 'close-active-view', 'open-view'));
  });

  it('freezes the current page while paused', () => {
    let state = reduce(createEngine(1), { type: 'start' }).state;
    state = reduce(state, { type: 'loaded', generation: state.generation }).state;
    const paused = reduce(state, { type: 'pause' });
    assert.equal(paused.state.phase, 'paused-showing');
    const ignored = reduce(paused.state, { type: 'display-elapsed', generation: paused.state.generation });
    assert.equal(ignored.effects.length, 0);
    assert.equal(ignored.state.phase, 'paused-showing');
    const resumed = reduce(paused.state, { type: 'resume' });
    assert.equal(resumed.state.phase, 'showing');
    assert.deepEqual(effectTypes(resumed.effects), ['resume-timer']);
  });

  it('ignores stale events from a view that was already replaced', () => {
    const started = reduce(createEngine(2), { type: 'start' });
    const firstGeneration = started.state.generation;
    const loaded = reduce(started.state, { type: 'loaded', generation: firstGeneration });
    const advanced = reduce(loaded.state, { type: 'display-elapsed', generation: firstGeneration });
    const stale = reduce(advanced.state, { type: 'loaded', generation: firstGeneration });
    assert.equal(stale.effects.length, 0);
    assert.equal(stale.state.generation, advanced.state.generation);
    assert.notEqual(stale.state.generation, firstGeneration);
  });

  it('keeps a single website open instead of reloading it', () => {
    const state = showing(createEngine(1));
    const elapsed = reduce(state, { type: 'display-elapsed', generation: state.generation });
    assert.equal(elapsed.state.phase, 'showing');
    assert.equal(elapsed.state.index, 0);
    assert.equal(elapsed.state.generation, state.generation);
    assert.equal(elapsed.effects.length, 0);
    assert.equal(reduce(state, { type: 'next' }).effects.length, 0);
    assert.equal(reduce(state, { type: 'previous' }).effects.length, 0);
    const loaded = reduce(reduce(createEngine(1), { type: 'start' }).state, {
      type: 'loaded',
      generation: 1,
    });
    assert.equal(effectTypes(loaded.effects).includes('start-display-timer'), false);
  });

  it('wraps next and previous and closes the current view', () => {
    let state = showing(createEngine(3));
    const next = reduce(state, { type: 'next' });
    assert.equal(next.state.index, 1);
    assert.ok(effectOrder(next.effects, 'close-active-view', 'open-view'));
    state = showingAt(next.state, 0);
    const previous = reduce(state, { type: 'previous' });
    assert.equal(previous.state.index, 2);
  });

  it('clears the active view on exit', () => {
    const state = showing(createEngine(2));
    const exited = reduce(state, { type: 'exit' });
    assert.equal(exited.state.phase, 'idle');
    assert.ok(effectTypes(exited.effects).includes('close-active-view'));
    assert.ok(effectTypes(exited.effects).includes('clear-timers'));
    assert.ok(effectTypes(exited.effects).includes('exit-playback'));
    const after = reduce(exited.state, { type: 'loaded', generation: state.generation });
    assert.equal(after.effects.length, 0);
  });
});

function showing(state: EngineState): EngineState {
  const started = reduce(state, { type: 'start' });
  return reduce(started.state, { type: 'loaded', generation: started.state.generation }).state;
}

function showingAt(state: EngineState, index: number): EngineState {
  let current = state;
  while (current.index !== index) {
    const stepped = reduce(current, { type: 'next' });
    current = reduce(stepped.state, { type: 'loaded', generation: stepped.state.generation }).state;
  }
  return current;
}

function effectOrder(effects: EngineEffect[], first: string, second: string): boolean {
  const names = effectTypes(effects);
  return names.indexOf(first) !== -1 && names.indexOf(first) < names.indexOf(second);
}
