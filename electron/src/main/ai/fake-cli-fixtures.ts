import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProviderLaunch } from './provider-types';

/** A stand-in for `claude`: answers the probe commands and speaks stream-json on stdin/stdout. */
const FAKE_CLAUDE = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_ARGS_FILE || require('node:path').join(__dirname, 'args.ndjson'), JSON.stringify(args) + '\n');
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n');
// Leaves a background process holding stdout open, then exits without answering.
const exitLeavingOrphan = () => {
  require('node:child_process').spawn('sleep', ['30'], { stdio: ['ignore', 'inherit', 'inherit'] }).unref();
  process.stderr.write('crashed mid-turn\n', () => process.exit(1));
};
if (args[0] === '--version') { console.log('2.1.0 (Claude Code)'); process.exit(0); }
if (args[0] === 'auth') { out({ loggedIn: process.env.FAKE_LOGGED_IN !== '0', subscriptionType: 'max' }); process.exit(0); }
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(0));
function handle(message) {
  if (message.type === 'control_request' && message.request.subtype === 'initialize') {
    out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: {
      models: [
        { value: 'default', displayName: 'Default', resolvedModel: 'model-a' },
        { value: 'opus', displayName: 'Opus', resolvedModel: 'model-a' },
        { value: 'model-a', displayName: 'Model A again', resolvedModel: 'model-a' },
        { value: 'haiku', displayName: 'Haiku', resolvedModel: 'model-b' },
      ],
      account: process.env.FAKE_NO_ACCOUNT ? { apiProvider: 'firstParty' } : { subscriptionType: 'claude_max', apiProvider: 'firstParty' },
    } } });
    return;
  }
  if (message.type === 'control_request' && message.request.subtype === 'get_usage') {
    out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: process.env.FAKE_NO_ACCOUNT
      ? { rate_limits_available: false, rate_limits: {} }
      : { rate_limits_available: true, rate_limits: {
        five_hour: { utilization: 74, resets_at: '2026-10-17T20:20:00.000Z' },
        seven_day: { utilization: 46, resets_at: '2026-10-22T14:00:00.000Z' },
      } } } });
    return;
  }
  if (message.type === 'control_response') {
    out({ type: 'result', subtype: 'success', is_error: false, result: 'answered:' + message.response.subtype });
    return;
  }
  if (message.type !== 'user') return;
  // Kept beside the script, so tests can see what was asked even when HackDesk launched it.
  fs.appendFileSync(require('node:path').join(__dirname, 'prompts.ndjson'), JSON.stringify(message.message.content) + '\n');
  const mode = process.env.FAKE_MODE || 'ok';
  if (mode === 'hang') return;
  if (mode === 'orphan') return exitLeavingOrphan();
  if (mode === 'error') { out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' }); return; }
  if (mode === 'ask') { out({ type: 'control_request', request_id: 'ask-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {} } }); return; }
  // A question about notes gets an answer citing its first source.
  const reply = String(message.message.content).includes('<source id=') ? ['Offline reading ships first ', '[1].'] : ['Hel', 'lo'];
  for (const text of reply) out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: reply.join('') });
}
`;

/** A stand-in for `codex`: lists MCP servers and runs a minimal app-server JSON-RPC loop. */
const FAKE_CODEX = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAKE_ARGS_FILE) fs.appendFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(args) + '\n');
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n');
// Leaves a background process holding stdout open, then exits without answering.
const exitLeavingOrphan = () => {
  require('node:child_process').spawn('sleep', ['30'], { stdio: ['ignore', 'inherit', 'inherit'] }).unref();
  process.stderr.write('crashed mid-turn\n', () => process.exit(1));
};
if (args[0] === '--version') { console.log('codex-cli 0.200.0'); process.exit(0); }
if (args.includes('mcp')) { console.log(JSON.stringify(process.env.FAKE_MCP ? JSON.parse(process.env.FAKE_MCP) : [{ name: 'mine', enabled: true }])); process.exit(0); }
if (args[args.length - 1] !== 'app-server') process.exit(2);
let buffer = '';
let turn = null;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(0));
function handle(message) {
  if (message.id === 'srv-1') {
    if (process.env.FAKE_APPROVAL_FILE) fs.writeFileSync(process.env.FAKE_APPROVAL_FILE, JSON.stringify(message));
    for (const delta of ['Bon', 'jour']) out({ method: 'item/agentMessage/delta', params: { threadId: 't1', turnId: 'u1', itemId: 'i1', delta } });
    out({ method: 'turn/completed', params: { threadId: 't1', turn: { id: 'u1', status: process.env.FAKE_TURN_STATUS || 'completed', error: process.env.FAKE_TURN_STATUS ? { message: 'Usage limit reached' } : null } } });
    return;
  }
  const reply = (result) => out({ id: message.id, result });
  switch (message.method) {
    case 'initialize': return reply({ userAgent: 'fake' });
    case 'initialized': return;
    case 'account/read': return reply({ account: process.env.FAKE_SIGNED_OUT ? null : { type: 'chatgpt', email: 'x@example.test', planType: 'plus' }, requiresOpenaiAuth: true });
    case 'model/list': return reply({ data: [
      { id: 'm1', model: 'gpt-test', displayName: 'GPT Test', hidden: false, isDefault: true },
      { id: 'm2', model: 'gpt-hidden', displayName: 'Hidden', hidden: true, isDefault: false },
    ], nextCursor: null });
    case 'account/rateLimits/read': return reply({ rateLimits: { primary: { usedPercent: 85, windowDurationMins: 300, resetsAt: 2000000000 }, secondary: null } });
    case 'thread/start':
      if (process.env.FAKE_THREAD_FILE) fs.writeFileSync(process.env.FAKE_THREAD_FILE, JSON.stringify(message.params));
      return reply({ thread: { id: 't1' } });
    case 'turn/start':
      if (process.env.FAKE_MODE === 'orphan') return exitLeavingOrphan();
      turn = message.params;
      reply({ turn: { id: 'u1', status: 'inProgress' } });
      out({ id: 'srv-1', method: 'item/commandExecution/requestApproval', params: { threadId: 't1', turnId: 'u1' } });
      return;
    case 'turn/interrupt': return reply({});
    default: out({ id: message.id, error: { code: -32601, message: 'unknown ' + message.method } });
  }
}
`;

export async function createFakeCli(kind: 'claude' | 'codex', extraEnv: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), `hackdesk-fake-${kind}-`));
  const executable = join(directory, kind);
  await writeFile(executable, `#!${process.execPath}\n${kind === 'claude' ? FAKE_CLAUDE : FAKE_CODEX}`);
  await chmod(executable, 0o755);
  const workspace = join(directory, 'workspace');
  const launch: ProviderLaunch = {
    executable,
    cwd: directory,
    env: { ...process.env, FAKE_ARGS_FILE: join(directory, 'args.ndjson'), ...extraEnv },
  };
  return { directory, executable, workspace, launch, argsFile: join(directory, 'args.ndjson'), promptsFile: join(directory, 'prompts.ndjson') };
}
