import { cli } from './cli';

process.exitCode = cli(
  process.argv.slice(2),
  (text) => process.stdout.write(text),
  (text) => process.stderr.write(text),
);
