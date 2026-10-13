import { BASE_DEFAULTS, QWEN_DEFAULT, SCENE_FORMAT_CONTRACT, EXTRACT_INSTRUCTIONS, newChatProfile, effectivePreset, detectNpcs, importOldLibrary, libDescription, makePrompt, novelaiRequest, parseSceneLLM, stripRpText, trackerClothing } from './core.mjs';
import { oai_settings, proxies, chat_completion_sources } from '../../../openai.js';

const MODULE = 'nai_comic_studio';
const ctx = () => SillyTavern.getContext();
const clone = v => JSON.parse(JSON.stringify(v));
let settings;
let busy = false;
let shownContext = '';
let currentScene = null;
let prepared = null;

let personaModule;

let personaLoadWarningShown = false;
let ui = null;

function initialize() {
  const c = ctx();
  if (!c.extensionSettings[MODULE]) c.extensionSettings[MODULE] = clone(BASE_DEFAULTS);
  settings = c.extensionSettings[MODULE];
  for(const [k,v] of Object.entries(BASE_DEFAULTS))if(settings[k]===undefined) settings[k]=clone(v);
  // This extension stores its own data and never mutates the other image generator settings.
  persist();
}
function persist(){ctx().saveSettingsDebounced();}
function log(level, msg){
  const line=`${new Date().toLocaleTimeString('ru-RU')} [${level}] ${msg}`;
  if(level==='ERROR') console.error('[NAI Comic]',msg);else console.info('[NAI Comic]',msg);
  settings.debugLog.push(line);
  if(settings.debugLog.length>150)settings.debugLog.splice(0,settings.debugLog.length-150);
  persist(); updateDebug();
}
function el(id){return document.getElementById('nai-comic-'+id)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function id(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;}
function chatConfig(){
 const key=currentChatId();if(!settings.chatProfiles)settings.chatProfiles={};
 if(!settings.chatProfiles[key]){
  const next=newChatProfile();next.styleActive=settings.styleActive||'default-style';next.negativeActive=settings.negativeActive||'default-negative';
  settings.chatProfiles[key]=next;persist();
 }
 const entry=settings.chatProfiles[key];
 if(!entry.partPrompts)entry.partPrompts={...EXTRACT_INSTRUCTIONS};
 if(typeof entry.qwenPrompt!=='string')entry.qwenPrompt=QWEN_DEFAULT;
 return entry;
}
function activeEntry(kind,key){return settings[kind]?.[key]||null;}
function profileList(){return ctx().extensionSettings?.connectionManager?.profiles||[];}
function getCharIdentity(){const c=ctx(), char=c.characters?.[c.characterId];if(!char)return {key:'',name:'Персонаж не выбран'};
 return {key:char.avatar?'avatar:'+char.avatar:'name:'+char.name,name:char.name||'Персонаж'};}
async function getPersonaIdentity(){
 const c=ctx(); let avatar=String(c.user_avatar||c.userAvatar||'').trim();
 try{if(!personaModule)personaModule=await import('/scripts/personas.js'); if(personaModule?.user_avatar)avatar=String(personaModule.user_avatar);}catch(err){if(!personaLoadWarningShown){personaLoadWarningShown=true;log('WARN','Не удалось получить активную персону из модуля SillyTavern: '+err.message);}}
 if(!avatar && settings.personaOverride)avatar=settings.personaOverride.replace(/^avatar:/,'');
 const personaName=(c.powerUserSettings?.personas||{})[avatar]||c.name1||avatar||'Персона';
 return {key:avatar?'avatar:'+avatar:'',name:personaName};
}
async function currentIdentity(){const char=getCharIdentity(),persona=await getPersonaIdentity();return {char,persona};}
function currentChatId(){const c=ctx();return `${c.characterId||''}::${c.chatId||c.chatFile||c.chat_metadata?.chat_name||c.chat?.[0]?.send_date||''}`;}
function identityAliases(ident){
 const s=settings;
 const findEntry=(kind,identity)=>{
  if(s[kind][identity.key])return s[kind][identity.key];
  if(s.aliases?.[identity.key]&&s[kind][s.aliases[identity.key]])return s[kind][s.aliases[identity.key]];
  return null;
 };
 return { char:findEntry('characters',ident.char),persona:findEntry('personas',ident.persona)};
}
function createEntry(kind,key,name){if(!key)throw new Error('В SillyTavern не выбран персонаж или персона.');
 if(!settings[kind][key])settings[kind][key]={name,main:'',mainEnabled:true,tag:kind==='personas'?'girl':'boy',extra:[]};
 persist();return settings[kind][key];}
function selectStyle(kind){
 const list=settings[kind]||[],which=kind==='styles'?'style':'negative',select=el(which);
 if(!select)return;
 const profile=chatConfig(),key=kind==='styles'?'styleActive':'negativeActive';
 select.innerHTML='<option value="">— не использовать —</option>'+list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
 let active=profile[key];
 if(active && !list.some(x=>String(x.id)===String(active)))active='';
 if(!active&&list.some(x=>x.value?.trim())&&!profile.allowEmptyPresets){
  active=list.find(x=>x.value?.trim()).id;profile[key]=active;persist();
 }
 select.value=active||'';
 const v=el(which+'-text');if(v)v.value=list.find(x=>x.id===active)?.value||'';
 const indicator=el(which+'-state');if(indicator)indicator.textContent=active?`${(list.find(x=>x.id===active)?.value||'').trim().length} символов, включён`:'Не выбран — платная генерация остановится';
}
function fillProfiles(){const sel=el('qwen-profile');if(!sel)return; const list=profileList();sel.innerHTML='<option value="">— без Qwen, ручная сцена —</option>'+list.filter(x=>x.mode==='cc').map(x=>`<option value="${esc(x.name)}">${esc(x.name)} · ${esc(x.model)}</option>`).join('');sel.value=settings.qwenProfile||'';}
async function refreshIdentity(){
 if(!ui)return;
 const ident=await currentIdentity();const {char,persona}=identityAliases(ident);
 el('current-char').textContent=`${ident.char.name} · ${ident.char.key||'не выбран'}`;
 el('current-persona').textContent=`${ident.persona.name} · ${ident.persona.key||'не выбрана'}`;
 el('char-status').textContent=char?`${libDescription(char).length} символов описания`:'нет анкеты';
 el('persona-status').textContent=persona?`${libDescription(persona).length} символов описания`:'нет анкеты';
 el('char-main').value=char?.main||'';el('persona-main').value=persona?.main||'';
 el('char-enabled').checked=char?.mainEnabled!==false;el('persona-enabled').checked=persona?.mainEnabled!==false;
 el('char-tag').value=char?.tag||'boy';el('persona-tag').value=persona?.tag||'girl';
 for(const kind of ['char','persona']){ renderExtras(kind,kind==='char'?char:persona); el(kind+'-library-negative').value=(kind==='char'?char:persona)?.negative||''; }
 el('identity-warning').textContent=!ident.char.key||!ident.persona.key?'Нужно выбрать чат с персонажем и активную персону.':(!libDescription(char)||!libDescription(persona))?'Внимание: одна из анкет пуста. Генерация заблокирована до заполнения.':'Обе анкеты найдены; они будут отправлены в NovelAI один раз, каждая в своей секции.';
}
function renderExtras(kind,entry){
 const root=el(kind+'-extras');if(!root)return;root.replaceChildren();
 for(const [i,x] of (entry?.extra||[]).entries()){
  const card=document.createElement('details');card.className='ncs-extra';
  card.innerHTML=`<summary><span class="ncs-extra-heading">📝 Запись ${i+1}: ${esc(String(x.text||'').slice(0,46)||'Новая')}</span><span class="ncs-extra-controls"><input aria-label="Учитывать дополнительную запись" class="ncs-extra-enabled" type="checkbox" ${x.enabled!==false?'checked':''}> <button type="button" class="ncs-extra-delete" title="Удалить запись">✕</button></span></summary><label>Описание <textarea class="ncs-extra-text" rows="4" placeholder="Особенности внешности"></textarea></label>`;
  card.querySelector('textarea').value=x.text||'';
  card.querySelector('.ncs-extra-enabled').addEventListener('click',e=>e.stopPropagation());
  card.querySelector('.ncs-extra-enabled').addEventListener('change',e=>{x.enabled=e.target.checked;persist();prepared=null;});
  card.querySelector('.ncs-extra-delete').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();entry.extra=entry.extra.filter(i=>i!==x);persist();prepared=null;renderExtras(kind,entry);});
  card.querySelector('textarea').addEventListener('input',e=>{x.text=e.target.value;card.querySelector('.ncs-extra-heading').textContent=`📝 Запись ${i+1}: ${String(x.text||'').slice(0,46)||'Новая'}`;persist();prepared=null;el(kind+'-status').textContent=`${libDescription(entry).length} символов описания`;});
  root.append(card);
 }
}
function updateDebug(){if(el('logs'))el('logs').value=(settings.debugLog||[]).join('\n');if(el('debug-qwen'))el('debug-qwen').value=settings.lastQwenRaw||'';}
function setStatus(txt){if(el('status'))el('status').textContent=txt;}
function roleFromFields(role){return {clothing:el(`manual-${role}-clothing`)?.value?.trim()||'',action:el(`manual-${role}-action`)?.value?.trim()||'',emotion:el(`manual-${role}-emotion`)?.value?.trim()||''};}
function sceneFromManual(){
 const raw=el('manual-scene')?.value?.trim();if(!raw)return null;
 if(raw.startsWith('{'))return parseSceneLLM(raw);
 return {base:raw,character:roleFromFields('char'),persona:roleFromFields('persona'),npcs:currentScene?.npcs||[]};
}
function applyScene(v){
 currentScene=v;settings.chatScene[currentChatId()]=clone(v);settings.lastScene=clone(v);persist();
 el('manual-scene').value=v.base;
 for(const [source,role] of [['character','char'],['persona','persona']]){
  const obj=v[source]||{};
  for(const part of ['clothing','action','emotion'])el(`manual-${role}-${part}`).value=obj[part]||'';
 }
 renderSceneNpcs(v.npcs||[]);
 setStatus('Сцена готова. «Предпросмотр» показывает стиль, негатив и персонажей без траты Anlas.');
}
function npcContext(){const c=ctx();return (c.chat||[]).slice(-5).map(m=>stripRpText(m.mes)).join('\n');}
function matchingNpcs(){return detectNpcs(settings.npcs||[],npcContext());}
function buildSceneContext(){
 const c=ctx(),msgs=Array.isArray(c.chat)?c.chat.slice(-7):[];
 const text=msgs.map(m=>{const who=m.is_user?'PERSONA':'CHARACTER';return who+': '+stripRpText(m.mes).slice(0,1800)}).filter(v=>!v.endsWith(': ')).join('\n\n');
 const profile=chatConfig();const list=matchingNpcs();
 const instructions=['CHAT NOTES (continuity, not appearance):',profile.notes||'(none)','\nCHARACTER / PERSONA / NPC LABELS:',getCharIdentity().name,'Persona: '+(el('current-persona')?.textContent||'active user persona'),'\nALLOWED NPC LIST (do not invent NPCs):',...list.map(x=>`${x.name} [${x.tag||'other'}]; triggers: ${x.triggers||x.name}`)];
 return `${instructions.join('\n')}\n\nROLEPLAY:\n${text}\n\nCURRENT OUTFIT TRACKER:\n${trackerClothing(c.chat)||'(No tracker state; use only clothing explicitly stated in RP.)'}`.slice(0,15000);
}
function systemPrompt(){
 const p=chatConfig();
 return `${p.qwenPrompt?.trim()||QWEN_DEFAULT}\n\nCUSTOM PER-ROLE EXTRACTION INSTRUCTIONS (follow these, without restating appearance):\n`+Object.entries(EXTRACT_INSTRUCTIONS).map(([k,def])=>`${k}: ${p.partPrompts?.[k]||def}`).join('\n')+'\n\n'+SCENE_FORMAT_CONTRACT;
}
function getProfileData(){const profile=profileList().find(p=>p.name===settings.qwenProfile);if(!profile)throw new Error('Выбери Connection Profile Qwen или заполни сцену вручную.');if(profile.mode!=='cc')throw new Error('Нужен профиль Chat Completions.');return profile;}
function responseText(data){if(typeof data==='string')return data;
 if(Array.isArray(data.content))return data.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
 return data.choices?.[0]?.message?.content||data.choices?.[0]?.text||data.text||data.message?.content?.[0]?.text||'';
}
async function qwenGenerate(){
 const p=getProfileData();const c=ctx();const source=p.api==='google'?'makersuite':p.api;
 const body={messages:[{role:'system',content:systemPrompt()},{role:'user',content:buildSceneContext()}],model:p.model,temperature:0.2,top_p:0.9,stream:false,chat_completion_source:source,max_tokens:Math.max(1200,Number(settings.qwenMaxTokens)||1200)};
 if(p['prompt-post-processing'])body.custom_prompt_post_processing=p['prompt-post-processing'];
 if(p.proxy){const proxy=proxies.find(x=>x.name===p.proxy);if(proxy?.url){body.reverse_proxy=proxy.url;body.proxy_password=proxy.password;}}
 if(source===chat_completion_sources.CUSTOM || source==='custom'){
   body.custom_url=p['api-url']||oai_settings.custom_url;
   for(const k of ['custom_include_body','custom_exclude_body','custom_include_headers'])if(oai_settings[k]!==undefined)body[k]=oai_settings[k];
 }else if(source===chat_completion_sources.VERTEXAI||source==='vertexai')body.vertexai_region=p['api-url']||oai_settings.vertexai_region;
 else if(source===chat_completion_sources.ZAI&&p['api-url']&&!p.proxy)body.zai_endpoint=p['api-url'];
 else if(source===chat_completion_sources.OPENROUTER||source==='openrouter'){
   body.use_fallback=oai_settings.openrouter_use_fallback;body.provider=oai_settings.openrouter_providers;
 }
 if(source==='claude'||source==='makersuite'||source==='vertexai')body.use_sysprompt=true;
 log('INFO',`Qwen: Connection Profile ${p.name}, контекст ${body.messages[1].content.length} символов`);
 const response=await fetch('/api/backends/chat-completions/generate',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify(body)});
 if(!response.ok)throw new Error(`Qwen HTTP ${response.status}: ${(await response.text()).slice(0,350)}`);
 const payload=await response.json();if(payload.error)throw new Error(payload.error.message||JSON.stringify(payload.error));
 const raw=responseText(payload);settings.lastQwenRaw=raw;if(el('debug-qwen'))el('debug-qwen').value=raw;log('INFO',`Qwen: ответ ${raw.length} символов`);
 return parseSceneLLM(raw);
}
function presetText(kind){
 const profile=chatConfig(),list=kind==='styles'?settings.styles:settings.negatives;
 return effectivePreset(list,kind==='styles'?profile.styleActive:profile.negativeActive,kind==='styles'?'Стиль':'Негатив');
}
async function buildPreview(showInline=false){
 const ident=await currentIdentity(),matched=identityAliases(ident);const scene=sceneFromManual()||currentScene;
 if(!scene)throw new Error('Сначала подготовь сцену — с Qwen или вручную.');
 const profile=chatConfig(),style=presetText('styles'),negative=presetText('negatives');
 const candidates=matchingNpcs();
 const assembled=makePrompt({scene,character:matched.char,persona:matched.persona,characterLabel:ident.char.name,personaLabel:ident.persona.name,style,negative,
  charNegative:profile.charNegative,personaNegative:profile.personaNegative,npcEntries:candidates});
 const body=novelaiRequest(settings,assembled);
 const snap={at:new Date().toISOString(),chat:currentChatId(),identities:ident,scene,style,negative,characterNegatives:assembled.characterNegatives,
  npcNames:assembled.npcNames,positive:assembled.display,providerBody:body};
 prepared={snap,body};settings.lastRequest=snap;persist();
 if(el('preview-inline')){
  const panel=el('preview-inline');panel.hidden=false;panel.open=true;
  el('preview-base').value=assembled.positive.base;
  el('preview-character').value=assembled.positive.chars[0]||'';
  el('preview-persona').value=assembled.positive.chars[1]||'';
  el('preview-negative').value=negative;
  el('preview-char-negatives').value=assembled.characterNegatives.map((t,i)=>`${i+1}: ${t||'(none)'}`).join('\n');
  if(showInline && typeof panel.scrollIntoView==='function')setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}),0);
 }
 el('final-prompt').value=assembled.display;
 el('provider-json').value=JSON.stringify(body,null,2);
 if(el('debug-style'))el('debug-style').value=style;
 if(el('debug-tracker'))el('debug-tracker').value=trackerClothing(ctx().chat)||'Нет сохранённого состояния WTracker в истории чата.';
 if(el('debug-negative'))el('debug-negative').value=negative+'\n--- CHARACTER NEGATIVES ---\n'+assembled.characterNegatives.map((n,i)=>`${i+1}: ${n||'(none)'}`).join('\n');
 const lengths=body.parameters.v4_prompt.caption.char_captions.map(x=>x.char_caption.length);
 const badWeight=(style.match(/::/g)||[]).length%2!==0;
 setStatus(`Предпросмотр готов ниже кнопок: стиль ${style.length} символов, негатив ${negative.length}, ${lengths.length} секции персонажей. Anlas не потрачены.`+(badWeight?' ⚠ Проверь стиль: обнаружена незакрытая пара :: в NovelAI-тегах.':''));
 log('INFO',`Preview: style=${style.length} chars, negative=${negative.length} chars, character sections=${lengths.length}, NPC=${assembled.npcNames.join(',')||'none'}`);
 return snap;
}
async function generateNovelAI(body){
 if(!settings.apiKey.trim())throw new Error('Не указан ключ NovelAI.');
 const endpoint=String(settings.endpoint||'https://image.novelai.net').replace(/\/+$/,'');
 const url=endpoint.endsWith('/ai/generate-image')?endpoint:endpoint+'/ai/generate-image';
 log('INFO',`NovelAI запрос: ${body.model}, ${body.parameters.width}x${body.parameters.height}, ${body.parameters.v4_prompt.caption.char_captions.length} секции, seed ${body.parameters.seed}`);
 const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
 if(!res.ok)throw new Error(`NovelAI HTTP ${res.status}: ${(await res.text()).slice(0,500)}`);
 const out=await res.json();const data=out?.images?.[0]?.image;
 if(!data)throw new Error('NovelAI не вернул base64 картинки.');return data;
}
async function uploadImage(base64){const c=ctx(),char=c.characters?.[c.characterId]?.name||'generated';
 const res=await fetch('/api/images/upload',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({image:base64,format:'png',ch_name:char,filename:'nai_comic_'+new Date().toISOString().replace(/[:.]/g,'-')})});
 if(!res.ok)throw new Error('Не удалось сохранить картинку: '+(await res.text()).slice(0,250));
 const out=await res.json();return out.path?.startsWith('/')?out.path:'/'+out.path;
}
async function attachImage(url,messageId){const c=ctx();const m=c.chat?.[messageId];if(!m)return;
 const html=`<!-- NAI_COMIC_START -->\n<img class="nai-comic-generated" src="${esc(url)}" alt="NovelAI comic illustration" />\n<!-- NAI_COMIC_END -->`;
 m.mes=String(m.mes||'').replace(/<!-- NAI_COMIC_START -->[\s\S]*?<!-- NAI_COMIC_END -->/g,'').trim()+'\n'+html;
 if(typeof c.saveChat==='function')await c.saveChat();else if(typeof c.saveChatDebounced==='function')c.saveChatDebounced();
 if(typeof c.reloadCurrentChat==='function')await c.reloadCurrentChat();else if(typeof c.updateMessageBlock==='function')c.updateMessageBlock(messageId,m);
}
function lastCharacterMessageId(){const chat=ctx().chat||[];for(let i=chat.length-1;i>=0;i--)if(!chat[i].is_user&&!chat[i].is_system)return i;return null;}
async function runJob(mode='preview', messageId=null){
 if(busy){setStatus('Уже выполняется задача.');return;} busy=true;setBusy(true);
 try{
  if(mode==='scene'||mode==='auto'){
    if(!settings.qwenProfile && mode==='auto')throw new Error('Автогенерация требует Connection Profile Qwen.');
    if(settings.qwenProfile)applyScene(await qwenGenerate());
    else if(!sceneFromManual())throw new Error('Сначала заполни сцену вручную.');
  }
  if(mode!=='scene')await buildPreview(mode==='preview');
  if(mode==='image'||mode==='auto'){
   const body=prepared.body;const response=await generateNovelAI(body);
   const img=await uploadImage(response);
   el('last-image').src=img;el('last-image-link').href=img;el('last-image-link').hidden=false;
   if(settings.attach && messageId!==null)await attachImage(img,messageId);
   log('INFO','Картинка сохранена: '+img);setStatus('Картинка готова.');
  }
 }catch(err){log('ERROR',err.message);setStatus('Ошибка: '+err.message); if(window.toastr)toastr.error(err.message,'NAI Comic Studio');}
 finally{busy=false;setBusy(false);}
}
function setBusy(value){for(const key of ['btn-scene','btn-preview','btn-image'])if(el(key))el(key).disabled=value;}
function bind(id,event,fn){el(id)?.addEventListener(event,fn);}
function saveField(id,key,type='text'){bind(id,type==='check'?'change':'input',e=>{settings[key]=type==='check'?e.target.checked:e.target.value;if(type==='int')settings[key]=Number(e.target.value);persist();prepared=null;});}
function renderSceneNpcs(npcs){const root=el('npc-scene-status');if(root)root.textContent=npcs.length?'Qwen включил NPC: '+npcs.map(x=>x.name).join(', '):'Qwen не включил NPC в текущую сцену.';}
function saveChatState(){
 const p=chatConfig();p.qwenPrompt=el('qwen-instruction')?.value||QWEN_DEFAULT;
 p.notes=el('chat-notes')?.value||'';
 for(const [name] of Object.entries(EXTRACT_INSTRUCTIONS)){const role=name.replace('.','-');p.partPrompts[name]=el('prompt-'+role)?.value||EXTRACT_INSTRUCTIONS[name];}
 p.charNegative=el('chat-char-negative')?.value||'';p.personaNegative=el('chat-persona-negative')?.value||'';
 persist();prepared=null;
}
function refreshChatState(){
 const p=chatConfig();if(el('qwen-instruction'))el('qwen-instruction').value=p.qwenPrompt;
 if(el('chat-notes'))el('chat-notes').value=p.notes||'';
 for(const [name,d] of Object.entries(EXTRACT_INSTRUCTIONS)){const field=el('prompt-'+name.replace('.','-'));if(field)field.value=p.partPrompts?.[name]||d;}
 if(el('chat-char-negative'))el('chat-char-negative').value=p.charNegative||'';
 if(el('chat-persona-negative'))el('chat-persona-negative').value=p.personaNegative||'';
 selectStyle('styles');selectStyle('negatives');
 const cached=settings.chatScene[currentChatId()];if(cached)applyScene(cached);
 else{currentScene=null;for(const field of ['manual-scene',...['char','persona'].flatMap(x=>['clothing','action','emotion'].map(y=>`manual-${x}-${y}`))])if(el(field))el(field).value='';renderSceneNpcs([]);}
 if(el('chat-id'))el('chat-id').textContent=currentChatId();
}
function npcSelect(){const select=el('npc-select');if(!select)return;select.innerHTML='<option value="">— выбрать NPC —</option>'+(settings.npcs||[]).map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');}
function npcForm(npc){for(const field of ['name','triggers','main','negative'])if(el('npc-'+field))el('npc-'+field).value=npc?.[field]||'';
 if(el('npc-tag'))el('npc-tag').value=npc?.tag||'other';if(el('npc-enabled'))el('npc-enabled').checked=npc?.enabled!==false;
 if(el('npc-library-status'))el('npc-library-status').textContent=npc?'Автотриггер: '+(npc.triggers||npc.name):'Выбери NPC или создай нового.';
}
function currentNpc(){return (settings.npcs||[]).find(x=>x.id===el('npc-select')?.value);}
function updateNpc(){const npc=currentNpc();if(!npc)return;for(const field of ['name','triggers','main','negative'])npc[field]=el('npc-'+field).value;
 npc.tag=el('npc-tag').value;npc.enabled=el('npc-enabled').checked;
 persist();prepared=null;
 if(el('npc-library-status'))el('npc-library-status').textContent=`Сохранено: ${npc.name}`;
}
async function storeAppearance(kind){const ident=await currentIdentity();const info=kind==='char'?ident.char:ident.persona;const bucket=kind==='char'?'characters':'personas';const entry=createEntry(bucket,info.key,info.name);
 entry.main=el(kind+'-main').value;entry.mainEnabled=el(kind+'-enabled').checked;entry.tag=el(kind+'-tag').value;entry.negative=el(kind+'-library-negative').value;persist();prepared=null;await refreshIdentity();}
function createPanel(){
 const root=document.createElement('section');root.id='nai-comic-panel';
 const roleControls=kind=>{
  const title=kind==='char'?'Активный персонаж чата':'Активная персона';
  return `<details class="ncs-compact ncs-subgroup"><summary><i class="fa-solid fa-user-pen" aria-hidden="true"></i> ${title}: одежда, действие, эмоция</summary>
   <div class="ncs-substack">${['clothing','action','emotion'].map(part=>`<section class="ncs-subpane"><label>${{clothing:'👕 Одежда и аксессуары',action:'🤝 Действия и контакт',emotion:'💗 Эмоции и мимика'}[part]}<textarea id="nai-comic-manual-${kind}-${part}" rows="2"></textarea></label></section>`).join('')}</div>
  </details>`;
 };
 const rolePrompts=kind=>{
  const title=kind==='character'?'Персонаж чата':'Активная персона';
  return `<details class="ncs-compact ncs-subgroup"><summary><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${title} · три инструкции Qwen</summary>
  <div class="ncs-substack">${['clothing','action','emotion'].map(part=>`<section class="ncs-subpane"><label>${{clothing:'👕 Как извлекать одежду',action:'🤝 Как извлекать действия',emotion:'💗 Как извлекать эмоции'}[part]}<textarea id="nai-comic-prompt-${kind}-${part}" rows="3"></textarea></label></section>`).join('')}</div>
  </details>`;
 };
 root.innerHTML=`
 <details open class="ncs-root"><summary><i class="fa-solid fa-book-open" aria-hidden="true"></i> NAI Comic Studio · v0.2.2</summary>
 <div class="ncs-body">
  <div class="ncs-toolbar"><label class="ncs-switch"><input id="nai-comic-enabled" type="checkbox"> ✓ Включено</label><label class="ncs-switch"><input id="nai-comic-auto" type="checkbox"> <i class="fa-solid fa-wand-magic-sparkles"></i> Автоматически (Anlas)</label><label class="ncs-switch"><input id="nai-comic-attach" type="checkbox"> <i class="fa-solid fa-paperclip"></i> К сообщению</label></div>
  <p class="ncs-note">Каждый чат помнит свои подсказки и пресеты. Сначала предпросмотр — затем платная генерация.</p>
  <div class="ncs-buttons"><button id="nai-comic-btn-scene" type="button"><i class="fa-solid fa-comment-dots"></i> 1. Qwen: сцена</button><button id="nai-comic-btn-preview" type="button"><i class="fa-solid fa-eye"></i> 2. Предпросмотр · бесплатно</button><button id="nai-comic-btn-image" type="button" class="ncs-primary"><i class="fa-solid fa-image"></i> 3. Создать · Anlas</button></div>
  <p id="nai-comic-status" class="ncs-note" role="status" aria-live="polite">Ожидаю настройки.</p>
  <details id="nai-comic-preview-inline" class="ncs-preview" hidden>
    <summary><i class="fa-solid fa-magnifying-glass"></i> Готовый промпт NovelAI · предпросмотр без Anlas</summary>
    <p class="ncs-note">Это именно те секции, которые отправляются в NovelAI. Можно проверить здесь, не листая до «Отладки».</p>
    <label>Общая сцена + стиль + теги комикса<textarea id="nai-comic-preview-base" rows="6" readonly></textarea></label>
    <label>Персонаж чата: одежда, действия, внешность<textarea id="nai-comic-preview-character" rows="5" readonly></textarea></label>
    <label>Активная персона: одежда, действия, внешность<textarea id="nai-comic-preview-persona" rows="5" readonly></textarea></label>
    <label>Общий негатив<textarea id="nai-comic-preview-negative" rows="3" readonly></textarea></label>
    <label>Негативы участников<textarea id="nai-comic-preview-char-negatives" rows="3" readonly></textarea></label>
    <div class="ncs-buttons"><button type="button" id="nai-comic-copy-preview"><i class="fa-solid fa-copy"></i> Скопировать промпт</button><button type="button" id="nai-comic-copy-provider"><i class="fa-solid fa-file-code"></i> Скопировать JSON запроса</button></div>
  </details>


  <details open class="ncs-major"><summary><i class="fa-solid fa-sliders"></i> Пресеты стиля и негативов <span class="ncs-tip">для этого чата</span></summary>
   <div class="ncs-grid ncs-two ncs-subgrid"><section class="ncs-subpane"><label><i class="fa-solid fa-palette"></i> Стиль <select id="nai-comic-style"></select></label><label>Теги стиля<textarea rows="4" id="nai-comic-style-text"></textarea></label><div id="nai-comic-style-state" class="ncs-note"></div><button id="nai-comic-style-add" type="button">＋ Создать стиль</button><button id="nai-comic-style-delete" type="button">Удалить</button></section>
   <section class="ncs-subpane"><label><i class="fa-solid fa-ban"></i> Общий негатив <select id="nai-comic-negative"></select></label><label>Негативные теги<textarea rows="4" id="nai-comic-negative-text"></textarea></label><div id="nai-comic-negative-state" class="ncs-note"></div><button id="nai-comic-negative-add" type="button">＋ Создать негатив</button><button id="nai-comic-negative-delete" type="button">Удалить</button></section></div>
  </details>

  <details open class="ncs-major"><summary><i class="fa-solid fa-people-arrows-left-right"></i> Этот чат · эмоции, действия, одежда и негативы</summary>
   <p class="ncs-note">Настраивается один раз на чат: <code id="nai-comic-chat-id"></code>. Не влияет на другие беседы.</p>
   <div class="ncs-substack">
    <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Контекст текущего чата</div><label>Заметки (не внешность)<textarea id="nai-comic-chat-notes" rows="2" placeholder="Например: действие дома; одежда из трекера приоритетна"></textarea></label></section>
    <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-ban" aria-hidden="true"></i> Негативы участников</div><div class="ncs-grid ncs-two"><label>Негатив персонажа<textarea rows="3" id="nai-comic-chat-char-negative" placeholder="Только для персонажа"></textarea></label><label>Негатив персоны<textarea rows="3" id="nai-comic-chat-persona-negative" placeholder="Только для персоны"></textarea></label></div></section>
   </div>
   <details class="ncs-compact ncs-subgroup"><summary><i class="fa-solid fa-brain"></i> Свой главный промпт Qwen</summary><label>Полная инструкция для сцены, которую можно изменять<textarea rows="8" id="nai-comic-qwen-instruction"></textarea></label><button id="nai-comic-reset-qwen" type="button"><i class="fa-solid fa-arrow-rotate-left"></i> Вернуть базовую инструкцию</button></details>
   ${rolePrompts('character')}${rolePrompts('persona')}
  </details>

  <details open class="ncs-major"><summary><i class="fa-solid fa-clapperboard"></i> Сцена от Qwen · можно исправить вручную</summary>
   <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-film" aria-hidden="true"></i> Общая сцена</div>
    <label>Профиль Qwen <select id="nai-comic-qwen-profile"></select></label><button id="nai-comic-refresh-profiles" type="button"><i class="fa-solid fa-rotate"></i> Обновить список</button>
    <p class="ncs-note">Здесь только изменяемое состояние персонажей; внешность добавляет библиотека без повторов.</p>
    <label>Локация, свет и композиция панелей<textarea id="nai-comic-manual-scene" rows="4" placeholder="Получить сцену из Qwen или написать самостоятельно"></textarea></label>
   </section>
   ${roleControls('char')}${roleControls('persona')}
   <div id="nai-comic-npc-scene-status" class="ncs-note">NPC пока не найдены.</div>
  </details>

  <details class="ncs-major"><summary><i class="fa-solid fa-address-book"></i> Библиотека персонажей и персон <span class="ncs-tip">переключаются с чатом</span></summary>
   <details class="ncs-compact ncs-subgroup"><summary><i class="fa-solid fa-user"></i> Активный персонаж: <span id="nai-comic-current-char"></span> · <span id="nai-comic-char-status"></span></summary>
    <label>Тег для NovelAI<select id="nai-comic-char-tag"><option value="boy">boy</option><option value="girl">girl</option><option value="other">other</option></select></label>
    <label>Главный референс<textarea id="nai-comic-char-main" rows="6"></textarea></label><label class="ncs-switch"><input id="nai-comic-char-enabled" type="checkbox" checked> Использовать главное описание</label>
    <div id="nai-comic-char-extras"></div><button id="nai-comic-char-extra-add" type="button">＋ Деталь внешности</button>
    <label>Постоянный персональный негатив<textarea id="nai-comic-char-library-negative" rows="2"></textarea></label><button id="nai-comic-char-save" type="button">💾 Сохранить анкету</button>
   </details>
   <details class="ncs-compact ncs-subgroup"><summary><i class="fa-solid fa-user-astronaut"></i> Активная персона: <span id="nai-comic-current-persona"></span> · <span id="nai-comic-persona-status"></span></summary>
    <label>Тег для NovelAI<select id="nai-comic-persona-tag"><option value="girl">girl</option><option value="boy">boy</option><option value="other">other</option></select></label>
    <label>Главный референс<textarea id="nai-comic-persona-main" rows="6"></textarea></label><label class="ncs-switch"><input id="nai-comic-persona-enabled" type="checkbox" checked> Использовать главное описание</label>
    <div id="nai-comic-persona-extras"></div><button id="nai-comic-persona-extra-add" type="button">＋ Деталь внешности</button>
    <label>Постоянный персональный негатив<textarea id="nai-comic-persona-library-negative" rows="2"></textarea></label><button id="nai-comic-persona-save" type="button">💾 Сохранить анкету</button>
   </details>
   <p id="nai-comic-identity-warning" class="ncs-note"></p>
   <button id="nai-comic-import-old" type="button"><i class="fa-solid fa-file-import"></i> Импорт из старой библиотеки</button>
  </details>

  <details class="ncs-major"><summary><i class="fa-solid fa-masks-theater"></i> Библиотека NPC · автоматическое появление по имени</summary>
   <p class="ncs-note">NPC добавляется в промпт только при упоминании триггера в недавней ролке <em>и</em> если Qwen подтвердил его присутствие в сцене. У каждого — отдельная внешность и негатив.</p>
   <label>Выбрать NPC<select id="nai-comic-npc-select"></select></label><div class="ncs-buttons"><button type="button" id="nai-comic-npc-add">＋ Новый NPC</button><button type="button" id="nai-comic-npc-delete">✕ Удалить</button></div>
   <div class="ncs-grid ncs-two"><label>Имя NPC<input type="text" id="nai-comic-npc-name" placeholder="Например: Денджи"></label><label>Триггеры (через запятую)<input type="text" id="nai-comic-npc-triggers" placeholder="Денджи, Denji"></label></div>
   <div class="ncs-grid ncs-two"><label>Тег NovelAI<select id="nai-comic-npc-tag"><option value="boy">boy</option><option value="girl">girl</option><option value="other">other</option></select></label><label class="ncs-switch"><input type="checkbox" id="nai-comic-npc-enabled" checked> NPC включён</label></div>
   <label>Описание внешности NPC<textarea id="nai-comic-npc-main" rows="4"></textarea></label><label>Негатив только для NPC<textarea id="nai-comic-npc-negative" rows="3"></textarea></label><button type="button" id="nai-comic-npc-save">💾 Сохранить NPC</button><div id="nai-comic-npc-library-status" class="ncs-note"></div>
  </details>

  <details class="ncs-major"><summary><i class="fa-solid fa-gear"></i> NovelAI V5 · ключ и параметры</summary>
   <div class="ncs-grid ncs-two"><label>Ключ NovelAI<input id="nai-comic-api-key" type="password" autocomplete="off" placeholder="Не размещать на GitHub"></label>
    <label>API URL<input id="nai-comic-endpoint" type="text"></label>
    <label>Модель<select id="nai-comic-model"><option value="nai-diffusion-5-full">V5 Full</option><option value="nai-diffusion-5-full-medium">V5 Full Medium</option><option value="nai-diffusion-5-curated">V5 Curated</option><option value="nai-diffusion-4-5-full">V4.5 Full</option></select></label>
    <label>Соотношение<select id="nai-comic-aspect"><option>2:3</option><option>1:1</option><option>3:2</option><option>9:16</option><option>16:9</option></select></label>
    <label>Размер<select id="nai-comic-size"><option value="small">Маленький</option><option value="normal">Стандартный</option><option value="large">Большой</option></select></label>
    <label>Sampler<select id="nai-comic-sampler"><option value="k_euler_ancestral">Euler Ancestral</option><option value="k_euler">Euler</option><option value="k_dpmpp_2m">DPM++ 2M</option><option value="k_dpmpp_2m_sde">DPM++ 2M SDE</option></select></label>
    <label>Steps<input id="nai-comic-steps" type="number" min="1" max="50"></label><label>CFG<input id="nai-comic-cfg" type="number" min="0" max="10" step="0.1"></label>
    <label>CFG Rescale<input id="nai-comic-cfgRescale" type="number" min="0" max="1" step="0.01"></label>
    <label>Seed (-1 = случайный)<input id="nai-comic-seed" type="number"></label>
   </div>
  </details>

  <details class="ncs-major"><summary><i class="fa-solid fa-bug"></i> Отладка · всё, что отправляется NovelAI</summary>
   <div class="ncs-substack">
    <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-list" aria-hidden="true"></i> Входные данные</div>
     <label>Стиль в общем позитивном промпте<textarea id="nai-comic-debug-style" rows="3" readonly></textarea></label>
     <label>Текущий трекер одежды<textarea id="nai-comic-debug-tracker" rows="3" readonly></textarea></label>
     <label>Сырой ответ Qwen<textarea id="nai-comic-debug-qwen" rows="4" readonly></textarea></label>
    </section>
    <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-file-code" aria-hidden="true"></i> Собранный запрос</div>
     <label>Негативы: общий и отдельные персонажи<textarea id="nai-comic-debug-negative" rows="4" readonly></textarea></label>
     <label>Положительный промпт (секции персонажей)<textarea id="nai-comic-final-prompt" rows="8" readonly></textarea></label>
     <label>Полный JSON NovelAI<textarea id="nai-comic-provider-json" rows="9" readonly></textarea></label>
    </section>
    <section class="ncs-subpane"><div class="ncs-subhead"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Журнал и резервные копии</div>
     <label>Журнал<textarea id="nai-comic-logs" rows="6" readonly></textarea></label>
     <div class="ncs-buttons"><button type="button" id="nai-comic-export-debug"><i class="fa-solid fa-file-arrow-down"></i> Экспорт отладки</button>
     <button type="button" id="nai-comic-export-settings"><i class="fa-solid fa-floppy-disk"></i> Резервная копия библиотек</button>
     <button type="button" id="nai-comic-import-settings"><i class="fa-solid fa-file-import"></i> Импорт настроек</button></div><input id="nai-comic-import-file" type="file" accept="application/json,.json" hidden>
    </section>
   </div>
  </details>
  <p><a id="nai-comic-last-image-link" href="#" target="_blank" rel="noopener" hidden>Открыть последнее изображение</a></p><img id="nai-comic-last-image" class="ncs-image" alt="Готовая иллюстрация" />
 </div></details>`;
 ui=root;(document.getElementById('extensions_settings')||document.getElementById('extensions_settings2')||document.body).append(root);
 setupBindings();return root;
}
function fillFields(){
 for(const key of ['enabled','auto','attach','apiKey','endpoint','model','aspect','size','sampler','steps','cfg','cfgRescale','seed']){
  const target=el(key==='apiKey'?'api-key':key);if(!target)continue;if(target.type==='checkbox')target.checked=!!settings[key];else target.value=settings[key]??'';
 }
 fillProfiles();selectStyle('styles');selectStyle('negatives');npcSelect();updateDebug();
}
function download(filename,obj){const body=JSON.stringify(obj,null,2);const blob=new Blob([body],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function setupBindings(){fillFields();
 for(const key of ['enabled','auto','attach','apiKey','endpoint','model','aspect','size','sampler','steps','cfg','cfgRescale','seed'])saveField(key==='apiKey'?'api-key':key,key,['enabled','auto','attach'].includes(key)?'check':['steps','cfg','cfgRescale','seed'].includes(key)?'int':'text');
 bind('qwen-profile','change',e=>{settings.qwenProfile=e.target.value;persist();});bind('refresh-profiles','click',fillProfiles);
 for(const name of ['qwen-instruction','chat-notes','chat-char-negative','chat-persona-negative',...Object.keys(EXTRACT_INSTRUCTIONS).map(k=>'prompt-'+k.replace('.','-'))])bind(name,'input',saveChatState);
 bind('reset-qwen','click',()=>{if(!confirm('Сбросить только основную инструкцию Qwen для этого чата?'))return;el('qwen-instruction').value=QWEN_DEFAULT;saveChatState();});
 for(const kind of ['char','persona']){
  bind(kind+'-save','click',async()=>{await storeAppearance(kind);log('INFO','Сохранена анкета '+kind);});
  for(const field of [kind+'-main',kind+'-enabled',kind+'-tag',kind+'-library-negative'])bind(field,'change',()=>storeAppearance(kind));
  bind(kind+'-extra-add','click',async()=>{const ident=await currentIdentity();const data=kind==='char'?ident.char:ident.persona;const entry=createEntry(kind==='char'?'characters':'personas',data.key,data.name);entry.extra.push({id:id(),enabled:true,text:''});persist();renderExtras(kind,entry);const newest=el(kind+'-extras')?.lastElementChild;if(newest)newest.open=true;});
 }
 for(const [kind,select,txt] of [['styles','style','style-text'],['negatives','negative','negative-text']]){
  const key=kind==='styles'?'styleActive':'negativeActive';
  bind(select,'change',e=>{chatConfig()[key]=e.target.value;persist();selectStyle(kind);prepared=null;});
  bind(txt,'input',e=>{const entry=settings[kind].find(x=>String(x.id)===String(chatConfig()[key]));if(entry){entry.value=e.target.value;persist();prepared=null;const indicator=el(select+'-state');if(indicator)indicator.textContent=`${entry.value.length} символов, включён`;}});
  bind(select+'-add','click',()=>{const name=prompt('Название '+(kind==='styles'?'стиля':'негатива'));if(name===null)return;const entry={id:id(),name:name||'Без названия',value:''};settings[kind].push(entry);chatConfig()[key]=entry.id;persist();selectStyle(kind);});
  bind(select+'-delete','click',()=>{const p=chatConfig();if(!p[key]||!confirm('Удалить выбранный пресет?'))return;settings[kind]=settings[kind].filter(x=>x.id!==p[key]);p[key]='';persist();selectStyle(kind);});
 }
 bind('npc-select','change',()=>npcForm(currentNpc()));
 bind('npc-add','click',()=>{const npc={id:id(),name:'Новый NPC',triggers:'',main:'',negative:'',tag:'other',enabled:true,mainEnabled:true,extra:[]};settings.npcs.push(npc);persist();npcSelect();el('npc-select').value=npc.id;npcForm(npc);});
 bind('npc-delete','click',()=>{const npc=currentNpc();if(!npc||!confirm('Удалить NPC «'+npc.name+'»?'))return;settings.npcs=settings.npcs.filter(x=>x!==npc);persist();npcSelect();npcForm(null);prepared=null;});
 bind('npc-save','click',()=>{updateNpc();npcSelect();const npc=settings.npcs.find(x=>x.name===el('npc-name').value);if(npc)el('npc-select').value=npc.id;});
 for(const field of ['npc-name','npc-triggers','npc-main','npc-negative','npc-tag','npc-enabled'])bind(field,field==='npc-enabled'||field==='npc-tag'?'change':'input',updateNpc);
 for(const name of ['manual-scene',...['char','persona'].flatMap(k=>['clothing','action','emotion'].map(part=>`manual-${k}-${part}`))])bind(name,'input',()=>{prepared=null;});
 async function copyText(value){
  if(!value)return;
  try { await navigator.clipboard.writeText(value);setStatus('Промпт скопирован.'); }
  catch(e){setStatus('Автокопирование недоступно в браузере — выдели содержимое поля и нажми Ctrl+C.');}
 }
 bind('copy-preview','click',()=>copyText(prepared?.snap?.positive||settings.lastRequest?.positive||''));
 bind('copy-provider','click',()=>copyText(JSON.stringify(prepared?.body||settings.lastRequest?.providerBody||{},null,2)));
 bind('btn-scene','click',()=>runJob('scene'));bind('btn-preview','click',()=>runJob('preview'));
 bind('btn-image','click',()=>runJob('image',lastCharacterMessageId()));
 bind('import-old','click',async()=>{const old=ctx().extensionSettings?.inline_image_gen;if(!old){setStatus('Старые настройки inline_image_gen не найдены.');return;}
  if(!confirm('Импортировать анкеты и пресеты? Существующие заполненные анкеты не перезаписываются.'))return;
  Object.assign(settings,importOldLibrary(settings,old));
  const profile=chatConfig();profile.styleActive=settings.styleActive||profile.styleActive;profile.negativeActive=settings.negativeActive||profile.negativeActive;
  const small=ctx().extensionSettings?.ExtBlocks?.api_presets?.small?.connection_profile;if(!settings.qwenProfile&&small)settings.qwenProfile=small;
  persist();fillFields();await refreshIdentity();log('INFO','Импортированы анкеты, стиль и негативы.');});
 bind('export-debug','click',()=>download('nai-comic-debug.json',{lastRequest:settings.lastRequest,qwenRaw:settings.lastQwenRaw,tracker:trackerClothing(ctx().chat),logs:settings.debugLog.map(line=>line.replace(/Bearer\s+\S+/gi,'Bearer [redacted]')),chat:currentChatId(),date:new Date().toISOString()}));
 bind('export-settings','click',()=>{const s=clone(settings);delete s.apiKey;delete s.debugLog;delete s.lastRequest;download('nai-comic-settings-no-key.json',s);});
 bind('import-settings','click',()=>el('import-file').click());
 bind('import-file','change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=JSON.parse(await f.text());for(const k of ['characters','personas','styles','negatives','styleActive','negativeActive','chatProfiles','npcs','aliases','chatScene'])if(s[k]!==undefined)settings[k]=clone(s[k]);persist();fillFields();refreshIdentity();refreshChatState();setStatus('Библиотеки и параметры чатов импортированы.');}catch(err){setStatus('Ошибка импорта: '+err.message);}e.target.value='';});
}
async function handleAuto(messageId){if(!ui||busy||!settings.enabled||!settings.auto)return;
 const c=ctx(),msg=c.chat?.[messageId];if(!msg||msg.is_user||msg.is_system)return;
 const chat=currentChatId();const key=chat+'::'+messageId+'::'+String(msg.mes||'').slice(0,120);
 if(settings.autoProcessed[chat]===key)return;
 settings.autoProcessed[chat]=key;persist();
 if(!settings.apiKey || !settings.qwenProfile){log('WARN','Автогенерация пропущена: нет NovelAI ключа или Qwen профиля.');return;}
 await runJob('auto',messageId);
}
function subscribe(){const c=ctx(),t=c.event_types||{};if(!c.eventSource){log('WARN','Нет eventSource; ручной режим работает.');return;}
 const sync=()=>{const sig=getCharIdentity().key+'::'+currentChatId();if(sig!==shownContext){shownContext=sig;currentScene=null;prepared=null;for(const field of ['final-prompt','provider-json','debug-style','debug-negative'])if(el(field))el(field).value='';refreshChatState();refreshIdentity();log('INFO','Чат изменён: '+sig);}};
 if(t.CHAT_CHANGED)c.eventSource.on(t.CHAT_CHANGED,sync);
 if(t.MESSAGE_RECEIVED)c.eventSource.on(t.MESSAGE_RECEIVED,async messageId=>{{const index=Number(messageId);if(Number.isInteger(index)&&index>=0)await handleAuto(index);}});
 if(t.MESSAGE_SENT)c.eventSource.on(t.MESSAGE_SENT,()=>{prepared=null;});
 // Active user persona may change without CHAT_CHANGED; poll only IDs, do not request data or trigger generation.
 let lastPersona='';setInterval(async()=>{if(!ui)return;const p=await getPersonaIdentity();if(p.key!==lastPersona){const changed=!!lastPersona;lastPersona=p.key;prepared=null;if(changed){delete settings.chatScene[currentChatId()];currentScene=null;for(const field of ['manual-scene',...['char','persona'].flatMap(k=>['clothing','action','emotion'].map(x=>`manual-${k}-${x}`))])if(el(field))el(field).value='';setStatus('Персона изменена: получи сцену заново перед генерацией.');persist();}await refreshIdentity();}},2200);
 sync();}
async function init(){initialize();createPanel();await refreshIdentity();refreshChatState();subscribe();log('INFO','NAI Comic Studio loaded. Автогенерация выключена до явного включения.');}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>console.error('[NAI Comic init]',e)));else init().catch(e=>console.error('[NAI Comic init]',e));
