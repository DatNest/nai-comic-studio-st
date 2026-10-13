/** Pure, testable prompt and settings helpers. No browser/SillyTavern dependencies. */
export const RATIOS = { '1:1':[1024,1024], '2:3':[832,1216], '3:2':[1216,832], '9:16':[768,1344], '16:9':[1344,768] };
export const SIZES = {
  small: {'1:1':[640,640],'2:3':[512,768],'3:2':[768,512],'9:16':[448,832],'16:9':[832,448]},
  normal: RATIOS,
  large: {'1:1':[1472,1472],'2:3':[1024,1536],'3:2':[1536,1024],'9:16':[1088,1920],'16:9':[1920,1088]},
};
export const EXTRACT_INSTRUCTIONS = {
  'character.clothing':'Determine ONLY current visible garments and worn accessories for the chat character. Prioritize the clothing tracker and the latest explicit change. Do not invent clothes or jewelry.',
  'character.action':'Determine ONLY the character current pose, physical actions, hand positions, contact and gaze. Never invent a kiss or a gesture.',
  'character.emotion':'Determine ONLY the character current emotional state and visible expression from the latest RP moment.',
  'persona.clothing':'Determine ONLY current visible garments and worn accessories for the active persona. Prioritize the clothing tracker and the latest explicit change. Do not invent clothes or jewelry.',
  'persona.action':'Determine ONLY the persona current pose, physical actions, hand positions, contact and gaze. Never invent a kiss or a gesture.',
  'persona.emotion':'Determine ONLY the persona current emotional state and visible expression from the latest RP moment.',
};
export const QWEN_DEFAULT = "You are SHINO COMIC DIRECTOR, adapting the proven ExtBlocks naicom page-planning rules to NAI Comic Studio.\n\nNON-NEGOTIABLE OUTPUT: A single VALID JSON object, nothing else:\n{\"base\":\"...\",\"character\":{\"clothing\":\"...\",\"action\":\"...\",\"emotion\":\"...\"},\"persona\":{\"clothing\":\"...\",\"action\":\"...\",\"emotion\":\"...\"},\"npcs\":[]}\n\nYou are writing the SCENE ONLY. The extension, not Qwen, supplies permanent appearance from its image character library and adds Danbooru tags and style to the official NovelAI V5 character-prompt API. Never describe permanent eye colors, face, hairstyle, body shape, tattoos, freckles, ages, beauty marks, or other lasting design features. Avoid repetition between fields. The roleplay's most recent established event is authoritative. WTracker clothing data and the latest explicit change define clothing, NOT a model default.\n\nCOPY SHINO'S PROVEN PANEL DIRECTING LOGIC:\n\nUse the latest established RP moment. The image library supplies permanent appearance. RP and tracker supply the current scene, emotions, actions and clothing. Preserve everything that is still valid within scene continuity.\n\nBASE: PAGE AND ACTION\n\nDescribe the setting and visible scene and then each panel. Do NOT include gender-count tags; the extension prepends those automatically. The extension also adds recognized comic layout tags; you must supply the actual composition. Names identify participants here; clothing belongs in character/persona fields and permanent appearance belongs to the image library.\n\nUse ONE dominant \"Main frame\" and 1–3 smaller \"Focus frame\" panels. The \"Main frame\" occupies roughly two thirds of the page. \"Focus frame\" panels are compact insets or small adjacent panels, not an equal grid. Use narrow gutters and scene-filled outer edges. State the position of every panel clearly and consistently. Focus frames may contain chibi versions of characters doing something, interacting, reacting, or expressing the character's current mood.\n\nFor conversation and close interaction, the \"Main frame\" should be a tight chest-up two-shot, cropped around the chest or upper torso. Faces and the relevant interaction should fill most of the frame. With three or more participants, place additional speakers into separate close-up \"Focus frame\" panels rather than widening the \"Main frame\". Show close-ups of faces, expressions, hands, or already established physical contact. Choose every crop for its purpose; if an important action involves the lower body, use a localized detail panel for that action.\n\nDescribe only what is actually visible inside the selected crop. If only the upper half of the body is visible, do not describe lower-body clothing. Do not list a complete outfit and then request a portrait crop. Background objects should remain partial and secondary. For normal conversation, avoid \"full body\", \"long shot\", and \"wide shot\". Do not paste these forbidden terms into the positive image prompt as a negative list.\n\nA chibi reaction gag is welcome when it fits the already established mood. Localize it to ONE small \"Focus frame\" and to the named character only, preferably as a chibi face or bust. The \"Main frame\" must retain normal proportions. Do not add global chibi tags to the base scene or identity descriptions.\n\nInside each base panel plan, identify participants, their relative position, gaze target and established interaction, leaving each person's detailed changing state to the character and persona fields. Bind physical contact to the named participants and the relevant body part. Matching detail panels must preserve the same contact and clothing state.\n\nCharacters must behave visually as though no viewer, camera, photographer, or audience exists. They live inside the scene and must direct their attention only toward another character, an object, an event, or another meaningful point within the scene. Never describe a character as looking at the viewer, looking into the camera, facing the audience, making eye contact with the viewer, posing for the camera, acknowledging the camera, or breaking the fourth wall unless the RP explicitly establishes that exact behavior. Do not use viewer-facing eye contact as a neutral default. Even when a face is shown frontally, the eyes must still be directed toward an in-scene person or object rather than outward toward the viewer. For every visible character, give a scene-internal gaze target whenever practical. Treat the viewer as completely nonexistent from the characters' perspective.\n\n\nCHARACTER AND PERSONA FIELDS (these replace Shino's | character prompt sections)\n\ncharacter means the active chat character (Yukio in this chat). persona means the current user persona (Ness in this chat). Their names and permanent appearance are supplied independently by the extension.\n\n- clothing: visible current garments and accessories including removed/displaced clothing when relevant, NOTHING invented. No glasses unless established as worn now; if removed, say removed.\n- action: precise current pose, relationship to the other named participant, hand position and contact points, direction of gaze. State visually unambiguous spatial roles and movements already established by RP. One participant's own actions ONLY in their field. Keep separate action ownership, e.g. mutual#hug can be used for a mutually established hug, source#hug and target#hug only when correct. Do not invent tags/behaviors.\n- emotion: visible expression and emotion, not commentary about internal thoughts or storytelling.\n- Any extra characters must be both present in the source RP and drawn from the allowed NPC list. Return them in the npcs array with name/clothing/action/emotion; otherwise [].\n\nTags are transmitted to NovelAI as standard Danbooru tags; favor useful known tags such as upper body, sitting, hugging, blush, looking at another, holding, indoors, couch when truthful. For unusual body contact, supplement short tags with plain unambiguous English. Do not emit a tag dump of invented details.\n\nIMPORTANT: This is one COMIC PAGE, not character turnaround, not poster, not portraits. The Main frame must clearly show the actual shared action. Focus frames show factual close details or a localized chibi reaction to that SAME instant. Do not create another person or change wardrobe between panels. Do not look at the viewer unless explicitly established.\n\nDIALOGUE\nUse no more than three short verbatim Russian lines already spoken in the current moment, with no more than one speech bubble per speaker. Preserve profanity. Select a complete short line or a self-contained excerpt rather than inventing or paraphrasing dialogue. A silent panel needs no text. Speech bubbles must not cover faces or identifying features.\n\nPut text into the base panel description only ONCE, with speaker and bubble tail: NAME has a speech bubble saying «Реплика». No second copy in character fields. Russian rendering may not be exact in the NovelAI model. Do not invent speech bubbles when none are called for.\n\n\n\nCONTINUITY AND ADULT SITUATIONS\n- Apply this section only when the established RP moment explicitly contains sexual activity. Do not infer sexual activity merely from romance, nudity, or physical closeness.\n- Preserve the already established level of explicitness. Do not sanitize an established sexual act and do not escalate beyond what is already occurring.\n- Use direct clinical Danbooru terminology. Do not use metaphors, romantic abstractions, euphemisms, poetic phrasing, or emotional embellishment in sexual descriptions.\n- When applicable, state the exact established sexual act using standard terms: \"missionary\", \"doggystyle\", \"cowgirl position\", \"oral\", \"fellatio\", \"cunnilingus\", \"anal\", \"vaginal\", \"fingering\", \"handjob\", \"penetration\".\n- Describe only the currently established visible contact and garment state precisely, without inventing additions.\n- Describe only the currently established visible contact and garment state precisely, without inventing additions.\n- Describe clothing state mechanically and precisely for every relevant participant: \"naked\", \"partially undressed\", \"clothes pulled down\", \"shirt lifted\", \"bottomless\", or another directly established state.\n- Keep anatomy, clothing state, pose, penetration, and contact ownership inside the relevant named \"Main frame\" or \"Focus frame\" description.\n- Use a dedicated close-up \"Focus frame\" when an established sexual contact point would otherwise be too small or ambiguous.\n- Do not invent an x-ray Focus frame; show only what is explicitly requested by the scene.\n- X-ray illustration is optional only if the roleplay explicitly calls for it.\n\n\n\n- Preserve established anatomy, fluids, clothing displacement, penetration, and contact consistently between the main frame and the close-up.\n- Explicit scenes do not automatically become POV. The viewer still does not exist from the characters' perspective. Characters must not look toward the viewer, camera, or imagined audience during explicit scenes unless such behavior is explicitly established in the RP itself.\n- Dialogue rules remain unchanged in explicit scenes.\n\n\n\nNever add quality/artists/rendering/year/style/negative tags: extension owns those. No HTML, no | separators, no Markdown. Escape JSON quotes properly. Prefer 50-110 words for base and 10-40 words per individual action/clothing/emotion field, but do not omit critical specifics. Preserve the original Shino visual directing precision. Return only valid JSON.";
export const SCENE_FORMAT_CONTRACT = `CRITICAL OUTPUT CONTRACT FOR NOVELAI V5:
Return ONLY one JSON object with keys base (English string), character and persona (objects with clothing, action, emotion strings), npcs (array of {name,clothing,action,emotion}). Do not include permanent appearance. The extension builds two separate character captions from the library, so do not insert literal | character separators. Stick to established events and clothing with no invention. The base gives a definite main-panel+focus-panels composition and the setting. Separate detailed character actions and emotions correctly: actions by Yukio go into character.action; actions by Ness go into persona.action. If an action is mutual, specify who does what in each action field. Use NAI-friendly concise visual language and known image tags where natural. JSON ONLY.
`;

export const BASE_DEFAULTS = {
  enabled:true, auto:false, attach:true, readable:true, model:'nai-diffusion-5-full', aspect:'2:3', size:'normal',
  steps:23,cfg:7,cfgRescale:0,sampler:'k_euler_ancestral',seed:-1,
  apiKey:'', endpoint:'https://image.novelai.net', qwenProfile:'', qwenMaxTokens:1100,
  styleActive:'default-style', negativeActive:'default-negative',
  styles:[{id:'default-style',name:'Новелла',value:'0.5::artist:daimou ruaeru::, 1::artist:suzumi_(ccroquette)::, 0.2::artist:n_sol::, very aesthetic, absurdres, year 2026, artist:dango 23, 1.2::artist:faxparduo::, 0.8::artist:aransmind::, artist:east_100, artist:angrymiloras, muted colors, pale colors, soft warm light, subtle shading, delicate lineart'}],
  negatives:[{id:'default-negative',name:'Стандартный',value:'lowres, bad anatomy, bad hands, extra limbs, extra fingers, poorly drawn hands, jpeg artifacts, watermark, text artifacts'}],
  characters:{}, personas:{}, aliases:{}, chatProfiles:{}, npcs:[], chatScene:{}, autoProcessed:{},
  debugLog:[], lastRequest:null, lastScene:null,
};
export function normalize(text) { return String(text ?? '').replace(/\s+/g,' ').trim(); }

/** Repair a lone numeric-weight opener like 0.9::backlighting, without changing properly paired weights. */
export function normalizeNovelAIStyle(style){
 const text=normalize(style);
 if((text.match(/::/g)||[]).length%2===0)return text;
 // Repair only the final unmatched opener, bounded by the NEXT comma; keep complex valid weights untouched.
 const marker=/(-?\d+(?:\.\d+)?::[^,:\n]+)(?=,|$)/g;
 const matches=[...text.matchAll(marker)];
 if(!matches.length)return text;
 const last=matches[matches.length-1];
 const offset=last.index+last[0].length;
 return text.slice(0,offset)+'::'+text.slice(offset);
}
/** Matches the old sillyimages parser: treat style as its own text block, then join it
 * to the scene once when building a single NovelAI API base_caption. The API has NO style key. */
export function composeStyleScene(style, scene){
 const rawStyle=String(style??'').trim(); // do not rewrite user's Danbooru weights or artist tags
 const rawScene=String(scene??'').trim();
 return rawStyle && rawScene ? `${rawStyle}\n\n${rawScene}` : rawStyle || rawScene;
}
export function uniqueTexts(values){ const seen = new Set(); return (values||[]).map(normalize).filter(s => s && (!seen.has(s) && seen.add(s))); }
export function libDescription(entry){ if(!entry)return '';const items=[];if(entry.mainEnabled!==false)items.push(entry.main||'');for(const ex of entry.extra||[])if(ex.enabled!==false)items.push(ex.text||'');return uniqueTexts(items).join(' '); }
export function legacyDescription(entry){if(!entry)return '';return uniqueTexts([entry.primary?.enabled===false?'':entry.primary?.description||'',...(entry.appearanceItems||[]).filter(x=>x.enabled!==false).map(x=>x.description||'')]).join(' ');}
export function newChatProfile(){return {styleActive:'',negativeActive:'',qwenPrompt:QWEN_DEFAULT,partPrompts:{...EXTRACT_INSTRUCTIONS},notes:'',charNegative:'',personaNegative:'',allowEmptyPresets:false};}
export function effectivePreset(list, selected, label){
 const found=(list||[]).find(x=>String(x.id)===String(selected));
 if(!found || !normalize(found.value))throw new Error(`Не выбран заполненный пресет «${label}». Выбери его в библиотеке стилей/негативов до генерации.`);
 return normalize(found.value);
}
export function combineNegative(...items){return uniqueTexts(items).join(', ');}
export function detectNpcs(npcs, transcript){
 const found=[];const text=String(transcript||'');
 for(const entry of npcs||[]){
  if(entry.enabled===false || !entry.name || !libDescription(entry))continue;
  const triggers=[entry.name,...String(entry.triggers||'').split(/[,;\n]+/)].map(x=>x.trim()).filter(Boolean);
  const matches=triggers.some(t=>{const escaped=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,'iu').test(text);});
  if(matches)found.push(entry);
 }
 return found;
}
export function importOldLibrary(current,legacy){
 const next={...current,characters:{...current.characters},personas:{...current.personas}};
 for(const [kind,src] of [['characters','characters'],['personas','users']]){
  for(const [key,entry] of Object.entries(legacy?.characterReferenceLibrary?.[src]||{})){
   const targetKey=kind==='personas'&&key.startsWith('persona:')?'avatar:'+key.slice(8):key;
   if(next[kind][targetKey] && libDescription(next[kind][targetKey]))continue;
   next[kind][targetKey]={name:entry.displayName||'',main:entry.primary?.description||'',mainEnabled:entry.primary?.enabled!==false,tag:kind==='personas'?'girl':'boy',negative:'',extra:(entry.appearanceItems||[]).filter(i=>i.type!=='image'||i.description).map((i,idx)=>({id:i.id||'import-'+idx,enabled:i.enabled!==false,text:i.description||''}))};
  }
 }
 for(const [key,name] of [['styles','styles'],['negatives','negativePrompts']])if((legacy?.[name]||[]).length)next[key]=legacy[name].map(x=>({id:String(x.id),name:String(x.name),value:String(x.value||x.prompt||x.text||'')}));
 if(legacy?.activeStyleId&&next.styles.some(x=>x.id===legacy.activeStyleId))next.styleActive=legacy.activeStyleId;
 if(legacy?.activeNegativePromptId&&next.negatives.some(x=>x.id===legacy.activeNegativePromptId))next.negativeActive=legacy.activeNegativePromptId;
 if(!next.apiKey&&legacy?.apiKey)next.apiKey=legacy.apiKey;
 return next;
}
export function parseSceneLLM(raw){
 const source=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const a=source.indexOf('{'),b=source.lastIndexOf('}');
 if(a<0||b<=a)throw new Error('Qwen не вернул JSON. Проверь инструкцию в настройках чата.');
 const v=JSON.parse(source.slice(a,b+1));if(typeof v.base!=='string'||!v.base.trim())throw new Error('Qwen не заполнил сцену (base).');
 const clean=x=>normalize(x).replace(/\|/g,',');
 const role=k=>{if(typeof v[k]==='string')return {clothing:'',action:clean(v[k]),emotion:''};if(!v[k]||typeof v[k]!=='object')return {clothing:'',action:'',emotion:''};return {clothing:clean(v[k].clothing),action:clean(v[k].action),emotion:clean(v[k].emotion)};};
 const npcs=Array.isArray(v.npcs)?v.npcs.filter(n=>n&&typeof n.name==='string').map(n=>({name:clean(n.name),clothing:clean(n.clothing),action:clean(n.action),emotion:clean(n.emotion)})):[];
 return {base:clean(v.base),character:role('character'),persona:role('persona'),npcs};
}
export function makePrompt({scene,character,persona,characterLabel,personaLabel,style='',negative='',charNegative='',personaNegative='',npcEntries=[]}){
 const a=libDescription(character),b=libDescription(persona);
 if(!a||!b)throw new Error(`Отсутствует описание ${!a?'персонажа ':''}${!b?'персоны':''}. Генерация отменена.`);
 const c=scene?.character||{},p=scene?.persona||{};
 const describe=(role)=>typeof role==='string'?role:uniqueTexts([role.clothing,role.action,role.emotion]).join(', ');
 const roleCaption=(entry,label,role,tag)=>{
  // Give the model the pose/outfit before long permanent features, but preserve ALL library details.
  const main=entry?.mainEnabled===false?'':normalize(entry?.main);
  const details=uniqueTexts((entry?.extra||[]).filter(x=>x.enabled!==false).map(x=>x.text));
  return uniqueTexts([tag,label,describe(role),main,...details]).join(', ');
 };
 const captions=[roleCaption(character,characterLabel,c,character?.tag||'boy'),roleCaption(persona,personaLabel,p,persona?.tag||'girl')];
 const characterNeg=[combineNegative(charNegative,character?.negative),combineNegative(personaNegative,persona?.negative)];
 const names=[characterLabel,personaLabel];const tags=[character?.tag||'boy',persona?.tag||'girl'];
 const byName=new Map((scene?.npcs||[]).map(x=>[x.name.toLocaleLowerCase(),x]));
 const selected=[];
 for(const npc of npcEntries){if(npc.enabled===false)continue;const aliases=[npc.name,...String(npc.triggers||'').split(/[,;\n]+/)].map(x=>x.trim().toLocaleLowerCase()).filter(Boolean);const npcScene=aliases.map(x=>byName.get(x)).find(Boolean);if(!npcScene)continue;
  const d=libDescription(npc);if(!d)throw new Error(`NPC «${npc.name}»: отсутствует описание.`);
  captions.push(roleCaption(npc,npc.name,npcScene,npc.tag||'other'));characterNeg.push(normalize(npc.negative||''));names.push(npc.name);tags.push(npc.tag||'other');selected.push(npc.name);
 }
 // NovelAI official multi-character prompting: numbers in BASE, unnumbered boy/girl in character captions.
 const counts=[...new Set(tags)].map(tag=>`${tags.filter(t=>t===tag).length}${tag==='boy'?'boy':tag==='girl'?'girl':'other'}`).join(', ');
 const rawScene=normalize(scene?.base);
 const panelMatch=rawScene.match(/\b([2-4])\s*(?:-\s*)?panels?\b/i);
 const numberPanels=panelMatch?Number(panelMatch[1]):3;
 // If Qwen repeats the comic or cast tags, suppress these duplicates rather than transmitting two copies.
 const sceneText=normalize(rawScene
   .replace(/\b(?:[2-4]\s*panels?|comic page|comic)\b/gi,'')
   .replace(/\b(?:1boy|1girl|[2-9]boys?|[2-9]girls?)\b/gi,'')
   .replace(/^[,;:\s]+|[,;:\s]+$/g,'')
   .replace(/[,;]\s*[,;]+/g,','));
 const layout=`comic, comic page, ${numberPanels} panels, multiple panels, one large main panel showing the interaction of both participants, ${numberPanels-1} smaller inset ${numberPanels-1===1?'panel':'panels'}, panel borders`;
 // Reproduce the ORIGINAL old image extension: STYLE is an independent unmodified text
 // block inserted before the scene with a BLANK LINE, in ONE base_caption and ONE API request.
 const sceneBase=uniqueTexts([counts,layout,sceneText]).join(', ');
 const cleanStyle=String(style??'').trim();
 const base=composeStyleScene(cleanStyle,sceneBase);
 const positive={style:cleanStyle,scene:sceneBase,base,chars:captions};
 return {positive,negative:normalize(negative),characterNegatives:characterNeg,display:[base,...captions].join(' | '),npcNames:selected};
}
export function novelaiRequest(s,assembled){
 const medium=s.model==='nai-diffusion-5-full-medium';const globalNeg=assembled.negative;
 const dims=(SIZES[s.size]||SIZES.normal)[s.aspect]||SIZES.normal['2:3'];const seed=Number(s.seed)<0?Math.floor(Math.random()*4294967296):Math.floor(Number(s.seed));
 const cap=(base,chars)=>({base_caption:base,char_captions:chars.map((char_caption,i)=>({char_caption,centers:[{x:0.5,y:0.5}]}))});
 const charNegs=(assembled.characterNegatives||[]).map(x=>normalize(x));
 const params={params_version:4,width:dims[0],height:dims[1],steps:Number(s.steps),scale:Number(s.cfg),cfg_rescale:Number(s.cfgRescale),sampler:s.sampler||'k_euler_ancestral',seed,n_samples:1,negative_prompt:globalNeg,qualityToggle:false,ucPreset:3,deliberate_euler_ancestral_bug:false,prefer_brownian:true,
  v4_prompt:{caption:cap(assembled.positive.base,assembled.positive.chars),use_coords:false,use_order:true},
  v4_negative_prompt:{caption:cap(globalNeg,charNegs),legacy_uc:false}};
 if(medium){params.steps=14;params.sampler='k_euler_ancestral';delete params.cfg_rescale;}
 if(!(s.model||'').startsWith('nai-diffusion-5-'))params.noise_schedule='karras';
 return {action:'generate',model:s.model,input:assembled.positive.base,parameters:params};
}
export function stripRpText(text){return String(text||'').replace(/<naicom>[\s\S]*?<\/naicom>/ig,'').replace(/<!-- NAI_COMIC_START -->[\s\S]*?<!-- NAI_COMIC_END -->/ig,'').replace(/<[^>]*>/g,' ').replace(/\[[Ii][Mm][Gg]:[^\]]*\]/g,'').replace(/\s+/g,' ').trim();}
export function trackerClothing(chat){if(!Array.isArray(chat))return '';const key=/outfit|clothing|clothes|wearing|одежд|наряд|гардероб/i;const lines=[];let data;
 for(let i=chat.length-1;i>=0;i--){const obj=chat[i]?.extra?.WTracker?.value;if(obj&&typeof obj==='object'){data=obj;break;}}if(!data)return '';
 const visited=new Set();function walk(o,path,depth){if(depth>7||!o||typeof o!=='object'||visited.has(o)||lines.length>18)return;visited.add(o);for(const [k,v]of Object.entries(o)){const p=path?path+'.'+k:k;if(key.test(k)&&v!=null){const vtext=typeof v==='string'?v:JSON.stringify(v);lines.push(`${p}: ${String(vtext).slice(0,600)}`);}else if(typeof v==='object')walk(v,p,depth+1);}}walk(data,'',0);return lines.join('\n').slice(0,2800);
}
