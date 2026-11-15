import type { JointedSpec } from './Jointed';
import { MARIO_STYLE } from './Mario';
import { PEACH_MODEL } from './peachModel';

export const PEACH: JointedSpec = { kind: 'peach', model: PEACH_MODEL, style: MARIO_STYLE, shadow: 1.3 };
