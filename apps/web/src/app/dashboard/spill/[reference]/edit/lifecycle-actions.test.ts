import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({client:vi.fn(),change:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createItemLifecycleClient:m.client}));
vi.mock("@/lib/workspace/item-lifecycle",()=>({changeItemLifecycle:m.change}));
import {changeItemLifecycleAction} from "./lifecycle-actions";
const idle={status:'idle' as const,message:null,current:null};
function form(){const f=new FormData();for(const [k,v] of Object.entries({intent_id:'28200000-0000-4000-8000-000000000003',reference:'27',expected_revision:'1',expected_lifecycle:'published',action:'hide',confirmed:'false'}))f.set(k,v);return f;}
beforeEach(()=>{m.client.mockResolvedValue({});m.change.mockResolvedValue({status:'success',lifecycle:'hidden',revision:2});});afterEach(()=>vi.clearAllMocks());
it('returns acknowledged lifecycle without publishing Working',async()=>{expect(await changeItemLifecycleAction(idle,form())).toMatchObject({status:'saved',current:{lifecycle:'hidden',revision:2}});expect(m.change.mock.calls[0]![1]).toMatchObject({action:'hide',confirmed:false});});
it.each(['missing','duplicate','extra','hex','archive-unconfirmed','invalid-boolean'])('rejects native envelope %s before authority',async invalid=>{const f=form();if(invalid==='missing')f.delete('reference');if(invalid==='duplicate')f.append('reference','27');if(invalid==='extra')f.set('owner_id','forged');if(invalid==='hex')f.set('reference','0x1b');if(invalid==='archive-unconfirmed')f.set('action','archive');if(invalid==='invalid-boolean')f.set('confirmed','yes');expect((await changeItemLifecycleAction(idle,f)).status).toBe('error');expect(m.client).not.toHaveBeenCalled();});
it('unknown or failed outcomes require GET and never invoke retry',async()=>{m.change.mockResolvedValue({status:'outcome_unknown'});expect((await changeItemLifecycleAction(idle,form())).status).toBe('reload');expect(m.change).toHaveBeenCalledTimes(1);});
it('Archived restore truth remains Hidden',async()=>{const f=form();f.set('expected_lifecycle','archived');f.set('action','restore');expect((await changeItemLifecycleAction(idle,f)).message).toContain('Restored to Hidden. It has not been republished.');});

it('review-required outcome provides repair truth without claiming a successful Restore',async()=>{m.change.mockResolvedValue({status:'review_required'});expect(await changeItemLifecycleAction(idle,form())).toMatchObject({status:'reload',current:null,message:expect.stringContaining('needs review')});});
it('stale outcome clearly requests fresh readback',async()=>{m.change.mockResolvedValue({status:'stale_write'});expect(await changeItemLifecycleAction(idle,form())).toMatchObject({status:'reload',message:expect.stringContaining('another request')});});
