import { canonicalJson } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('canonicalJson', () => {
  it('sorts keys recursively, keeps array order, ends with a newline', () => {
    const out = canonicalJson({ b: [{ z: 1, a: 2 }], a: { y: null, x: 'v' } });
    expect(out).toBe(
      '{\n  "a": {\n    "x": "v",\n    "y": null\n  },\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    }\n  ]\n}\n',
    );
  });
});
