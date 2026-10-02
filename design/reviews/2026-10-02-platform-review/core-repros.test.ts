import { convexTest } from 'convex-test';
import { test, expect } from 'vitest';
import { getConvexSize } from 'convex/values';
import { api, internal } from '../../../fixture/convex/_generated/api.js';
import schema from '../../../fixture/convex/schema.js';
import depotSchema from '../../../fixture/convex/depot/schema.js';
import annexSchema from '../../../fixture/convex/annex/schema.js';
import { normalizeThrown, classifyThrown, reject } from '../../../src/command/index.js';
import { rebuild } from '../../../src/kernel/index.js';
function app() {
 const t=convexTest(schema,import.meta.glob('/fixture/convex/**/*.ts'));
 t.registerComponent('depot',depotSchema,import.meta.glob('/fixture/convex/depot/**/*.ts'));
 t.registerComponent('annex',annexSchema,import.meta.glob('/fixture/convex/annex/**/*.ts'));
 return t;
}
const issuer='https://fixture-issuer.test';
test('review: a subject A grant discloses the operation ID of a subject B receipt on conflict',async()=>{
 const t=app();
 for (const [subject,id] of [['alice','a'],['bob','b']]) await t.mutation(internal.grants.grant,{tenantId:'t',principalKind:'human',principalId:`${issuer}|${subject}`,permission:'depot.documents',subject:{contextId:'depot',streamType:'document',streamId:id},grantedBy:'operator'});
 const alice=t.withIdentity({issuer,subject:'alice'}), bob=t.withIdentity({issuer,subject:'bob'});
 const original=await bob.mutation(api.depotCommands.createDocument,{tenantId:'t',requestKey:'shared-key',input:{documentId:'b',title:'B'}});
 await expect(alice.mutation(api.depotCommands.createDocument,{tenantId:'t',requestKey:'other-key',input:{documentId:'b',title:'B'}})).rejects.toMatchObject({data:{code:'forbidden'}});
 await expect(alice.mutation(api.depotCommands.createDocument,{tenantId:'t',requestKey:'shared-key',input:{documentId:'a',title:'A'}})).rejects.toMatchObject({data:{code:'idempotencyConflict',details:{operationId:original.operationId}}});
});
test('review: exported reject bypasses the declared rejection list',()=>{
 let error: unknown;
 try { reject({code:'notDeclared',message:'x',commandType:'SomeOtherCommand'}); } catch(e){error=e;}
 try { normalizeThrown(error,'CreateDocument',[]); } catch(e){
  expect(classifyThrown(e)).toMatchObject({kind:'rejection',data:{code:'notDeclared',commandType:'SomeOtherCommand'}});
 }
});
test('review: a legal correlation ID creates an envelope above the stated 17 KiB folding allowance',async()=>{
 const t=app();
 await t.mutation(internal.grants.grant,{tenantId:'t',principalKind:'human',principalId:`${issuer}|alice`,permission:'depot.documents',grantedBy:'operator'});
 const a=t.withIdentity({issuer,subject:'alice'});
 const response=await a.mutation(api.depotCommands.createDocument,{tenantId:'t',correlationId:'c'.repeat(32768),input:{documentId:'a',title:'A'}});
 const direct=await t.mutation(internal.depotRelay.createDocuments,{tenantId:'t',actor:{kind:'human',id:'alice'},operation:{operationId:'measure-op',correlationId:'c'.repeat(32768),causedBy:{kind:'command',commandType:'CreateDocument'}},input:{documents:[{documentId:'b',title:'B'}]}}) as {streams:{events:unknown[]}[]};
 const event=direct.streams[0]!.events[0];
 expect(getConvexSize(event as never)).toBeGreaterThan(32768);
 expect(response.kind).toBe('applied');
 // The adapter stores this exact unchanged correlationId on every envelope.
 const minimalEnvelope={correlationId:'c'.repeat(32768),payload:{title:'A'}};
 expect(getConvexSize(minimalEnvelope)).toBeGreaterThan(17*1024);
});
test('review: a null baseline start is replaced with initial despite S admitting null',()=>{
 const decider={streamType:'nullable',initial:()=>42 as number|null,decide:()=>({kind:'rejection' as const,rejection:{code:'x',message:'x'}}),evolve:(_s:number|null,_e:{eventType:string,eventSchemaVersion:number,payload:unknown})=>null};
 expect(rebuild(decider,[],null)).toBe(42);
});
