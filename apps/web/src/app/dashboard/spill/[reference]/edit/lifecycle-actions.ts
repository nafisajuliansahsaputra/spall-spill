"use server";
import { createItemLifecycleClient } from "@/lib/workspace/profile-editor-server";
import { changeItemLifecycle } from "@/lib/workspace/item-lifecycle";
import { lifecycleCommandSchema,type LifecyclePage } from "@/lib/workspace/item-lifecycle-contract";
export type LifecycleActionState={status:"idle"|"error"|"saved"|"reload";message:string|null;current:Pick<LifecyclePage,"lifecycle"|"revision">|null};
export async function changeItemLifecycleAction(_previous:LifecycleActionState,form:FormData):Promise<LifecycleActionState>{
 const error:LifecycleActionState={status:"error",message:"Choose an available action and confirm Archive explicitly.",current:null};
 const keys=["intent_id","reference","expected_revision","expected_lifecycle","action","confirmed"];
 if(keys.some(k=>form.getAll(k).length!==1||typeof form.get(k)!=="string")||Array.from(form.keys()).some(k=>!k.startsWith("$ACTION_")&&!keys.includes(k))||(!['true','false'].includes(String(form.get('confirmed')))||!['reference','expected_revision'].every(key=>/^[1-9][0-9]{0,15}$/.test(String(form.get(key))))))return error;
 const input=lifecycleCommandSchema.safeParse({intent_id:form.get('intent_id'),reference:Number(form.get('reference')),expected_revision:Number(form.get('expected_revision')),expected_lifecycle:form.get('expected_lifecycle'),action:form.get('action'),confirmed:form.get('confirmed')==='true'});
 if(!input.success)return error;
 try{const result=await changeItemLifecycle(await createItemLifecycleClient(),input.data);
  if(result.status==='review_required')return {status:'reload',current:null,message:'The last Published version needs review before it can be restored. Your Working has not been published. Reload the saved Item before continuing.'};
  if(result.status==='stale_write')return {status:'reload',current:null,message:'This Item changed in another request. Reload its saved state before acting. Your local Working inputs are retained.'};
  if(result.status==='success')return {status:'saved',current:{lifecycle:result.lifecycle,revision:result.revision},message:result.lifecycle==='archived'?'Archived. Saved work and the reference are retained.':input.data.expected_lifecycle==='archived'?'Restored to Hidden. It has not been republished.':result.lifecycle==='hidden'?'Hidden from public discovery. You can undo this.':'Restored using the last Published version. Your Working edits stay private.'};
 }catch{}
 return {status:'reload',message:'We couldn’t confirm the current lifecycle. Reload the saved Item before trying again. Your local Working inputs are retained.',current:null};
}
