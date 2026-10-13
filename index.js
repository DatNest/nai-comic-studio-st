import { BASE_DEFAULTS, importOldLibrary, libDescription, makePrompt, novelaiRequest, parseSceneLLM, stripRpText, trackerClothing } from './core.mjs';
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
function selectStyle(kind){const list=settings[kind],select=el(kind==='styles'?'style':'negative');if(!select)return;
 const active=kind==='styles'?settings.styleActive:settings.negativeActive;
 select.innerHTML='<option value="">— не использовать —</option>'+list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');select.value=active||'';
 const val=el(kind==='styles'?'style-text':'negative-text');const item=list.find(x=>x.id===active);if(val)val.value=item?.value||'';
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
 for(const kind of ['char','persona'])renderExtras(kind,kind==='char'?char:persona);
 el('identity-warning').textContent=!ident.char.key||!ident.persona.key?'Нужно выбрать чат с персонажем и активную персону.':(!libDescription(char)||!libDescription(persona))?'Внимание: одна из анкет пуста. Генерация заблокирована до заполнения.':'Обе анкеты найдены; они будут отправлены в NovelAI один раз, каждая в своей секции.';
}
function renderExtras(kind,entry){const root=el(kind+'-extras');if(!root)return;root.innerHTML='';for(const x of entry?.extra||[]){
 const div=document.createElement('div');div.className='ncs-extra';div.innerHTML=`<label><input class="ncs-extra-enabled" type="checkbox" ${x.enabled!==false?'checked':''}> Добавочное описание</label><button type="button" class="ncs-extra-delete">Удалить</button><textarea class="ncs-extra-text" rows="3" placeholder="Особенности внешности"></textarea>`;
 div.querySelector('textarea').value=x.text;div.querySelector('.ncs-extra-enabled').addEventListener('change',e=>{x.enabled=e.target.checked;persist();refreshIdentity();});
 div.querySelector('.ncs-extra-delete').addEventListener('click',()=>{entry.extra=entry.extra.filter(i=>i!==x);persist();refreshIdentity();});
 div.querySelector('textarea').addEventListener('input',e=>{x.text=e.target.value;persist();el(kind+'-status').textContent=`${libDescription(entry).length} символов описания`;});
 root.append(div);
 }}
function updateDebug(){if(el('logs'))el('logs').value=(settings.debugLog||[]).join('\n');}
function setStatus(txt){if(el('status'))el('status').textContent=txt;}
function sceneFromManual(){const raw=el('manual-scene')?.value?.trim();if(!raw)return null;
 if(raw.startsWith('{'))return parseSceneLLM(raw);
 return {base:raw,character:el('manual-char')?.value?.trim()||'present in scene',persona:el('manual-persona')?.value?.trim()||'present in scene'};
}
function applyScene(v){currentScene=v;settings.lastScene=clone(v);persist();
 el('manual-scene').value=v.base;el('manual-char').value=v.character;el('manual-persona').value=v.persona;setStatus('Сцена готова. Нажми «Показать полный запрос» — это бесплатно.');}
const QWEN_SYSTEM = `You are an accurate scene extractor for a visual-novel / comic image. Extract ONLY the latest established RP moment. Return STRICT JSON with exactly 3 English string fields: {"base":"...", "character":"...", "persona":"..."}. Do not generate markup, Danbooru quality/artist tags, character designs or appearance. IMPORTANT: permanent appearance will be inserted independently from a saved library. Do not describe hair, eye color, face shape, body type, tattoos, freckles, age or static accessories. BASE: comic page with one main panel occupying 65-80% and 1-3 compact supporting panels; factual setting, objects, light, positions and panel actions, two characters physically together in the main frame if both appear. Focus panels magnify actual details of same instant, do not invent events. CHARACTER / PERSONA: ONLY confirmed CURRENT clothing, wearable accessories, actions, expressions, gaze and physical contact. Never invent clothing, jewelry, pearl chains, new kisses, gestures, props or actions. A kiss is only permitted if it already occurs in the latest RP moment. If clothing is unknown say "clothing not established". The provided outfit tracker overrides guesses. Avoid global chibi except a single small joke panel as appropriate. Use each detail once. Scene-internal gaze; never viewer. No extra people. Do not invent dialogue. Make complete but concise, around 90-170 words total. DO NOT INCLUDE the characters' fixed designs. Output only JSON.`;
function buildSceneContext(){const c=ctx(), msgs=Array.isArray(c.chat)?c.chat.slice(-7):[];
 const text=msgs.map(m=>{const who=m.is_user?'PERSONA':'CHARACTER';return who+': '+stripRpText(m.mes).slice(0,1800)}).filter(v=>!v.endsWith(': ')).join('\n\n');
 return `${text}\n\nCURRENT OUTFIT TRACKER:\n${trackerClothing(c.chat)||'(No structured tracker state; use only clothing explicitly stated in the RP.)'}`.slice(0,13500);
}
function getProfileData(){const profile=profileList().find(p=>p.name===settings.qwenProfile);if(!profile)throw new Error('Выбери Connection Profile Qwen или заполни сцену вручную.');if(profile.mode!=='cc')throw new Error('Нужен профиль Chat Completions.');return profile;}
function responseText(data){if(typeof data==='string')return data;
 if(Array.isArray(data.content))return data.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
 return data.choices?.[0]?.message?.content||data.choices?.[0]?.text||data.text||data.message?.content?.[0]?.text||'';
}
async function qwenGenerate(){
 const p=getProfileData();const c=ctx();const source=p.api==='google'?'makersuite':p.api;
 const body={messages:[{role:'system',content:QWEN_SYSTEM},{role:'user',content:buildSceneContext()}],model:p.model,temperature:0.2,top_p:0.9,stream:false,chat_completion_source:source,max_tokens:Number(settings.qwenMaxTokens)||700};
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
 const raw=responseText(payload);log('INFO',`Qwen: ответ ${raw.length} символов`);
 return parseSceneLLM(raw);
}
function presetText(kind){const list=kind==='styles'?settings.styles:settings.negatives;const sel=kind==='styles'?settings.styleActive:settings.negativeActive;return list.find(x=>x.id===sel)?.value||'';}
async function buildPreview(){
 const ident=await currentIdentity(),matched=identityAliases(ident);const scene=sceneFromManual()||currentScene;
 if(!scene)throw new Error('Сначала подготовь сцену — с Qwen или вручную.');
 const assembled=makePrompt({scene,character:matched.char,persona:matched.persona,characterLabel:ident.char.name,personaLabel:ident.persona.name,style:presetText('styles'),negative:presetText('negatives')});
 const body=novelaiRequest(settings,assembled);
 const snap={at:new Date().toISOString(), identities:ident,scene,positive:assembled.display,negative:assembled.negative,providerBody:body};
 prepared={snap,body};settings.lastRequest=snap;persist();
 el('final-prompt').value=assembled.display;
 el('provider-json').value=JSON.stringify(body,null,2);
 const lengths=body.parameters.v4_prompt.caption.char_captions.map(x=>x.char_caption.length);
 setStatus(`Готово: ${lengths.length} секции персонажей; ${ident.char.name} — ${lengths[0]} символов, ${ident.persona.name} — ${lengths[1]} символов. Anlas пока не тратятся.`);
 log('INFO',`Предпросмотр: exactly ${lengths.length} sections, char ${lengths[0]} chars, persona ${lengths[1]} chars`);
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
  if(mode!=='scene')await buildPreview();
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
async function storeAppearance(kind){const ident=await currentIdentity();const info=kind==='char'?ident.char:ident.persona;const bucket=kind==='char'?'characters':'personas';const entry=createEntry(bucket,info.key,info.name);
 entry.main=el(kind+'-main').value;entry.mainEnabled=el(kind+'-enabled').checked;entry.tag=el(kind+'-tag').value;persist();await refreshIdentity();}
function createPanel(){const root=document.createElement('section');root.id='nai-comic-panel';root.innerHTML=`
<details open><summary>NAI Comic Studio · автономный NovelAI V5</summary>
<div class="ncs-body">
  <p class="ncs-note">Без ExtBlocks и без sillyimages. Ручная генерация бесплатна до нажатия «Создать картинку». Авто по умолчанию выключено.</p>
  <div class="ncs-grid">
   <label><input id="nai-comic-enabled" type="checkbox"> Включено</label>
   <label><input id="nai-comic-auto" type="checkbox"> Автогенерация после поста персонажа (тратит Anlas)</label>
   <label><input id="nai-comic-attach" type="checkbox"> Прикреплять изображение к существующему посту</label>
  </div>
  <details><summary>NovelAI V5 · ключ и параметры</summary>
   <div class="ncs-grid ncs-two">
    <label>Ключ NovelAI <input id="nai-comic-api-key" type="password" autocomplete="off" placeholder="Ключ сохраняется только в настройках SillyTavern"></label>
    <label>API URL <input id="nai-comic-endpoint" type="text"></label>
    <label>Модель <select id="nai-comic-model"><option value="nai-diffusion-5-full">V5 Full</option><option value="nai-diffusion-5-full-medium">V5 Full Medium</option><option value="nai-diffusion-5-curated">V5 Curated</option><option value="nai-diffusion-4-5-full">V4.5 Full</option></select></label>
    <label>Соотношение <select id="nai-comic-aspect"><option>2:3</option><option>1:1</option><option>3:2</option><option>9:16</option><option>16:9</option></select></label>
    <label>Размер <select id="nai-comic-size"><option value="small">Маленький</option><option value="normal">Стандартный</option><option value="large">Большой</option></select></label>
    <label>Сэмплер <select id="nai-comic-sampler"><option value="k_euler_ancestral">Euler Ancestral</option><option value="k_euler">Euler</option><option value="k_dpmpp_2m">DPM++ 2M</option><option value="k_dpmpp_2m_sde">DPM++ 2M SDE</option></select></label>
    <label>Steps <input id="nai-comic-steps" type="number" min="1" max="50"></label>
    <label>CFG <input id="nai-comic-cfg" type="number" min="0" max="10" step="0.1"></label>
    <label>CFG Rescale <input id="nai-comic-cfgRescale" type="number" min="0" max="1" step="0.01"></label>
    <label>Seed (-1 — случайный) <input id="nai-comic-seed" type="number"></label>
   </div>
  </details>
  <details open><summary>Персонажи и персоны · автоматический выбор по чату</summary>
    <p><strong>Карточка:</strong> <span id="nai-comic-current-char"></span> · <span id="nai-comic-char-status"></span></p>
    <label>Тег пола персонажа для NovelAI <select id="nai-comic-char-tag"><option value="boy">boy</option><option value="girl">girl</option><option value="other">other</option></select></label>
    <label>Главное описание персонажа <textarea id="nai-comic-char-main" rows="5"></textarea></label>
    <label><input id="nai-comic-char-enabled" type="checkbox" checked> Использовать главное описание</label><div id="nai-comic-char-extras"></div>
    <button id="nai-comic-char-extra-add" type="button">+ Доп. описание персонажа</button><button id="nai-comic-char-save" type="button">Сохранить персонажа</button>
    <hr>
    <p><strong>Персона:</strong> <span id="nai-comic-current-persona"></span> · <span id="nai-comic-persona-status"></span></p>
    <label>Тег пола персоны для NovelAI <select id="nai-comic-persona-tag"><option value="girl">girl</option><option value="boy">boy</option><option value="other">other</option></select></label>
    <label>Главное описание персоны <textarea id="nai-comic-persona-main" rows="5"></textarea></label>
    <label><input id="nai-comic-persona-enabled" type="checkbox" checked> Использовать главное описание</label><div id="nai-comic-persona-extras"></div>
    <button id="nai-comic-persona-extra-add" type="button">+ Доп. описание персоны</button><button id="nai-comic-persona-save" type="button">Сохранить персону</button>
    <p id="nai-comic-identity-warning" class="ncs-note"></p>
    <button id="nai-comic-import-old" type="button">Импортировать внешность, стили и негативы из старого генератора</button>
  </details>
  <details open><summary>Стили и негативные промпты · независимые библиотеки</summary>
    <div class="ncs-grid ncs-two">
      <section><label>Стиль <select id="nai-comic-style"></select></label><textarea rows="4" id="nai-comic-style-text"></textarea><button id="nai-comic-style-add" type="button">+ Стиль</button><button id="nai-comic-style-delete" type="button">Удалить стиль</button></section>
      <section><label>Негатив <select id="nai-comic-negative"></select></label><textarea rows="4" id="nai-comic-negative-text"></textarea><button id="nai-comic-negative-add" type="button">+ Негатив</button><button id="nai-comic-negative-delete" type="button">Удалить негатив</button></section>
    </div>
  </details>
  <details open><summary>Qwen · извлечение сцены</summary>
    <label>Профиль Qwen из Connection Profiles <select id="nai-comic-qwen-profile"></select></label><button id="nai-comic-refresh-profiles" type="button">Обновить профили</button>
    <p class="ncs-note">Qwen передаёт только сцену, одежду и действия. Внешность добавляется программно — не текстом Qwen.</p>
    <label>Сцена и панели <textarea id="nai-comic-manual-scene" rows="5" placeholder="Нажми «Получить сцену из Qwen» или опиши вручную"></textarea></label>
    <div class="ncs-grid ncs-two"><label>Действия и одежда героя <textarea id="nai-comic-manual-char" rows="3"></textarea></label><label>Действия и одежда персоны <textarea id="nai-comic-manual-persona" rows="3"></textarea></label></div>
  </details>
  <div class="ncs-buttons"><button id="nai-comic-btn-scene" type="button">1 · Получить сцену из Qwen</button><button id="nai-comic-btn-preview" type="button">2 · Показать полный запрос (бесплатно)</button><button id="nai-comic-btn-image" type="button" class="ncs-primary">3 · Создать картинку (Anlas)</button></div>
  <div id="nai-comic-status" class="ncs-note" aria-live="polite">Ожидаю настройки.</div>
  <details open><summary>Отладка · последний запрос NovelAI</summary>
    <label>Полный позитивный промпт (разделён на 2 персонажа) <textarea id="nai-comic-final-prompt" rows="8" readonly></textarea></label>
    <label>JSON-параметры провайдера <textarea id="nai-comic-provider-json" rows="9" readonly></textarea></label>
    <label>Логи <textarea id="nai-comic-logs" rows="7" readonly></textarea></label>
    <button type="button" id="nai-comic-export-debug">Скачать диагностику</button>
    <button type="button" id="nai-comic-export-settings">Экспорт библиотек и настроек (без ключа)</button>
    <button type="button" id="nai-comic-import-settings">Импорт настроек из JSON</button><input id="nai-comic-import-file" type="file" accept="application/json,.json" hidden>
  </details>
  <p><a id="nai-comic-last-image-link" href="#" target="_blank" rel="noopener" hidden>Открыть последнее изображение</a></p><img id="nai-comic-last-image" class="ncs-image" alt="" />
</div></details>`;
 ui=root;
 (document.getElementById('extensions_settings')||document.getElementById('extensions_settings2')||document.body).append(root);
 setupBindings();return root;
}
function fillFields(){for(const key of ['enabled','auto','attach','apiKey','endpoint','model','aspect','size','sampler','steps','cfg','cfgRescale','seed']){
 const target=el(key==='apiKey'?'api-key':key);if(!target)continue; if(target.type==='checkbox')target.checked=!!settings[key];else target.value=settings[key]??'';}
 fillProfiles();selectStyle('styles');selectStyle('negatives');updateDebug();}
function download(filename,obj){const body=JSON.stringify(obj,null,2);const blob=new Blob([body],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function setupBindings(){fillFields();
 for(const key of ['enabled','auto','attach','apiKey','endpoint','model','aspect','size','sampler','steps','cfg','cfgRescale','seed'])saveField(key==='apiKey'?'api-key':key,key,['enabled','auto','attach'].includes(key)?'check':['steps','cfg','cfgRescale','seed'].includes(key)?'int':'text');
 bind('qwen-profile','change',e=>{settings.qwenProfile=e.target.value;persist();});bind('refresh-profiles','click',fillProfiles);
 for(const kind of ['char','persona']){
  bind(kind+'-save','click',async()=>{await storeAppearance(kind);log('INFO','Сохранена анкета '+kind);});
  for(const field of [kind+'-main',kind+'-enabled',kind+'-tag'])bind(field,'change',()=>storeAppearance(kind));
  bind(kind+'-extra-add','click',async()=>{const ident=await currentIdentity();const data=kind==='char'?ident.char:ident.persona;const entry=createEntry(kind==='char'?'characters':'personas',data.key,data.name);entry.extra.push({id:id(),enabled:true,text:''});persist();refreshIdentity();});
 }
 for(const [kind,select,txt] of [['styles','style','style-text'],['negatives','negative','negative-text']]){
  bind(select,'change',e=>{const k=kind==='styles'?'styleActive':'negativeActive';settings[k]=e.target.value;persist();selectStyle(kind);prepared=null;});
  bind(txt,'input',e=>{const k=kind==='styles'?'styleActive':'negativeActive';const entry=settings[kind].find(x=>x.id===settings[k]);if(entry){entry.value=e.target.value;persist();prepared=null;}});
  bind(select+'-add','click',()=>{const name=prompt('Название нового '+(kind==='styles'?'стиля':'негатива'));if(name===null)return;const entry={id:id(),name:name||'Без названия',value:''};settings[kind].push(entry);settings[kind==='styles'?'styleActive':'negativeActive']=entry.id;persist();selectStyle(kind);});
  bind(select+'-delete','click',()=>{const k=kind==='styles'?'styleActive':'negativeActive';if(!settings[k])return;if(!confirm('Удалить выбранный пресет?'))return;settings[kind]=settings[kind].filter(x=>x.id!==settings[k]);settings[k]='';persist();selectStyle(kind);});
 }
 bind('btn-scene','click',()=>runJob('scene'));bind('btn-preview','click',()=>runJob('preview'));
 bind('btn-image','click',()=>runJob('image',lastCharacterMessageId()));
 bind('import-old','click',async()=>{const old=ctx().extensionSettings?.inline_image_gen;if(!old){setStatus('Старые настройки inline_image_gen не найдены.');return;}
    if(!confirm('Импортировать сохранённые анкеты и пресеты? Уже заполненные анкеты не будут перезаписаны.'))return;
    Object.assign(settings,importOldLibrary(settings,old));
    const small=ctx().extensionSettings?.ExtBlocks?.api_presets?.small?.connection_profile;
    if(!settings.qwenProfile && small)settings.qwenProfile=small;
    persist();fillFields();await refreshIdentity();log('INFO','Импортированы сохранённые анкеты и библиотеки стилей старого генератора.');});
 bind('export-debug','click',()=>download('nai-comic-debug.json',{lastRequest:settings.lastRequest,logs:settings.debugLog.map(line=>line.replace(/Bearer\s+\S+/gi,'Bearer [redacted]')),chat:currentChatId(),date:new Date().toISOString()}));
 bind('export-settings','click',()=>{const s=clone(settings);delete s.apiKey;delete s.debugLog;delete s.lastRequest;download('nai-comic-settings-no-key.json',s);});
 bind('import-settings','click',()=>el('import-file').click());
 bind('import-file','change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=JSON.parse(await f.text());for(const k of ['characters','personas','styles','negatives','styleActive','negativeActive'])if(s[k]!==undefined)settings[k]=clone(s[k]);persist();fillFields();refreshIdentity();setStatus('Библиотеки импортированы.');}catch(err){setStatus('Ошибка импорта: '+err.message);}e.target.value='';});
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
 const sync=()=>{const sig=getCharIdentity().key+'::'+currentChatId();if(sig!==shownContext){shownContext=sig;currentScene=null;prepared=null;for(const field of ['manual-scene','manual-char','manual-persona','final-prompt','provider-json'])if(el(field))el(field).value='';refreshIdentity();log('INFO','Чат изменён: '+sig);}};
 if(t.CHAT_CHANGED)c.eventSource.on(t.CHAT_CHANGED,sync);
 if(t.MESSAGE_RECEIVED)c.eventSource.on(t.MESSAGE_RECEIVED,async messageId=>{{const index=Number(messageId);if(Number.isInteger(index)&&index>=0)await handleAuto(index);}});
 if(t.MESSAGE_SENT)c.eventSource.on(t.MESSAGE_SENT,()=>{prepared=null;});
 // Active user persona may change without CHAT_CHANGED; poll only IDs, do not request data or trigger generation.
 let lastPersona='';setInterval(async()=>{if(!ui)return;const p=await getPersonaIdentity();if(p.key!==lastPersona){lastPersona=p.key;prepared=null;await refreshIdentity();}},2200);
 sync();}
async function init(){initialize();createPanel();await refreshIdentity();subscribe();log('INFO','NAI Comic Studio loaded. Автогенерация выключена до явного включения.');}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>console.error('[NAI Comic init]',e)));else init().catch(e=>console.error('[NAI Comic init]',e));
