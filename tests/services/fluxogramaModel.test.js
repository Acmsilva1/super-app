import { describe, expect, it } from 'vitest';

import {
  applyPersistedData,
  getGraphPayload,
  resetGraphState,
  state,
} from '../../features/fluxograma/model/flowchartModel.js';

describe('flowchartModel zoom persistence', () => {
  it('serializa o zoom atual no payload do grafo', () => {
    resetGraphState();
    state.zoom = 1.35;

    const payload = getGraphPayload();

    expect(payload.zoom).toBe(1.35);
  });

  it('restaura o zoom persistido e usa 1 como fallback', () => {
    resetGraphState();
    applyPersistedData({ zoom: 1.6 });
    expect(state.zoom).toBe(1.6);

    applyPersistedData({});
    expect(state.zoom).toBe(1);
  });
});
