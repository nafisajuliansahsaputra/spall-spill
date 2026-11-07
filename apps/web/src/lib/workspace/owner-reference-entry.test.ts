import { expect, it } from "vitest";
import { ownerReferenceEditorPath } from "./owner-reference-entry";
it.each(["1","#1","42","#9007199254740991"])("builds only the fixed private editor path for %s", value => {
 expect(ownerReferenceEditorPath(value)).toBe(`/dashboard/spill/${value.replace(/^#/,"")}/edit`);
});
it.each([undefined,null,[],["1","2"],1,{},"","#","0","#0","01","#01"," 1","1 ","##1","1.0","-1","1e2","9007199254740992","#9007199254740992","9".repeat(100),"//evil.test","https://evil.test","1/edit?owner=foreign","<script>"])("denies noncanonical/hostile intent %j", value => {
 expect(ownerReferenceEditorPath(value)).toBeNull();
});
