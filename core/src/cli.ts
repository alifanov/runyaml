import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { run, type Pipeline } from './runner.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: runyaml <path-to-yaml>');
  process.exit(1);
}

const pipeline = parse(readFileSync(resolve(file), 'utf8')) as Pipeline;
run(pipeline);
