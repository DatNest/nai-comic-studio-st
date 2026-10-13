/** Pure helpers for NAI Comic Studio. No SillyTavern globals. */
export const RATIOS = { '1:1':[1024,1024], '2:3':[832,1216], '3:2':[1216,832], '9:16':[768,1344], '16:9':[1344,768] };
export const SIZES = {
  small: {'1:1':[640,640],'2:3':[512,768],'3:2':[768,512],'9:16':[448,832],'16:9':[832,448]},
  normal: RATIOS,
  large: {'1:1':[1472,1472],'2:3':[1024,1536],'3:2':[1536,1024],'9:16':[1088,1920],'16:9':[1920,1088]}
};
export const BASE_DEFAULTS = {
  enabled:true, auto:false, attach:true, model:'nai-diffusion-5-full', aspect:'2:3', size:'normal',
  steps:23,cfg:7,cfgRescale:0,sampler:'k_euler_ancestral',seed:-1,
  apiKey:'', endpoint:'https://image.novelai.net', qwenProfile:'', qwenMaxTokens:700,
  styleActive:'default-style', negativeActive:'default-negative',
  styles:[{id:'default-style',name:'Новелла',value:'0.5::artist:daimou ruaeru::, 1::artist:suzumi_(ccroquette)::, 0.2::artist:n_sol::, very aesthetic, absurdres, year 2026, artist:dango 23, 1.2::artist:faxparduo::, 0.8::artist:aransmind::, artist:east_100, artist:angrymiloras, muted colors, pale colors, soft warm light, subtle shading, delicate lineart'}],
  negatives:[{id:'default-negative',name:'Стандартный',value:'lowres, bad anatomy, bad hands, extra limbs, extra fingers, poorly drawn hands, jpeg artifacts, watermark, text artifacts, multiple boys, multiple girls'}],
  characters:{}, personas:{}, aliases:{}, chatScene:{}, autoProcessed:{},
  debugLog:[], lastRequest:null, lastScene:null,
};
export function normalize(text) { return String(text ?? '').replace(/\s+/g,' ').trim(); }
export function uniqueTexts(values){ const seen = new Set(); return (values||[]).map(normalize).filter(s => s && (!seen.has(s) && seen.add(s))); }
export function libDescription(entry){ if(!entry) return ''; const items=[];
 if(entry.mainEnabled !== false) items.push(entry.main || '');
 for(const extra of entry.extra || []) if(extra.enabled !== false) items.push(extra.text || '');
 return uniqueTexts(items).join(' ');
}
export function legacyDescription(entry){ if(!entry) return ''; const primary=entry.primary?.enabled === false?'':entry.primary?.description||'';
 const rest=(entry.appearanceItems||[]).filter(x=>x.enabled !== false).map(x=>x.description||'');
 return uniqueTexts([primary,...rest]).join(' ');
}
export function importOldLibrary(current, legacy){
 const next = {...current, characters:{...current.characters}, personas:{...current.personas}};
 for(const [kind,srcName] of [['characters','characters'],['personas','users']]){
   for(const [key,entry] of Object.entries(legacy?.characterReferenceLibrary?.[srcName]||{})){
     const targetKey=kind==='personas' && key.startsWith('persona:')?'avatar:'+key.slice(8):key;
     if(next[kind][targetKey] && libDescription(next[kind][targetKey])) continue;
     next[kind][targetKey]={name:entry.displayName||'',main:entry.primary?.description||'',mainEnabled:entry.primary?.enabled!==false,tag:kind==='personas'?'girl':'boy',
       extra:(entry.appearanceItems||[]).filter(i=>i.type!=='image'||i.description).map((i,idx)=>({id:i.id||'import-'+idx,enabled:i.enabled!==false,text:i.description||''}))};
   }
 }
 for(const [key,name] of [['styles','styles'],['negatives','negativePrompts']]){
   if((legacy?.[name]||[]).length)next[key]=legacy[name].map(x=>({id:String(x.id),name:String(x.name),value:String(x.value||'')}));
 }
 if(legacy?.activeStyleId && next.styles.some(x=>x.id===legacy.activeStyleId))next.styleActive=legacy.activeStyleId;
 if(legacy?.activeNegativePromptId && next.negatives.some(x=>x.id===legacy.activeNegativePromptId))next.negativeActive=legacy.activeNegativePromptId;
 if(!next.apiKey && legacy?.apiKey)next.apiKey=legacy.apiKey;
 return next;
}
export function makePrompt({scene, character,persona,characterLabel,personaLabel,style='',negative=''}){
 const appearanceChar=libDescription(character); const appearancePersona=libDescription(persona);
 if(!appearanceChar || !appearancePersona)throw new Error(`Отсутствует описание: ${!appearanceChar?'персонажа ':''}${!appearancePersona?'персоны':''}. Генерация отменена, Anlas не расходуются.`);
 const tags=[character?.tag||'boy',persona?.tag||'girl'];
 const counts=[...new Set(tags)].map(tag=>`${tags.filter(x=>x===tag).length}${tag==='boy'?'boy':tag==='girl'?'girl':'other'}`).join(', ');
 const base=uniqueTexts([counts,style,scene?.base]).join(', ');
 const maleSection=uniqueTexts([`${character?.tag||'boy'}, ${characterLabel}`,appearanceChar,scene?.character]).join(', ');
 const femaleSection=uniqueTexts([`${persona?.tag||'girl'}, ${personaLabel}`,appearancePersona,scene?.persona]).join(', ');
 const positive={base, chars:[maleSection,femaleSection]};
 // All character captions are assembled ONCE. The global base deliberately contains no identity descriptions.
 return {positive,negative:normalize(negative),display:[base,maleSection,femaleSection].join(' | ')};
}
export function novelaiRequest(s,assembled){
 const positive=assembled.positive;
 const medium=s.model==='nai-diffusion-5-full-medium';
 const negativeText=medium?'lowres, artistic error, film grain, worst quality, bad quality, jpeg artifacts, very displeasing, watermark, multiple views, blank page':assembled.negative;
 const dims=(SIZES[s.size]||SIZES.normal)[s.aspect] || SIZES.normal['2:3'];
 const seed=Number(s.seed)<0?Math.floor(Math.random()*4294967296):Math.floor(Number(s.seed));
 const v5=(s.model||'').startsWith('nai-diffusion-5-');
 const cap=(base,chars)=>({base_caption:base,char_captions:chars.map((char_caption,i)=>({char_caption,centers:[{x:i===0?0.35:0.65,y:0.5}]}))});
 const params={params_version:4,width:dims[0],height:dims[1],steps:Number(s.steps),scale:Number(s.cfg),cfg_rescale:Number(s.cfgRescale),sampler:s.sampler||'k_euler_ancestral',seed,n_samples:1,negative_prompt:negativeText,qualityToggle:false,ucPreset:medium?0:3,deliberate_euler_ancestral_bug:false,prefer_brownian:true,
   v4_prompt:{caption:cap(positive.base,positive.chars),use_coords:false,use_order:true},
   v4_negative_prompt:{caption:cap(negativeText,positive.chars.map(()=>'')),legacy_uc:false}};
 if(!v5)params.noise_schedule='karras';
 if(s.model==='nai-diffusion-5-full-medium'){params.steps=14;params.sampler='k_euler_ancestral';delete params.cfg_rescale;}
 return {action:'generate',model:s.model,input:positive.base,parameters:params};
}
export function parseSceneLLM(raw){
 let source=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const a=source.indexOf('{'),b=source.lastIndexOf('}');if(a<0||b<=a)throw new Error('Qwen не вернул JSON сцены. Исправь или повтори предпросмотр.');
 const v=JSON.parse(source.slice(a,b+1));
 for(const k of ['base','character','persona'])if(typeof v[k]!=='string'||!v[k].trim())throw new Error(`Qwen не заполнил поле ${k}.`);
 // Never interpret pipes as additional NovelAI characters; individual scene fields are fixed.
 return {base:normalize(v.base).replace(/\|/g,','),character:normalize(v.character).replace(/\|/g,','),persona:normalize(v.persona).replace(/\|/g,',')};
}
export function stripRpText(text){return String(text||'').replace(/<naicom>[\s\S]*?<\/naicom>/ig,'').replace(/<!-- NAI_COMIC_START -->[\s\S]*?<!-- NAI_COMIC_END -->/ig,'').replace(/<[^>]*>/g,' ').replace(/\[[Ii][Mm][Gg]:[^\]]*\]/g,'').replace(/\s+/g,' ').trim();}
export function trackerClothing(chat){
 if(!Array.isArray(chat))return '';
 const key=/outfit|clothing|clothes|wearing|одежд|наряд|гардероб/i;
 const lines=[];let data;
 for(let i=chat.length-1;i>=0;i--){ const obj=chat[i]?.extra?.WTracker?.value;if(obj&&typeof obj==='object'){data=obj;break;} }
 if(!data)return '';
 const visited = new Set();
 function walk(o,path,depth){ if(depth>7||!o||typeof o!=='object'||visited.has(o)||lines.length>18)return; visited.add(o);
  for(const [k,v] of Object.entries(o)){const p=path?path+'.'+k:k;
    if(key.test(k)&&v!==null&&v!==undefined){ const vtext=typeof v==='string'?v:JSON.stringify(v); lines.push(`${p}: ${String(vtext).slice(0,600)}`); }
    else if(typeof v==='object')walk(v,p,depth+1);
  }} walk(data,'',0);return lines.join('\n').slice(0,2800);
}
