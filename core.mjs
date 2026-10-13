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
export const QWEN_DEFAULT = `You are a VISUAL SCENE EXTRACTOR for NovelAI V5 Full. Read the newest established RP moment as fact. Return JSON only: {"base":"...","character":{"clothing":"...","action":"...","emotion":"..."},"persona":{"clothing":"...","action":"...","emotion":"..."},"npcs":[]}. Write compact visual, tag-like English fragments instead of literary descriptions. The base field defines one LARGE main comic panel with the interacting couple and 1-2 small detail insets OF THE SAME MOMENT: setting, framing, lighting, precise pose, panel content and relative position. Character and persona fields contain ONLY their own clothing, actions and expressions. Current explicit clothing and removed accessories override old tracker or profile. Do not repeat permanent appearance. Do not invent poses, garments, contacts, kisses, people, text, props or background. If not established, leave an empty field. Never make white-background portraits or add model-sheet panels. Keep the action readable, give an unambiguous physical composition, and use visual specificity rather than abstract emotions. Output JSON only.`;export const SCENE_FORMAT_CONTRACT = `MANDATORY NOVELAI COMIC FORMAT (applies even with a customized Qwen prompt):
Return ONLY valid JSON with keys base, character, persona, npcs. character and persona each have clothing, action, emotion strings. The BASE field is a concise comma-separated visual description, NOT a literary paragraph. Name the exact one main two-person interaction and its visible setting. Describe a comic page with ONE large main panel showing both participants together and ONE or TWO smaller inset panels showing details of that same instant. Explicitly say what each panel depicts and where it is located. Keep the main interaction central; no isolated portraits, character sheets, white studio backdrop, unrelated headshots or second time slice. Describe camera distance clearly (chest-up, waist-up, or wider ONLY if contact requires it). Mention necessary furniture and surroundings. Preserve the roleplay action, posture and contact exactly; never invent more intimate contact than established.
For character.clothing/action/emotion, describe ONLY the chat character, not the persona. For persona.clothing/action/emotion, describe ONLY the user persona, not the chat character. Do not put sentences beginning with the other participant name into a role section. A partner name is allowed only to identify physical contact (for example, hand touching the partner shoulder). Outfit and accessories MUST come from the latest explicit state or tracker; never make up glasses, jewelry, garments, nudity, or their removal. If there is no confirmed outfit detail, return an empty clothing field. Expressions and contact must be visible and specific, not abstract romance.
Do not repeat hair, eyes, face, tattoos, freckles or body proportions: library supplies appearances later. Keep the role fields compact and tag-like, separated by commas. Output English only. Never wrap your JSON in explanations or markdown.`;

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
 const counts=[...new Set(tags)].map(tag=>`${tags.filter(t=>t===tag).length}${tag==='boy'?'boy':tag==='girl'?'girl':'other'}`).join(', ');
 const rawScene=normalize(scene?.base);
 const panelMatch=rawScene.match(/\b([2-4])\s*(?:-\s*)?panels?\b/i);
 const numberPanels=panelMatch?Number(panelMatch[1]):3;
 // Hard anchors to combat single-character portraits and white-background model sheets.
 const layout=`comic, comic page, ${numberPanels} panels, one large main panel, ${numberPanels-1} small inset ${numberPanels-1===1?'panel':'panels'}, main panel containing both characters together, matching scene across inset panels, visible environment matching the described setting, dynamic interaction, sequential art`;
 const base=uniqueTexts([counts,layout,style,rawScene]).join(', ');
 const positive={base,chars:captions};return {positive,negative:normalize(negative),characterNegatives:characterNeg,display:[base,...captions].join(' | '),npcNames:selected};
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
