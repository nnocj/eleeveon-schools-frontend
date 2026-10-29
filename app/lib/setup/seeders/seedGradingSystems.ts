import type { SeedContext, SeedDefinition } from "../types";
import { upsertSeed } from "../seedUtils";
export async function seedGradingSystems(ctx:SeedContext,definitions:SeedDefinition[]){for(const d of definitions)await upsertSeed(ctx,"gradingStructures",d,{...d,key:undefined});}
