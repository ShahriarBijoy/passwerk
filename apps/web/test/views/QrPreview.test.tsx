/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrPreview } from '@/views/parts/QrPreview.tsx';
import { mount } from './render.tsx';

describe('QrPreview', () => {
  it('renders the SVG as an image with its payload', () => {
    mount(
      <QrPreview
        lang="en"
        carrier={{
          ok: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          payload: 'https://p.example/1',
        }}
      />,
    );
    const img = screen.getByTestId('qr-image') as HTMLImageElement;
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(screen.getByTestId('qr-payload').textContent).toBe('https://p.example/1');
  });
  it('shows the reason in the chosen language when there is no QR', () => {
    mount(
      <QrPreview
        lang="de"
        carrier={{ ok: false, message: { de: 'kein https', en: 'no https' } }}
      />,
    );
    expect(screen.getByTestId('qr-none').textContent).toContain('kein https');
  });
});
