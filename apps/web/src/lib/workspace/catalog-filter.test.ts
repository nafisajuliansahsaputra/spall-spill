import { expect,it } from "vitest";
import { catalogFilterSchema,catalogFilterPath } from "./catalog-filter";
const base={q:"",kind:"all",lifecycle:"all",before:null} as const;
it("normalizes whitespace without changing literal search intent",()=>{expect(catalogFilterSchema.parse({...base,q:"  Mixed\t Name\n "}).q).toBe("Mixed Name");expect(catalogFilterSchema.parse({...base,q:"100% _ safe"}).q).toBe("100% _ safe");});
it.each([{...base,q:["x"]},{...base,q:"x".repeat(81)},{...base,q:"\u0000"},{...base,q:"\ud800"},{...base,kind:"owner"},{...base,lifecycle:"needs_attention"},{...base,before:0},{...base,before:9007199254740992},{...base,owner_id:"forged"}])("rejects invalid scope %j",value=>expect(catalogFilterSchema.safeParse(value).success).toBe(false));
it("encodes scope into one fixed same-origin path and preserves it for pagination",()=>{expect(catalogFilterPath({...base,q:"#27",kind:"resource",lifecycle:"hidden"},18)).toBe("/dashboard/spill?q=%2327&kind=resource&lifecycle=hidden&before=18");expect(catalogFilterPath(base)).toBe("/dashboard/spill");});
