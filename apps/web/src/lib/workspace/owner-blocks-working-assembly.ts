import "server-only";

// 12.110: one guarded page implementation for both private entry points.
export {
  createOwnerBlocksWorkingPagedAssembly as createOwnerBlocksWorkingAssembly,
  type OwnerBlocksWorkingPagedAssemblyResult as OwnerBlocksWorkingAssemblyResult,
} from "./owner-blocks-working-paged-assembly";
