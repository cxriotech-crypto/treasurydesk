/** Registers the demo seed with the store (imported once by the service layer). */
import { registerSeeder } from './store';
import { buildSeed } from './seed';

registerSeeder((opts) => buildSeed(opts));
