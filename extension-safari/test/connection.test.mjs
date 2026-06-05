import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseConnection } from '../src/shared/connection.js';

test('asks for a URL when empty', () => {
  assert.match(diagnoseConnection('', null), /Enter your portal URL/);
});

test('flags an invalid URL', () => {
  assert.match(diagnoseConnection('http//bad', null), /not valid/);
});

test('suggests http when https is used against a LAN host', () => {
  const m = diagnoseConnection('https://192.168.1.10:4000', new TypeError('Failed to fetch'));
  assert.match(m, /http:\/\/192\.168\.1\.10:4000/);
});

test('gives reachability guidance for a network error', () => {
  const m = diagnoseConnection('http://192.168.1.10:4000', new TypeError('Failed to fetch'));
  assert.match(m, /HOST=0\.0\.0\.0/);
  assert.match(m, /same Wi-Fi/);
});

test('passes through a server-provided (non-network) error', () => {
  assert.match(diagnoseConnection('http://x:4000', new Error('Request failed (500)')), /Request failed \(500\)/);
});
