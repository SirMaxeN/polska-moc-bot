import { fileURLToPath } from 'node:url';
import { Deployment } from './Deployment.js';

try {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === '--prepare-only') options.prepareOnly = true;
    else if (arg === '--preview') options.preview = true;
    else if (arg === '--skip-register') options.skipRegister = true;
    else if (arg.startsWith('--session=')) options.session = arg.slice('--session='.length);
    else if (arg.startsWith('--winscp=')) options.winScp = arg.slice('--winscp='.length);
    else throw new Error(`Unknown deployment option: ${arg}`);
  }
  await new Deployment(fileURLToPath(new URL('..', import.meta.url)), options).run();
} catch (error) {
  console.error(`Deployment stopped: ${error.message}`);
  process.exitCode = 1;
}
