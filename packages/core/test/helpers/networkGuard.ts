/**
 * Socket-level network guards for the sovereignty proof (ADR D-013). Every network API
 * Node offers is replaced by a function that records the attempt and throws, so a single
 * call anywhere in the exercised surface fails the test. Shared by core and server.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export interface Attempt {
  api: string;
  target: string;
}

export interface NetworkGuard {
  attempts: Attempt[];
  install(): void;
  restore(): void;
}

export function createNetworkGuard(): NetworkGuard {
  const attempts: Attempt[] = [];
  const restores: Array<() => void> = [];

  function guard<T extends object>(obj: T, key: keyof T, api: string): void {
    const original = obj[key];
    const blocked = (...args: unknown[]) => {
      attempts.push({ api, target: String(args[0] ?? '') });
      throw new Error(`passwerk sovereignty: network attempt via ${api}`);
    };
    (obj as Record<keyof T, unknown>)[key] = blocked;
    restores.push(() => {
      (obj as Record<keyof T, unknown>)[key] = original;
    });
  }

  return {
    attempts,
    install() {
      guard(net.Socket.prototype, 'connect', 'net.Socket.prototype.connect');
      guard(tls, 'connect', 'tls.connect');
      guard(dns, 'lookup', 'dns.lookup');
      guard(dns, 'resolve', 'dns.resolve');
      guard(dns, 'resolve4', 'dns.resolve4');
      guard(dns, 'resolve6', 'dns.resolve6');
      guard(dns.promises, 'lookup', 'dns.promises.lookup');
      guard(dns.promises, 'resolve', 'dns.promises.resolve');
      guard(dns.promises, 'resolve4', 'dns.promises.resolve4');
      guard(dns.promises, 'resolve6', 'dns.promises.resolve6');
      guard(http, 'request', 'http.request');
      guard(http, 'get', 'http.get');
      guard(https, 'request', 'https.request');
      guard(https, 'get', 'https.get');
      guard(globalThis, 'fetch', 'fetch');
    },
    restore() {
      for (const restore of restores.splice(0).reverse()) restore();
    },
  };
}
