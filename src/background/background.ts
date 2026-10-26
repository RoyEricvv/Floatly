import { getAdapter } from '../adapters/index.ts';
import { startBackground } from './background-controller.ts';

startBackground(getAdapter());
