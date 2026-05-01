import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { run, type Pipeline } from './runner.ts';

const file = process.argv[2];
const message = process.argv.slice(3).join(' ');

if (!file) {
  console.error('usage: runyaml <path-to-yaml> [message]');
  process.exit(1);
}

const pipeline = parse(readFileSync(resolve(file), 'utf8')) as Pipeline;
run(pipeline, { globals: { ARGUMENTS: message, USER_MESSAGE: message } });
