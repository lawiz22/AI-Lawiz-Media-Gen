import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
const code = ts.transpileModule(readFileSync(new URL('./qwen21Workflow.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const workflowUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const sceneCode = ts.transpileModule(readFileSync(new URL('./qwen21CharacterSceneWorkflow.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from ['"]\.\/qwen21Workflow['"]/g, `from '${workflowUrl}'`);
const sceneModule = await import(`data:text/javascript;base64,${Buffer.from(sceneCode).toString('base64')}`);
test('Character in a Scene exactly matches attachment and keeps scene-first geometry and two LoRA slots', {skip:!process.env.QWEN21_CHARACTER_SCENE_WORKFLOW}, () => {
    const reference=JSON.parse(readFileSync(process.env.QWEN21_CHARACTER_SCENE_WORKFLOW,'utf8'));for(const id of ['22','23','24','25'])delete reference[id];
    const options=sceneModule.defaultCharacterSceneOptions();const graph=sceneModule.buildCharacterSceneWorkflow(reference['5'].inputs.image,reference['6'].inputs.image,options);
    const normalize=workflow=>Object.fromEntries(Object.entries(workflow).map(([id,node])=>[id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):value]))}]));
    assert.deepEqual(normalize(graph),normalize(reference));
    const extra=sceneModule.buildCharacterSceneWorkflow('scene','character',{...options,extraLora:{name:'extra.safetensors',enabled:true,modelStrength:0.5,clipStrength:0.7}});
    assert.equal(JSON.parse(extra['28'].inputs.LoraLoaderState).loras.length,2);assert.deepEqual(extra['11'].inputs.latent_image,['20',0]);assert.deepEqual(extra['10'].inputs['images.image_1'],['19',0]);assert.deepEqual(extra['14'].inputs.image1,['19',0]);assert.equal(JSON.parse(extra['6'].inputs.LoadImageMiniState).mode,'max_mp');
});
test('Character in a Scene insert/replace prompts preserve scene style and target exactly one identified person', () => {
    const analysis={scene:'Three people in a room',style:'Old film grain',lighting:'Soft window light',character:'Curly hair and grey suit',uncertainty:'',people:[{id:'person-1',description:'Left person in brown jacket',pose:'standing',expression:'neutral'},{id:'person-2',description:'Center person with red bow tie',pose:'standing with arms lowered',expression:'serious'}],placements:[{label:'Beside the group',instruction:'Stand to the right of the existing group.'}]};
    const options=sceneModule.defaultCharacterSceneOptions();assert.throws(()=>sceneModule.characterScenePrompt(options,analysis),/Choose the person/);
    assert.equal(options.analysisProvider,'mammouth');assert.equal(module.defaultQwen21MultiOptions().analysisProvider,'mammouth');
    const replace=sceneModule.characterScenePrompt({...options,targetId:'person-2'},analysis);assert.ok(replace.includes('ONLY the person'));assert.ok(replace.includes('Center person with red bow tie'));assert.ok(replace.includes('Keep the original target pose'));assert.ok(replace.includes('Blend the character from <image2>'));assert.ok(replace.includes('Do not replace, remove or change any other person'));
    assert.ok(replace.includes('at their original position'));assert.ok(replace.includes('Do not apply the face, hair or clothing from <image2> to anyone else'));assert.ok(!replace.includes(analysis.scene));assert.ok(!replace.includes(analysis.people[0].description));
    const insert=sceneModule.characterScenePrompt({...options,mode:'insert',placement:analysis.placements[0].instruction},analysis);assert.ok(insert.includes('Keep all existing people'));assert.ok(insert.includes('Stand to the right'));assert.ok(!insert.includes('ONLY the person'));
    assert.deepEqual(sceneModule.parseCharacterSceneAnalysis(JSON.stringify(analysis)),analysis);
    assert.throws(()=>sceneModule.parseCharacterSceneAnalysis(JSON.stringify({...analysis,people:[analysis.people[0],analysis.people[0]]})),/duplicate/);
    assert.throws(()=>sceneModule.characterScenePrompt({...options,targetId:'missing'},analysis),/Choose the person/);
    const info=Object.fromEntries(Object.values(sceneModule.buildCharacterSceneWorkflow('scene','character',options)).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));info.LoraLoader={input:{required:{lora_name:[[options.lora.name]]}}};
    assert.doesNotThrow(()=>sceneModule.validateCharacterSceneReadiness(sceneModule.buildCharacterSceneWorkflow('scene','character',options),info));info.LoraLoader.input.required.lora_name=[[]];assert.throws(()=>sceneModule.validateCharacterSceneReadiness(sceneModule.buildCharacterSceneWorkflow('scene','character',options),info),/Fusion_2000/);
});
test('Replace uses the selected woman only as a locator and the incoming image as the appearance source', () => {
    const analysis = { scene: 'Two men and a woman in a vintage room', style: 'Vintage film', lighting: 'Soft indoor light', character: 'Stale analysis of another character', uncertainty: '', people: [
        { id: 'person-1', description: 'Man on the left in a brown jacket', pose: 'standing', expression: 'neutral' },
        { id: 'person-2', description: 'Woman on the original right with blonde hair, a black choker and a sequined top', pose: 'standing with arms lowered', expression: 'slightly concerned, looking ahead' },
    ], placements: [] };
    const options = { ...sceneModule.defaultCharacterSceneOptions(), targetId: 'person-2', refinement: 'Keep her hands visible.' };
    const prompt = sceneModule.characterScenePrompt(options, analysis);
    assert.match(prompt, /complete person replacement: change the target face, hair, outfit and visible body appearance/);
    assert.match(prompt, /Target locator in <image1> \(identification only\): "Woman on the original right/);
    assert.match(prompt, /not the desired appearance of the replacement/);
    assert.match(prompt, /<image2> as the sole reference for the replacement identity, facial features, hair, clothing and body proportions/);
    assert.match(prompt, /Apply the target expression.*replacement face from <image2>, without retaining the original facial features/);
    assert.match(prompt, /keep the same number of people/);
    assert.match(prompt, /Keep her hands visible/);
    assert.doesNotMatch(prompt, /Stale analysis|Two men and a woman|Man on the left|Keep the character face, hair and clothing exactly/);
    const graph = sceneModule.buildCharacterSceneWorkflow('scene.png', 'incoming-woman.png', { ...options, prompt });
    assert.equal(JSON.parse(graph['8'].inputs.PromptState).text, prompt);
    assert.deepEqual(graph['10'].inputs.prompt, ['8', 0]);
    assert.deepEqual(graph['10'].inputs['images.image_1'], ['19', 0]);
    assert.deepEqual(graph['10'].inputs['images.image_2'], ['6', 0]);
    assert.equal(graph['6'].inputs.image, 'incoming-woman.png');
    assert.equal(sceneModule.characterScenePrompt({ ...options, manualPrompt: true, prompt: 'My exact replacement prompt' }, analysis), 'My exact replacement prompt');
    const insert = sceneModule.characterScenePrompt({ ...options, mode: 'insert', placement: 'Stand beside the group.' }, analysis);
    assert.match(insert, /Keep all existing people in <image1> unchanged/);
    assert.match(insert, /Scene from <image1>: Two men and a woman/);
    assert.match(insert, /Character from <image2>: Stale analysis of another character/);
    assert.match(insert, /Stand beside the group/);
    assert.doesNotMatch(insert, /Target locator|complete person replacement/);
});

test('Create Character Turbo switches the full Viggle sampler graph without changing references or normal settings', () => {
    const settings=module.defaultQwen21MultiOptions();const original=structuredClone(settings);const images=['subject','outfit','background','pose'];
    assert.deepEqual(module.buildQwen21CreateCharacterWorkflow(images,settings),module.buildQwen21MultiWorkflow(images,settings));
    const graph=module.buildQwen21CreateCharacterWorkflow(images,settings,true);const native=module.defaultQwen21EditOptions('turbo');
    assert.equal(graph['11'],undefined);assert.deepEqual(graph['12'].inputs.samples,['33',0]);assert.deepEqual(graph['33'].inputs.latent_image,['18',0]);assert.deepEqual(graph['32'].inputs.conditioning,['10',0]);assert.deepEqual(graph['28'].inputs.noise_seed,['9',0]);
    assert.equal(graph['30'].inputs.steps,native.steps);assert.equal(graph['30'].inputs.denoise,1);assert.equal(graph['29'].inputs.sampler_name,native.sampler);assert.equal(graph['31'].inputs.steps,native.intermediateSteps);assert.equal(graph['31'].inputs.start_at_sigma,native.startSigma);assert.equal(graph['31'].inputs.end_at_sigma,native.endSigma);assert.equal(graph['31'].inputs.spacing,native.spacing);assert.equal(graph['27'].inputs.max_shift,native.maxShift);assert.equal(graph['27'].inputs.base_shift,native.baseShift);assert.deepEqual(graph['27'].inputs.width,['17',0]);assert.deepEqual(graph['4'].inputs.model,['27',0]);assert.deepEqual(graph['27'].inputs.model,['26',0]);
    assert.equal(JSON.parse(graph['26'].inputs.LoraLoaderState).loras[0].name,native.lora.name);for(const [index,id] of ['5','6','16','24'].entries())assert.deepEqual(graph['10'].inputs[`images.image_${index+1}`],[id,0]);assert.deepEqual(settings,original);
    const extras=module.buildQwen21CreateCharacterWorkflow(images,{...settings,loras:[{name:'extra',enabled:true,modelStrength:.5,clipStrength:.6}]},true);assert.deepEqual(extras['26'].inputs.model,['25',0]);
    const info=Object.fromEntries(Object.values(graph).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));info.LoraLoader={input:{required:{lora_name:[[native.lora.name]]}}};assert.doesNotThrow(()=>module.validateQwen21CreateCharacterReadiness(graph,info));delete info.SamplerCustomAdvanced;assert.throws(()=>module.validateQwen21CreateCharacterReadiness(graph,info),/SamplerCustomAdvanced/);info.SamplerCustomAdvanced={};info.LoraLoader.input.required.lora_name=[[]];assert.throws(()=>module.validateQwen21CreateCharacterReadiness(graph,info),/viggle-turbo/);
});
test('source aspect ratio mode derives sampling geometry from the reference and restores exact source dimensions', () => {
    const settings = { ...module.defaultQwen21MultiOptions(), preserveSourceAspectRatio: true };
    for (const turbo of [false, true]) {
        const graph = module.buildQwen21CreateCharacterWorkflow(['source.png'], settings, turbo);
        assert.deepEqual(graph['10'].inputs['images.image_1'], ['5', 0]);
        assert.equal(JSON.parse(graph['5'].inputs.LoadImageMiniState).mode, 'off');
        assert.deepEqual(graph['35'].inputs.image, ['5', 0]);
        assert.deepEqual(graph['34'].inputs['values.a'], ['17', 0]);
        assert.deepEqual(graph['34'].inputs['values.b'], ['17', 1]);
        assert.deepEqual(graph['18'].inputs.width, ['36', 0]);
        assert.deepEqual(graph['18'].inputs.height, ['36', 1]);
        assert.deepEqual(graph['36'].inputs.image, ['35', 0]);
        assert.deepEqual(graph['37'].inputs.image, ['5', 0]);
        assert.deepEqual(graph['38'].inputs.width, ['37', 0]);
        assert.deepEqual(graph['38'].inputs.height, ['37', 1]);
        assert.equal(graph['38'].inputs.crop, 'disabled');
        assert.deepEqual(graph['13'].inputs.image, ['38', 0]);
        if (turbo) {
            assert.deepEqual(graph['27'].inputs.width, graph['18'].inputs.width);
            assert.deepEqual(graph['27'].inputs.height, graph['18'].inputs.height);
        }
        const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, { input: { required: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) => [key, [[value]]])) } }]));
        info.LoraLoader = { input: { required: { lora_name: [[module.defaultQwen21EditOptions('turbo').lora.name]] } } };
        assert.doesNotThrow(() => module.validateQwen21CreateCharacterReadiness(graph, info));
        delete info.ImageScale;
        assert.throws(() => module.validateQwen21CreateCharacterReadiness(graph, info), /ImageScale/);
    }
    const standard = module.buildQwen21MultiWorkflow(['source.png'], module.defaultQwen21MultiOptions());
    assert.equal(standard['38'], undefined);
    assert.deepEqual(standard['18'].inputs.width, ['17', 0]);
});
const analysisCode = ts.transpileModule(readFileSync(new URL('./qwen21ReferenceService.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const analysisModule = await import(`data:text/javascript;base64,${Buffer.from(analysisCode).toString('base64')}`);
test('reference interaction analysis accepts grounded placeholders and safely handles legacy or malformed choices', () => {
    const result=analysisModule.parseQwen21ReferenceAnalysis(JSON.stringify({description:'Living room with a sofa.',interactions:[
        {label:'Sit on the sofa',instruction:'MAIN_PERSON sits on the sofa visible in REFERENCE_IMAGE.'},
        {label:'Wrong image tag',instruction:'MAIN_PERSON sits in <image3> from REFERENCE_IMAGE.'},
        {label:'Missing link',instruction:'Stand outside.'},
        {label:12,instruction:'MAIN_PERSON uses REFERENCE_IMAGE.'},
    ]}));
    assert.deepEqual(result.interactionChoices,[{id:'analysis-1',label:'Sit on the sofa',instruction:'MAIN_PERSON sits on the sofa visible in REFERENCE_IMAGE.'}]);
    assert.deepEqual(analysisModule.parseQwen21ReferenceAnalysis('```json\n{"description":"Person with short hair."}\n```').interactionChoices,[]);
    assert.throws(()=>analysisModule.parseQwen21ReferenceAnalysis('{"description":""}'),/no reference description/);
    assert.throws(()=>analysisModule.parseQwen21ReferenceAnalysis('null'),/no reference description/);
});
test('multi-image graph exactly matches the supplied three-image workflow', {skip:!process.env.QWEN21_MULTI_WORKFLOW}, () => {
    const reference=JSON.parse(readFileSync(process.env.QWEN21_MULTI_WORKFLOW,'utf8'));for(const id of ['19','20','21','22'])delete reference[id];
    const graph=module.buildQwen21MultiWorkflow(['5','6','16'].map(id=>reference[id].inputs.image),module.defaultQwen21MultiOptions());
    const normalize=workflow=>Object.fromEntries(Object.entries(workflow).map(([id,node])=>[id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):value]))}]));
    assert.deepEqual(normalize(graph),normalize(reference));
});
test('multi-image sizes, reference numbering, role prompts and four LoRAs stay independent', () => {
    const options=module.defaultQwen21MultiOptions();
    for(let index=0;index<9;index++)assert.deepEqual(module.qwen21MultiDimensions({...options,sizeIndex:index,orientation:'portrait'}),{width:module.QWEN21_MULTI_SIZES[index][1],height:module.QWEN21_MULTI_SIZES[index][0]});
    const loras=Array.from({length:4},(_,index)=>({name:`extra-${index}.safetensors`,enabled:index!==2,modelStrength:0.6,clipStrength:0.8}));
    const graph=module.buildQwen21MultiWorkflow(['one.png','two.png','three.png','four.png'],{...options,loras});
    assert.deepEqual(graph['10'].inputs['images.image_4'],['24',0]);assert.deepEqual(graph['11'].inputs.latent_image,['18',0]);assert.deepEqual(graph['4'].inputs.model,['25',0]);assert.equal(JSON.parse(graph['25'].inputs.LoraLoaderState).loras.length,4);
    assert.equal(graph['10'].inputs.resolution,1024);assert.ok(!Object.values(graph).some(node=>node.class_type==='PixaromaCompare'));
    assert.throws(()=>module.buildQwen21MultiWorkflow(['1','2','3','4','5'],options),/four reference/);
    const prompt=module.qwen21MultiPrompt({...options,referenceCount:4,instruction:'A studio portrait.',references:options.references.map((ref,index)=>({...ref,description:`Visible detail ${index+1}`,refinement:'Keep the original colors.'}))});
    for(let index=1;index<=4;index++)assert.ok(prompt.includes(`<image${index}>`));assert.ok(prompt.includes('Visible detail 4'));assert.ok(prompt.includes('A studio portrait.'));
    assert.equal(module.qwen21MultiPrompt({...options,manualPrompt:true,prompt:'Manual instruction.'}),'Manual instruction.\nBlend the person into the background image seamlessly.');
    const plain=module.buildQwen21MultiWorkflow(['1','2','3','4'],options);
    const info=Object.fromEntries(Object.values(plain).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));
    delete info.TextEncodeQwenImage21.input.required['images.image_4'];info.TextEncodeQwenImage21.input.required.images=['COMFY_AUTOGROW_V3',{template:{names:['image_1','image_2','image_3','image_4']}}];
    assert.doesNotThrow(()=>module.validateQwen21MultiReadiness(plain,info));info.TextEncodeQwenImage21.input.required.images[1].template.names.pop();assert.throws(()=>module.validateQwen21MultiReadiness(plain,info),/image_4/);
});
test('multi-image interactions link every reference to the main person without changing body or identities', () => {
    const options=module.defaultQwen21MultiOptions();
    options.referenceCount=4;
    options.references=[
        {role:'object',description:'Main person',refinement:'',interactionId:'hold-two'},
        {role:'object',description:'Green mixer',refinement:'',interactionId:'hold-two'},
        {role:'outfit',description:'Blue jacket',refinement:'',interactionId:'fitted'},
        {role:'identity',description:'Second person',refinement:'',interactionId:'hold-hands'},
    ];
    const prompt=module.qwen21MultiPrompt(options);
    assert.ok(prompt.includes('person from <image1> is the main person'));
    assert.ok(prompt.includes('holds the object from <image2> in both hands'));
    assert.ok(prompt.includes('clothing from <image3> fitted closely to their existing body contours'));
    assert.ok(prompt.includes('never reshape their body'));
    assert.ok(prompt.includes('additional person from <image4> hold hands'));
    assert.ok(prompt.includes('Do not merge, swap or duplicate'));
    assert.deepEqual(module.qwen21ReferenceInteractions(options.references[0],0),[]);
    assert.ok(!prompt.includes('MAIN_PERSON'));assert.ok(!prompt.includes('REFERENCE_IMAGE'));
    options.references[1]={role:'background',description:'Room with a sofa',refinement:'',interactionId:'scene-sofa',interactionChoices:[{id:'scene-sofa',label:'Sit on the sofa',instruction:'MAIN_PERSON sits naturally on the visible sofa in REFERENCE_IMAGE.'}]};
    assert.ok(module.qwen21MultiPrompt(options).includes('sits naturally on the visible sofa in <image2>'));
    options.references[1].interactionId='missing';assert.ok(!module.qwen21MultiPrompt(options).includes('sits naturally'));
    assert.ok(!module.qwen21ReferenceInteractions({role:'background',description:'',refinement:''},1).some(choice=>/chair|sofa/.test(choice.instruction)));
    options.manualPrompt=true;options.prompt='Manual prompt';assert.equal(module.qwen21MultiPrompt(options),'Manual prompt\nBlend the person into the background image seamlessly.');
});
test('multi-image background blending is conditional, applies to manual prompts and never rescues an empty prompt', () => {
    const options=module.defaultQwen21MultiOptions();const blend='Blend the person into the background image seamlessly.';
    assert.ok(module.qwen21MultiPrompt(options).endsWith(blend));
    assert.ok(!module.qwen21MultiPrompt({...options,referenceCount:2}).includes(blend));
    const noBackground={...options,references:options.references.map(reference=>({...reference,role:'identity'}))};
    assert.ok(!module.qwen21MultiPrompt(noBackground).includes(blend));
    assert.equal(module.qwen21MultiPrompt({...noBackground,manualPrompt:true,prompt:'Manual edit.'}),'Manual edit.');
    const manual={...options,manualPrompt:true,prompt:`Manual edit.\n${blend}`};
    assert.equal(module.qwen21MultiPrompt(manual),manual.prompt);
    assert.equal(module.qwen21MultiPrompt({...manual,prompt:''}),'');
});
for (const [mode,variable] of [['consistency','QWEN21_EDIT_CONSISTENCY_WORKFLOW'],['turbo','QWEN21_EDIT_TURBO_WORKFLOW']]) {
    test(`single-image ${mode} graph exactly matches supplied workflow`, {skip:!process.env[variable]}, () => {
        const reference=JSON.parse(readFileSync(process.env[variable],'utf8'));
        for(const id of ['17','18','19','20'])delete reference[id];
        const graph=module.buildQwen21EditWorkflow(reference['5'].inputs.image,module.defaultQwen21EditOptions(mode),mode);
        const normalize=workflow=>Object.fromEntries(Object.entries(workflow).map(([id,node])=>[id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):value]))}]));
        assert.deepEqual(normalize(graph),normalize(reference));
    });
}
test('edit modes preserve reference latent, aligned compare and independently configurable LoRA', () => {
    for(const mode of ['consistency','turbo']) {
        const options=module.defaultQwen21EditOptions(mode);
        const graph=module.buildQwen21EditWorkflow('source.png',{...options,lora:{...options.lora,enabled:false}},mode);
        assert.deepEqual(graph[mode==='turbo'?'30':'10'].inputs.latent_image,['9',2]);
        assert.deepEqual(graph['13'].inputs.image1,['16',0]);
        assert.equal(JSON.parse(graph['22'].inputs.LoraLoaderState).loras[0].on,false);
        if(mode==='turbo'){assert.equal(graph['27'].inputs.steps,4);assert.equal(graph['28'].inputs.steps,3);assert.equal(graph['10'],undefined);}
    }
});
test('both edit modes support four extra LoRAs with independent strengths and validate enabled extras', () => {
    for(const mode of ['consistency','turbo']){
        const defaults=module.defaultQwen21EditOptions(mode);
        assert.equal(defaults.extraLoras.length,4);assert.ok(defaults.extraLoras.every(lora=>!lora.enabled&&!lora.name));
        const legacy={...defaults};delete legacy.extraLoras;
        assert.deepEqual(module.buildQwen21EditWorkflow('source.png',legacy,mode),module.buildQwen21EditWorkflow('source.png',defaults,mode));
        const extraLoras=Array.from({length:4},(_,index)=>({name:`extra-${index+1}.safetensors`,enabled:index!==2,modelStrength:0.5+index/10,clipStrength:0.8-index/10}));
        const options={...defaults,extraLoras};const graph=module.buildQwen21EditWorkflow('source.png',options,mode);
        const loaded=JSON.parse(graph['22'].inputs.LoraLoaderState).loras;assert.equal(loaded.length,5);
        assert.deepEqual(loaded.slice(1),extraLoras.map(lora=>({name:lora.name,on:lora.enabled,sm:lora.modelStrength,sc:lora.clipStrength,triggers:[]})));
        const info=Object.fromEntries(Object.values(graph).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));
        info.LoraLoader={input:{required:{lora_name:[[defaults.lora.name,...extraLoras.filter(lora=>lora.enabled).map(lora=>lora.name)]]}}};
        assert.doesNotThrow(()=>module.validateQwen21EditReadiness(graph,info));
        info.LoraLoader.input.required.lora_name[0].pop();assert.throws(()=>module.validateQwen21EditReadiness(graph,info),/extra-4/);
        assert.throws(()=>module.buildQwen21EditWorkflow('source.png',{...defaults,extraLoras:[...extraLoras,extraLoras[0]]},mode),/four additional/);
        assert.throws(()=>module.buildQwen21EditWorkflow('source.png',{...defaults,extraLoras:[{...extraLoras[0],name:''}]},mode),/valid edit LoRA/);
        assert.throws(()=>module.buildQwen21EditWorkflow('source.png',{...defaults,extraLoras:[{...extraLoras[0],modelStrength:NaN}]},mode),/valid edit LoRA/);
    }
    const first=module.defaultQwen21EditOptions('consistency'),second=module.defaultQwen21EditOptions('turbo');
    first.extraLoras[0].name='changed';assert.equal(first.extraLoras[1].name,'');assert.equal(second.extraLoras[0].name,'');
});
test('Low VRAM attachment differs only by LoRA and demonstration inputs after node-ID remapping', {skip:!process.env.QWEN21_EDIT_LOW_VRAM_WORKFLOW}, () => {
    const reference=JSON.parse(readFileSync(process.env.QWEN21_EDIT_LOW_VRAM_WORKFLOW,'utf8'));
    for(const id of ['17','18','19','20'])delete reference[id];
    const lora=JSON.parse(reference['23'].inputs.LoraLoaderState).loras[0];
    const options={...module.defaultQwen21EditOptions('consistency'),seed:reference['8'].inputs.seed,prompt:JSON.parse(reference['7'].inputs.PromptState).text,lora:{name:lora.name,enabled:lora.on,modelStrength:lora.sm,clipStrength:lora.sc}};
    const graph=module.buildQwen21EditWorkflow(reference['5'].inputs.image,options,'consistency');
    const normalize=workflow=>Object.fromEntries(Object.values(workflow).map(node=>[node.class_type,Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):Array.isArray(value)&&workflow[value[0]]?[workflow[value[0]].class_type,value[1]]:value]))]));
    assert.deepEqual(normalize(graph),normalize(reference));
    assert.equal(lora.name,'qwen21\\lenovo_qwen21.safetensors');assert.equal(options.megapixels,1);
});
test('edit readiness verifies active LoRA and Turbo nodes before queueing', () => {
    for(const mode of ['consistency','turbo']){
        const options=module.defaultQwen21EditOptions(mode);const graph=module.buildQwen21EditWorkflow('source.png',options,mode);
        const info=Object.fromEntries(Object.values(graph).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));
        info.LoraLoader={input:{required:{lora_name:[[options.lora.name]]}}};
        assert.doesNotThrow(()=>module.validateQwen21EditReadiness(graph,info));
        const unavailable=module.buildQwen21EditWorkflow('source.png',{...options,lora:{...options.lora,name:'missing.safetensors'}},mode);
        assert.throws(()=>module.validateQwen21EditReadiness(unavailable,info),/Unavailable Qwen 2.1 LoRA/);
        assert.doesNotThrow(()=>module.validateQwen21EditReadiness(module.buildQwen21EditWorkflow('source.png',{...options,lora:{...options.lora,name:'missing.safetensors',enabled:false}},mode),info));
        if(mode==='turbo'){delete info.ExtendIntermediateSigmas;assert.throws(()=>module.validateQwen21EditReadiness(graph,info),/ExtendIntermediateSigmas/);}
    }
});
test('Remove Background graph matches supplied JSON and uses reference latent with no added LoRAs or alpha-flattening nodes', () => {
    const settings = module.defaultQwen21RemoveBackgroundOptions();
    const graph = module.buildQwen21RemoveBackgroundWorkflow('source.png',settings);
    assert.equal(settings.prompt,'Remove the background, and output a PNG image');
    assert.deepEqual(graph['10'].inputs.latent_image,['9',2]);assert.deepEqual(graph['13'].inputs.image1,['16',0]);assert.deepEqual(graph['13'].inputs.image2,['11',0]);
    assert.equal(JSON.parse(graph['6'].inputs.DropdownState).value,'1');assert.equal(graph['9'].inputs.resolution,0);
    assert.ok(!Object.values(graph).some(node=>/Lora|SplitImageWithAlpha|EmptyLatentImage/.test(node.class_type)));
    assert.equal(JSON.parse(module.buildQwen21RemoveBackgroundWorkflow('source.png',{...settings,prompt:'Keep the person only.',megapixels:2.25,steps:30})['7'].inputs.PromptState).text,'Keep the person only.');
    assert.throws(()=>module.buildQwen21RemoveBackgroundWorkflow('source.png',{...settings,prompt:''}),/prompt/);
    assert.throws(()=>module.buildQwen21RemoveBackgroundWorkflow('source.png',{...settings,megapixels:0}),/output size/);
    if(process.env.QWEN21_REMOVE_BACKGROUND_WORKFLOW){
        const reference=JSON.parse(readFileSync(process.env.QWEN21_REMOVE_BACKGROUND_WORKFLOW,'utf8'));
        for(const id of ['17','18','19','20'])delete reference[id];
        const actual=module.buildQwen21RemoveBackgroundWorkflow(reference['5'].inputs.image,settings);
        const normalize=workflow=>Object.fromEntries(Object.entries(workflow).map(([id,node])=>[id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):value]))}]));
        assert.deepEqual(normalize(actual),normalize(reference));
    }
});
test('Remove Background readiness rejects missing cache/reference/compare choices without requiring LoRAs', () => {
    const options=module.defaultQwen21RemoveBackgroundOptions();
    const graph=module.buildQwen21RemoveBackgroundWorkflow('source.png',options);
    const info=Object.fromEntries(Object.values(graph).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));
    assert.doesNotThrow(()=>module.validateQwen21RemoveBackgroundReadiness(graph,info));
    for(const key of ['weightDtype','clipDevice','cacheDevice','cacheDtype','referenceUpscale'])assert.throws(()=>module.validateQwen21RemoveBackgroundReadiness(module.buildQwen21RemoveBackgroundWorkflow('source.png',{...options,[key]:'unavailable'}),info),/Unavailable/);
    delete info.PixaromaCompare;assert.throws(()=>module.validateQwen21RemoveBackgroundReadiness(graph,info),/PixaromaCompare/);
});
test('Character Sheet graph matches the supplied execution JSON exactly', {skip:!process.env.QWEN21_CHARACTER_WORKFLOW}, () => {
    const reference = JSON.parse(readFileSync(process.env.QWEN21_CHARACTER_WORKFLOW,'utf8'));
    for (const id of ['22','23','24','25']) delete reference[id];
    const graph = module.buildQwen21CharacterSheetWorkflow(reference['5'].inputs.image,module.defaultQwen21CharacterSheetOptions());
    const normalize = workflow => Object.fromEntries(Object.entries(workflow).map(([id,node]) => [id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,key.endsWith('State')?JSON.parse(value):value]))}]));
    assert.deepEqual(normalize(graph),normalize(reference));
});
test('Character Sheet keeps separate reference/output geometry, four editable prompt blocks and native sampling', () => {
    const options = module.defaultQwen21CharacterSheetOptions();
    const graph = module.buildQwen21CharacterSheetWorkflow('character.png',options);
    assert.deepEqual(graph['11'].inputs.latent_image,['20',0]);assert.notDeepEqual(graph['11'].inputs.latent_image,['10',2]);
    assert.deepEqual(graph['19'].inputs.image,['5',0]);assert.deepEqual(graph['28'].inputs.image,['18',0]);
    assert.equal(graph['21'].inputs.expression,'a * b / (1024 * 1024)');
    assert.equal(Object.values(graph).some(node=>node.class_type.includes('Lora')),false);
    assert.deepEqual(module.qwen21CharacterDimensions(options),{width:1920,height:1088});
    for(let index=0;index<7;index++)assert.deepEqual(module.qwen21CharacterDimensions({...options,sizeIndex:index,orientation:'portrait'}),{width:module.QWEN21_CHARACTER_SIZES[index][1],height:module.QWEN21_CHARACTER_SIZES[index][0]});
    const edited={...options,texts:['Pose','Views','','Background'],separator:'custom',customSeparator:' | '};
    assert.equal(module.qwen21CharacterPrompt(edited),'Pose | Views | Background');
    for (const [separator,expected] of [['newline','Pose\nViews\nBackground'],['comma','Pose, Views, Background'],['space','Pose Views Background'],['none','PoseViewsBackground']]) assert.equal(module.qwen21CharacterPrompt({...edited,separator}),expected);
    assert.equal(module.qwen21CharacterPrompt({...edited,skipEmpty:false}),'Pose | Views |  | Background');
    assert.equal(module.buildQwen21CharacterSheetWorkflow('character.png',edited)['27'].inputs.text_2,'Views');
    assert.throws(()=>module.buildQwen21CharacterSheetWorkflow('x.png',{...options,sizeIndex:7}),/size/);
    assert.throws(()=>module.buildQwen21CharacterSheetWorkflow('x.png',{...options,seed:-1}),/seed/);
    assert.throws(()=>module.buildQwen21CharacterSheetWorkflow('x.png',{...options,texts:['','','','']}),/prompt/);
});
test('Character Sheet readiness handles a graph without LoRAs and validates native model/cache/reference choices', () => {
    const settings=module.defaultQwen21CharacterSheetOptions();
    const graph=module.buildQwen21CharacterSheetWorkflow('character.png',settings);
    const info=Object.fromEntries(Object.values(graph).map(node=>[node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value])=>[key,[[value]]]))}}]));
    assert.doesNotThrow(()=>module.validateQwen21CharacterReadiness(graph,info));
    for(const key of ['weightDtype','clipDevice','cacheDevice','cacheDtype','referenceUpscale']) assert.throws(()=>module.validateQwen21CharacterReadiness(module.buildQwen21CharacterSheetWorkflow('character.png',{...settings,[key]:'unavailable'}),info),/Unavailable/);
    delete info.PixaromaTextJoinFour;
    assert.throws(()=>module.validateQwen21CharacterReadiness(graph,info),/PixaromaTextJoinFour/);
});
test('separate Character Sheet view crops cover every pixel once and permit adjustable boundaries', () => {
    assert.deepEqual(module.characterSheetCropRects(1920,1088,[1/3,2/3]),[{x:0,y:0,width:640,height:1088},{x:640,y:0,width:640,height:1088},{x:1280,y:0,width:640,height:1088}]);
    const rects=module.characterSheetCropRects(1376,768,[0.2,0.6,0.85]);
    assert.equal(rects.reduce((total,rect)=>total+rect.width,0),1376);assert.equal(rects[1].x,rects[0].width);
    assert.throws(()=>module.characterSheetCropRects(100,100,[0.6,0.2]),/boundaries/);
    assert.throws(()=>module.characterSheetCropRects(100,100,[0,0.5]),/boundaries/);
    assert.throws(()=>module.characterSheetCropRects(2,2,[0.2,0.3]),/pixel/);
});
test('outpaint preview matches source ratio anchors, binary MP, snapping and final stitch dimensions', async () => {
    const settings = module.defaultQwen21OutpaintOptions();
    assert.deepEqual(module.qwen21OutpaintLayout(526,526,settings), {top:0,bottom:0,left:204,right:205,canvasWidth:935,canvasHeight:526,renderWidth:1920,renderHeight:1056,axis:'horizontal'});
    assert.equal(module.qwen21OutpaintLayout(526,526,{...settings,anchor:'left'}).left,409);
    assert.equal(module.qwen21OutpaintLayout(526,526,{...settings,anchor:'right'}).right,409);
    assert.equal(module.qwen21OutpaintLayout(526,526,{...settings,ratio:'9:16',anchor:'top'}).top,409);
    assert.equal(module.qwen21OutpaintLayout(526,526,{...settings,ratio:'1:1'}).left,0);
    const capped = module.qwen21OutpaintLayout(16000,16000,{...settings,mode:'sides',left:8192,right:8192,top:8192,bottom:8192});
    assert.equal(capped.canvasWidth,16384);assert.equal(capped.left,192);
    if (process.env.PIXAROMA_OUTPAINT_CORE) {
        const pixaroma = await import(pathToFileURL(process.env.PIXAROMA_OUTPAINT_CORE).href);
        for(const [width,height] of [[526,526],[400,999],[1600,900],[900,1600],[8,8],[2000,1100]])
        for(const mode of ['ratio','sides']) for(const ratio of module.QWEN21_OUTPAINT_RATIOS) for(const anchor of ['left','centre','right','top','middle','bottom']) for(const limit of [0,1,1.5,2]) {
            const options = {...settings,mode,ratio,anchor,limit,top:23,bottom:76,left:123,right:245};
            const pads = pixaroma.padsForState(options,width,height);
            const size = pixaroma.finalSize(width,height,pads,limit,32);
            const ours = module.qwen21OutpaintLayout(width,height,options);
            assert.deepEqual({top:ours.top,bottom:ours.bottom,left:ours.left,right:ours.right},pads);
            assert.deepEqual({w:ours.renderWidth,h:ours.renderHeight},size);
        }
    }
});
test('outpaint uses source encoding, cache, alpha split and original-image stitch without a latent mask', () => {
    const settings = module.defaultQwen21OutpaintOptions();
    const graph = module.buildQwen21OutpaintWorkflow('source.png', settings);
    assert.equal(graph['9'].inputs.resolution, 0); assert.deepEqual(graph['9'].inputs['images.image_1'], ['22', 0]);
    assert.deepEqual(graph['10'].inputs.latent_image, ['9', 2]); assert.equal(graph['10'].inputs.steps, 25);
    assert.deepEqual(graph['24'].inputs.outpaint_info, ['22', 3]); assert.equal(graph['24'].inputs.feather, 32); assert.equal(graph['24'].inputs.color_match, 100);
    assert.equal(graph['23'].class_type, 'SplitImageWithAlpha'); assert.deepEqual(graph['12'].inputs.image, ['24', 0]);
    assert.ok(!Object.values(graph).some(node => node.class_type === 'SetLatentNoiseMask'));
    assert.equal(JSON.parse(graph['22'].inputs.OutpaintState).color, '#808080');
    assert.equal(JSON.parse(graph['25'].inputs.LoraLoaderState).loras.length, 1);
    settings.extraLora = { name:'extra.safetensors',enabled:true,modelStrength:0.5,clipStrength:0.5 };
    settings.scene = 'Continue the garden.';
    const changed = module.buildQwen21OutpaintWorkflow('source.png', settings);
    assert.equal(JSON.parse(changed['25'].inputs.LoraLoaderState).loras.length, 2);
    assert.equal(JSON.parse(changed['7'].inputs.PromptState).text, module.QWEN21_OUTPAINT_PROMPT + ' Scene: Continue the garden.');
    assert.throws(() => module.buildQwen21OutpaintWorkflow('source.png',{...settings,left:-1}),/padding/);
});
test('outpaint readiness checks cache choices and both enabled LoRAs before execution', () => {
    const settings = module.defaultQwen21OutpaintOptions();
    const graph = module.buildQwen21OutpaintWorkflow('source.png',settings);
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type,{input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value]) => [key,[[value]]]))}}]));
    info.LoraLoaderModelOnly = {input:{required:{lora_name:[[settings.outpaintLora.name]]}}};
    info.QwenImage21Cache.input.required.device = ['COMBO',{options:['auto','cpu']}];
    info.QwenImage21Cache.input.required.dtype = ['COMBO',{options:['default','float16']}];
    assert.doesNotThrow(() => module.validateQwen21OutpaintReadiness(graph,info));
    assert.throws(() => module.validateQwen21OutpaintReadiness(module.buildQwen21OutpaintWorkflow('source.png',{...settings,cacheDevice:'unavailable'}),info),/QwenImage21Cache.device/);
    assert.throws(() => module.validateQwen21OutpaintReadiness(module.buildQwen21OutpaintWorkflow('source.png',{...settings,cacheDtype:'unavailable'}),info),/QwenImage21Cache.dtype/);
    const extraLora = {name:'QWEN/missing.safetensors',enabled:true,modelStrength:0.5,clipStrength:1};
    assert.throws(() => module.validateQwen21OutpaintReadiness(module.buildQwen21OutpaintWorkflow('source.png',{...settings,extraLora}),info),/missing.safetensors/);
    assert.doesNotThrow(() => module.validateQwen21OutpaintReadiness(module.buildQwen21OutpaintWorkflow('source.png',{...settings,extraLora:{...extraLora,enabled:false}}),info));
});
test('outpaint execution graph matches the supplied JSON', {skip:!process.env.QWEN21_OUTPAINT_WORKFLOW}, () => {
    const reference = JSON.parse(readFileSync(process.env.QWEN21_OUTPAINT_WORKFLOW,'utf8'));
    for(const id of ['17','18','19','20']) delete reference[id];
    const graph = module.buildQwen21OutpaintWorkflow(reference['5'].inputs.image,module.defaultQwen21OutpaintOptions());
    const normalize = workflow => Object.fromEntries(Object.entries(workflow).map(([id,node]) => [id,{class_type:node.class_type,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value]) => [key,key.endsWith('State')?JSON.parse(value):value]))}]));
    assert.deepEqual(normalize(graph),normalize(reference));
});
test('both attached execution graphs match exactly, excluding decorative UI nodes and metadata', { skip: !process.env.QWEN21_STANDARD_WORKFLOW || !process.env.QWEN21_TURBO_WORKFLOW }, () => {
    for (const mode of ['t2i', 'turbo']) {
        const reference = JSON.parse(readFileSync(mode === 't2i' ? process.env.QWEN21_STANDARD_WORKFLOW : process.env.QWEN21_TURBO_WORKFLOW, 'utf8'));
        const settings = { ...module.defaultQwen21Settings(mode), prompt: 'A tree.' };
        const graph = module.buildQwen21Workflow(mode, settings, 42);
        delete reference['12']; delete reference['13']; delete reference['14']; delete reference['15']; delete reference['16'];
        reference['5'].inputs.PromptState = JSON.stringify({ text: 'A tree.', order: 'mine', sep: ', ' });
        reference['6'].inputs.SeedState = JSON.stringify({ runSeed: 42 }); reference['6'].inputs.seed = 42;
        const normalize = workflow => Object.fromEntries(Object.entries(workflow).map(([id, node]) => [id, { class_type: node.class_type, inputs: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) => [key, key.endsWith('State') ? JSON.parse(value) : value])) }]));
        assert.deepEqual(normalize(graph), normalize(reference));
    }
});
test('Qwen 2.1 has exact per-workflow sizes and reversible orientations', () => {
    assert.deepEqual(module.QWEN21_SIZES.t2i, [[1024,1024],[1152,864],[1248,832],[1376,768],[1536,1536]]);
    assert.deepEqual(module.QWEN21_SIZES.turbo, [[1024,1024],[1152,864],[1248,832],[1376,768],[1920,1088],[1536,1536],[2560,1440],[2048,2048],[2400,1792],[2528,1696],[2752,1536]]);
    for (const mode of ['t2i','turbo']) for (const [sizeIndex, size] of module.QWEN21_SIZES[mode].entries()) {
        for (const orientation of ['landscape','portrait']) {
            const settings = { ...module.defaultQwen21Settings(mode), sizeIndex, orientation, prompt: 'A tree.' };
            const dimensions = module.qwen21Dimensions(mode, settings);
            assert.equal(dimensions.width, orientation === 'landscape' ? Math.max(...size) : Math.min(...size));
            assert.equal(dimensions.height, orientation === 'landscape' ? Math.min(...size) : Math.max(...size));
            const state = JSON.parse(module.buildQwen21Workflow(mode, settings, 42)['4'].inputs.SizesState);
            assert.deepEqual(state.sizes, module.QWEN21_SIZES[mode]); assert.equal(state.w, dimensions.width); assert.equal(state.h, dimensions.height);
        }
    }
});
test('normal KSampler and Turbo sigma graphs stay distinct with source execution values', () => {
    for (const mode of ['t2i','turbo']) {
        const settings = { ...module.defaultQwen21Settings(mode), prompt: 'A tree.', negativePrompt: 'blur' };
        const graph = module.buildQwen21Workflow(mode, settings, 42);
        assert.equal(graph['7'].class_type, 'TextEncodeQwenImage21'); assert.equal(graph['7'].inputs.resolution, 1024);
        assert.equal(graph['7'].inputs.negative_prompt, 'blur'); assert.equal(graph['11'].class_type, 'PixaromaPreview');
        assert.equal(graph['1'].inputs.unet_name, 'qwen_image_2.1_int8_convrot.safetensors');
        if (mode === 't2i') {
            assert.equal(graph['9'].inputs.steps, 25); assert.deepEqual(graph['9'].inputs.seed, ['6',0]); assert.deepEqual(graph['9'].inputs.negative, ['7',1]);
            assert.equal(graph['23'], undefined); assert.deepEqual(graph['17'].inputs.model, ['18',0]);
        } else {
            assert.equal(graph['9'], undefined); assert.equal(graph['22'].inputs.steps, 6);
            assert.deepEqual(graph['23'].inputs, { steps: 3, start_at_sigma: -1, end_at_sigma: 0.95, spacing: 'linear', sigmas: ['22',0] });
            assert.equal(graph['19'].inputs.max_shift, 0.69); assert.equal(graph['19'].inputs.base_shift, 0.5);
            assert.equal(graph['24'].class_type, 'BasicGuider'); assert.deepEqual(graph['25'].inputs.sigmas, ['23',0]);
        }
        for (const node of Object.values(graph)) for (const value of Object.values(node.inputs)) if (Array.isArray(value)) assert.ok(graph[value[0]]);
        module.setQwen21WorkflowSeed(graph, 98); assert.equal(graph['6'].inputs.seed, 98); assert.equal(JSON.parse(graph['6'].inputs.SeedState).runSeed, 98);
    }
});
test('six independent LoRA slots retain names, enabled flags and both strengths', () => {
    for (const mode of ['t2i','turbo']) {
        const settings = module.defaultQwen21Settings(mode); assert.equal(settings.loras.length, 6);
        assert.equal(settings.loras[0].enabled, mode === 'turbo');
        settings.prompt = 'A tree.';
        settings.loras = settings.loras.map((entry,index) => ({ name:`lora-${index}`, enabled:index !== 3, modelStrength:index/10, clipStrength:1 }));
        const state = JSON.parse(module.buildQwen21Workflow(mode, settings, 42)['18'].inputs.LoraLoaderState);
        assert.equal(state.loras.length, 6); assert.equal(state.loras[3].on, false); assert.equal(state.loras[5].sm, 0.5);
        assert.throws(() => module.buildQwen21Workflow(mode, {...settings, loras:[...settings.loras, settings.loras[0]]},42), /six/);
    }
});
test('readiness rejects missing Qwen/Pixaroma nodes and enabled missing LoRAs', () => {
    const settings = { ...module.defaultQwen21Settings('turbo'), prompt:'A tree.' };
    const graph = module.buildQwen21Workflow('turbo',settings,42);
    assert.throws(() => module.validateQwen21Readiness(graph, {}), /TextEncodeQwenImage21/);
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type,{ input:{required:Object.fromEntries(Object.entries(node.inputs).map(([key,value]) => [key,[[value]]]))} }]));
    info.LoraLoaderModelOnly = {input:{required:{lora_name:[settings.loras.filter(lora => lora.enabled).map(lora => lora.name)]}}};
    module.validateQwen21Readiness(graph,info);
    for (const [node, key] of [['ModelAttentionBackend', 'attention'], ['KSamplerSelect', 'sampler_name'], ['BasicScheduler', 'scheduler']]) {
        const values = info[node].input.required[key][0];
        info[node].input.required[key] = ['COMBO', { options: values, multiselect: false }];
        assert.deepEqual(module.getQwen21Choices(info, node, key), values);
    }
    module.validateQwen21Readiness(graph,info);
    info.LoraLoaderModelOnly.input.required.lora_name = [[]]; assert.throws(() => module.validateQwen21Readiness(graph,info),/Unavailable Qwen 2.1 LoRA/);
    assert.throws(() => module.buildQwen21Workflow('t2i', {...module.defaultQwen21Settings('t2i'),prompt:' '},42),/prompt/);
});