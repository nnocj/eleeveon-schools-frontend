import type {SeedTemplate,SetupTemplateCode} from "../types";
import {buildGhanaTemplate,SETUP_COMBINATIONS} from "./ghana2026";
export const setupTemplates=Object.fromEntries(Object.keys(SETUP_COMBINATIONS).map(code=>[code,buildGhanaTemplate(code as SetupTemplateCode)])) as Record<SetupTemplateCode,SeedTemplate>;
export function getSetupTemplate(code:SetupTemplateCode):SeedTemplate {const template=setupTemplates[code];if(!template)throw new Error(`Unknown setup template: ${code}`);return template;}
